// New project from a starter: one of the CLI's built-in templates, such as
// DuckDB on a laptop, created with the template's own standard and environments.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { builtInTemplates, type Template } from "@ingestron/cli";
import * as vscode from "vscode";
import { parse } from "yaml";

/** The starter chosen, and the environments its project.yaml names. */
export interface StarterChoice {
  template: Template;
  environments: string[];
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
    { title: "New project: starter", placeHolder: "Search starters", matchOnDetail: true },
  );
  if (!picked) return undefined;
  const project = parse(readFileSync(join(picked.template.folder, "project.yaml"), "utf8")) as {
    environments?: Record<string, unknown>;
  };
  return {
    template: picked.template,
    environments: Object.keys(project.environments ?? { dev: {} }),
  };
}
