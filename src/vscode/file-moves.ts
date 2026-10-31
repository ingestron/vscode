// When a file or folder in a project is renamed or moved, the `${file:…}`
// references to it change in the same operation, so the definitions still
// find their code and one undo puts everything back.
import * as vscode from "vscode";
import { fileMoveEdits, inProject } from "@ingestron/authoring";
import { projectAt, rangeIn, uriOf } from "./state.js";

/** Registers the edits that follow a move. */
export function registerFileMoves(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.onWillRenameFiles((event) =>
      event.waitUntil(Promise.resolve(editsFor(event))),
    ),
  );
}

function editsFor(event: vscode.FileWillRenameEvent): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();
  for (const { oldUri, newUri } of event.files) {
    const here = projectAt(oldUri);
    const to = here && inProject(here.project.folder, newUri.fsPath);
    // A move out of the project leaves nothing in it to point at.
    if (!here || !to) continue;
    for (const [file, changes] of Object.entries(fileMoveEdits(here.project, here.file, to)))
      for (const change of changes)
        edit.replace(
          uriOf(here.project, file),
          rangeIn(here.project, file, change.range),
          change.text,
        );
  }
  return edit;
}
