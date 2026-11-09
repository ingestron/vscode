// When a file or folder in a project is renamed or moved, the `${file:…}`
// references to it change in the same operation, so the definitions still
// find their code and one undo puts everything back.
import * as vscode from "vscode";
import { inProject } from "@ingestron/authoring";
import { rangeIn, uriOf, type ExtensionState } from "../state/index.js";

/** Registers the edits that follow a move. */
export function registerFileMoves(context: vscode.ExtensionContext, state: ExtensionState): void {
  context.subscriptions.push(
    vscode.workspace.onWillRenameFiles((event) =>
      event.waitUntil(Promise.resolve(editsFor(state, event))),
    ),
  );
}

function editsFor(state: ExtensionState, event: vscode.FileWillRenameEvent): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();
  for (const { oldUri, newUri } of event.files) {
    const here = state.projectAt(oldUri);
    const to = here && inProject(here.project.folder, newUri.fsPath);
    // A move out of the project leaves nothing in it to point at.
    if (!here || !to) continue;
    for (const [file, changes] of Object.entries(here.project.fileMoveEdits(here.file, to)))
      for (const change of changes)
        edit.replace(
          uriOf(here.project, file),
          rangeIn(here.project, file, change.range),
          change.text,
        );
  }
  return edit;
}
