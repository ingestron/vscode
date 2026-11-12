// The picker for coding assistants, and the command that writes their files into an open project.
import { join } from "node:path";
import { run } from "@ingestron/cli";
import * as vscode from "vscode";
import {
  addedMessage,
  assistantItems,
  assistantPlaceholder,
  newProjectTitle,
  openGuide,
} from "../../features/assistants.js";
import type { ExtensionState } from "../state/index.js";

/** The names ticked under `title`, none when Enter is pressed alone; undefined on Escape. */
export async function chooseAssistants(title: string): Promise<string[] | undefined> {
  const picked = await vscode.window.showQuickPick(
    assistantItems.map((item) => ({ label: item.label, name: item.name })),
    { title, placeHolder: assistantPlaceholder, canPickMany: true },
  );
  return picked?.map((item) => item.name);
}

/** New project's step, after what to start from and before the folder. */
export function chooseNewProjectAssistants(): Promise<string[] | undefined> {
  return chooseAssistants(newProjectTitle);
}

/** Registers Add assistant files, for a project's menus and the Command Palette. */
export function registerAddAssistantFiles(
  context: vscode.ExtensionContext,
  state: ExtensionState,
  output: vscode.OutputChannel,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("ingestron.addAssistantFiles", (uri?: vscode.Uri) =>
      addAssistantFiles(state, output, uri),
    ),
  );
}

/** Writes the chosen assistants' files into the project, and says what was added. */
async function addAssistantFiles(
  state: ExtensionState,
  output: vscode.OutputChannel,
  uri?: vscode.Uri,
): Promise<void> {
  const here = state.hereFor(uri);
  if (!here) return void vscode.window.showWarningMessage("Open a file of an Ingestron project.");
  const names = await chooseAssistants("Add assistant files");
  if (!names || names.length === 0) return;
  const folder = here.project.folder;
  output.clear();
  output.show(true);
  const code = run(["assistant", "add", ...names, "--definitions", folder], {
    cwd: folder,
    write: (text) => output.append(text),
  });
  if (code !== 0) return;
  const picked = await vscode.window.showInformationMessage(addedMessage, openGuide);
  if (picked === openGuide) {
    await vscode.window.showTextDocument(vscode.Uri.file(join(folder, "AGENTS.md")));
  }
}
