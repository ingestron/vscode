// What the source metadata commands say to the person: the notification after an import, the
// warning when an import stops, and which refusal is answered by asking for the table's name.
// The import itself is `ProjectSnapshot.importSource`; nothing here decides what to import.

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
