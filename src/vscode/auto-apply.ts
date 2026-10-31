// The auto-apply switch: a status bar item and a command. Turning it on
// applies at once; then each save of a project's definitions runs the CLI's
// apply for the selected environment, which the switch names, and logs one
// line of activity in the output panel.
import { join } from "node:path";
import { run } from "@ingestron/cli";
import * as vscode from "vscode";
import { activity, triggers } from "../features/auto-apply.js";
import type { Project } from "@ingestron/authoring";
import { contextAt } from "./previews.js";
import { environmentOf, onProjectChange, projectAt } from "./state.js";

const key = "ingestron.autoApply";

/** Registers the switch; `refresh` updates problems after a run. */
export function registerAutoApply(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  refresh: (uri: vscode.Uri) => void,
): void {
  let on = context.workspaceState.get<boolean>(key) ?? false;
  const { item, show } = statusItem(() => on);
  const apply = debounced(output, refresh);
  context.subscriptions.push(
    item,
    vscode.window.onDidChangeActiveTextEditor(show),
    onProjectChange(show),
    vscode.commands.registerCommand("ingestron.toggleAutoApply", async () => {
      on = !on;
      await context.workspaceState.update(key, on);
      show();
      const here = current();
      const environment = here && (environmentOf(here.project) ?? "default");
      output.appendLine(
        `${new Date().toTimeString().slice(0, 8)}  auto-apply ${on ? `on: applying ${environment ?? "each project"} now, then after each save` : "off"}`,
      );
      output.show(true);
      if (on && here) apply(here.project);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      const here = on ? projectAt(document.uri) : undefined;
      if (here && triggers(here.file)) apply(here.project);
    }),
  );
  show();
}

/** The status bar switch, shown only in a project. */
function statusItem(isOn: () => boolean) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  item.command = "ingestron.toggleAutoApply";
  const show = () => {
    const here = current();
    if (!here) return item.hide();
    // What auto-apply writes after a save: the project's choice, even beside a preview.
    const environment = environmentOf(here.project) ?? "default";
    item.text = isOn() ? `$(sync) Auto-apply: on (${environment})` : "Auto-apply: off";
    item.tooltip = isOn()
      ? `Applying ${environment} after each save of the definitions. Click to turn off.`
      : `Click to apply ${environment} now, and again after each save of the definitions.`;
    item.show();
  };
  return { item, show };
}

/** Applies a project 400 ms after its last save, then refreshes its problems. */
function debounced(output: vscode.OutputChannel, refresh: (uri: vscode.Uri) => void) {
  const timers = new Map<string, NodeJS.Timeout>();
  return (project: Project) => {
    clearTimeout(timers.get(project.folder));
    timers.set(
      project.folder,
      setTimeout(() => {
        applyNow(project, output);
        refresh(vscode.Uri.file(join(project.folder, "project.yaml")));
      }, 400),
    );
  };
}

function current() {
  const uri = vscode.window.activeTextEditor?.document.uri;
  return uri && contextAt(uri);
}

/** The CLI's own apply, with its output turned into one activity entry. */
function applyNow(project: Project, output: vscode.OutputChannel): void {
  const environment = environmentOf(project);
  const { folder } = project;
  let text = "";
  const args = ["apply", "--no-diff", "--definitions", folder, "--out", join(folder, "build")];
  run([...args, ...(environment ? ["--env", environment] : [])], {
    cwd: folder,
    write: (chunk) => (text += chunk),
  });
  output.append(activity(text, environment ?? "default", new Date()));
}
