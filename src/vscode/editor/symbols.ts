// "Go to Symbol in Workspace" (Ctrl+T) across every project in the workspace,
// and each definitions file's outline: tables, documents and values.
import * as vscode from "vscode";
import type { ProjectSnapshot, ProjectSymbol } from "@ingestron/authoring";
import { selector } from "./providers.js";
import { rangeIn, uriOf, type ExtensionState } from "../state/index.js";

const symbolKinds: Record<string, vscode.SymbolKind> = {
  table: vscode.SymbolKind.Struct,
  value: vscode.SymbolKind.Constant,
  Connection: vscode.SymbolKind.Interface,
  DataContract: vscode.SymbolKind.Class,
  Flow: vscode.SymbolKind.Module,
  Transform: vscode.SymbolKind.Function,
};

/** Registers the workspace and document symbol providers. */
export function registerSymbols(context: vscode.ExtensionContext, state: ExtensionState): void {
  context.subscriptions.push(
    vscode.languages.registerWorkspaceSymbolProvider({
      provideWorkspaceSymbols: (query) => workspaceSymbols(state, query),
    }),
    vscode.languages.registerDocumentSymbolProvider(selector, {
      provideDocumentSymbols: (document) => documentSymbols(state, document),
    }),
  );
}

async function workspaceSymbols(
  state: ExtensionState,
  query: string,
): Promise<vscode.SymbolInformation[]> {
  const manifests = await vscode.workspace.findFiles(
    "**/project.yaml",
    "**/{node_modules,build}/**",
  );
  const wanted = query.toLowerCase();
  return manifests.flatMap((uri) => {
    const here = state.projectAt(uri);
    if (!here) return [];
    return here.project
      .symbols()
      .filter((symbol) => symbol.name.toLowerCase().includes(wanted))
      .map((symbol) => information(here.project, symbol));
  });
}

function documentSymbols(
  state: ExtensionState,
  document: vscode.TextDocument,
): vscode.DocumentSymbol[] {
  const here = state.projectAt(document.uri);
  if (!here) return [];
  return here.project
    .symbols()
    .filter((symbol) => symbol.file === here.file)
    .map((symbol) => {
      const range = rangeIn(here.project, symbol.file, symbol.range);
      return new vscode.DocumentSymbol(symbol.name, symbol.kind, kindOf(symbol), range, range);
    });
}

function information(project: ProjectSnapshot, symbol: ProjectSymbol): vscode.SymbolInformation {
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
