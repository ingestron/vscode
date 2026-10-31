// The Reference tab in the side bar on the right, beside chat: the reference
// entry for the place under the cursor, kept up to date as the cursor moves,
// the editor changes or problems change. A link to what the code describes
// opens in the tab itself, with Back; other pages open in the browser.
import { referenceAt, referenceForDocs } from "@ingestron/authoring";
import * as vscode from "vscode";
import { referenceHtml } from "../features/reference-html.js";
import { docsLink } from "./docs.js";
import { environmentOf, projectAt, type Here } from "./state.js";

const viewId = "ingestron.reference";
const openCommand = "ingestron.referenceOpen";
const backCommand = "ingestron.referenceBack";

/** Registers the view and the commands that show it and move through it. */
export function registerReference(context: vscode.ExtensionContext): void {
  let view: vscode.WebviewView | undefined;
  let timer: NodeJS.Timeout | undefined;
  /** The docs paths opened in the tab, the latest last; empty while following the cursor. */
  const history: string[] = [];
  const render = () => {
    if (view?.visible) view.webview.html = page(vscode.window.activeTextEditor, history);
  };
  const follow = () => {
    history.length = 0;
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  };
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(viewId, {
      resolveWebviewView(resolved) {
        view = resolved;
        resolved.webview.options = {
          enableScripts: false,
          enableCommandUris: [openCommand, backCommand],
        };
        resolved.onDidChangeVisibility(render);
        render();
      },
    }),
    vscode.commands.registerCommand("ingestron.showReference", () =>
      vscode.commands.executeCommand(`${viewId}.focus`),
    ),
    ...browsing(history, render),
    vscode.window.onDidChangeTextEditorSelection(follow),
    vscode.window.onDidChangeActiveTextEditor(follow),
    vscode.languages.onDidChangeDiagnostics(() => {
      if (history.length === 0) follow();
    }),
  );
}

/** Open a docs path in the tab, and go back from it. */
function browsing(history: string[], render: () => void): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(openCommand, (path: string) => {
      history.push(path);
      render();
    }),
    vscode.commands.registerCommand(backCommand, () => {
      history.pop();
      render();
    }),
  ];
}

/** The page for the last docs path opened, else for the cursor in the active editor. */
function page(editor: vscode.TextEditor | undefined, history: string[]): string {
  const here = editor && projectAt(editor.document.uri);
  if (!editor || !here) return referenceHtml(undefined, docsLink);
  const link = inPanel(here);
  try {
    const path = history.at(-1);
    if (path) {
      const entry = referenceForDocs(here.project, path, environmentOf(here.project));
      // Back goes to the previous entry, or from the first one back to the cursor.
      return referenceHtml(entry, link, {
        back: commandUri(backCommand, []),
        external: docsLink(path),
      });
    }
    const { document, selection } = editor;
    const entry = referenceAt(
      here.project,
      here.file,
      document.getText(),
      document.offsetAt(selection.active),
      environmentOf(here.project),
    );
    return referenceHtml(entry, link);
  } catch (error) {
    console.error("ingestron: the reference could not be shown", error);
    return referenceHtml(undefined, docsLink);
  }
}

/** A link that opens in the tab when the code describes what it names, else on the site. */
function inPanel(here: Here): (path: string) => string {
  const environment = environmentOf(here.project);
  return (path) =>
    referenceForDocs(here.project, path, environment)
      ? commandUri(openCommand, [path])
      : docsLink(path);
}

function commandUri(command: string, args: unknown[]): string {
  return `command:${command}?${encodeURIComponent(JSON.stringify(args))}`;
}
