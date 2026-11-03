// The context keys the menus in package.json test: whether the active editor is
// in an Ingestron project, and which folders are project folders.
import { dirname } from "node:path";
import * as vscode from "vscode";
import { hereFor } from "./state.js";

const exclude = "**/{build,node_modules,.git}/**";

/** Keeps `ingestron.inProject`, `ingestron.projectFolders` and `ingestron.hasProjects` up to date. */
export function registerContextKeys(context: vscode.ExtensionContext): void {
  const update = () => {
    void setProjectFolders();
    void setInProject();
  };
  const watcher = vscode.workspace.createFileSystemWatcher("**/project.yaml");
  context.subscriptions.push(
    watcher,
    // A project appears or goes, perhaps under the file that is open now.
    watcher.onDidCreate(update),
    watcher.onDidDelete(update),
    vscode.workspace.onDidChangeWorkspaceFolders(update),
    vscode.window.onDidChangeActiveTextEditor(() => void setInProject()),
  );
  void setInProject();
  void setProjectFolders();
}

function setKey(key: string, value: boolean | string[]): Thenable<unknown> {
  return vscode.commands.executeCommand("setContext", key, value);
}

/** True when the active editor is a project file or a preview of one's generated files. */
async function setInProject(): Promise<void> {
  await setKey("ingestron.inProject", hereFor(undefined) !== undefined);
}

/**
 * The folders of the workspace that hold a project.yaml, as `resourcePath`
 * spells them, for menus on a folder in the Explorer.
 */
async function setProjectFolders(): Promise<void> {
  const manifests = await vscode.workspace.findFiles("**/project.yaml", exclude);
  const folders = manifests.map((manifest) => dirname(manifest.fsPath));
  await setKey("ingestron.projectFolders", folders);
  await setKey("ingestron.hasProjects", folders.length > 0);
}
