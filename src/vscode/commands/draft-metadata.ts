// Draft and link an optional metadata-based flow table without changing its source observation.
import { join } from "node:path";
import * as vscode from "vscode";
import { positionAt, tableAtCursor } from "@ingestron/authoring";
import type { FileSource } from "@ingestron/config";
import type { ContractDraft } from "@ingestron/core";
import {
  contractImport,
  metadataContractEdits,
  metadataDrafts,
} from "../../features/metadata-contract.js";
import { applyAndSave, unsavedNote } from "../wizard/index.js";
import type { ExtensionState, Here } from "../state/index.js";

/** Register the per-table action and palette command. */
export function registerDraftMetadata(
  context: vscode.ExtensionContext,
  state: ExtensionState,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ingestron.draftContractFromMetadata",
      (uri?: vscode.Uri, table?: string) => draftMetadata(state, uri, table),
    ),
  );
}

async function draftMetadata(
  state: ExtensionState,
  uri?: vscode.Uri,
  table?: string,
): Promise<void> {
  const here = state.hereFor(uri);
  if (!here)
    return void vscode.window.showWarningMessage(
      "Place the cursor in a metadata-based flow table.",
    );
  try {
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.file(join(here.project.folder, here.file)),
    );
    const selected = await selectedTable(state, here, document, uri, table);
    if (!selected) return;
    await convert(state, here, document, selected);
  } catch (cause) {
    await vscode.window.showErrorMessage(cause instanceof Error ? cause.message : String(cause));
  }
}

async function selectedTable(
  state: ExtensionState,
  here: Here,
  document: vscode.TextDocument,
  uri?: vscode.Uri,
  table?: string,
): Promise<string | undefined> {
  const editor = vscode.window.activeTextEditor;
  const selected =
    table ??
    (editor?.document === document
      ? tableAtCursor(document.getText(), document.offsetAt(editor.selection.active))
      : undefined);
  if (selected) return selected;
  if (uri) {
    const result = metadataDrafts(here.project.files, here.file, state.environmentHere(here));
    if (result.problems.length) throw new Error(result.problems.join("\n"));
    return vscode.window.showQuickPick([...result.drafts.keys()], {
      placeHolder: "The metadata-based table to draft a contract for",
    });
  }
  void vscode.window.showWarningMessage(
    "Place the cursor in a metadata-based flow table, then run Draft contract from metadata.",
  );
  return undefined;
}

async function convert(
  state: ExtensionState,
  here: Here,
  document: vscode.TextDocument,
  table: string,
): Promise<void> {
  const version = document.version;
  const text = document.getText();
  const files = {
    list: () => here.project.files.list(),
    read: (path: string) => (path === here.file ? text : here.project.files.read(path)),
  };
  const environment = state.environmentHere(here);
  const result = metadataDrafts(files, here.file, environment);
  const draft = result.drafts.get(table);
  if (!draft)
    throw new Error(
      result.problems.join("\n") ||
        "This table already has a contract or has no imported source metadata. Import its metadata first.",
    );
  const changes = metadataContractEdits(files, here.file, table, draft, environment);
  const imported = contractImport(files, draft, environment);
  const target = vscode.Uri.file(join(here.project.folder, draft.path));
  const edit = conversionEdit(here.project.folder, files, draft, changes);
  if (document.version !== version)
    throw new Error("The flow changed while preparing the draft. Try again; nothing changed.");
  const changed = [...new Set(changes.map((change) => change.file))];
  const unsaved = await applyAndSave(here.project.folder, edit, changed);
  state.forget(here.project.folder);
  await vscode.window.showTextDocument(target);
  void vscode.window.showInformationMessage(
    `Drafted ${draft.path} and linked it from ${here.file}${imported ? `; project.yaml now imports ${imported.added}` : ""}.${unsavedNote(unsaved)} Review its types, required columns and keys, then run Plan. Source metadata is kept for comparison. Undo reverts the conversion.`,
  );
}

function conversionEdit(
  folder: string,
  files: FileSource,
  draft: ContractDraft,
  changes: ReturnType<typeof metadataContractEdits>,
): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();
  edit.createFile(vscode.Uri.file(join(folder, draft.path)), {
    overwrite: false,
    ignoreIfExists: false,
    contents: new TextEncoder().encode(draft.text),
  });
  for (const change of changes) {
    const source = files.read(change.file) ?? "";
    const start = positionAt(source, change.start);
    const end = positionAt(source, change.end);
    edit.replace(
      vscode.Uri.file(join(folder, change.file)),
      new vscode.Range(start.line, start.character, end.line, end.character),
      change.text,
    );
  }
  return edit;
}
