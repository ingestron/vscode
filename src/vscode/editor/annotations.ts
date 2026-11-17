// Inlay hints and code lenses: what a line resolves to, and the generated
// files that come from it, for the chosen environment.
import * as vscode from "vscode";
import { type GeneratedLens, tableAtCursor } from "@ingestron/authoring";
import { metadataDrafts } from "../../features/metadata-contract.js";
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
  if (found.length === 0) return [];
  const drafts = metadataDrafts(
    here.project.files,
    here.file,
    state.environmentOf(here.project),
  ).drafts;
  return found.flatMap((item) => {
    const offset = document.offsetAt(new vscode.Position(item.line, 0));
    const table = tableAtCursor(document.getText(), offset);
    return tableLenses(document.uri, item, table && drafts.has(table) ? table : undefined);
  });
}

/** Keep the table toolbar bounded; the picker holds full generated paths. */
function tableLenses(
  uri: vscode.Uri,
  { line, files, methods, chosen }: GeneratedLens,
  table: string | undefined,
): vscode.CodeLens[] {
  const at = new vscode.Range(line, 0, line, 0);
  const preview = new vscode.CodeLens(at, {
    title: `Generated files (${files.length})`,
    tooltip: `Preview the files generated for this table; nothing runs or deploys.\n\n${methods}\n${chosen}`,
    command: "ingestron.showGenerated",
    arguments: [uri, files],
  });
  const draft = table
    ? [
        new vscode.CodeLens(at, {
          title: "Draft contract",
          tooltip:
            "Create and link an ODCS draft from this table's imported metadata. Review it before use.",
          command: "ingestron.draftContractFromMetadata",
          arguments: [uri, table],
        }),
      ]
    : [];
  return [preview, ...draft];
}
