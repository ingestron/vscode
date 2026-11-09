// Definition, references, rename, completion and hover, from ../features.
import { join } from "node:path";
import * as vscode from "vscode";
import type { Suggestion } from "@ingestron/authoring";
import { docsLink } from "./docs.js";
import { rangeIn, uriOf, type ExtensionState } from "../state/index.js";

/** The files the language features and quick fixes serve. */
export const selector: vscode.DocumentSelector = [
  { scheme: "file", pattern: "**/*.{yaml,yml}" },
  { scheme: "file", pattern: "**/*.{sql,py}" },
];

const kinds: Record<Suggestion["kind"], vscode.CompletionItemKind> = {
  field: vscode.CompletionItemKind.Field,
  value: vscode.CompletionItemKind.EnumMember,
  reference: vscode.CompletionItemKind.Reference,
  method: vscode.CompletionItemKind.Function,
  setting: vscode.CompletionItemKind.Property,
  document: vscode.CompletionItemKind.Snippet,
};

/** Registers every language feature. */
export function registerProviders(context: vscode.ExtensionContext, state: ExtensionState): void {
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selector, {
      provideDefinition: (document, position) => definition(state, document, position),
    }),
    vscode.languages.registerReferenceProvider(selector, {
      provideReferences: (document, position) => references(state, document, position),
    }),
    vscode.languages.registerRenameProvider(selector, {
      provideRenameEdits: (document, position, name) => rename(state, document, position, name),
    }),
    vscode.languages.registerHoverProvider(selector, {
      provideHover: (document, position) => hover(state, document, position),
    }),
    vscode.languages.registerCompletionItemProvider(
      selector,
      { provideCompletionItems: (document, position) => complete(state, document, position) },
      // Not on a space: completion runs when asked (Ctrl+Space), after ".", ":" and "${",
      // and after the quote of a Python transform's tables["…"].
      ".",
      ":",
      "{",
      '"',
      "'",
    ),
    vscode.commands.registerCommand("ingestron.applyEdits", applyEdits),
  );
}

function definition(
  state: ExtensionState,
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Location | undefined {
  const here = state.projectAt(document.uri);
  const place = here && here.project.definitionAt(here.file, document.offsetAt(position));
  return (
    here &&
    place &&
    new vscode.Location(
      uriOf(here.project, place.file),
      rangeIn(here.project, place.file, place.range),
    )
  );
}

function references(
  state: ExtensionState,
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Location[] {
  const here = state.projectAt(document.uri);
  if (!here) return [];
  return here.project
    .referencesAt(here.file, document.offsetAt(position))
    .map(
      (place) =>
        new vscode.Location(
          uriOf(here.project, place.file),
          rangeIn(here.project, place.file, place.range),
        ),
    );
}

function rename(
  state: ExtensionState,
  document: vscode.TextDocument,
  position: vscode.Position,
  name: string,
): vscode.WorkspaceEdit | undefined {
  const here = state.projectAt(document.uri);
  const offset = document.offsetAt(position);
  // VS Code shows a thrown error as the reason the rename cannot go ahead.
  const problem = here && here.project.renameProblem(here.file, offset, name);
  if (problem) throw new Error(problem);
  const edits = here && here.project.renameAt(here.file, offset, name);
  if (!here || !edits) return undefined;
  const edit = new vscode.WorkspaceEdit();
  for (const [file, changes] of Object.entries(edits))
    for (const change of changes)
      edit.replace(
        uriOf(here.project, file),
        rangeIn(here.project, file, change.range),
        change.text,
      );
  return edit;
}

function hover(
  state: ExtensionState,
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Hover | undefined {
  const here = state.projectAt(document.uri);
  if (!here) return undefined;
  const shown = here.project.hoverAt(
    here.file,
    document.getText(),
    document.offsetAt(position),
    state.environmentOf(here.project),
    { docs: docsLink },
  );
  return shown ? new vscode.Hover(new vscode.MarkdownString(shown)) : undefined;
}

function complete(
  state: ExtensionState,
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.CompletionItem[] {
  const here = state.projectAt(document.uri);
  if (!here) return [];
  return here.project
    .completionsAt(
      here.file,
      document.getText(),
      document.offsetAt(position),
      state.environmentOf(here.project),
    )
    .map((suggestion, index) => {
      const item = new vscode.CompletionItem(suggestion.label, kinds[suggestion.kind]);
      if (suggestion.snippet) item.insertText = new vscode.SnippetString(suggestion.snippet);
      if (suggestion.insertText) item.insertText = suggestion.insertText;
      // YAML counts "-" as part of a word; an empty range keeps the dash and shows every suggestion.
      if (suggestion.afterDash) item.range = new vscode.Range(position, position);
      // Keep the order given: the likely choice first, the ones that cannot be used last.
      item.sortText = String(index).padStart(4, "0");
      if (suggestion.preselect) item.preselect = true;
      item.command = commandAfter(suggestion, here.project.folder);
      if (suggestion.detail) item.detail = suggestion.detail;
      const reference = suggestion.docs && `[Reference](${docsLink(suggestion.docs)})`;
      const documentation = [suggestion.documentation, reference].filter(Boolean).join("\n\n");
      if (documentation) item.documentation = new vscode.MarkdownString(documentation);
      return item;
    });
}

/** What runs once a suggestion is inserted, if anything. */
function commandAfter(suggestion: Suggestion, folder: string): vscode.Command | undefined {
  // Such as declaring an input in the transform's YAML.
  if (suggestion.edits)
    return {
      title: suggestion.detail ?? "",
      command: "ingestron.applyEdits",
      arguments: [folder, suggestion.edits],
    };
  // A new line for a mapping's fields opens their suggestions at once.
  if (suggestion.retrigger) return { title: "Suggest", command: "editor.action.triggerSuggest" };
  return undefined;
}

/** Applies a suggestion's edits, in project files, as one change. */
async function applyEdits(folder: string, edits: NonNullable<Suggestion["edits"]>): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  for (const { file, range, text } of edits)
    edit.replace(
      vscode.Uri.file(join(folder, file)),
      new vscode.Range(
        range.start.line,
        range.start.character,
        range.end.line,
        range.end.character,
      ),
      text,
    );
  await vscode.workspace.applyEdit(edit);
}
