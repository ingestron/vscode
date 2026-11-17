// Ingestron: New project. Two questions (where it runs, then which standard, or a sample project),
// then the folder; the CLI's own `init` writes the project, with REPLACE_ME where a value cannot be
// known, and README.md, which opens to say what to write.
import { join } from "node:path";
import { run } from "@ingestron/cli";
import * as vscode from "vscode";
import { assistantFlags } from "../../features/assistants.js";
import { chooseNewProjectAssistants } from "./wizard-assistants.js";
import { chooseTarget, sampleFlags, standardFlags } from "./wizard-starters.js";

/** Registers the New project command. */
export function registerWizard(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("ingestron.newProject", () => newProject(output)),
  );
}

/** What to create first, then where: the folder dialog comes last, and its name is the id. */
async function newProject(output: vscode.OutputChannel): Promise<void> {
  const target = await chooseTarget();
  if (!target) return;
  const flags = target === "sample" ? await sampleFlags() : await standardFlags(target);
  if (!flags) return;
  const assistants = await chooseNewProjectAssistants();
  if (!assistants) return;
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
  let written = "";
  const code = run(["init", folder.fsPath, ...flags, ...assistantFlags(assistants), "--yes"], {
    cwd: folder.fsPath,
    write: (text) => {
      written += text;
      output.append(text);
    },
  });
  if (code !== 0) return;
  const readme = vscode.Uri.file(join(folder.fsPath, "README.md"));
  await vscode.commands.executeCommand("markdown.showPreview", readme);
  await offerFolder(folder, createdMessage(written));
}

/** What init said is still to write, as the message after creating the project. */
export function createdMessage(output: string): string {
  // init's own line, not plan's, which ends "; ingestron check fails…".
  const found = /^(\d+) values? (?:are|is) still REPLACE_ME(:| \(README)/m.exec(output);
  if (output.includes("Platform and standard created."))
    return "Created the platform and standard. Review target settings, then use Add connection and Add flow.";
  if (!found) return "Created the project. Nothing to replace: it runs as written.";
  const values = found[1] === "1" ? "1 value is" : `${found[1]} values are`;
  // A README.md that was there is kept, so the Ingestron output lists the values instead.
  const where = found[2] === ":" ? "README.md lists them" : "the Ingestron output lists them";
  return `Created the project. ${values} still REPLACE_ME: ${where}.`;
}

/**
 * Explorer shows the workspace, so a project created outside it would stay hidden: offer to
 * open its folder, or to add it beside the others.
 */
async function offerFolder(folder: vscode.Uri, message: string): Promise<void> {
  if (vscode.workspace.getWorkspaceFolder(folder)) {
    // A platform project has no source yet: Add connection is the next step.
    if (!message.startsWith("Created the platform")) {
      void vscode.window.showInformationMessage(message);
      return;
    }
    const connect = "Add connection";
    const picked = await vscode.window.showInformationMessage(message, connect);
    if (picked === connect) await vscode.commands.executeCommand("ingestron.addConnection", folder);
    return;
  }
  const open = "Open folder";
  const add = "Add to workspace";
  const picked = await vscode.window.showInformationMessage(
    `${message} Open its folder to see it in Explorer.`,
    open,
    add,
  );
  if (picked === open) await vscode.commands.executeCommand("vscode.openFolder", folder);
  if (picked === add) {
    const at = vscode.workspace.workspaceFolders?.length ?? 0;
    vscode.workspace.updateWorkspaceFolders(at, 0, { uri: folder });
  }
}
