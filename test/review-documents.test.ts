// Review results are stable, read-only virtual documents, scoped to a project.
import { beforeEach, describe, expect, it, vi } from "vitest";

const observed = vi.hoisted(() => ({
  provider: undefined as
    undefined | { provideTextDocumentContent(uri: { toString(): string }): string },
  opened: [] as { scheme: string; path: string; query: string; toString(): string }[],
}));

vi.mock("vscode", () => ({
  Uri: {
    from: (parts: { scheme: string; path: string; query: string }) => ({
      ...parts,
      toString: () => JSON.stringify(parts),
    }),
  },
  EventEmitter: class {
    event = () => ({ dispose() {} });
    fire() {}
    dispose() {}
  },
  workspace: {
    registerTextDocumentContentProvider: (_scheme: string, provider: typeof observed.provider) => {
      observed.provider = provider;
      return { dispose() {} };
    },
    openTextDocument: async (uri: (typeof observed.opened)[number]) => {
      observed.opened.push(uri);
      return { uri };
    },
  },
  window: { showTextDocument: async () => undefined },
}));

import { registerMarkdown, showMarkdown } from "../src/vscode/commands/markdown.js";

beforeEach(() => {
  observed.opened = [];
  registerMarkdown({ subscriptions: [] } as never);
});

describe("generated review documents", () => {
  it("refreshes a named provider-backed document instead of accumulating unsaved buffers", async () => {
    await showMarkdown("# Source request: sales (dev)\n\nBefore import", "/projects/sales");
    await showMarkdown("# Source request: sales (dev)\n\nAll tables captured", "/projects/sales");
    expect(observed.opened[0]?.scheme).toBe("ingestron-review");
    expect(observed.opened[0]?.path).toMatch(/\.md$/);
    expect(observed.opened[0]?.toString()).toBe(observed.opened[1]?.toString());
    expect(observed.provider?.provideTextDocumentContent(observed.opened[0]!)).toContain(
      "All tables captured",
    );
  });
  it("keeps projects with the same id separate", async () => {
    await showMarkdown("# Platform request: sales (dev)", "/projects/one");
    await showMarkdown("# Platform request: sales (dev)", "/projects/two");
    expect(observed.opened[0]?.toString()).not.toBe(observed.opened[1]?.toString());
  });
});
