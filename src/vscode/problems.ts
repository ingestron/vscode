// Problems in the Problems panel, refreshed shortly after each change.
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { codeDocs, problems, type Problem } from "@ingestron/authoring";
import { docsLink } from "./docs.js";
import { environmentOf, forget, projectAt } from "./state.js";

const severities: Record<Problem["severity"], vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
};

/** Registers the problem collection and keeps it up to date. Returns a refresh for a file. */
export function registerProblems(context: vscode.ExtensionContext): (uri: vscode.Uri) => void {
  const collection = vscode.languages.createDiagnosticCollection("ingestron");
  const shown = new Map<string, Set<string>>();
  const timers = new Map<string, NodeJS.Timeout>();
  const refresh = (uri: vscode.Uri) => {
    const here = projectAt(uri);
    if (!here) return clearGone(collection, shown, uri);
    const folder = here.project.folder;
    clearTimeout(timers.get(folder));
    timers.set(
      folder,
      setTimeout(() => {
        try {
          show(collection, shown, uri);
        } catch (error) {
          console.error("ingestron: problems could not be checked", error);
        }
      }, 300),
    );
  };
  // Every change, in an editor or on disk, makes the project's snapshot stale.
  const changed = (uri: vscode.Uri) => {
    forget(uri.fsPath);
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
  collection: vscode.DiagnosticCollection,
  shown: Map<string, Set<string>>,
  uri: vscode.Uri,
): void {
  const here = projectAt(uri);
  if (!here) return;
  const { project } = here;
  const byFile = new Map<string, vscode.Diagnostic[]>();
  for (const problem of problems(project, environmentOf(project))) {
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
