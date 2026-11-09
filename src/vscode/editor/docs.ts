// Links to the documentation site, at the address in the `ingestron.docs.url` setting.
import { docsUrl } from "@ingestron/authoring";
import * as vscode from "vscode";

/** The full URL of a docs path, such as `/docs/reference/errors#SCHEMA`. */
export function docsLink(link: string): string {
  const base = vscode.workspace.getConfiguration("ingestron").get<string>("docs.url");
  return docsUrl(base || "https://docs.ingestron.io", link);
}

/** A problem's code, or the code itself when VS Code shows it as a link. */
export function codeOf(diagnostic: vscode.Diagnostic): string {
  const { code } = diagnostic;
  return String(typeof code === "object" ? code.value : code);
}
