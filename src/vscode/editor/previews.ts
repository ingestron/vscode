// Read-only previews of generated files. Each preview's URI names its
// project and environment, and its text is generated again whenever that
// project changes, so an open preview never shows another project's or an
// older version's output.
import { basename, join } from "node:path";
import * as vscode from "vscode";
import type { ProjectSnapshot } from "@ingestron/authoring";
import { previewOf, previewScheme, type ExtensionState } from "../state/index.js";

/**
 * The preview of one generated file. The path starts with the project
 * folder's name and the environment, so previews of the same file from two
 * projects or environments have different paths. VS Code shows no
 * breadcrumbs for this scheme, and a tab adds the path only when another
 * open tab has the same file name. The
 * query holds the folder itself, so two projects with the same name and
 * output paths never share a preview.
 */
export function previewUri(
  project: ProjectSnapshot,
  environment: string | undefined,
  path: string,
): vscode.Uri {
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

/** Serves previews and refreshes the open ones when their project changes. */
export function registerPreviews(context: vscode.ExtensionContext, state: ExtensionState): void {
  const changed = new vscode.EventEmitter<vscode.Uri>();
  context.subscriptions.push(
    changed,
    vscode.workspace.registerTextDocumentContentProvider(previewScheme, {
      onDidChange: changed.event,
      provideTextDocumentContent: (uri) => textOf(state, uri),
    }),
    state.onProjectChange(() => {
      for (const document of vscode.workspace.textDocuments)
        if (document.uri.scheme === previewScheme) changed.fire(document.uri);
    }),
  );
}

function textOf(state: ExtensionState, uri: vscode.Uri): string {
  const { folder, environment, file } = previewOf(uri);
  const here = state.projectAt(vscode.Uri.file(join(folder, "project.yaml")));
  if (!here) return `The project in ${folder} is not there any more.\n`;
  const files = here.project.generatedFiles(environment || undefined);
  if (!Array.isArray(files))
    return `Nothing is generated while plan would stop:\n\n${files.problems}\n`;
  return files.find((item) => item.path === file)?.text ?? `${file} is not generated now.\n`;
}
