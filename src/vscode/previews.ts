// Read-only previews of generated files. Each preview's URI names its
// project and environment, and its text is generated again whenever that
// project changes, so an open preview never shows another project's or an
// older version's output.
import { basename, join } from "node:path";
import * as vscode from "vscode";
import { generatedFiles, type Project } from "@ingestron/authoring";
import { onProjectChange, projectAt, type Here } from "./state.js";

/** The scheme of read-only previews of generated files. */
export const previewScheme = "ingestron-generated";

/**
 * The preview of one generated file. The path starts with the project
 * folder's name and the environment, so the tab and breadcrumbs say which
 * project it is; the query holds the folder itself, so two projects with the
 * same name and output paths never share a preview.
 */
export function previewUri(project: Project, environment: string | undefined, path: string) {
  return vscode.Uri.from({
    scheme: previewScheme,
    path: `/${basename(project.folder)}/${environment ?? "default"}/${path}`,
    query: new URLSearchParams({
      folder: project.folder,
      environment: environment ?? "",
      file: path,
    }).toString(),
  });
}

/**
 * The project of a file, or of the preview, that `uri` names. A preview also
 * gives its environment, so a command run from it acts on what it shows.
 */
export function contextAt(uri: vscode.Uri): Here | undefined {
  if (uri.scheme !== previewScheme) return projectAt(uri);
  const { folder, file, environment } = previewOf(uri);
  const here = projectAt(vscode.Uri.file(join(folder, "project.yaml")));
  return here && { project: here.project, file, ...(environment && { environment }) };
}

/** Serves previews and refreshes the open ones when their project changes. */
export function registerPreviews(context: vscode.ExtensionContext): void {
  const changed = new vscode.EventEmitter<vscode.Uri>();
  context.subscriptions.push(
    changed,
    vscode.workspace.registerTextDocumentContentProvider(previewScheme, {
      onDidChange: changed.event,
      provideTextDocumentContent: textOf,
    }),
    onProjectChange(() => {
      for (const document of vscode.workspace.textDocuments)
        if (document.uri.scheme === previewScheme) changed.fire(document.uri);
    }),
  );
}

function textOf(uri: vscode.Uri): string {
  const { folder, environment, file } = previewOf(uri);
  const here = projectAt(vscode.Uri.file(join(folder, "project.yaml")));
  if (!here) return `The project in ${folder} is not there any more.\n`;
  const files = generatedFiles(here.project, environment || undefined);
  if (!Array.isArray(files)) return `The definitions have problems:\n${files.problems}\n`;
  return files.find((item) => item.path === file)?.text ?? `${file} is not generated now.\n`;
}

function previewOf(uri: vscode.Uri) {
  const query = new URLSearchParams(uri.query);
  return {
    folder: query.get("folder") ?? "",
    environment: query.get("environment") ?? "",
    file: query.get("file") ?? "",
  };
}
