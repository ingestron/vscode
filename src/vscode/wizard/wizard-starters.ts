// New project's two questions: where the project runs (a target platform, or a sample project to
// try), then, for a platform, which standard: a new one, a published standard for that platform,
// or the team's standard file. The answers become init's flags.
import { builtInTemplates, installedKits, projectPlatforms } from "@ingestron/core";
import * as vscode from "vscode";

/** The sample project choice in the first question. */
export const sampleLabel = "Try a sample project";

/** Where the project runs: a platform id, "sample", or undefined when the user cancels. */
export async function chooseTarget(): Promise<string | undefined> {
  const picked = await vscode.window.showQuickPick(
    [
      ...projectPlatforms().map((item) => ({
        label: item.title,
        description: item.id,
        detail: item.summary,
        id: item.id,
      })),
      {
        label: sampleLabel,
        detail: "A ready-made project, such as DuckDB on a laptop, that runs as written",
        id: "sample",
      },
    ],
    { title: "New project", placeHolder: "Where will this project run?" },
  );
  return picked?.id;
}

/** The published standards for a platform: a kit's id starts with its platform. */
export function kitsFor(platform: string): { title: string; summary: string; spec: string }[] {
  return installedKits()
    .filter((kit) => {
      const prefix = kit.id.split("/")[0]!;
      return platform === prefix || platform.startsWith(`${prefix}-`);
    })
    .map((kit) => ({ title: kit.title, summary: kit.summary, spec: `${kit.id}@${kit.version}` }));
}

/** Which standard, as init's flags; undefined when the user cancels. */
export async function standardFlags(platform: string): Promise<string[] | undefined> {
  const title = projectPlatforms().find((item) => item.id === platform)?.title ?? platform;
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: `A new standard for ${title}`,
        description: "Recommended",
        detail: "A reviewable standard with this platform's defaults; add sources later",
        flags: ["--platform", platform],
      },
      ...kitsFor(platform).map((kit) => ({
        label: kit.title,
        description: kit.spec,
        detail: `Published standard. ${kit.summary}`,
        flags: ["--kit", kit.spec, "--empty"],
      })),
      {
        label: "Your team's standard file",
        detail: "Keep an existing standard.yaml; its fixed settings stay fixed",
        flags: undefined,
      },
    ],
    { title: `New project: ${title} standard`, placeHolder: "Which standard should it follow?" },
  );
  if (!picked) return;
  return picked.flags ?? fileFlags(platform);
}

/** A standard file the team already has, with the target chosen in the first question. */
async function fileFlags(platform: string): Promise<string[] | undefined> {
  const standard = (
    await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      filters: { YAML: ["yaml", "yml"] },
      openLabel: "Use this standard",
    })
  )?.[0];
  return standard && ["--platform", platform, "--standard", standard.fsPath];
}

/** One of the built-in starters as init's flag, or undefined when the user cancels. */
export async function sampleFlags(): Promise<string[] | undefined> {
  const picked = await vscode.window.showQuickPick(
    builtInTemplates().map((template) => ({
      label: template.title,
      description: template.name,
      detail: template.summary,
      id: template.name,
    })),
    {
      title: "New project: sample project",
      placeHolder: "Search sample projects",
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  return picked && ["--template", picked.id];
}
