import {
  THREAD_STORAGE_REPORT_LIMIT,
  type DatabaseStorageStatus,
  type ThreadStorageReport,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as SqlClient from "effect/sql/SqlClient";
import type * as SqlError from "effect/sql/SqlError";

import { resolveHostCliCommand } from "../cli/invocation.ts";
import * as ServerConfig from "../config.ts";
import * as ProjectionMaintenance from "../orchestration-v2/ProjectionMaintenance.ts";
import { forkParked } from "../serverActivation.ts";

// Bound each reclaim pass to one minute of churn.
const RECLAIM_PAGES_PER_PASS = 1024;
const COMPACTION_INTERVAL = Duration.hours(6);

export class DatabaseStorage extends Context.Service<
  DatabaseStorage,
  {
    /** Return free pages to the filesystem on databases with incremental auto_vacuum. */
    readonly reclaim: Effect.Effect<void>;
    /** Current file accounting, re-published after each maintenance pass. Null until first read. */
    readonly status: Stream.Stream<DatabaseStorageStatus | null>;
    /** Bytes of stored history per thread, largest first. Scans the event log; run on demand. */
    readonly threadStorage: Effect.Effect<ThreadStorageReport, SqlError.SqlError>;
  }
>()("t3/persistence/DatabaseStorage") {}

// Deleted events have newer retained replacements; old cursors replay to the same state.
const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const maintenance = yield* ProjectionMaintenance.ProjectionMaintenanceV2;
  const config = yield* ServerConfig.ServerConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const statusRef = yield* SubscriptionRef.make<DatabaseStorageStatus | null>(null);

  // The notice shows host-shell quoting verbatim; desktop needs its launcher because t3 is absent from PATH.
  const { command: compactCommand } = yield* resolveHostCliCommand("doctor", [
    "--base-dir",
    config.baseDir,
  ]);
  // doctor --base-dir targets userdata, not implicit dev homes; suppress status to avoid touching the live install.
  const doctorTargetsThisDatabase =
    path.resolve(config.dbPath) ===
    path.resolve(config.baseDir, "userdata", path.basename(config.dbPath));
  // Only VACUUM changes these, and doctor refuses to VACUUM while a server has the database open.
  let layout: { readonly pageSize: number; readonly incrementalVacuum: boolean } | undefined;
  const readLayout = Effect.suspend(() =>
    layout !== undefined
      ? Effect.succeed(layout)
      : Effect.gen(function* () {
          const size = yield* sql<{ readonly page_size: number }>`PRAGMA page_size`;
          const mode = yield* sql<{ readonly auto_vacuum: number }>`PRAGMA auto_vacuum`;
          layout = {
            pageSize: size[0]?.page_size ?? 0,
            incrementalVacuum: mode[0]?.auto_vacuum === 2,
          };
          return layout;
        }),
  );
  const publishStatus = Effect.gen(function* () {
    if (!doctorTargetsThisDatabase) return;
    const { pageSize, incrementalVacuum } = yield* readLayout;
    const pages = yield* sql<{ readonly page_count: number }>`PRAGMA page_count`;
    const free = yield* sql<{ readonly freelist_count: number }>`PRAGMA freelist_count`;
    const next: DatabaseStorageStatus = {
      databaseBytes: (pages[0]?.page_count ?? 0) * pageSize,
      reclaimableBytes: (free[0]?.freelist_count ?? 0) * pageSize,
      incrementalVacuumEnabled: incrementalVacuum,
      compactCommand,
    };
    // Every set reaches each open Storage page; most passes change nothing.
    if (!Equal.equals(yield* SubscriptionRef.get(statusRef), next)) {
      yield* SubscriptionRef.set(statusRef, next);
    }
  }).pipe(
    Effect.catch((cause) => Effect.logWarning("Database storage inspection failed", { cause })),
  );

  const reclaim = Effect.gen(function* () {
    if (!(yield* readLayout).incrementalVacuum) return;
    // The driver steps once per statement; incremental_vacuum frees one page per step. Yield between pages.
    for (let page = 0; page < RECLAIM_PAGES_PER_PASS; page++) {
      const free = yield* sql<{ readonly freelist_count: number }>`PRAGMA freelist_count`;
      if ((free[0]?.freelist_count ?? 0) === 0) break;
      yield* sql`PRAGMA incremental_vacuum(1)`;
      yield* Effect.yieldNow;
    }
  }).pipe(
    Effect.catch((cause) => Effect.logWarning("Database space reclamation failed", { cause })),
  );

  // Even a pass that deletes nothing scans the event store. Persist completion
  // so restarting does not trigger another scan before the six-hour interval.
  const compactedAtPath = path.join(path.dirname(config.dbPath), "compacted-at");
  const compact = Effect.gen(function* () {
    let sliceStarted = yield* Clock.monotonicTimeNanos;
    const betweenPages = Effect.gen(function* () {
      const elapsed = (yield* Clock.monotonicTimeNanos) - sliceStarted;
      if (elapsed < 25_000_000n) return;
      // Keep background maintenance at 10% duty, including pages that exceed the budget.
      yield* Effect.sleep((Number(elapsed) / 1_000_000) * 9);
      sliceStarted = yield* Clock.monotonicTimeNanos;
    });
    const result = yield* maintenance.compactEventStore(betweenPages);
    const completedAt = yield* Clock.currentTimeMillis;
    yield* fs.writeFileString(compactedAtPath, String(completedAt)).pipe(Effect.ignore);
    if (result.deletedEventCount > 0 || result.deletedReceiptCount > 0) {
      yield* Effect.logInfo("Compacted orchestration history", result);
    }
  }).pipe(
    Effect.catch((cause) =>
      Effect.logWarning("Orchestration history compaction failed", { cause }),
    ),
  );
  const lastCompactedAt = yield* fs.readFileString(compactedAtPath).pipe(
    Effect.map(Number),
    Effect.orElseSucceed(() => Number.NaN),
  );
  const intervalMs = Duration.toMillis(COMPACTION_INTERVAL);
  const untilDueMs = Number.isFinite(lastCompactedAt)
    ? lastCompactedAt + intervalMs - (yield* Clock.currentTimeMillis)
    : 0;
  const firstCompactionDelay = Duration.millis(
    Math.min(intervalMs, Math.max(Duration.toMillis(Duration.minutes(1)), untilDueMs)),
  );

  yield* forkParked(
    Effect.sleep(firstCompactionDelay).pipe(
      Effect.andThen(
        compact.pipe(
          Effect.andThen(publishStatus),
          Effect.repeat(Schedule.spaced(COMPACTION_INTERVAL)),
        ),
      ),
    ),
  );
  // A deleted thread's history goes on the next minute tick once its cleanup effects settle;
  // the reclaim right after returns the freed pages to disk.
  const purgeDeletedThreads = maintenance.purgeDeletedThreads.pipe(
    Effect.tap((result) =>
      result.purgedThreadCount > 0
        ? Effect.logInfo("Removed deleted threads' history", result)
        : Effect.void,
    ),
    Effect.catch((cause) => Effect.logWarning("Deleted thread purge failed", { cause })),
  );
  yield* forkParked(
    publishStatus.pipe(
      Effect.andThen(Effect.sleep("1 minute")),
      Effect.andThen(
        purgeDeletedThreads.pipe(
          Effect.andThen(reclaim),
          Effect.andThen(publishStatus),
          Effect.repeat(Schedule.spaced("1 minute")),
        ),
      ),
    ),
  );

  // ponytail: one full scan of the event payloads per request (~0.2 s for 250 MB). Cache a
  // running total per thread if this ever backs a live view.
  const threadStorage = Effect.gen(function* () {
    const { pageSize } = yield* readLayout;
    const pages = yield* sql<{ readonly page_count: number }>`PRAGMA page_count`;
    const rows = yield* sql<{
      readonly thread_id: string;
      readonly project_id: string | null;
      readonly title: string | null;
      readonly deleted: number;
      readonly bytes: number;
    }>`
      WITH sizes AS (
        SELECT stream_id AS thread_id, SUM(length(payload_json) + length(metadata_json)) AS bytes
        FROM orchestration_events WHERE aggregate_kind = 'thread' GROUP BY stream_id
        UNION ALL
        SELECT thread_id, SUM(length(payload_json)) FROM orchestration_v2_projection_turn_items
        GROUP BY thread_id
        UNION ALL
        SELECT thread_id, SUM(length(payload_json)) FROM orchestration_v2_projection_nodes
        GROUP BY thread_id
      )
      SELECT sizes.thread_id, threads.project_id, threads.title,
        threads.deleted_at IS NOT NULL AS deleted, SUM(sizes.bytes) AS bytes
      FROM sizes
      LEFT JOIN orchestration_v2_projection_threads AS threads
        ON threads.thread_id = sizes.thread_id
      GROUP BY sizes.thread_id
      ORDER BY bytes DESC
    `;
    // A thread with history but no projection row was removed outright; count it as deleted.
    const isDeleted = (row: (typeof rows)[number]) => row.deleted === 1 || row.title === null;
    const live = rows.filter((row) => !isDeleted(row));
    const deleted = rows.filter(isDeleted);
    return {
      databaseBytes: (pages[0]?.page_count ?? 0) * pageSize,
      threadCount: live.length,
      threads: live.slice(0, THREAD_STORAGE_REPORT_LIMIT).map((row) => ({
        threadId: row.thread_id,
        projectId: row.project_id,
        title: row.title ?? "Untitled thread",
        bytes: row.bytes,
      })),
      deleted: {
        threadCount: deleted.length,
        bytes: deleted.reduce((total, row) => total + row.bytes, 0),
      },
    } satisfies ThreadStorageReport;
  });

  return DatabaseStorage.of({
    reclaim,
    status: SubscriptionRef.changes(statusRef),
    threadStorage,
  });
});

export const layer = Layer.effect(DatabaseStorage, make);
