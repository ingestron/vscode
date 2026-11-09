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
import { ExtensionState, registerContextKeys } from "./vscode/state/index.js";
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
  const state = new ExtensionState(context.workspaceState);
  context.subscriptions.push(state);
  const refresh = registerProblems(context, state);
  registerProviders(context, state);
  registerSymbols(context, state);
  registerAnnotations(context, state);
  registerFixes(context, state);
  registerFileMoves(context, state);
  registerReference(context, state);
  registerProjectView(context, state);
  registerCommands(context, state, output, refresh);
  registerContextKeys(context);
  registerAutoApply(context, state, output, refresh);
  registerWizard(context, output);
  registerDraftContract(context);
  registerWalkthrough(context, state);
}

/** Nothing to clean up beyond the disposables in the context. */
export function deactivate(): void {}
