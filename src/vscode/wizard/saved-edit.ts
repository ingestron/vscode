// One save rule for the editor's actions that change existing files (spec/cli/projects.md,
// "The new file's import"): the change is one undoable edit, and each file it changes is saved
// when it had no unsaved changes, so it is on disk as an addition's new file is. A file that had
// unsaved changes keeps them, with the change, unsaved: saving it would also save work the action
// did not make.
import { join } from "node:path";
import * as vscode from "vscode";

/**
 * Applies the edit, then saves each of the project's `files` (relative paths) that had no
 * unsaved changes before it. Returns those left unsaved; throws when the edit is refused.
 */
export async function applyAndSave(
  folder: string,
  edit: vscode.WorkspaceEdit,
  files: readonly string[],
): Promise<string[]> {
  const documents = await Promise.all(
    files.map((file) => vscode.workspace.openTextDocument(vscode.Uri.file(join(folder, file)))),
  );
  const unsaved = documents.map((document) => document.isDirty);
  if (!(await vscode.workspace.applyEdit(edit)))
    throw new Error("The edit was refused; nothing changed.");
  await Promise.all(
    documents.filter((_, index) => !unsaved[index]).map((document) => document.save()),
  );
  return files.filter((_, index) => unsaved[index]);
}

/** What a notification adds about the files left unsaved, naming them; empty when none was. */
export function unsavedNote(files: readonly string[]): string {
  if (files.length === 0) return "";
  const named =
    files.length === 1 ? files[0] : `${files.slice(0, -1).join(", ")} and ${files.at(-1)}`;
  return ` ${named} had unsaved changes, so ${files.length === 1 ? "it stays" : "they stay"} unsaved: save to keep the change.`;
}
