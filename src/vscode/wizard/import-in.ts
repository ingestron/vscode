// A new definition's import, written into project.yaml through the editor rather than the disk.
import { join } from "node:path";
import * as vscode from "vscode";
import type { AddedImport } from "@ingestron/core";
import { textChange } from "../../features/text-change.js";
import { applyAndSave, unsavedNote } from "./saved-edit.js";

/**
 * project.yaml's new import as one undoable edit of only the line it adds. The text may hold
 * unsaved changes the draft was made from; returns project.yaml when it stays unsaved.
 */
export async function importIn(
  folder: string,
  current: string,
  imports: AddedImport,
): Promise<string[]> {
  const change = textChange("project.yaml", current, imports.project);
  const document = await vscode.workspace.openTextDocument(
    vscode.Uri.file(join(folder, "project.yaml")),
  );
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    document.uri,
    new vscode.Range(document.positionAt(change.start), document.positionAt(change.end)),
    change.text,
  );
  return applyAndSave(folder, edit, ["project.yaml"]);
}

/** The notification for a new file and the import that loads it, naming a file left unsaved. */
export function addedNote(file: string, imports: AddedImport, unsaved: readonly string[]): string {
  return `Added ${file}; project.yaml now imports ${imports.added}.${unsavedNote(unsaved)}`;
}
