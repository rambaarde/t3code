import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { listNestedRepositories } from "./nestedRepositories.ts";

it.effect("lists only direct child folders that are git repositories", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "t3-nested-repos-" });
    const folder = (...parts: string[]) =>
      fs.makeDirectory(path.join(root, ...parts), { recursive: true });
    yield* folder("ims-fe-2025", ".git");
    yield* folder("ims-be-2025");
    // A submodule or linked worktree has a `.git` file, not a folder.
    yield* fs.writeFileString(
      path.join(root, "ims-be-2025", ".git"),
      "gitdir: ../.git/modules/be\n",
    );
    yield* folder("docs");
    yield* folder("node_modules", "pkg", ".git");
    yield* folder(".claude", ".git");
    yield* folder("apps", "deep", ".git");
    yield* fs.writeFileString(path.join(root, "README.md"), "# root\n");

    const result = yield* listNestedRepositories(root);
    assert.deepStrictEqual(result.repositories, [
      { name: "ims-be-2025", path: path.join(root, "ims-be-2025") },
      { name: "ims-fe-2025", path: path.join(root, "ims-fe-2025") },
    ]);
    assert.deepStrictEqual(
      (yield* listNestedRepositories(path.join(root, "missing"))).repositories,
      [],
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
