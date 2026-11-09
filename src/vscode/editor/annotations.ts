// Inlay hints and code lenses: what a line resolves to, and the generated
// files that come from it, for the chosen environment.
import { basename } from "node:path";
import * as vscode from "vscode";
import type { ExtensionState } from "../state/index.js";

const yaml: vscode.DocumentSelector = [{ scheme: "file", pattern: "**/*.{yaml,yml}" }];

/** Registers the inlay hints and code lenses. */
export function registerAnnotations(context: vscode.ExtensionContext, state: ExtensionState): void {
  context.subscriptions.push(
    vscode.languages.registerInlayHintsProvider(yaml, {
      onDidChangeInlayHints: state.onProjectChange,
      provideInlayHints: (document, range) => hints(state, document, range),
    }),
    vscode.languages.registerCodeLensProvider(yaml, {
      onDidChangeCodeLenses: state.onProjectChange,
      provideCodeLenses: (document) => lenses(state, document),
    }),
  );
}

function hints(
  state: ExtensionState,
  document: vscode.TextDocument,
  range: vscode.Range,
): vscode.InlayHint[] {
  const here = state.projectAt(document.uri);
  if (!here) return [];
  const found = here.project.annotationsIn(
    here.file,
    document.getText(),
    state.environmentOf(here.project),
  );
  return found
    .filter((item) => item.line >= range.start.line && item.line <= range.end.line)
    .map((item) => {
      const end = document.lineAt(item.line).range.end;
      const hint = new vscode.InlayHint(end, item.label);
      hint.paddingLeft = true;
      if (item.tooltip)
        hint.tooltip = item.language
          ? new vscode.MarkdownString().appendCodeblock(item.tooltip, item.language)
          : item.tooltip;
      return hint;
    });
}

function lenses(state: ExtensionState, document: vscode.TextDocument): vscode.CodeLens[] {
  const here = state.projectAt(document.uri);
  if (!here) return [];
  const found = here.project.generatedLenses(
    here.file,
    document.getText(),
    state.environmentOf(here.project),
  );
  return found.flatMap(({ line, methods, chosen, files }) => {
    const at = new vscode.Range(line, 0, line, 0);
    // The methods first, explained on hover; then each generated file, which opens it.
    const how = new vscode.CodeLens(at, { title: methods, tooltip: chosen, command: "" });
    return [
      how,
      ...files.map(
        (path) =>
          new vscode.CodeLens(at, {
            title: `$(file-code) ${basename(path)}`,
            tooltip: `Generated: ${path}`,
            command: "ingestron.openGenerated",
            arguments: [document.uri, path],
          }),
      ),
    ];
  });
}
