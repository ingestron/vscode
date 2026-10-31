// Inlay hints and code lenses: what a line resolves to, and the generated
// files that come from it, for the chosen environment.
import { basename } from "node:path";
import * as vscode from "vscode";
import { annotationsIn, generatedLenses } from "@ingestron/authoring";
import { environmentOf, onProjectChange, projectAt } from "./state.js";

const yaml: vscode.DocumentSelector = [{ scheme: "file", pattern: "**/*.{yaml,yml}" }];

/** Registers the inlay hints and code lenses. */
export function registerAnnotations(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerInlayHintsProvider(yaml, {
      onDidChangeInlayHints: onProjectChange,
      provideInlayHints: hints,
    }),
    vscode.languages.registerCodeLensProvider(yaml, {
      onDidChangeCodeLenses: onProjectChange,
      provideCodeLenses: lenses,
    }),
  );
}

function hints(document: vscode.TextDocument, range: vscode.Range): vscode.InlayHint[] {
  const here = projectAt(document.uri);
  if (!here) return [];
  const found = annotationsIn(
    here.project,
    here.file,
    document.getText(),
    environmentOf(here.project),
  );
  return found
    .filter((item) => item.line >= range.start.line && item.line <= range.end.line)
    .map((item) => {
      const end = document.lineAt(item.line).range.end;
      const hint = new vscode.InlayHint(end, item.label);
      hint.paddingLeft = true;
      if (item.tooltip) hint.tooltip = item.tooltip;
      return hint;
    });
}

function lenses(document: vscode.TextDocument): vscode.CodeLens[] {
  const here = projectAt(document.uri);
  if (!here) return [];
  const found = generatedLenses(
    here.project,
    here.file,
    document.getText(),
    environmentOf(here.project),
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
