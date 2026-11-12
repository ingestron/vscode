// Writes what an import gives: the whole text of each file, in one workspace edit, then saved.
import { join } from "node:path";
import * as vscode from "vscode";
import type { SourceImportEdit } from "@ingestron/authoring";
import type { ImportFailure } from "../../features/source-import.js";

/** A file the import changes, and whether to save it afterwards. */
interface Change {
  file: string;
  uri: vscode.Uri;
  save: boolean;
}

/**
 * Replaces each file of `imported` in the project at `folder` (open editors hold the text it was
 * made from), or creates it, as one change that one undo reverts. Then saves the metadata
 * document; project.yaml is saved only when it had no unsaved changes before, since saving it
 * otherwise would write the person's own unfinished typing. Returns where it failed, if it did.
 */
export async function applyImport(
  imported: Pick<SourceImportEdit, "files">,
  folder: string,
): Promise<ImportFailure | undefined> {
  const edit = new vscode.WorkspaceEdit();
  const changes: Change[] = [];
  for (const { file, text } of imported.files) {
    const change = await stage(edit, vscode.Uri.file(join(folder, file)), file, text);
    if (change) changes.push(change);
  }
  if (!(await vscode.workspace.applyEdit(edit)))
    return { file: changes[0]?.file ?? "the import", step: "write" };
  for (const { file, uri, save } of changes) {
    const document = await vscode.workspace.openTextDocument(uri);
    if (save && document.isDirty && !(await document.save())) return { file, step: "save" };
  }
  return undefined;
}

/** Adds the file's new text to `edit`; undefined, adding nothing, when the file already holds it. */
async function stage(
  edit: vscode.WorkspaceEdit,
  uri: vscode.Uri,
  file: string,
  text: string,
): Promise<Change | undefined> {
  const document = await existing(uri);
  if (document?.getText() === text) return undefined;
  if (document) edit.replace(uri, allOf(document), text);
  else {
    edit.createFile(uri, { ignoreIfExists: true });
    edit.insert(uri, new vscode.Position(0, 0), text);
  }
  return { file, uri, save: file !== "project.yaml" || !document?.isDirty };
}

function allOf(document: vscode.TextDocument): vscode.Range {
  return new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
}

/**
 * The document of a file that is there, open or on disk; undefined for one that is not. A file
 * that exists but cannot be opened throws.
 */
async function existing(uri: vscode.Uri): Promise<vscode.TextDocument | undefined> {
  try {
    await vscode.workspace.fs.stat(uri);
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") return undefined;
    throw error;
  }
  return vscode.workspace.openTextDocument(uri);
}
