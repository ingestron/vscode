// The import queue runs one import at a time, and nothing once the extension has stopped: an
// import still waiting then does nothing.
import { describe, expect, it, vi } from "vitest";
import { queued, registerImportQueue } from "../src/vscode/editor/source-queue.js";

/** Starts the queue as the extension does; gives what stops it. */
function start(): () => void {
  const subscriptions: { dispose(): unknown }[] = [];
  registerImportQueue({ subscriptions } as unknown as Parameters<typeof registerImportQueue>[0]);
  return () => subscriptions.forEach((item) => item.dispose());
}

/** A promise and what settles it, for a task that runs until the test lets it finish. */
function gate(): { done: Promise<void>; release: () => void } {
  let release = () => {};
  const done = new Promise<void>((resolve) => (release = resolve));
  return { done, release };
}

describe("queued", () => {
  it("runs each task after the one before has finished", async () => {
    const stop = start();
    const order: string[] = [];
    const first = gate();
    const running = queued(async () => {
      order.push("first started");
      await first.done;
      order.push("first finished");
    });
    const second = queued(async () => void order.push("second"));
    first.release();
    await Promise.all([running, second]);
    expect(order).toEqual(["first started", "first finished", "second"]);
    stop();
  });

  it("does nothing after dispose, for a task still waiting or queued after it", async () => {
    const stop = start();
    const first = gate();
    const running = queued(() => first.done);
    const waiting = vi.fn(async () => {});
    const queuedBefore = queued(waiting);
    stop();
    first.release();
    const after = vi.fn(async () => {});
    await Promise.all([running, queuedBefore, queued(after)]);
    expect(waiting).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });
});
