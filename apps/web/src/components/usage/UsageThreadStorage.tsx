/**
 * The Usage page's Threads tab: how much history each thread stores, and the database total,
 * colored green / yellow / red against fixed thresholds.
 */
import { RegistryContext } from "@effect/atom-react";
import { ThreadId, type EnvironmentId, type ThreadStorageEntry } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import type { ContextType } from "react";

import { formatBytes } from "../../lib/formatBytes";
import { cn } from "../../lib/utils";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { buildThreadRouteParams } from "../../threadRoutes";

const MB = 1024 ** 2;
const GB = 1024 ** 3;

export type StorageLevel = "ok" | "warning" | "critical";

/**
 * Yellow and red start points. A thread replays its whole history when it opens, so a big one
 * opens slower; the database total also grows the backup and every compaction pass.
 */
export const STORAGE_THRESHOLDS = {
  thread: { warning: 10 * MB, critical: 40 * MB },
  database: { warning: 1 * GB, critical: 2 * GB },
} as const;

export function storageLevel(
  bytes: number,
  thresholds: { readonly warning: number; readonly critical: number },
): StorageLevel {
  if (bytes >= thresholds.critical) return "critical";
  if (bytes >= thresholds.warning) return "warning";
  return "ok";
}

const LEVEL_STYLE: Record<StorageLevel, { readonly bar: string; readonly text: string }> = {
  ok: { bar: "bg-success", text: "text-success" },
  warning: { bar: "bg-warning", text: "text-warning" },
  critical: { bar: "bg-destructive", text: "text-destructive" },
};

const LEVEL_LABEL: Record<StorageLevel, string> = {
  ok: "Healthy",
  warning: "Large",
  critical: "Critical",
};

/** Fill relative to the red threshold, so a red bar is always full. */
function StorageBar({
  bytes,
  thresholds,
  className,
}: {
  readonly bytes: number;
  readonly thresholds: { readonly warning: number; readonly critical: number };
  readonly className?: string;
}) {
  const level = storageLevel(bytes, thresholds);
  const fill = Math.min(1, bytes / thresholds.critical);
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={thresholds.critical}
      aria-valuenow={bytes}
      aria-valuetext={`${formatBytes(bytes)}, ${LEVEL_LABEL[level]}`}
      className={cn("relative h-3 overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn("absolute inset-y-0 left-0 rounded-full", LEVEL_STYLE[level].bar)}
        style={{ width: `${Math.max(fill * 100, bytes > 0 ? 1 : 0)}%` }}
      />
      <div
        aria-hidden
        className="absolute inset-y-0 w-px bg-foreground/40"
        style={{ left: `${(thresholds.warning / thresholds.critical) * 100}%` }}
      />
    </div>
  );
}

function ThreadRow({
  environmentId,
  thread,
}: {
  readonly environmentId: EnvironmentId;
  readonly thread: ThreadStorageEntry;
}) {
  const level = storageLevel(thread.bytes, STORAGE_THRESHOLDS.thread);
  return (
    // Narrow screens put the bar on its own line, so the title keeps its width.
    <li className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-x-4 gap-y-1.5 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(4rem,12rem)_5.5rem]">
      <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", LEVEL_STYLE[level].bar)} />
        <Link
          to="/$environmentId/$threadId"
          params={buildThreadRouteParams({
            environmentId,
            threadId: ThreadId.make(thread.threadId),
          })}
          className="min-w-0 truncate hover:underline"
        >
          {thread.title}
        </Link>
      </span>
      <StorageBar
        bytes={thread.bytes}
        thresholds={STORAGE_THRESHOLDS.thread}
        className="order-last col-span-2 h-1.5 sm:order-none sm:col-span-1"
      />
      <span
        className={cn(
          "text-end text-xs tabular-nums",
          level === "ok" ? "text-muted-foreground" : LEVEL_STYLE[level].text,
        )}
      >
        {formatBytes(thread.bytes)}
      </span>
    </li>
  );
}

