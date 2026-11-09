// The Ingestron extension: registers the features in ./features with VS Code.
import * as vscode from "vscode";
import {
  registerAutoApply,
  registerCommands,
  registerDraftContract,
  registerFileMoves,
} from "./vscode/commands/index.js";
import {
  registerAnnotations,
  registerFixes,
  registerProblems,
  registerProviders,
  registerSymbols,
} from "./vscode/editor/index.js";
import { registerContextKeys, rememberEnvironments } from "./vscode/state/index.js";
import {
  registerProjectView,
  registerReference,
  registerWalkthrough,
} from "./vscode/views/index.js";
import { registerWizard } from "./vscode/wizard/index.js";

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
  registerProjectView(context);
  registerCommands(context, output, refresh);
  registerContextKeys(context);
  registerAutoApply(context, output, refresh);
  registerWizard(context, output);
  registerDraftContract(context);
  registerWalkthrough(context);
}

/** Nothing to clean up beyond the disposables in the context. */
export function deactivate(): void {}
