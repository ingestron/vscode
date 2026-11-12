// What the source metadata commands say to the person: the notification after an import, the
// warning when an import stops, and which refusal is answered by asking for the table's name.
// The import itself is `ProjectSnapshot.importSource`; nothing here decides what to import.
// Also which file events import straight away, and how events for one file are grouped.
import { inProject } from "@ingestron/authoring";

/** The refusal of a file that does not say which table it describes. */
const needsObjectReason = "Name the table this file describes with --object.";

/** The button that opens every change of an import. */
export const showChanges = "Show all changes";

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

/** True when the import stopped only for want of the table the file describes. */
export function needsObject(refused: readonly string[]): boolean {
  return refused.length === 1 && refused[0] === needsObjectReason;
}

/** The warning for an import that stopped: nothing was written, and each reason. */
export function refusalNotice(refused: readonly string[]): string {
  // The editor asks for the table in a box; it has no --object option to name.
  const reasons = refused.map((reason) => reason.replace(" with --object.", "."));
  return ["Nothing was imported.", ...reasons].join(" ");
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

/** Where an import could not be finished: writing a file's change, or saving the file after it. */
export interface ImportFailure {
  file: string;
  step: "write" | "save";
}

/** The warning for an import that could not be finished. */
export function importFailureNotice({ file, step }: ImportFailure): string {
  return step === "write"
    ? `Could not write ${file}.`
    : `Wrote the import, but could not save ${file}.`;
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
 * table's name as the command does, so it says where to save a file of one table.
 */
export function watchRefusalNotice(file: string, refused: readonly string[]): string {
  const hint = needsObject(refused)
    ? " Save it as sources/<connection>/<table> or use Import source metadata…."
    : "";
  return `${file}: ${refusalNotice(refused)}${hint}`;
}
