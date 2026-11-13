// Imports a file as soon as it is saved where the source request says: under sources/ in a
// project. The metadata document and project.yaml are never imported, so what an import writes
// does not start another.
import * as vscode from "vscode";
import {
  failedNotice,
  grouped,
  oversizeNotice,
  shouldImport,
  tooLarge,
  watchRefusalNotice,
} from "../../features/source-import.js";
import { limits } from "../../features/limits.js";
import type { ExtensionState, Here } from "../state/index.js";
import { reportImport, reportRefusal } from "./source-apply.js";
import { queued } from "./source-queue.js";

/**
 * Watches `sources/` folders and the saves of editors, and imports each file once its saves have
 * settled (`show` opens the full list of changes). Imports run one at a time (see `queued`).
 */
export function registerSourceWatch(
  context: vscode.ExtensionContext,
  state: ExtensionState,
  show: (summary: string) => Thenable<unknown>,
): void {
  const settled = grouped(limits.sourceImportSettleMs, (path) => {
    const uri = vscode.Uri.file(path);
    void queued(() => importSaved(state, uri, show)).catch((error) => failed(state, uri, error));
  });
  const event = (uri: vscode.Uri) => {
    const here = uri.scheme === "file" ? state.projectAt(uri) : undefined;
    if (here && importable(here, uri)) settled.push(uri.fsPath);
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

/** True when the file is one to import as soon as it is saved. */
function importable(here: Here, uri: vscode.Uri): boolean {
  const { project } = here;
  return shouldImport({ path: uri.fsPath, projectFolder: project.folder }, (file) =>
    project.sourceFileAt(file),
  );
}

function failed(state: ExtensionState, uri: vscode.Uri, error: unknown): void {
  console.error("ingestron: a saved source file could not be imported", error);
  const file = state.projectAt(uri)?.file ?? uri.fsPath;
  void vscode.window.showWarningMessage(failedNotice(file, error));
}

/**
 * Imports one saved file: the bytes on disk, as the project is once they are read. Nothing for a
 * folder or a gone file; a warning, and no read, for a file over the limit.
 */
async function importSaved(
  state: ExtensionState,
  uri: vscode.Uri,
  show: (summary: string) => Thenable<unknown>,
): Promise<void> {
  const size = await sizeOf(uri);
  const found = size === undefined ? undefined : state.projectAt(uri);
  if (size === undefined || !found || !importable(found, uri)) return;
  if (tooLarge(size, limits.sourceImportBytes))
    return void vscode.window.showWarningMessage(
      oversizeNotice(found.file, limits.sourceImportBytes),
    );
  const contents = await vscode.workspace.fs.readFile(uri);
  // The project is read afresh, after the file: the import before this one changed its files,
  // and the person may have changed them while the file was read.
  state.forget(uri.fsPath);
  const here = state.projectAt(uri);
  if (!here || !importable(here, uri)) return;
  const environment = state.environmentOf(here.project);
  const result = here.project.importSource(uri.fsPath, contents, {
    ...(environment && { environment }),
    at: new Date().toISOString(),
  });
  if ("refused" in result)
    return reportRefusal(here.file, watchRefusalNotice(here.file, result), result.refused, show);
  await reportImport(result, here.file, here.project.folder, show);
}

/** The file's size in bytes; undefined for a folder or a file that is gone. */
async function sizeOf(uri: vscode.Uri): Promise<number | undefined> {
  try {
    const { type, size } = await vscode.workspace.fs.stat(uri);
    return type & vscode.FileType.Directory ? undefined : size;
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") return undefined;
    throw error;
  }
}
