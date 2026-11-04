// Plan, Apply, Check, Select environment, Show generated files, Compare with
// build, Compare environments and Prepare platform request. The first three run the CLI itself, so
// results are identical, and generate every environment together. Each works from a project file
// or a generated-file preview, and, run from a menu, on the file or folder that was clicked.
import { join } from "node:path";
import { run } from "@ingestron/cli";
import * as vscode from "vscode";
import {
  compareEnvironments,
  inProject,
  problems,
  generatedFiles,
  generatedForTable,
  platformRequest,
  tableAtCursor,
  type Generated,
} from "@ingestron/authoring";
import { stoppedMessage } from "../features/stopped.js";
import { previewUri, registerPreviews } from "./previews.js";
import { selectEnvironment } from "./environment.js";
import { contextAt, environmentHere, hereFor } from "./state.js";

/** Registers the commands; `refresh` updates problems after the environment changes. */
export function registerCommands(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  refresh: (uri: vscode.Uri) => void,
): void {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  status.command = "ingestron.selectEnvironment";
  const updateStatus = () => {
    const here = hereFor(undefined);
    const environment = here && environmentHere(here);
    if (!environment) return status.hide();
    status.text = `Ingestron: ${environment}`;
    status.tooltip = here.environment
      ? "The environment this preview shows. Prepare platform request uses it too."
      : "The environment for problems, previews and the platform request";
    status.show();
  };
  context.subscriptions.push(
    status,
    vscode.window.onDidChangeActiveTextEditor(updateStatus),
    ...cliCommands(output, refresh),
    vscode.commands.registerCommand(
      "ingestron.selectEnvironment",
      async (folder?: unknown, name?: unknown) => {
        await selectEnvironment(refresh, folder, name);
        updateStatus();
      },
    ),
    vscode.commands.registerCommand("ingestron.showGenerated", (uri?: vscode.Uri) =>
      showGenerated(false, uri),
    ),
    vscode.commands.registerCommand("ingestron.compareWithBuild", () => showGenerated(true)),
    vscode.commands.registerCommand("ingestron.openGenerated", openGenerated),
    vscode.commands.registerCommand("ingestron.platformRequest", showPlatformRequest),
    vscode.commands.registerCommand("ingestron.compareEnvironments", showComparison),
  );
  registerPreviews(context);
  updateStatus();
}

/**
 * Plan, Apply and Check, which run the CLI in the project of the file or folder they are given,
 * for every environment together: the CLI takes no environment for them.
 */
function cliCommands(output: vscode.OutputChannel, refresh: (uri: vscode.Uri) => void) {
  return (["plan", "apply", "check"] as const).map((name) =>
    vscode.commands.registerCommand(`ingestron.${name}`, async (uri?: vscode.Uri) => {
      const project = await runCli(name, output, uri);
      // Apply rewrites build/: show what is true now.
      if (project) refresh(vscode.Uri.file(join(project, "project.yaml")));
    }),
  );
}

/** Runs the CLI in the project of `uri`, else of the active editor. Returns the project folder it ran in. */
async function runCli(
  command: "plan" | "apply" | "check",
  output: vscode.OutputChannel,
  uri: vscode.Uri | undefined,
): Promise<string | undefined> {
  const here = hereFor(uri);
  if (!here)
    return void vscode.window.showInformationMessage("Open a file of an Ingestron project first.");
  const { folder } = here.project;
  // The CLI reads the files on disk.
  const unsaved = await saveProject(folder);
  if (unsaved)
    return void vscode.window.showWarningMessage(
      `Could not save ${unsaved}, so nothing was run: the command would read the old file.`,
    );
  const args = [command, "--definitions", folder, "--out", join(folder, "build")];
  output.clear();
  output.show(true);
  run(args, { cwd: folder, write: (text) => output.append(text) });
  return folder;
}

