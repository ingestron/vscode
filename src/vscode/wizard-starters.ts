// New project from a starter: one of the CLI's built-in templates, such as
// DuckDB on a laptop.
import { builtInTemplates, type Template } from "@ingestron/cli";
import * as vscode from "vscode";

/** The starter chosen. */
export interface StarterChoice {
  template: Template;
}

/** Connection first, as before, or a ready-made starter. */
export async function chooseStart(): Promise<"connection" | "starter" | undefined> {
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: "From a connection",
        detail: "Choose a source, how it is reached and a supported route",
        id: "connection" as const,
      },
      {
        label: "From a starter",
        detail: "A ready-made project to try, such as DuckDB on a laptop",
        id: "starter" as const,
      },
    ],
    { title: "New project", placeHolder: "How do you want to start?" },
  );
  return picked?.id;
}

/** One of the built-in starters, or undefined when the user cancels. */
export async function chooseStarter(): Promise<StarterChoice | undefined> {
  const picked = await vscode.window.showQuickPick(
    builtInTemplates().map((template) => ({
      label: template.title,
      description: template.name,
      detail: template.summary,
      id: template.name,
      template,
    })),
    {
      title: "New project: starter",
      placeHolder: "Search starters",
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  return picked && { template: picked.template };
}
