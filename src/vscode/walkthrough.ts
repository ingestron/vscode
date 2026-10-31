// The Get started walkthrough's steps that depend on the workspace's files:
// a project, a connection, a contract and a flow. VS Code registers an
// extension's walkthrough up to seconds after startup and does not tick a step
// whose condition was already true then, so the steps are also marked complete
// directly; none is ever unmarked.
import * as vscode from "vscode";
import { onProjectChange } from "./state.js";

/** Each document kind, and the step it completes. */
const kinds = { Connection: "connection", DataContract: "contract", Flow: "flow" } as const;

/** Checks the workspace now, once the walkthrough is registered, and after every change. */
export function registerWalkthrough(context: vscode.ExtensionContext): void {
  const prefix = `${context.extension.id}#start#`;
  let timer: NodeJS.Timeout | undefined;
  const later = (delay: number) => {
    clearTimeout(timer);
    // A check that is still waiting never keeps the extension host from exiting.
    timer = setTimeout(() => void update(prefix), delay).unref();
  };
  context.subscriptions.push(
    onProjectChange(() => later(1000)),
    { dispose: () => clearTimeout(timer) },
  );
  void update(prefix);
  later(6000);
}

async function update(prefix: string): Promise<void> {
  const exclude = "**/{build,node_modules,.git}/**";
  const done = new Set<string>();
  if ((await vscode.workspace.findFiles("**/project.yaml", exclude, 1)).length > 0)
    done.add("project");
  for (const file of await vscode.workspace.findFiles("**/*.{yaml,yml}", exclude, 500)) {
    const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(file));
    const kind = /^kind:\s*(\S+)/m.exec(text)?.[1];
    if (kind && kind in kinds) done.add(kinds[kind as keyof typeof kinds]);
  }
  for (const step of done) {
    await vscode.commands.executeCommand("setContext", `ingestron.done.${step}`, true);
    // Absent in editors without walkthroughs, and before VS Code has registered this one.
    await Promise.resolve(
      vscode.commands.executeCommand("welcome.markStepComplete", prefix + step),
    ).catch(() => undefined);
  }
}
