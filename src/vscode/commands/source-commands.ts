// Request source metadata and Import source metadata…: the request to send to whoever can read
// the source's catalogue, and the file they send back, read into sources/<connection>.yaml.
// What to ask for and what a file means are decided by ProjectSnapshot (core's rules); this
// asks the person for the choices and shows the result.
import * as vscode from "vscode";
import type { ProjectSnapshot, SourceImportEdit } from "@ingestron/authoring";
import {
  importNotice,
  needsObject,
  refusalNotice,
  showChanges,
} from "../../features/source-import.js";
import { applyImport } from "../editor/index.js";
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
  const connections = connectionsOf(here.project);
  let connection: string | undefined;
  if (connections.length >= 2) {
    const choices = [
      { label: "All connections", connection: undefined },
      ...connections.map((id) => ({ label: id, connection: id })),
    ];
    const chosen = await vscode.window.showQuickPick(choices, {
      placeHolder: "The connection to ask about",
    });
    if (!chosen) return;
    connection = chosen.connection;
  }
  await showMarkdown(here.project.sourceRequest(state.environmentHere(here), connection));
}

/** Reads a chosen file into the project's source metadata and tells the person what changed. */
async function importSourceMetadata(state: ExtensionState, uri?: vscode.Uri): Promise<void> {
  const here = state.hereFor(uri);
  if (!here) return void vscode.window.showWarningMessage("Open a file of an Ingestron project.");
  const file = (
    await vscode.window.showOpenDialog({
      canSelectMany: false,
      defaultUri: vscode.Uri.file(here.project.folder),
      openLabel: "Import",
      title: "The file that describes a source's tables",
    })
  )?.[0];
  if (!file) return;
  const connection = await connectionFor(here, file);
  if (connection === null) return;
  const contents = await vscode.workspace.fs.readFile(file);
  const options = {
    ...(connection && { connection }),
    ...optionalEnvironment(state.environmentHere(here)),
    at: new Date().toISOString(),
  };
  let result = here.project.importSource(file.fsPath, contents, options);
  if ("refused" in result && needsObject(result.refused)) {
    const object = await vscode.window.showInputBox({
      prompt: "The table this file describes, such as ERP.dbo.Customers",
      validateInput: (value) => (value.trim() === "" ? "Give the table's name." : undefined),
    });
    if (!object) return;
    result = here.project.importSource(file.fsPath, contents, {
      ...options,
      object: object.trim(),
    });
  }
  if ("refused" in result)
    return void vscode.window.showWarningMessage(refusalNotice(result.refused));
  await finish(result, here.project.folder);
}

const optionalEnvironment = (environment: string | undefined) =>
  environment ? { environment } : {};

/**
 * The connection the file describes when its path does not name one: the project's only
 * connection, else the person's choice. Undefined when the path names it; null when there is
 * none to choose or the person chose nothing.
 */
async function connectionFor(here: Here, file: vscode.Uri): Promise<string | undefined | null> {
  if (here.project.sourceFileAt(file.fsPath)) return undefined;
  const connections = connectionsOf(here.project);
  if (connections.length === 0) {
    void vscode.window.showWarningMessage("The project has no connection to import for.");
    return null;
  }
  if (connections.length === 1) return connections[0]!;
  return (
    (await vscode.window.showQuickPick(connections, {
      placeHolder: "The connection this file describes",
    })) ?? null
  );
}

/** Writes the import and tells the person, with the button that shows every change. */
async function finish(imported: SourceImportEdit, folder: string): Promise<void> {
  const unwritten = await applyImport(imported, folder);
  if (unwritten)
    return void vscode.window.showWarningMessage(
      `Could not write ${unwritten}, so the import stopped.`,
    );
  const { message, buttons } = importNotice(imported);
  // Not awaited: the command is done when the files are written, not when the message is closed.
  void vscode.window.showInformationMessage(message, ...buttons).then((pressed) => {
    if (pressed === showChanges) return showMarkdown(imported.summary);
  });
}
