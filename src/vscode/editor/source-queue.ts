// One import at a time: two can change the same metadata document, and an import reads the
// project as the one before left it. The saved-file watcher and the import command share it.
import type * as vscode from "vscode";

let tail: Promise<unknown> = Promise.resolve();
let stopped = true;
let waiting = 0;
const emptied: (() => void)[] = [];

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
 * task's own result or failure; does nothing once the extension has stopped. When the queue is
 * empty again, the listeners of `onEmpty` have run before this gives its result.
 */
export function queued(task: () => Promise<void>): Promise<void> {
  waiting += 1;
  const run = tail.then(() => (stopped ? undefined : task()));
  const done = run.finally(() => {
    waiting -= 1;
    if (waiting === 0) tellEmpty();
  });
  tail = done.catch(() => undefined);
  return done;
}

/** True when no task is running or waiting. */
export function idle(): boolean {
  return waiting === 0;
}

/**
 * Calls `listener` each time the queue becomes empty: the imports queued together are then all
 * done, and what they gave can be told as one.
 */
export function onEmpty(listener: () => void): void {
  emptied.push(listener);
}

function tellEmpty(): void {
  for (const listener of emptied) {
    try {
      listener();
    } catch (error) {
      console.error("ingestron: telling the imports' results failed", error);
    }
  }
}
