// Request source metadata and Import source metadata…: the request to send to whoever can read
// the source's catalogue, and the file they send back, read into sources/<connection>.yaml.
// What to ask for and what a file means are decided by ProjectSnapshot (core's rules); this
// asks the person for the choices and shows the result.
import * as vscode from "vscode";
import type { ProjectSnapshot, SourceImportEdit } from "@ingestron/authoring";
import {
  connectionChoice,
  needsObject,
  noConnectionNotice,
  refusalNotice,
  requestChoices,
} from "../../features/source-import.js";
import { reportImport } from "../editor/index.js";
import type { ExtensionState, Here } from "../state/index.js";
import { showMarkdown } from "./markdown.js";

/** Registers the two commands, for a project's menus and the Command Palette. */
export function registerSourceCommands(
  context: vscode.ExtensionContext,
  state: ExtensionState,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("ingestron.requestSourceMetadata", (uri?: vscode.Uri) =>
      requestSourceMetadata(state, uri),
    ),
    vscode.commands.registerCommand("ingestron.importSourceMetadata", (uri?: vscode.Uri) =>
      importSourceMetadata(state, uri),
    ),
  );
}

/** The ids of the project's connections, in the order the project lists them. */
function connectionsOf(project: ProjectSnapshot): string[] {
  const ids = project
    .symbols()
    .filter((symbol) => symbol.kind === "Connection")
    .map((symbol) => symbol.name);
  return [...new Set(ids)];
}

/** The source request for the selected environment, as an unsaved Markdown document to send. */
async function requestSourceMetadata(state: ExtensionState, uri?: vscode.Uri): Promise<void> {
  const here = state.hereFor(uri);
  if (!here) return void vscode.window.showWarningMessage("Open a file of an Ingestron project.");
  const choices = requestChoices(connectionsOf(here.project));
  let connection: string | undefined;
  if (choices) {
    const chosen = await vscode.window.showQuickPick(choices, {
      placeHolder: "The connection to ask about",
    });
    if (!chosen) return;
    connection = chosen.connection;
  }
  await showMarkdown(here.project.sourceRequest(state.environmentHere(here), connection));
}

/**
 * Reads a file into the project's source metadata and tells the person what changed. The file is
 * the one clicked in the Explorer, else the one chosen in the open dialog; a folder, a project
 * view row or the Command Palette gives the project only.
 */
async function importSourceMetadata(state: ExtensionState, uri?: vscode.Uri): Promise<void> {
  const clicked = await clickedFile(uri);
  // A clicked file outside every project is imported into the project of the active editor.
  const here = state.hereFor(uri) ?? (clicked ? state.hereFor(undefined) : undefined);
  if (!here) return void vscode.window.showWarningMessage("Open a file of an Ingestron project.");
  const file = clicked ?? (await chooseFile(here.project.folder));
  const connection = file && (await connectionFor(here, file));
  if (!file || connection === null) return;
  const options = {
    ...(connection && { connection }),
    ...optionalEnvironment(state.environmentHere(here)),
    at: new Date().toISOString(),
  };
  const result = await importFile(here.project, file, options);
  if (result) await finish(result, here.project.folder);
}

type ImportOptions = Parameters<ProjectSnapshot["importSource"]>[2];

/**
 * Imports the file; when it stops for want of the table it describes, asks for the table once and
 * imports again. Undefined when the person gives none.
 */
async function importFile(
  project: ProjectSnapshot,
  file: vscode.Uri,
  options: ImportOptions,
): Promise<ReturnType<ProjectSnapshot["importSource"]> | undefined> {
  const contents = await vscode.workspace.fs.readFile(file);
  const result = project.importSource(file.fsPath, contents, options);
  if (!("refused" in result) || !needsObject(result.refused)) return result;
  const object = await vscode.window.showInputBox({
    prompt: "The table this file describes, such as ERP.dbo.Customers",
    validateInput: (value) => (value.trim() === "" ? "Give the table's name." : undefined),
  });
  return object
    ? project.importSource(file.fsPath, contents, { ...options, object: object.trim() })
    : undefined;
}

/** The file a command was run on, when it is a file; undefined for a folder or nothing. */
async function clickedFile(uri: vscode.Uri | undefined): Promise<vscode.Uri | undefined> {
  if (typeof uri?.scheme !== "string" || uri.scheme !== "file") return undefined;
  try {
    const { type } = await vscode.workspace.fs.stat(uri);
    return type & vscode.FileType.Directory ? undefined : uri;
  } catch {
    return undefined;
  }
}

async function chooseFile(folder: string): Promise<vscode.Uri | undefined> {
  const chosen = await vscode.window.showOpenDialog({
    canSelectMany: false,
    defaultUri: vscode.Uri.file(folder),
    openLabel: "Import",
    title: "The file that describes a source's tables",
  });
  return chosen?.[0];
}

const optionalEnvironment = (environment: string | undefined) =>
  environment ? { environment } : {};

/**
 * The connection the file describes when its path does not name one (the project's only
 * connection, else the person's choice). Undefined when the path names it; null when there is
 * none to choose or the person chose nothing.
 */
async function connectionFor(here: Here, file: vscode.Uri): Promise<string | undefined | null> {
  const choice = connectionChoice(
    here.project.sourceFileAt(file.fsPath) !== undefined,
    connectionsOf(here.project),
  );
  if (choice.kind === "path") return undefined;
  if (choice.kind === "use") return choice.connection;
  if (choice.kind === "none") {
    void vscode.window.showWarningMessage(noConnectionNotice);
    return null;
  }
  const picked = await vscode.window.showQuickPick(choice.connections, {
    placeHolder: "The connection this file describes",
  });
  return picked ?? null;
}

/** Tells the person why an import stopped, or writes it and tells them what changed. */
async function finish(
  result: SourceImportEdit | { refused: string[] },
  folder: string,
): Promise<void> {
  if ("refused" in result)
    return void vscode.window.showWarningMessage(refusalNotice(result.refused));
  await reportImport(result, folder, showMarkdown);
}
