// Ingestron: New project. The init questions as pickers and input boxes;
// then the CLI's own `init` with every answer as a flag, and an offer to open
// the new folder when it is outside the workspace.
import { join } from "node:path";
import { nameProblem, projectId, run, type Template } from "@ingestron/cli";
import * as vscode from "vscode";
import { chooseProject, type ProjectChoice } from "./wizard-choices.js";
import { chooseStart, chooseStarter } from "./wizard-starters.js";

/** Registers the New project command. */
export function registerWizard(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("ingestron.newProject", () => newProject(output)),
  );
}

/** What to create first (template and answers), then where: the folder dialog comes last. */
async function newProject(output: vscode.OutputChannel): Promise<void> {
  const start = await chooseStart();
  const answers =
    start === "starter"
      ? await askStarter()
      : start === "connection"
        ? await askConnection()
        : undefined;
  if (!answers) return;
  const folder = (
    await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      openLabel: "Create the project here",
    })
  )?.[0];
  if (!folder) return;
  output.clear();
  output.show(true);
  const code = run(["init", folder.fsPath, ...answers, "--yes"], {
    cwd: folder.fsPath,
    write: (text) => output.append(text),
  });
  if (code !== 0) return;
  await vscode.window.showTextDocument(vscode.Uri.file(join(folder.fsPath, "project.yaml")));
  await offerFolder(folder);
}

/**
 * Explorer shows the workspace, so a project created outside it would stay
 * hidden: offer to open its folder, or to add it beside the others.
 */
async function offerFolder(folder: vscode.Uri): Promise<void> {
  if (vscode.workspace.getWorkspaceFolder(folder)) return;
  const open = "Open folder";
  const add = "Add to workspace";
  const picked = await vscode.window.showInformationMessage(
    `Created the project in ${folder.fsPath}. Open its folder to see its flows and contracts in Explorer; next, change the flow in flows/ to your own source.`,
    open,
    add,
  );
  if (picked === open) await vscode.commands.executeCommand("vscode.openFolder", folder);
  if (picked === add) {
    const at = vscode.workspace.workspaceFolders?.length ?? 0;
    vscode.workspace.updateWorkspaceFolders(at, 0, { uri: folder });
  }
}

/** A starter's answers as init flags: its name, environments, any standard, and its questions. */
async function askStarter(): Promise<string[] | undefined> {
  const choice = await chooseStarter();
  const named = choice && (await nameAndEnvironments(choice.id, choice.environments));
  const standard =
    named &&
    (await vscode.window.showInputBox({
      prompt: "Your organisation's standard: path or Git URL, or keep the starter's own",
    }));
  if (!choice || !named || standard === undefined) return undefined;
  const values = await questions(choice.template);
  return (
    values && [
      "--template",
      choice.template.name,
      ...named,
      ...(standard ? ["--standard", standard] : []),
      ...values,
    ]
  );
}

async function askConnection(): Promise<string[] | undefined> {
  const choice = await chooseProject();
  return choice && (await ask(choice));
}

/** The name and environments as init flags, checked as you type with the command's rules. */
async function nameAndEnvironments(
  suggested: string,
  known: string[],
): Promise<string[] | undefined> {
  const name = await vscode.window.showInputBox({
    prompt: "Project name: lowercase letters, digits and underscores",
    value: projectId(suggested),
    validateInput: (text) => nameProblem(text, "project"),
  });
  if (name === undefined) return undefined;
  const environments = await vscode.window.showInputBox({
    prompt: "Environments, separated by commas",
    value: known.join(", "),
    validateInput: environmentsProblem,
  });
  if (environments === undefined) return undefined;
  return [
    "--name",
    name,
    ...environments
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .flatMap((item) => ["--env", item]),
  ];
}

/** The answers as init flags, or undefined when the user cancels. */
async function ask(choice: ProjectChoice): Promise<string[] | undefined> {
  const template = choice.template;
  const named = await nameAndEnvironments(choice.connector, ["dev", "prod"]);
  if (!named) return undefined;
  const standard = await vscode.window.showInputBox({
    prompt: "Your organisation's standard: path or Git URL, or keep the route's own",
  });
  if (standard === undefined) return undefined;
  const values = await questions(template);
  if (!values) return undefined;
  return [
    "--connector",
    choice.connector,
    "--connectivity",
    choice.connectivity,
    "--via",
    choice.via,
    ...named,
    ...(standard ? ["--standard", standard] : []),
    ...values,
  ];
}

async function questions(template: Template | undefined): Promise<string[] | undefined> {
  const flags: string[] = [];
  for (const question of template?.questions ?? []) {
    const answer = await vscode.window.showInputBox({
      prompt: question.ask,
      value: question.default,
    });
    if (answer === undefined) return undefined;
    // As in the terminal: an empty answer takes the default.
    flags.push("--set", `${question.value}=${answer.trim() || question.default}`);
  }
  return flags;
}

/** The first environment name that is not valid, with the command's own rule. */
function environmentsProblem(text: string): string | undefined {
  const names = text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (names.length === 0) return "Name at least one environment, such as dev.";
  return names.map((item) => nameProblem(item, "environment")).find(Boolean);
}
