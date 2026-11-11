// New project from a starter (one of the CLI's built-in templates, such as DuckDB on a laptop)
// or from a published standard (a kit).
import { builtInTemplates, installedKits, type Template } from "@ingestron/core";
import * as vscode from "vscode";

/** The starter chosen. */
export interface StarterChoice {
  template: Template;
}

/** The published standard chosen, as init's `--kit` names it: `<id>@<version>`. */
export interface KitChoice {
  spec: string;
}

/** Connection first, as before, a ready-made starter, or a published standard. */
export async function chooseStart(): Promise<"connection" | "starter" | "kit" | undefined> {
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
      {
        label: "From a published standard",
        detail: "A dated standard for your platform, with an example project",
        id: "kit" as const,
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

/** One of the installed published standards, or undefined when the user cancels. */
export async function chooseKit(): Promise<KitChoice | undefined> {
  const picked = await vscode.window.showQuickPick(
    installedKits().map((kit) => ({
      label: kit.title,
      description: `${kit.id}@${kit.version}`,
      detail: kit.summary,
      spec: `${kit.id}@${kit.version}`,
    })),
    {
      title: "New project: published standard",
      placeHolder: "Search published standards",
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  return picked && { spec: picked.spec };
}
