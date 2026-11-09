// What the extension keeps: the project for a file (with open editors read
// before the disk) and the environment chosen for each project, which is
// remembered in the workspace so it is the same after a restart.
import { statSync } from "node:fs";
import { join, sep } from "node:path";
import * as vscode from "vscode";
import { inProject, positionAt, projectFolderOf, ProjectSnapshot } from "@ingestron/authoring";

/** A project and the file's path in it. */
export interface Here {
  project: ProjectSnapshot;
  file: string;
  /**
   * For a preview of generated files: the environment it shows, which Show generated files,
   * Compare with build and Prepare platform request then use. Plan, Apply and Check take none.
   */
  environment?: string;
}

const environmentsKey = "ingestron.environments";

/**
 * What the extension keeps while it runs: one snapshot per project folder, so features share
 * parsing and resolution until something changes, and the environment chosen for each
 * project, kept in the workspace's memory. Made once, when the extension starts.
 */
export class ExtensionState implements vscode.Disposable {
  readonly #memory: vscode.Memento;
  readonly #environments = new Map<string, string>();
  readonly #projects = new Map<string, ProjectSnapshot>();
  readonly #changes = new vscode.EventEmitter<void>();
  readonly #environmentChanges = new vscode.EventEmitter<void>();
  /** Fires when any project's files or chosen environment change. */
  readonly onProjectChange = this.#changes.event;
  /** Fires when an environment is chosen for a project; unlike `onProjectChange`, not on every edit. */
  readonly onEnvironmentChange = this.#environmentChanges.event;

  /** Reads the environments chosen before from `memory`, and keeps later choices there. */
  constructor(memory: vscode.Memento) {
    this.#memory = memory;
    const saved = memory.get<Record<string, string>>(environmentsKey) ?? {};
    for (const [folder, environment] of Object.entries(saved))
      this.#environments.set(folder, environment);
  }

  /** Drops the snapshot of any project that holds the path, after an edit or a change on disk. */
  forget(path: string): void {
    for (const folder of [...this.#projects.keys()])
      if (path === folder || path.startsWith(`${folder}${sep}`)) this.#projects.delete(folder);
    this.#changes.fire();
  }

  /** The project a file belongs to, or undefined outside any project. */
  projectAt(uri: vscode.Uri): Here | undefined {
    if (uri.scheme !== "file") return undefined;
    const folder = projectFolderOf(uri.fsPath);
    const file = folder && inProject(folder, uri.fsPath);
    if (!folder || !file) return undefined;
    let project = this.#projects.get(folder);
    if (!project) this.#projects.set(folder, (project = ProjectSnapshot.open(folder, openTexts())));
    return { project, file };
  }

  /**
   * The project of a file, or of the preview, that `uri` names. A preview also
   * gives its environment, so a command run from it acts on what it shows.
   */
  contextAt(uri: vscode.Uri): Here | undefined {
    if (uri.scheme !== previewScheme) return this.projectAt(uri);
    const { folder, file, environment } = previewOf(uri);
    const here = this.projectAt(vscode.Uri.file(join(folder, "project.yaml")));
    return here && { project: here.project, file, ...(environment && { environment }) };
  }

  /**
   * The project of what a command was run on: a clicked file, preview or folder
   * (a project folder, or any folder inside one). Without one, as from the
   * Command Palette, the project of the active editor.
   */
  hereFor(uri: vscode.Uri | undefined): Here | undefined {
    // Menus pass a URI; anything else a command might be given means the active editor.
    if (typeof uri?.scheme !== "string") {
      const active = vscode.window.activeTextEditor?.document.uri;
      return active && this.contextAt(active);
    }
    if (!isFolder(uri)) return this.contextAt(uri);
    // projectFolderOf starts at a path's parent, so a stand-in file inside the folder includes it.
    const inside = join(uri.fsPath, "project.yaml");
    const folder = projectFolderOf(inside);
    return folder ? this.projectAt(vscode.Uri.file(join(folder, "project.yaml"))) : undefined;
  }

  /** The chosen environment, else the first the project declares. */
  environmentOf(project: ProjectSnapshot): string | undefined {
    const chosen = this.#environments.get(project.folder);
    return chosen && project.environments.includes(chosen) ? chosen : project.environments[0];
  }

  /**
   * The environment for Show generated files, Compare with build and Prepare platform request
   * here: a preview's own, else the project's chosen one.
   */
  environmentHere(here: Here): string | undefined {
    return here.environment ?? this.environmentOf(here.project);
  }

  /** Remembers the environment for the project. */
  chooseEnvironment(project: ProjectSnapshot, environment: string): void {
    this.#environments.set(project.folder, environment);
    void this.#memory.update(environmentsKey, Object.fromEntries(this.#environments));
    this.#changes.fire();
    this.#environmentChanges.fire();
  }

  /** Stops the change events. */
  dispose(): void {
    this.#changes.dispose();
    this.#environmentChanges.dispose();
  }
}

/**
 * The text of every file with unsaved changes, by absolute path. A saved one
 * matches the disk, and VS Code keeps closed documents for a while, so a
 * deleted file must not come back from one.
 */
export function openTexts(): Map<string, string> {
  return new Map(
    vscode.workspace.textDocuments
      .filter((document) => document.uri.scheme === "file" && document.isDirty)
      .map((document) => [document.uri.fsPath, document.getText()]),
  );
}

/** The scheme of read-only previews of generated files. */
export const previewScheme = "ingestron-generated";

/** What a preview's URI names: its project folder, environment and generated file. */
export function previewOf(uri: vscode.Uri): { folder: string; environment: string; file: string } {
  const query = new URLSearchParams(uri.query);
  return {
    folder: query.get("folder") ?? "",
    environment: query.get("environment") ?? "",
    file: query.get("file") ?? "",
  };
}

function isFolder(uri: vscode.Uri): boolean {
  try {
    return uri.scheme === "file" && statSync(uri.fsPath).isDirectory();
  } catch {
    return false;
  }
}

/** A VS Code range for offsets in a project file. */
export function rangeIn(
  project: ProjectSnapshot,
  file: string,
  [start, end]: [number, number],
): vscode.Range {
  const text = project.files.read(file) ?? "";
  const from = positionAt(text, start);
  const to = positionAt(text, end);
  return new vscode.Range(from.line, from.character, to.line, to.character);
}

/** The URI of a project file. */
export function uriOf(project: ProjectSnapshot, file: string): vscode.Uri {
  return vscode.Uri.file(join(project.folder, file));
}
