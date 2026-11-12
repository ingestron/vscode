// What the source metadata commands say to the person: the notification after an import, the
// warning when an import stops, and which refusal is answered by asking for the table's name.
// The import itself is `ProjectSnapshot.importSource`; nothing here decides what to import.

/** The refusal of a file that does not say which table it describes. */
const needsObjectReason = "Name the table this file describes with --object.";

/** The button that opens every change of an import. */
export const showChanges = "Show all changes";

/**
 * What to tell the person after an import: the first line of its changes, then how many are
 * breaking when any are, and the button that shows all of them.
 */
export function importNotice(edit: { summary: string; breaking: number }): {
  message: string;
  buttons: string[];
} {
  const first = edit.summary.split("\n")[0]!;
  return {
    message: edit.breaking > 0 ? `${first} ${edit.breaking} breaking.` : first,
    buttons: [showChanges],
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
