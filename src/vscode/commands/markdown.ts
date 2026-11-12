// Opens text as an unsaved Markdown document, to read, copy or send.
import * as vscode from "vscode";

/** Shows `content` in a new Markdown document that is not saved anywhere. */
export async function showMarkdown(content: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument({ language: "markdown", content });
  await vscode.window.showTextDocument(document);
}
