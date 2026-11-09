// Quick fixes and moves in the light bulb menu, from @ingestron/authoring. A fix
// may edit several files; VS Code applies it as one change that one undo reverts.
import * as vscode from "vscode";
import type { QuickFix } from "@ingestron/authoring";
import { codeOf } from "./docs.js";
import { selector } from "./providers.js";
import { uriOf, type ExtensionState, type Here } from "../state/index.js";

/** Registers the quick fix provider. */
export function registerFixes(context: vscode.ExtensionContext, state: ExtensionState): void {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      selector,
      {
        provideCodeActions: (document, range, context) =>
          provideCodeActions(state, document, range, context),
      },
      {
        providedCodeActionKinds: [
          vscode.CodeActionKind.QuickFix,
          vscode.CodeActionKind.RefactorMove,
        ],
      },
    ),
  );
}

function provideCodeActions(
  state: ExtensionState,
  document: vscode.TextDocument,
  range: vscode.Range,
  context: vscode.CodeActionContext,
): vscode.CodeAction[] {
  const here = state.projectAt(document.uri);
  if (!here) return [];
  const at = { start: range.start, end: range.end };
  const environment = state.environmentOf(here.project);
  const fixes = here.project.quickFixes(environment, here.file, at);
  const offset = document.offsetAt(range.start);
  const moves = here.project.moveSetting(here.file, document.getText(), offset, environment);
  const codes = [...new Set(fixes.flatMap((fix) => (fix.problem ? [fix.problem.code] : [])))];
  const all = codes.flatMap((code) => here.project.fixAll(environment, code));
  return [
    ...fixes.map((fix, index) => actionFor(here, fix, context, index === 0)),
    ...all.map((fix) => actionFor(here, fix, context, false, vscode.CodeActionKind.QuickFix)),
    ...moves.map((fix) => actionFor(here, fix, context, false, vscode.CodeActionKind.RefactorMove)),
  ];
}

function actionFor(
  here: Here,
  fix: QuickFix,
  context: vscode.CodeActionContext,
  preferred: boolean,
  kind = vscode.CodeActionKind.QuickFix,
): vscode.CodeAction {
  const action = new vscode.CodeAction(fix.title, kind);
  action.edit = new vscode.WorkspaceEdit();
  for (const { file, range, text } of fix.edits) {
    const { start, end } = range;
    const place = new vscode.Range(start.line, start.character, end.line, end.character);
    action.edit.replace(uriOf(here.project, file), place, text);
  }
  if (fix.create) {
    const uri = uriOf(here.project, fix.create.file);
    action.edit.createFile(uri, { contents: new TextEncoder().encode(fix.create.text) });
    action.command = { title: "Open", command: "vscode.open", arguments: [uri] };
  }
  const problem = fix.problem;
  if (!problem) return action;
  action.diagnostics = context.diagnostics.filter(
    (diagnostic) =>
      codeOf(diagnostic) === problem.code && diagnostic.range.start.line === problem.line,
  );
  action.isPreferred = preferred;
  return action;
}
