// The context keys the menus in package.json test: whether the active editor is
// in an Ingestron project, which folders are project folders, and which files
// are inside one.
import { dirname } from "node:path";
import * as vscode from "vscode";
import { projectFilesOf, serialised } from "../features/context-keys.js";
import { hereFor, onProjectChange } from "./state.js";

const exclude = "**/{build,node_modules,.git}/**";
/** How long file changes settle before the file lists are read again, so typing does not rescan. */
const settle = 200;

/**
 * Keeps `ingestron.inProject`, `ingestron.projectFolders`, `ingestron.projectFiles` and
 * `ingestron.hasProjects` up to date. Updates run one at a time, so the last request wins.
 */
export function registerContextKeys(context: vscode.ExtensionContext): void {
  const sent = new Map<string, string>();
  const update = serialised(async (full) => {
    if (full) await setProjectKeys(sent);
    await setKey(sent, "ingestron.inProject", hereFor(undefined) !== undefined);
  });
  let timer: NodeJS.Timeout | undefined;
  const rescan = () => {
    clearTimeout(timer);
    timer = setTimeout(() => update(true), settle);
  };
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.{yaml,yml}");
  context.subscriptions.push(
    watcher,
    { dispose: () => clearTimeout(timer) },
    // A project, or a file in one, appears or goes, perhaps under the file that is open now.
    watcher.onDidCreate(rescan),
    watcher.onDidDelete(rescan),
    // Renaming, moving or deleting a folder in VS Code changes which files are in a project.
    vscode.workspace.onDidCreateFiles(rescan),
    vscode.workspace.onDidDeleteFiles(rescan),
    vscode.workspace.onDidRenameFiles(rescan),
    vscode.workspace.onDidChangeWorkspaceFolders(rescan),
    onProjectChange(rescan),
    onProjectChange(() => update(false)),
    vscode.window.onDidChangeActiveTextEditor(() => update(false)),
  );
  update(true);
}

/** Sets a key, unless it already has that value. */
async function setKey(
  sent: Map<string, string>,
  key: string,
  value: boolean | string[] | Record<string, true>,
): Promise<void> {
  const text = JSON.stringify(value);
  if (sent.get(key) === text) return;
  sent.set(key, text);
  await vscode.commands.executeCommand("setContext", key, value);
}

/**
 * The folders that hold a project.yaml and the YAML files inside them, as
 * `resourcePath` spells them, for menus in the Explorer.
 */
async function setProjectKeys(sent: Map<string, string>): Promise<void> {
  const [manifests, yaml] = await Promise.all([
    vscode.workspace.findFiles("**/project.yaml", exclude),
    vscode.workspace.findFiles("**/*.{yaml,yml}", exclude),
  ]);
  const folders = manifests.map((manifest) => dirname(manifest.fsPath));
  await setKey(sent, "ingestron.projectFolders", folders);
  await setKey(sent, "ingestron.hasProjects", folders.length > 0);
  await setKey(
    sent,
    "ingestron.projectFiles",
    projectFilesOf(
      yaml.map((uri) => uri.fsPath),
      folders,
    ),
  );
}
