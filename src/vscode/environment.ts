// Select environment: asks, for the active editor's project, or takes a project
// folder and an environment name, as the Project view's rows pass them.
import { join } from "node:path";
import * as vscode from "vscode";
import { chooseEnvironment, hereFor } from "./state.js";

/**
 * Remembers the environment for a project. Given a project folder and an
 * environment it declares, it selects that without asking; otherwise it asks
 * for the active editor's project. `refresh` updates problems afterwards.
 */
export async function selectEnvironment(
  refresh: (uri: vscode.Uri) => void,
  folder?: unknown,
  name?: unknown,
): Promise<void> {
  const named = typeof folder === "string" && typeof name === "string";
  const here = hereFor(named ? vscode.Uri.file(folder) : undefined);
  if (!here || here.project.environments.length === 0) return;
  const picked = named
    ? here.project.environments.find((environment) => environment === name)
    : await vscode.window.showQuickPick(here.project.environments, {
        placeHolder: "Environment for problems and previews",
      });
  if (!picked) return;
  chooseEnvironment(here.project, picked);
  refresh(vscode.Uri.file(join(here.project.folder, "project.yaml")));
}