function EnvironmentThreadStorage({
  environmentId,
  label,
}: {
  readonly environmentId: EnvironmentId;
  readonly label: string | null;
}) {
  const report = useEnvironmentQuery(serverEnvironment.threadStorage({ environmentId, input: {} }));
  const data = report.data;
  if (data === null) {
    return (
      <p className="text-sm text-muted-foreground">{report.error ?? "Measuring thread storage…"}</p>
    );
  }
  const databaseLevel = storageLevel(data.databaseBytes, STORAGE_THRESHOLDS.database);
  const flagged = data.threads.filter(
    (thread) => storageLevel(thread.bytes, STORAGE_THRESHOLDS.thread) !== "ok",
  ).length;
  return (
    <section className="flex flex-col gap-3" aria-label={label ?? "Thread storage"}>
      {label ? <h2 className="text-sm font-medium text-foreground">{label}</h2> : null}
      <div className="grid items-center gap-x-6 gap-y-3 rounded-lg border border-border/60 p-4 md:grid-cols-[11rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">Database</span>
          <span className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-foreground tabular-nums">
              {formatBytes(data.databaseBytes)}
            </span>
            <span className={cn("text-sm", LEVEL_STYLE[databaseLevel].text)}>
              {LEVEL_LABEL[databaseLevel]}
            </span>
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {data.threadCount} threads{flagged > 0 ? ` · ${flagged} large` : ""}
          </span>
        </div>
        <StorageBar bytes={data.databaseBytes} thresholds={STORAGE_THRESHOLDS.database} />
        <p className="text-xs text-muted-foreground md:col-span-2">
          Yellow from {formatBytes(STORAGE_THRESHOLDS.database.warning)}, red from{" "}
          {formatBytes(STORAGE_THRESHOLDS.database.critical)}. Old history is compacted
          automatically every 6 hours.
        </p>
      </div>
      <div className="rounded-lg border border-border/60 px-4 py-2">
        <ul className="divide-y divide-border/60">
          {data.threads.map((thread) => (
            <ThreadRow key={thread.threadId} environmentId={environmentId} thread={thread} />
          ))}
        </ul>
        {data.deleted.threadCount > 0 ? (
          <p className="flex items-center justify-between gap-4 border-t border-border/60 py-2 text-xs text-muted-foreground">
            <span>
              {data.deleted.threadCount} deleted{" "}
              {data.deleted.threadCount === 1 ? "thread" : "threads"} still clearing. Their history
              is removed within a minute of their cleanup finishing.
            </span>
            <span className="shrink-0 tabular-nums">{formatBytes(data.deleted.bytes)}</span>
          </p>
        ) : null}
        <p className="border-t border-border/60 py-2 text-xs text-muted-foreground">
          Per thread: yellow from {formatBytes(STORAGE_THRESHOLDS.thread.warning)}, red from{" "}
          {formatBytes(STORAGE_THRESHOLDS.thread.critical)}. A red thread opens slower; continue
          long work in a new thread.
          {data.threadCount > data.threads.length
            ? ` Showing the ${data.threads.length} largest of ${data.threadCount}.`
            : ""}
        </p>
      </div>
    </section>
  );
}

export function UsageThreadStorage({
  environments,
}: {
  readonly environments: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly label: string;
  }>;
}) {
  return (
    <div className="flex flex-col gap-8">
      {environments.map((environment) => (
        <EnvironmentThreadStorage
          key={environment.environmentId}
          environmentId={environment.environmentId}
          label={environments.length > 1 ? environment.label : null}
        />
      ))}
    </div>
  );
}

/** Rescans storage for each environment; the header's refresh button calls it on this tab. */
export function refreshThreadStorage(
  registry: ContextType<typeof RegistryContext>,
  environmentIds: ReadonlyArray<EnvironmentId>,
) {
  for (const environmentId of environmentIds) {
    registry.refresh(serverEnvironment.threadStorage({ environmentId, input: {} }));
  }
}
