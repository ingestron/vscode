// What the source metadata commands say to the person: the notification after an import and the
// warning when an import stops. The import itself is `ProjectSnapshot.importSource`, which also
// says when a refusal is answered by asking for the table's name; nothing here decides that.
// Also which file events import straight away, and how events for one file are grouped.
import { inProject } from "@ingestron/authoring";

/** The button that opens every change of an import. */
export const showChanges = "Show all changes";

/** The import command as every notice names it: its title, quoted. */
const importCommand = '"Import source metadata…"';

/**
 * What to tell the person after an import: the first line of its changes, then how many are
 * breaking when any are, and the button that shows all of them when there is more than that
 * line (a change or a note).
 */
export function importNotice(edit: { summary: string; breaking: number }): {
  message: string;
  buttons: string[];
} {
  const [first, ...rest] = edit.summary.split("\n");
  return {
    message: edit.breaking > 0 ? `${first} ${edit.breaking} breaking.` : first!,
    buttons: rest.some((line) => line.trim() !== "") ? [showChanges] : [],
  };
}

/** The reasons an import stopped, as the editor says them: it has no --object option to name. */
export function editorReasons(refused: readonly string[]): string[] {
  return refused.map((reason) => reason.replace(" with --object.", "."));
}

/** The warning for an import that stopped: nothing was written, and each reason. */
export function refusalNotice(refused: readonly string[]): string {
  return ["Nothing was imported.", ...editorReasons(refused)].join(" ");
}

/** The warning for a project with no connection to import for. */
export const noConnectionNotice = "The project has no connection to import for.";

/** The choices of Request source metadata: every connection first. Undefined when fewer than two. */
export function requestChoices(
  connections: readonly string[],
): { label: string; connection?: string }[] | undefined {
  if (connections.length < 2) return undefined;
  return [
    { label: "All connections" },
    ...connections.map((connection) => ({ label: connection, connection })),
  ];
}

/**
 * Which connection a file is imported for: the one its path names (`path`), else the project's
 * only connection (`use`), else the person's pick among several (`pick`), or `none` when the
 * project has no connection.
 */
export type ConnectionChoice =
  | { kind: "path" }
  | { kind: "use"; connection: string }
  | { kind: "pick"; connections: string[] }
  | { kind: "none" };

/** Decides how the connection of an import is found. */
export function connectionChoice(
  pathNamesOne: boolean,
  connections: readonly string[],
): ConnectionChoice {
  if (pathNamesOne) return { kind: "path" };
  const [only] = connections;
  if (only === undefined) return { kind: "none" };
  return connections.length === 1
    ? { kind: "use", connection: only }
    : { kind: "pick", connections: [...connections] };
}

/**
 * Where an import could not be finished: reading a file of the project to write the change into
 * (with the error), writing a file's change, or saving the file after it.
 */
export type ImportFailure =
  { file: string; step: "write" | "save" } | { file: string; step: "read"; error: unknown };

/** The warning for an import that could not be finished, in the project at `folder`. */
export function importFailureNotice(failure: ImportFailure, folder = ""): string {
  if (failure.step === "read") return readFailureNotice(failure.file, failure.error, folder);
  return failure.step === "write"
    ? `Could not write ${failure.file}.`
    : `Wrote the import, but could not save ${failure.file}.`;
}

/**
 * The warning for a file of the project that could not be read to write the import into: which
 * file (relative to the project) and why, never the file's content. An error of the file system
 * (it has a `code`) gives its code alone; any other error gives its message with the project's
 * folder left out of the paths in it, so only project-relative paths are shown.
 */
export function readFailureNotice(file: string, error: unknown, folder: string): string {
  if (!(error instanceof Error)) return `Could not read ${file}.`;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && code !== "") return `Could not read ${file}: ${code}.`;
  const message =
    folder === ""
      ? error.message
      : error.message.replaceAll(`${folder}/`, "").replaceAll(`${folder}\\`, "");
  return `Could not read ${file}: ${message}`;
}

/**
 * True when a file event is for a file saved where the source request says: under `sources/` in
 * the project at `projectFolder` (the nearest project, so a file of a nested project is not its
 * outer project's), named by `sourceFileAt` (which is never the metadata document), and not a
 * hidden file such as an editor's swap file. project.yaml and everything outside `sources/` is
 * false, so what an import writes never starts another.
 */
export function shouldImport(
  event: { path: string; projectFolder: string },
  sourceFileAt: (file: string) => unknown,
): boolean {
  const inside = inProject(event.projectFolder, event.path);
  if (inside === undefined || !inside.startsWith("sources/")) return false;
  // Editors and the system leave hidden files beside a file (.DS_Store, swap files, lock files):
  // importing those would only warn. A hidden sample is still imported by the command and the CLI.
  if (inside.split("/").some((part) => part.startsWith("."))) return false;
  return sourceFileAt(event.path) !== undefined;
}

/**
 * Groups events: `run(key)` is called once, `delayMs` after the last `push(key)` for that key.
 * `dispose` drops what is waiting.
 */
export function grouped(
  delayMs: number,
  run: (key: string) => void,
): { push: (key: string) => void; dispose: () => void } {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return {
    push(key) {
      clearTimeout(timers.get(key));
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          run(key);
        }, delayMs),
      );
    },
    dispose() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}

/**
 * The warning for a saved file the import stopped for, naming the file. A save cannot ask for the
 * table's name as the command does, so when the import needs it (`needsObject`) it says where to
 * save a file of one table.
 */
export function watchRefusalNotice(
  file: string,
  { refused, needsObject }: { refused: readonly string[]; needsObject?: true },
): string {
  const hint = needsObject
    ? ` Save it as sources/<connection>/<table> or use ${importCommand}.`
    : "";
  return `${file}: ${refusalNotice(refused)}${hint}`;
}

/** True when a file is too large to import as soon as it is saved. */
export function tooLarge(bytes: number, limit: number): boolean {
  return bytes > limit;
}

/** The warning for a saved file left alone for its size, with the ways to import it anyway. */
export function oversizeNotice(file: string, limit: number): string {
  const megabytes = Math.round(limit / (1024 * 1024));
  return (
    `${file} is over ${megabytes} MB, so it was not imported when saved. ` +
    `Use ${importCommand} or ingestron source import.`
  );
}

/**
 * The warning for a file that could not be imported: the reason, never the file's content. An
 * error of the file system (it has a `code`, such as `FileNotFound` or `EACCES`) gives its code
 * alone, as its message can hold the file's absolute path.
 */
export function failedNotice(file: string, error: unknown): string {
  if (!(error instanceof Error)) return `Could not import ${file}.`;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code !== ""
    ? `Could not import ${file}: ${code}.`
    : `Could not import ${file}: ${error.message}`;
}
