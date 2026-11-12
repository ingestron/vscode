// Imports a file as soon as it is saved where the source request says: under sources/ in a
// project. The metadata document and project.yaml are never imported, so what an import writes
// does not start another.
import * as vscode from "vscode";
import { grouped, shouldImport, watchRefusalNotice } from "../../features/source-import.js";
import { limits } from "../../features/limits.js";
import type { ExtensionState } from "../state/index.js";
import { reportImport } from "./source-apply.js";

/**
 * Watches `sources/` folders and the saves of editors, and imports each file once its saves have
 * settled (`show` opens the full list of changes). One import runs at a time, since two can
 * change the same metadata document.
 */
export function registerSourceWatch(
  context: vscode.ExtensionContext,
  state: ExtensionState,
  show: (summary: string) => Thenable<unknown>,
): void {
  let queue: Promise<void> = Promise.resolve();
  const settled = grouped(limits.sourceImportSettleMs, (path) => {
    queue = queue
      .then(() => importSaved(state, vscode.Uri.file(path), show))
      .catch((error) => failed(path, error));
  });
  const event = (uri: vscode.Uri) => {
    const here = uri.scheme === "file" ? state.projectAt(uri) : undefined;
    const path = uri.fsPath;
    if (
      here &&
      shouldImport({ path, projectFolder: here.project.folder }, (file) =>
        here.project.sourceFileAt(file),
      )
    )
      settled.push(path);
  };
  const watcher = vscode.workspace.createFileSystemWatcher("**/sources/**");
  context.subscriptions.push(
    settled,
    watcher,
    watcher.onDidCreate(event),
    watcher.onDidChange(event),
    vscode.workspace.onDidSaveTextDocument((document) => event(document.uri)),
  );
}

function failed(path: string, error: unknown): void {
  console.error("ingestron: a saved source file could not be imported", error);
  void vscode.window.showWarningMessage(`Could not import ${path}.`);
}

/** Imports one saved file: the bytes on disk, as the project is now. Nothing for a folder or a gone file. */
async function importSaved(
  state: ExtensionState,
  uri: vscode.Uri,
  show: (summary: string) => Thenable<unknown>,
): Promise<void> {
  const contents = await readFile(uri);
  if (!contents) return;
  // The project is read afresh: the import before this one changed its files.
  state.forget(uri.fsPath);
  const here = state.projectAt(uri);
  if (
    !here ||
    !shouldImport({ path: uri.fsPath, projectFolder: here.project.folder }, (file) =>
      here.project.sourceFileAt(file),
    )
  )
    return;
  const environment = state.environmentOf(here.project);
  const result = here.project.importSource(uri.fsPath, contents, {
    ...(environment && { environment }),
    at: new Date().toISOString(),
  });
  if ("refused" in result)
    return void vscode.window.showWarningMessage(watchRefusalNotice(here.file, result.refused));
  await reportImport(result, here.project.folder, show);
}

/** The file's bytes (Parquet is not text); undefined for a folder or a file that is gone. */
async function readFile(uri: vscode.Uri): Promise<Uint8Array | undefined> {
  try {
    const { type } = await vscode.workspace.fs.stat(uri);
    if (type & vscode.FileType.Directory) return undefined;
    return await vscode.workspace.fs.readFile(uri);
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") return undefined;
    throw error;
  }
}
