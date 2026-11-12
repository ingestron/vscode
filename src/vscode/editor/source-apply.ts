// Writes what an import gives: the whole text of each file, in one workspace edit, then saved.
import { join } from "node:path";
import * as vscode from "vscode";
import type { SourceImportEdit } from "@ingestron/authoring";

/**
 * Replaces each file of `imported` in the project at `folder` (open editors hold the text it was
 * made from), or creates it, as one change that one undo reverts, then saves the files it changed.
 * Returns the first file it could not write or save, else undefined.
 */
export async function applyImport(
  imported: Pick<SourceImportEdit, "files">,
  folder: string,
): Promise<string | undefined> {
  const edit = new vscode.WorkspaceEdit();
  const changed: { file: string; uri: vscode.Uri }[] = [];
  for (const { file, text } of imported.files) {
    const uri = vscode.Uri.file(join(folder, file));
    const document = await existing(uri);
    if (!document) {
      edit.createFile(uri, { ignoreIfExists: true });
      edit.insert(uri, new vscode.Position(0, 0), text);
    } else if (document.getText() !== text) {
      const end = document.positionAt(document.getText().length);
      edit.replace(uri, new vscode.Range(document.positionAt(0), end), text);
    } else continue;
    changed.push({ file, uri });
  }
  if (!(await vscode.workspace.applyEdit(edit))) return changed[0]?.file;
  for (const { file, uri } of changed) {
    const document = await vscode.workspace.openTextDocument(uri);
    if (document.isDirty && !(await document.save())) return file;
  }
  return undefined;
}

/** The document of a file that is there, open or on disk; undefined for one that is not. */
async function existing(uri: vscode.Uri): Promise<vscode.TextDocument | undefined> {
  try {
    return await vscode.workspace.openTextDocument(uri);
  } catch {
    return undefined;
  }
}
