// "Go to Symbol in Workspace" (Ctrl+T) across every project in the workspace,
// and each definitions file's outline: tables, documents and values.
import * as vscode from "vscode";
import { projectSymbols, type Project, type ProjectSymbol } from "@ingestron/authoring";
import { selector } from "./providers.js";
import { projectAt, rangeIn, uriOf } from "./state.js";

const symbolKinds: Record<string, vscode.SymbolKind> = {
  table: vscode.SymbolKind.Struct,
  value: vscode.SymbolKind.Constant,
  Connection: vscode.SymbolKind.Interface,
  DataContract: vscode.SymbolKind.Class,
  Flow: vscode.SymbolKind.Module,
  Transform: vscode.SymbolKind.Function,
};

/** Registers the workspace and document symbol providers. */
export function registerSymbols(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerWorkspaceSymbolProvider({ provideWorkspaceSymbols: workspaceSymbols }),
    vscode.languages.registerDocumentSymbolProvider(selector, {
      provideDocumentSymbols: documentSymbols,
    }),
  );
}

async function workspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
  const manifests = await vscode.workspace.findFiles(
    "**/project.yaml",
    "**/{node_modules,build}/**",
  );
  const wanted = query.toLowerCase();
  return manifests.flatMap((uri) => {
    const here = projectAt(uri);
    if (!here) return [];
    return projectSymbols(here.project)
      .filter((symbol) => symbol.name.toLowerCase().includes(wanted))
      .map((symbol) => information(here.project, symbol));
  });
}

function documentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
  const here = projectAt(document.uri);
  if (!here) return [];
  return projectSymbols(here.project)
    .filter((symbol) => symbol.file === here.file)
    .map((symbol) => {
      const range = rangeIn(here.project, symbol.file, symbol.range);
      return new vscode.DocumentSymbol(symbol.name, symbol.kind, kindOf(symbol), range, range);
    });
}

function information(project: Project, symbol: ProjectSymbol): vscode.SymbolInformation {
  return new vscode.SymbolInformation(
    symbol.name,
    kindOf(symbol),
    `${symbol.kind} · ${symbol.file}`,
    new vscode.Location(uriOf(project, symbol.file), rangeIn(project, symbol.file, symbol.range)),
  );
}

function kindOf(symbol: ProjectSymbol): vscode.SymbolKind {
  return symbolKinds[symbol.kind] ?? vscode.SymbolKind.Object;
}
