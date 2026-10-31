// Quick fixes and moves in the light bulb menu, from @ingestron/authoring. A fix
// may edit several files; VS Code applies it as one change that one undo reverts.
import * as vscode from "vscode";
import { fixAll, moveSetting, quickFixes, type QuickFix } from "@ingestron/authoring";
import { codeOf } from "./docs.js";
import { selector } from "./providers.js";
import { environmentOf, projectAt, uriOf, type Here } from "./state.js";

/** Registers the quick fix provider. */
export function registerFixes(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      selector,
      { provideCodeActions },
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
  document: vscode.TextDocument,
  range: vscode.Range,
  context: vscode.CodeActionContext,
): vscode.CodeAction[] {
  const here = projectAt(document.uri);
  if (!here) return [];
  const at = { start: range.start, end: range.end };
  const environment = environmentOf(here.project);
  const fixes = quickFixes(here.project, environment, here.file, at);
  const offset = document.offsetAt(range.start);
  const moves = moveSetting(here.project, here.file, document.getText(), offset, environment);
  const codes = [...new Set(fixes.flatMap((fix) => (fix.problem ? [fix.problem.code] : [])))];
  const all = codes.flatMap((code) => fixAll(here.project, environment, code));
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
