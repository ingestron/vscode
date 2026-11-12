// One import at a time: two can change the same metadata document, and an import reads the
// project as the one before left it. The saved-file watcher and the import command share it.
import type * as vscode from "vscode";

let tail: Promise<unknown> = Promise.resolve();
let stopped = true;

/** Starts the queue, and stops it with the extension: imports still waiting then do nothing. */
export function registerImportQueue(context: vscode.ExtensionContext): void {
  stopped = false;
  context.subscriptions.push({
    dispose: () => {
      stopped = true;
    },
  });
}

/**
 * Runs `task` after every task queued before it has finished, however they ended. Gives the
 * task's own result or failure; does nothing once the extension has stopped.
 */
export function queued(task: () => Promise<void>): Promise<void> {
  const run = tail.then(() => (stopped ? undefined : task()));
  tail = run.catch(() => undefined);
  return run;
}
