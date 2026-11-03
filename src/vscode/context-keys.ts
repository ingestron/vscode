// The context keys the menus in package.json test: whether the active editor is
// in an Ingestron project, which folders are project folders, and which files
// are inside one. They change only when files or folders are created, deleted
// or renamed, or the active editor changes; an edit changes none of them, so
// no project is opened or scanned for one.
import { existsSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import * as vscode from "vscode";
import { fileInProject, projectFilesOf, serialised } from "../features/context-keys.js";
import { previewOf, previewScheme } from "./state.js";

/** How long structural changes settle before the files are listed again. */
const settle = 200;
/** The most YAML files read from one project; a project with more is keyed for its first ones only. */
const scanLimit = 5000;
const projectLimit = 1000;

/**
 * Keeps `ingestron.inProject`, `ingestron.projectFolders`, `ingestron.projectFiles` and
 * `ingestron.hasProjects` up to date. Updates run one at a time, so the last request wins.
 */
export function registerContextKeys(context: vscode.ExtensionContext): void {
  const sent = new Map<string, string>();
  const update = serialised(async (full) => {
    if (full) await setProjectKeys(sent);
    await setKey(sent, "ingestron.inProject", activeInProject());
  });
  let timer: NodeJS.Timeout | undefined;
  const rescan = () => {
    clearTimeout(timer);
    timer = setTimeout(() => update(true), settle);
  };
  // What Apply writes into build/ does not change which files are in a project.
  const outsideBuild = (uri: vscode.Uri) => {
    if (!uri.fsPath.includes(`${sep}build${sep}`)) rescan();
  };
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.{yaml,yml}");
  context.subscriptions.push(
    watcher,
    { dispose: () => clearTimeout(timer) },
    // A project, or a file in one, appears or goes, perhaps under the file that is open now.
    watcher.onDidCreate(outsideBuild),
    watcher.onDidDelete(outsideBuild),
    // Renaming, moving or deleting a folder in VS Code changes which files are in a project.
    vscode.workspace.onDidCreateFiles(rescan),
    vscode.workspace.onDidDeleteFiles(rescan),
    vscode.workspace.onDidRenameFiles(rescan),
    vscode.workspace.onDidChangeWorkspaceFolders(rescan),
    vscode.window.onDidChangeActiveTextEditor(() => update(false)),
  );
  update(true);
}

/** True when the active editor shows a project file or a preview of one's generated files. */
function activeInProject(): boolean {
  const uri = vscode.window.activeTextEditor?.document.uri;
  if (!uri) return false;
  if (uri.scheme === previewScheme) return existsSync(join(previewOf(uri).folder, "project.yaml"));
  return uri.scheme === "file" && fileInProject(uri.fsPath);
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
  const manifests = await vscode.workspace.findFiles(
    "**/project.yaml",
    "**/{node_modules,.git}/**",
    projectLimit,
  );
  const folders = manifests.map((manifest) => dirname(manifest.fsPath));
  const files = (await Promise.all(folders.map(yamlFilesIn))).flat();
  await setKey(sent, "ingestron.projectFolders", folders);
  await setKey(sent, "ingestron.hasProjects", folders.length > 0);
  await setKey(sent, "ingestron.projectFiles", projectFilesOf(files, folders));
}

/**
 * The YAML files of one project, apart from its build folder and the folders
 * of dependencies. The search is bounded by `scanLimit`: a project with more
 * files keeps menus on the first ones found and none on the rest, because a
 * `when` clause cannot match a folder's files as a group.
 */
async function yamlFilesIn(folder: string): Promise<string[]> {
  const found = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folder, "**/*.{yaml,yml}"),
    new vscode.RelativePattern(folder, "{build/**,**/node_modules/**,**/.git/**}"),
    scanLimit,
  );
  if (found.length >= scanLimit)
    console.warn(`ingestron: ${folder} has over ${scanLimit} YAML files; menus cover the first.`);
  return found.map((uri) => uri.fsPath);
}
