// The Ingestron extension: registers the features in ./features with VS Code.
import * as vscode from "vscode";
import { registerAnnotations } from "./vscode/annotations.js";
import { registerAutoApply } from "./vscode/auto-apply.js";
import { registerCommands } from "./vscode/commands.js";
import { registerDraftContract } from "./vscode/draft-contract.js";
import { registerFileMoves } from "./vscode/file-moves.js";
import { registerFixes } from "./vscode/fixes.js";
import { registerProblems } from "./vscode/problems.js";
import { registerProviders } from "./vscode/providers.js";
import { registerReference } from "./vscode/reference.js";
import { rememberEnvironments } from "./vscode/state.js";
import { registerSymbols } from "./vscode/symbols.js";
import { registerWalkthrough } from "./vscode/walkthrough.js";
import { registerWizard } from "./vscode/wizard.js";

/** Called by VS Code when a workspace has an Ingestron project, or a command runs. */
export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Ingestron");
  context.subscriptions.push(output);
  rememberEnvironments(context.workspaceState);
  const refresh = registerProblems(context);
  registerProviders(context);
  registerSymbols(context);
  registerAnnotations(context);
  registerFixes(context);
  registerFileMoves(context);
  registerReference(context);
  registerCommands(context, output, refresh);
  registerAutoApply(context, output, refresh);
  registerWizard(context, output);
  registerDraftContract(context);
  registerWalkthrough(context);
}

/** Nothing to clean up beyond the disposables in the context. */
export function deactivate(): void {}
