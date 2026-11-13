// Writes what an import gives: the whole text of each file, in one workspace edit, then saved.
import { join } from "node:path";
import * as vscode from "vscode";
import type { SourceImportEdit } from "@ingestron/authoring";
import {
  batchNotices,
  importFailureNotice,
  type BatchEntry,
  type ImportFailure,
} from "../../features/source-import.js";
import { idle, onEmpty } from "./source-queue.js";

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
 * otherwise would write the person's own unfinished typing. Returns where it failed, if it did;
 * a file that cannot be read fails before anything is written.
 */
export async function applyImport(
  imported: Pick<SourceImportEdit, "files">,
  folder: string,
): Promise<ImportFailure | undefined> {
  const edit = new vscode.WorkspaceEdit();
  const changes = await stageAll(edit, imported, folder);
  if (!Array.isArray(changes)) return changes;
  if (!(await vscode.workspace.applyEdit(edit)))
    return { file: changes[0]?.file ?? "the import", step: "write" };
  for (const { file, uri, save } of changes) {
    const document = await vscode.workspace.openTextDocument(uri);
    if (save && document.isDirty && !(await document.save())) return { file, step: "save" };
  }
  return undefined;
}

/** What the imports of one drain of the queue gave, told when the queue is empty. */
let entries: BatchEntry[] = [];
let showText: ((text: string) => Thenable<unknown>) | undefined;
onEmpty(flush);

/**
 * Writes an import (see `applyImport`) of `file` (relative to the project) and records what
 * changed, or warns that it could not be finished. Done when the files are written, not when the
 * message is closed. What changed is told when the queue is empty, with the other imports of the
 * same drain as one notice (see `batchNotices`); `show` opens a document of the changes.
 */
export async function reportImport(
  imported: SourceImportEdit,
  file: string,
  folder: string,
  show: (text: string) => Thenable<unknown>,
): Promise<void> {
  const failure = await applyImport(imported, folder);
  if (failure) return void vscode.window.showWarningMessage(importFailureNotice(failure, folder));
  record({ kind: "imported", file, summary: imported.summary, breaking: imported.breaking }, show);
}

/**
 * Records an import of `file` that stopped, with the warning it gives alone (`message`) and each
 * reason; told when the queue is empty, never folded into the notice of the imports.
 */
export function reportRefusal(
  file: string,
  message: string,
  refused: readonly string[],
  show: (text: string) => Thenable<unknown>,
): void {
  record({ kind: "refused", file, message, refused }, show);
}

function record(entry: BatchEntry, show: (text: string) => Thenable<unknown>): void {
  entries.push(entry);
  showText ??= show;
  // Outside the queue nothing is draining, so nothing would tell it.
  if (idle()) flush();
}

/** Tells the person what the recorded imports gave, as one notice of each kind. */
function flush(): void {
  const done = entries;
  const show = showText;
  entries = [];
  showText = undefined;
  if (!show) return;
  for (const { level, message, button, document } of batchNotices(done)) {
    const buttons = button ? [button] : [];
    const shown =
      level === "warning"
        ? vscode.window.showWarningMessage(message, ...buttons)
        : vscode.window.showInformationMessage(message, ...buttons);
    void shown.then((pressed) => {
      if (pressed === button && document !== undefined) return show(document);
    });
  }
}

/** Stages every file of the import; the failure instead for one that is there but cannot be read. */
async function stageAll(
  edit: vscode.WorkspaceEdit,
  imported: Pick<SourceImportEdit, "files">,
  folder: string,
): Promise<Change[] | ImportFailure> {
  const changes: Change[] = [];
  for (const { file, text } of imported.files) {
    try {
      const change = await stage(edit, vscode.Uri.file(join(folder, file)), file, text);
      if (change) changes.push(change);
    } catch (error) {
      return { file, step: "read", error };
    }
  }
  return changes;
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
  // Created with its text, so the file is never on disk empty.
  else edit.createFile(uri, { ignoreIfExists: true, contents: new TextEncoder().encode(text) });
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
