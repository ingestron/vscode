// The Project view in the Ingestron side bar: each project's environments
// (click one to select it) and the actions on the project. It reads the same
// state as the status bar and keeps nothing of its own.
import { basename, dirname, join } from "node:path";
import * as vscode from "vscode";
import { parse } from "yaml";
import { limits } from "../features/limits.js";
import {
  isProjectManifest,
  projectTree,
  rowId,
  type ProjectInfo,
  type TreeNode,
} from "../features/project-tree.js";
import { environmentOf, onEnvironmentChange, projectAt } from "./state.js";

const exclude = "**/{build,node_modules,.git}/**";

/** Registers the Project view and keeps it up to date. */
export function registerProjectView(context: vscode.ExtensionContext): void {
  const provider = new ProjectTree();
  let timer: NodeJS.Timeout | undefined;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(() => provider.refresh(), limits.projectViewSettleMs);
  };
  const manifests = vscode.workspace.createFileSystemWatcher("**/project.yaml");
  // Only the integration test reads the rows this way, so no other run has the command.
  if (context.extensionMode === vscode.ExtensionMode.Test)
    context.subscriptions.push(
      vscode.commands.registerCommand("ingestron.projectRows", () => provider.getChildren()),
    );
  context.subscriptions.push(
    provider,
    manifests,
    { dispose: () => clearTimeout(timer) },
    vscode.window.registerTreeDataProvider("ingestron.project", provider),
    // The view shows only the folders, the environments and the chosen one, so it
    // follows those and not every edit (which includes text in the Output channel).
    onEnvironmentChange(changed),
    manifests.onDidChange(changed),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (isProjectManifest(event.document.uri.fsPath)) changed();
    }),
    // A project appears, goes or moves; the list of folders is read again.
    manifests.onDidCreate(() => provider.refresh(true)),
    manifests.onDidDelete(() => provider.refresh(true)),
    vscode.workspace.onDidCreateFiles(() => provider.refresh(true)),
    vscode.workspace.onDidDeleteFiles(() => provider.refresh(true)),
    vscode.workspace.onDidRenameFiles(() => provider.refresh(true)),
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.refresh(true)),
  );
}

class ProjectTree implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
  private readonly changes = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changes.event;
  /** The project folders, read from the workspace when something may have moved them. */
  private folders: Promise<string[]> | undefined;
  /** A row's place in the tree, so a row keeps its expanded state when the tree is rebuilt. */
  private readonly ids = new WeakMap<TreeNode, string>();

  /** Rebuilds the rows; `rescan` reads the project folders again first. */
  refresh(rescan = false): void {
    if (rescan) this.folders = undefined;
    this.changes.fire();
  }

  dispose(): void {
    this.changes.dispose();
  }

  async getChildren(node?: TreeNode): Promise<TreeNode[]> {
    const rows = node
      ? (node.children ?? [])
      : projectTree(await this.projects(), vscode.Uri.file, relativeToWorkspace);
    const parent = node ? this.ids.get(node) : "";
    for (const row of rows) this.ids.set(row, rowId(parent ?? "", row));
    return rows;
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      node.label,
      node.children
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    );
    item.id = this.ids.get(node);
    item.iconPath = new vscode.ThemeIcon(node.icon);
    if (node.description) item.description = node.description;
    if (node.command)
      item.command = {
        command: node.command.id,
        title: node.label,
        arguments: node.command.args,
      };
    return item;
  }

  private async projects(): Promise<ProjectInfo[]> {
    this.folders ??= findFolders();
    const found: ProjectInfo[] = [];
    for (const folder of await this.folders) {
      const here = projectAt(vscode.Uri.file(join(folder, "project.yaml")));
      if (!here) continue;
      const { project } = here;
      const chosen = environmentOf(project);
      found.push({
        folder,
        id: idOf(project.files.read("project.yaml"), folder),
        environments: project.environments,
        ...(chosen && { chosen }),
      });
    }
    return found;
  }
}

/** A folder as the Explorer spells it, relative to the workspace; "." for the workspace folder itself. */
function relativeToWorkspace(folder: string): string {
  return vscode.workspace.asRelativePath(folder) || ".";
}

async function findFolders(): Promise<string[]> {
  const manifests = await vscode.workspace.findFiles(
    "**/project.yaml",
    exclude,
    limits.projectsPerWorkspace,
  );
  return manifests.map((manifest) => dirname(manifest.fsPath)).sort();
}

/** The project's `id`, else its folder's name. */
function idOf(text: string | undefined, folder: string): string {
  try {
    const id = (parse(text ?? "") as { id?: unknown } | null)?.id;
    if (typeof id === "string" && id !== "") return id;
  } catch {
    // The problem is reported on the file itself.
  }
  return basename(folder);
}
