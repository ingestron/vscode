// What the extension keeps: the project for a file (with open editors read
// before the disk) and the environment chosen for each project, which is
// remembered in the workspace so it is the same after a restart.
import { join, sep } from "node:path";
import * as vscode from "vscode";
import {
  inProject,
  openProject,
  positionAt,
  projectFolderOf,
  type Project,
} from "@ingestron/authoring";

/** A project and the file's path in it. */
export interface Here {
  project: Project;
  file: string;
  /** For a preview of generated files: the environment it shows, which commands then use. */
  environment?: string;
}

/** The environment for commands here: a preview's own, else the project's chosen one. */
export function environmentHere(here: Here): string | undefined {
  return here.environment ?? environmentOf(here.project);
}

const environments = new Map<string, string>();
const environmentsKey = "ingestron.environments";
let memory: vscode.Memento | undefined;

/** Reads the environments chosen before, and keeps later choices in `memento`. */
export function rememberEnvironments(memento: vscode.Memento): void {
  memory = memento;
  const saved = memento.get<Record<string, string>>(environmentsKey) ?? {};
  for (const [folder, environment] of Object.entries(saved)) environments.set(folder, environment);
}
const changes = new vscode.EventEmitter<void>();
/** Fires when any project's files or chosen environment change. */
export const onProjectChange = changes.event;
/** One snapshot per project folder, so features share parsing and resolution until something changes. */
const projects = new Map<string, Project>();

/** Drops the snapshot of any project that holds the path, after an edit or a change on disk. */
export function forget(path: string): void {
  for (const folder of [...projects.keys()])
    if (path === folder || path.startsWith(`${folder}${sep}`)) projects.delete(folder);
  changes.fire();
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

/** The project a file belongs to, or undefined outside any project. */
export function projectAt(uri: vscode.Uri): Here | undefined {
  if (uri.scheme !== "file") return undefined;
  const folder = projectFolderOf(uri.fsPath);
  const file = folder && inProject(folder, uri.fsPath);
  if (!folder || !file) return undefined;
  let project = projects.get(folder);
  if (!project) projects.set(folder, (project = openProject(folder, openTexts())));
  return { project, file };
}

/** The chosen environment, else the first the project declares. */
export function environmentOf(project: Project): string | undefined {
  const chosen = environments.get(project.folder);
  return chosen && project.environments.includes(chosen) ? chosen : project.environments[0];
}

/** Remembers the environment for the project. */
export function chooseEnvironment(project: Project, environment: string): void {
  environments.set(project.folder, environment);
  void memory?.update(environmentsKey, Object.fromEntries(environments));
  changes.fire();
}

/** A VS Code range for offsets in a project file. */
export function rangeIn(
  project: Project,
  file: string,
  [start, end]: [number, number],
): vscode.Range {
  const text = project.files.read(file) ?? "";
  const from = positionAt(text, start);
  const to = positionAt(text, end);
  return new vscode.Range(from.line, from.character, to.line, to.character);
}

/** The URI of a project file. */
export function uriOf(project: Project, file: string): vscode.Uri {
  return vscode.Uri.file(join(project.folder, file));
}
