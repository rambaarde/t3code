import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import { checkPiProviderStatus, needsPiStatusRefresh } from "./status.ts";

const encoder = new TextEncoder();

/** Builds a completed child process for the provider-status probe. */
function processHandle(input: {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number;
}) {
  const bytes = (value: string | undefined) =>
    value === undefined || value.length === 0
      ? Stream.empty
      : Stream.succeed(encoder.encode(value));

  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(900_000_101),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(input.exitCode ?? 0)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    unref: Effect.succeed(Effect.void),
    stdin: Sink.drain,
    stdout: bytes(input.stdout),
    stderr: bytes(input.stderr),
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

const settings = {
  enabled: true,
  binaryPath: "omp",
  launchArgs: "",
  customModels: [],
} as const;

describe("OmpProvider", () => {
  it.effect("reads the OMP version from its non-interactive help output", () =>
    Effect.gen(function* () {
      const spawner = ChildProcessSpawner.make((command) => {
        const args = ChildProcess.isStandardCommand(command) ? command.args : [];
        return Effect.succeed(
          args.includes("--help")
            ? processHandle({ stdout: "omp v18.6.1\n\nUSAGE\n  $ omp [COMMAND]\n" })
            : processHandle({ stderr: "RPC startup failed", exitCode: 1 }),
        );
      });

      const snapshot = yield* checkPiProviderStatus(settings).pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      );

      assert.equal(snapshot.status, "ready");
      assert.equal(snapshot.version, "18.6.1");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("keeps the periodic check only until OMP is ready and authenticated", () =>
    Effect.gen(function* () {
      // --help succeeds and RPC discovery fails: ready, but no models yet.
      const spawner = ChildProcessSpawner.make((command) => {
        const args = ChildProcess.isStandardCommand(command) ? command.args : [];
        return Effect.succeed(
          args.includes("--help")
            ? processHandle({ stdout: "omp v18.6.1\n" })
            : processHandle({ stderr: "RPC startup failed", exitCode: 1 }),
        );
      });
      const discoveryFailed = yield* checkPiProviderStatus(settings).pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      );
      assert.equal(discoveryFailed.status, "ready");
      assert.equal(discoveryFailed.auth.status, "unknown");
      assert.isTrue(needsPiStatusRefresh(discoveryFailed));

      assert.isFalse(
        needsPiStatusRefresh({ status: "ready", auth: { status: "authenticated", type: "pi" } }),
      );
      assert.isTrue(
        needsPiStatusRefresh({
          status: "warning",
          auth: { status: "unauthenticated", type: "pi" },
        }),
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