async function showGenerated(compare: boolean, clicked?: vscode.Uri): Promise<void> {
  const here = hereFor(clicked);
  if (!here) return;
  const environment = environmentHere(here);
  const excluded = problems(here.project, environment).find(
    (problem) => problem.code === "NOT_IMPORTED" && problem.file === here.file,
  );
  if (excluded)
    return void vscode.window.showWarningMessage(
      `${here.file} is not part of the project, so nothing is generated from it. Use the quick fix on the file to import it.`,
    );
  const files = generatedFiles(here.project, environment);
  if (!Array.isArray(files))
    return void vscode.window.showWarningMessage(stoppedMessage(files.problems));
  const editor = vscode.window.activeTextEditor;
  // The table under the cursor narrows the choice only when the cursor is in the clicked file.
  const table =
    editor && (!clicked || editor.document.uri.toString() === clicked.toString())
      ? tableAtCursor(editor.document.getText(), editor.document.offsetAt(editor.selection.active))
      : undefined;
  const chosen = await pick(table ? generatedForTable(files, table) : [], files);
  if (!chosen) return;
  const preview = previewUri(here.project, environment, chosen.path);
  if (!compare) return void vscode.window.showTextDocument(preview, { preview: true });
  const onDisk = vscode.Uri.file(join(here.project.folder, chosen.path));
  await vscode.commands.executeCommand(
    "vscode.diff",
    onDisk,
    preview,
    `${chosen.path}: build ↔ generated now`,
  );
}

/** The platform request for the chosen environment, as an unsaved Markdown document to send. */
async function showPlatformRequest(uri?: vscode.Uri): Promise<void> {
  const here = hereFor(uri);
  if (!here) return void vscode.window.showWarningMessage("Open a file of an Ingestron project.");
  await markdown(platformRequest(here.project, environmentHere(here)));
}

/** The differences between two environments, chosen when the project has more than two. */
async function showComparison(uri?: vscode.Uri): Promise<void> {
  const here = hereFor(uri);
  const names = here?.project.environments ?? [];
  if (!here || names.length < 2)
    return void vscode.window.showWarningMessage(
      "Comparing needs a project with two environments.",
    );
  const picked =
    names.length === 2
      ? names
      : await vscode.window.showQuickPick(names, {
          canPickMany: true,
          placeHolder: "Two environments to compare",
        });
  if (picked?.length !== 2) return;
  const content = compareEnvironments(here.project, picked[0]!, picked[1]!);
  await markdown(content);
}

async function markdown(content: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument({ language: "markdown", content });
  await vscode.window.showTextDocument(document);
}

/** Opens one generated file, by its path in the project, for the file's project. */
async function openGenerated(source: vscode.Uri, path: string): Promise<void> {
  const here = contextAt(source);
  const environment = here && environmentHere(here);
  const files = here && generatedFiles(here.project, environment);
  const found = Array.isArray(files) ? files.find((file) => file.path === path) : undefined;
  if (!here || !found)
    return void vscode.window.showWarningMessage(`${path} is not generated now.`);
  await vscode.window.showTextDocument(previewUri(here.project, environment, found.path), {
    preview: true,
  });
}

async function pick(forTable: Generated[], all: Generated[]): Promise<Generated | undefined> {
  if (forTable.length === 1) return forTable[0];
  const choices = (forTable.length > 0 ? forTable : all).map((file) => ({
    label: file.path,
    file,
  }));
  return (await vscode.window.showQuickPick(choices, { placeHolder: "Generated file" }))?.file;
}

/**
 * Saves every changed document of the project, one by one: `saveAll` can
 * report success and leave a document that a fix changed unsaved. Returns
 * the first file that could not be saved, if any.
 */
async function saveProject(folder: string): Promise<string | undefined> {
  const changed = vscode.workspace.textDocuments.filter(
    (document) =>
      document.isDirty &&
      document.uri.scheme === "file" &&
      inProject(folder, document.uri.fsPath) !== undefined,
  );
  for (const document of changed)
    if (!(await document.save())) return inProject(folder, document.uri.fsPath);
  return undefined;
}
