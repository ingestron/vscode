// Definition, references, rename, completion and hover, from ../features.
import { join } from "node:path";
import * as vscode from "vscode";
import {
  completionsAt,
  definitionAt,
  hoverAt,
  referencesAt,
  renameAt,
  renameProblem,
  type Suggestion,
} from "@ingestron/authoring";
import { docsLink } from "./docs.js";
import { environmentOf, projectAt, rangeIn, uriOf } from "./state.js";

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
export function registerProviders(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selector, { provideDefinition: definition }),
    vscode.languages.registerReferenceProvider(selector, { provideReferences: references }),
    vscode.languages.registerRenameProvider(selector, { provideRenameEdits: rename }),
    vscode.languages.registerHoverProvider(selector, { provideHover: hover }),
    vscode.languages.registerCompletionItemProvider(
      selector,
      { provideCompletionItems: complete },
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
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Location | undefined {
  const here = projectAt(document.uri);
  const place = here && definitionAt(here.project, here.file, document.offsetAt(position));
  return (
    here &&
    place &&
    new vscode.Location(
      uriOf(here.project, place.file),
      rangeIn(here.project, place.file, place.range),
    )
  );
}

function references(document: vscode.TextDocument, position: vscode.Position): vscode.Location[] {
  const here = projectAt(document.uri);
  if (!here) return [];
  return referencesAt(here.project, here.file, document.offsetAt(position)).map(
    (place) =>
      new vscode.Location(
        uriOf(here.project, place.file),
        rangeIn(here.project, place.file, place.range),
      ),
  );
}

function rename(
  document: vscode.TextDocument,
  position: vscode.Position,
  name: string,
): vscode.WorkspaceEdit | undefined {
  const here = projectAt(document.uri);
  const offset = document.offsetAt(position);
  // VS Code shows a thrown error as the reason the rename cannot go ahead.
  const problem = here && renameProblem(here.project, here.file, offset, name);
  if (problem) throw new Error(problem);
  const edits = here && renameAt(here.project, here.file, offset, name);
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

function hover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
  const here = projectAt(document.uri);
  if (!here) return undefined;
  const shown = hoverAt(
    here.project,
    here.file,
    document.getText(),
    document.offsetAt(position),
    environmentOf(here.project),
    { docs: docsLink },
  );
  return shown ? new vscode.Hover(new vscode.MarkdownString(shown)) : undefined;
}

function complete(
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.CompletionItem[] {
  const here = projectAt(document.uri);
  if (!here) return [];
  return completionsAt(
    here.project,
    here.file,
    document.getText(),
    document.offsetAt(position),
    environmentOf(here.project),
  ).map((suggestion, index) => {
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
