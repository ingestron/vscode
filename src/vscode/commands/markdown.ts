// Named, read-only review documents: repeating a request refreshes its existing editor.
import * as vscode from "vscode";

const contents = new Map<string, string>();
let changed: vscode.EventEmitter<vscode.Uri> | undefined;

/** Registers the read-only document provider for generated requests and comparisons. */
export function registerMarkdown(context: vscode.ExtensionContext): void {
  changed = new vscode.EventEmitter<vscode.Uri>();
  context.subscriptions.push(
    changed,
    vscode.workspace.registerTextDocumentContentProvider("ingestron-review", {
      onDidChange: changed.event,
      provideTextDocumentContent: (uri) => contents.get(uri.toString()) ?? "",
    }),
  );
}

/** Shows a named review, refreshing it in place; Save As can retain a copy as evidence. */
export async function showMarkdown(content: string, key = ""): Promise<void> {
  const heading = content.split("\n")[0]?.replace(/^#+\s*/, "") || "Ingestron review";
  const uri = vscode.Uri.from({
    scheme: "ingestron-review",
    path: `/${heading.replace(/[\\/]/g, "-")}.md`,
    query: key,
  });
  contents.set(uri.toString(), content);
  changed?.fire(uri);
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document);
}
