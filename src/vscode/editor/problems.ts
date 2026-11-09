// Problems in the Problems panel, refreshed shortly after each change.
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { codeDocs, type Problem } from "@ingestron/authoring";
import { docsLink } from "./docs.js";
import type { ExtensionState } from "../state/index.js";

const severities: Record<Problem["severity"], vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
};

/** Registers the problem collection and keeps it up to date. Returns a refresh for a file. */
export function registerProblems(
  context: vscode.ExtensionContext,
  state: ExtensionState,
): (uri: vscode.Uri) => void {
  const collection = vscode.languages.createDiagnosticCollection("ingestron");
  const refresh = refresher(state, collection);
  // Every change, in an editor or on disk, makes the project's snapshot stale.
  const changed = (uri: vscode.Uri) => {
    state.forget(uri.fsPath);
    refresh(uri);
  };
  const watcher = vscode.workspace.createFileSystemWatcher("**/*");
  context.subscriptions.push(
    collection,
    watcher,
    watcher.onDidCreate(changed),
    watcher.onDidChange(changed),
    watcher.onDidDelete(changed),
    vscode.workspace.onDidOpenTextDocument((document) => changed(document.uri)),
    vscode.workspace.onDidChangeTextDocument((event) => changed(event.document.uri)),
    vscode.workspace.onDidSaveTextDocument((document) => changed(document.uri)),
    vscode.workspace.onDidCloseTextDocument((document) => changed(document.uri)),
  );
  for (const document of vscode.workspace.textDocuments) refresh(document.uri);
  return refresh;
}

/** Shows a file's project's problems 300 ms after the last call for that project. */
function refresher(
  state: ExtensionState,
  collection: vscode.DiagnosticCollection,
): (uri: vscode.Uri) => void {
  const shown = new Map<string, Set<string>>();
  const timers = new Map<string, NodeJS.Timeout>();
  return (uri: vscode.Uri) => {
    const here = state.projectAt(uri);
    if (!here) return clearGone(collection, shown, uri);
    const folder = here.project.folder;
    clearTimeout(timers.get(folder));
    timers.set(
      folder,
      setTimeout(() => {
        try {
          show(state, collection, shown, uri);
        } catch (error) {
          console.error("ingestron: problems could not be checked", error);
        }
      }, 300),
    );
  };
}

/** A project whose project.yaml is gone: clear the problems shown for it. */
function clearGone(
  collection: vscode.DiagnosticCollection,
  shown: Map<string, Set<string>>,
  uri: vscode.Uri,
): void {
  for (const [folder, files] of shown) {
    if (!uri.fsPath.startsWith(folder) || existsSync(join(folder, "project.yaml"))) continue;
    for (const file of files) collection.delete(vscode.Uri.file(join(folder, file)));
    shown.delete(folder);
  }
}

function show(
  state: ExtensionState,
  collection: vscode.DiagnosticCollection,
  shown: Map<string, Set<string>>,
  uri: vscode.Uri,
): void {
  const here = state.projectAt(uri);
  if (!here) return;
  const { project } = here;
  const byFile = new Map<string, vscode.Diagnostic[]>();
  for (const problem of project.problems(state.environmentOf(project))) {
    const { start, end } = problem.range;
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(start.line, start.character, end.line, end.character),
      problem.message,
      severities[problem.severity],
    );
    const docs = codeDocs(problem.code);
    diagnostic.code = docs
      ? { value: problem.code, target: vscode.Uri.parse(docsLink(docs)) }
      : problem.code;
    diagnostic.source = "ingestron";
    byFile.set(problem.file, [...(byFile.get(problem.file) ?? []), diagnostic]);
  }
  for (const file of shown.get(project.folder) ?? [])
    if (!byFile.has(file)) collection.delete(vscode.Uri.file(join(project.folder, file)));
  for (const [file, diagnostics] of byFile)
    collection.set(vscode.Uri.file(join(project.folder, file)), diagnostics);
  shown.set(project.folder, new Set(byFile.keys()));
}
