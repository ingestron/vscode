// Draft contract from sample: a contract with a sample file's column names and
// inferred types, written as `ingestron contract` writes it, then opened.
import { basename, dirname, join } from "node:path";
import * as vscode from "vscode";
import { contractFromSample } from "@ingestron/cli";
import { projectFolderOf } from "@ingestron/authoring";

/** Registers the command, for the Explorer's menu on CSV and JSON files and the open file. */
export function registerDraftContract(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("ingestron.draftContract", (uri?: vscode.Uri) =>
      draft(uri ?? vscode.window.activeTextEditor?.document.uri),
    ),
  );
}

async function draft(sample: vscode.Uri | undefined): Promise<void> {
  if (!sample || sample.scheme !== "file") return;
  const suggested = basename(sample.fsPath)
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  const id = await vscode.window.showInputBox({
    prompt: "The contract's id, such as shop.orders",
    value: suggested,
    validateInput: (value) => (/^[\w.-]+$/.test(value) ? undefined : "Letters, digits, _, - and ."),
  });
  if (!id) return;
  const folder = projectFolderOf(sample.fsPath) ?? dirname(sample.fsPath);
  const target = vscode.Uri.file(join(folder, "contracts", `${id}.yaml`));
  try {
    await vscode.workspace.fs.stat(target);
    return void vscode.window.showWarningMessage(
      `contracts/${id}.yaml already exists; nothing written.`,
    );
  } catch {
    // Not there yet: write it.
  }
  const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(sample));
  const content = contractFromSample(text, basename(sample.fsPath), id);
  await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(content));
  await vscode.window.showTextDocument(target);
}
