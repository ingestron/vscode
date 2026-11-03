// The parts of the context keys that need no VS Code: which files belong to a
// project, and a runner that applies updates one at a time.
import { isAbsolute, relative, sep } from "node:path";
import { inProject, projectFolderOf } from "@ingestron/authoring";

/**
 * The YAML files that lie inside a project folder, outside its build folder,
 * as an object keyed by path with the value true. A menu's `resourcePath in
 * ingestron.projectFiles` is then true only for a file of a project. Only YAML
 * files are keyed, because only they get the menu, which keeps the object small.
 */
export function projectFilesOf(files: string[], folders: string[]): Record<string, true> {
  const keyed: Record<string, true> = {};
  for (const file of files) {
    if (!/\.ya?ml$/i.test(file)) continue;
    if (folders.some((folder) => isProjectFile(folder, file))) keyed[file] = true;
  }
  return keyed;
}

function isProjectFile(folder: string, file: string): boolean {
  const inside = insidePath(folder, file);
  return inside !== undefined && inside.split(sep)[0] !== "build";
}

/** The path relative to the folder, or undefined when it is not strictly inside it. */
function insidePath(folder: string, path: string): string | undefined {
  const inside = relative(folder, path);
  return inside === "" || inside.startsWith("..") || isAbsolute(inside) ? undefined : inside;
}

/**
 * True when the path is in the build folder of the nearest project folder
 * that holds it. Only the part below the project folder counts, so a
 * workspace that sits under a folder named `build` is not mistaken for build
 * output. A path in no known project is not build output: it may be a new
 * project.
 */
export function inBuildFolder(path: string, folders: string[]): boolean {
  let nearest: string | undefined;
  for (const folder of folders)
    if (insidePath(folder, path) !== undefined && folder.length > (nearest?.length ?? -1))
      nearest = folder;
  const inside = nearest === undefined ? undefined : insidePath(nearest, path);
  return inside !== undefined && inside.split(sep)[0] === "build";
}

/**
 * Wraps an update so that two never run at once and the last request always
 * has the final say: a request made while one runs makes exactly one more run
 * after it, and a full request is not lost to a later partial one. Without
 * this, a slow update could finish after a newer one and leave stale keys.
 */
export function serialised(work: (full: boolean) => Promise<void>): (full: boolean) => void {
  let wanted: { full: boolean } | undefined;
  let running = false;
  const drain = async () => {
    running = true;
    try {
      while (wanted) {
        const { full } = wanted;
        wanted = undefined;
        await work(full).catch((error: unknown) =>
          console.error("ingestron: context keys could not be updated", error),
        );
      }
    } finally {
      running = false;
    }
  };
  return (full) => {
    wanted = { full: full || (wanted?.full ?? false) };
    if (!running) void drain();
  };
}

/**
 * True when the path is a file of a project. It looks only at the folders above
 * the path, and does not open the project, so it is cheap to ask whenever the
 * active editor changes.
 */
export function fileInProject(path: string): boolean {
  const folder = projectFolderOf(path);
  return folder !== undefined && inProject(folder, path) !== undefined;
}
