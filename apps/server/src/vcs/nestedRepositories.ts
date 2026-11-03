import type { VcsListNestedRepositoriesResult, VcsNestedRepository } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

/** Folders that hold installed or generated code, never a repository the user works in. */
const SKIPPED_FOLDERS = new Set(["node_modules", "vendor", "dist", "build"]);

/**
 * Git repositories in the direct child folders of `cwd`, such as `ims-fe-2025` inside a
 * monorepo root that ignores it. One level only, so it stays one directory read plus one
 * `.git` check per child. An unreadable `cwd` or child yields no repositories, never an error.
 */
export const listNestedRepositories = Effect.fn("vcs.listNestedRepositories")(function* (
  cwd: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const names = yield* fs.readDirectory(cwd).pipe(Effect.orElseSucceed(() => [] as string[]));
  const repositories: VcsNestedRepository[] = [];
  for (const name of names.toSorted((left, right) => left.localeCompare(right))) {
    if (name.startsWith(".") || SKIPPED_FOLDERS.has(name)) continue;
    const folder = path.join(cwd, name);
    const info = yield* fs.stat(folder).pipe(Effect.option);
    if (info._tag === "None" || info.value.type !== "Directory") continue;
    // A `.git` folder is a clone; a `.git` file is a submodule or linked worktree.
    const isRepository = yield* fs
      .exists(path.join(folder, ".git"))
      .pipe(Effect.orElseSucceed(() => false));
    if (isRepository) repositories.push({ name, path: folder });
  }
  return { repositories } satisfies VcsListNestedRepositoriesResult;
});
