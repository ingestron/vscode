// The real editor commands draft files through core, independently of project initialisation.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it, vi } from "vitest";
import { run } from "@ingestron/cli";
import { ProjectSnapshot } from "@ingestron/authoring";
import type * as vscode from "vscode";
import type { ExtensionState } from "../src/vscode/state/index.js";
const ui = vi.hoisted(() => ({
  commands: new Map<string, () => Promise<void>>(),
  titles: [] as string[],
  cancel: false,
  opened: [] as string[],
  notices: [] as string[],
  buffers: {} as Record<string, { text: string; dirty: boolean }>,
  dirty: [] as string[],
  saved: [] as string[],
}));
vi.mock("vscode", () => ({
  // Open documents: each a buffer over its file on disk, dirty until saved.
  workspace: {
    openTextDocument: async (uri: { fsPath: string }) => {
      const buffer = (ui.buffers[uri.fsPath] ??= {
        text: readFileSync(uri.fsPath, "utf8"),
        dirty: ui.dirty.includes(uri.fsPath),
      });
      return {
        uri,
        get isDirty() {
          return buffer.dirty;
        },
        positionAt: (offset: number) => offset,
        save: async () => {
          writeFileSync(uri.fsPath, buffer.text);
          buffer.dirty = false;
          ui.saved.push(uri.fsPath);
          return true;
        },
      };
    },
    applyEdit: async (edit: { replaced: [{ fsPath: string }, [number, number], string][] }) => {
      for (const [uri, [start, end], text] of edit.replaced) {
        const buffer = ui.buffers[uri.fsPath]!;
        buffer.text = buffer.text.slice(0, start) + text + buffer.text.slice(end);
        buffer.dirty = true;
      }
      return true;
    },
  },
  WorkspaceEdit: class {
    replaced: [{ fsPath: string }, [number, number], string][] = [];
    replace(uri: { fsPath: string }, range: { start: number; end: number }, text: string) {
      this.replaced.push([uri, [range.start, range.end], text]);
    }
  },
  Range: class {
    constructor(
      readonly start: number,
      readonly end: number,
    ) {}
  },
  commands: {
    registerCommand: (id: string, action: () => Promise<void>) => {
      ui.commands.set(id, action);
    },
    executeCommand: async () => {},
  },
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  window: {
    showQuickPick: async (items: (string | { label: string })[], options: { title: string }) => {
      ui.titles.push(options.title);
      return ui.cancel ? undefined : items[0];
    },
    showInputBox: async (options: { title: string; value?: string }) =>
      options.title === "Add flow: source object" ? "northwind.dbo.Order Details" : options.value,
    showTextDocument: async (uri: { fsPath: string }) => {
      ui.opened.push(uri.fsPath);
    },
    showInformationMessage: async (text: string) => {
      ui.notices.push(text);
    },
    showWarningMessage: async (text: string) => {
      ui.notices.push(text);
    },
    showErrorMessage: async (text: string) => {
      throw new Error(text);
    },
  },
}));
import { registerAddDefinitions } from "../src/vscode/wizard/add-definitions.js";
const folders: string[] = [];
afterAll(() => folders.forEach((folder) => rmSync(folder, { recursive: true, force: true })));
function project() {
  const folder = mkdtempSync(join(tmpdir(), "add-definitions-"));
  folders.push(folder);
  expect(
    run(["init", ".", "--platform", "synapse", "--yes"], { cwd: folder, write: () => {} }),
  ).toBe(0);
  const state = {
    hereFor: () => ({ project: ProjectSnapshot.open(folder), file: "project.yaml" }),
    environmentHere: () => "dev",
    forget: () => {},
  } as unknown as ExtensionState;
  registerAddDefinitions({ subscriptions: [] } as unknown as vscode.ExtensionContext, state);
  return folder;
}

it("adds a connection first, offers metadata, and adds a separate flow later", async () => {
  ui.cancel = false;
  const folder = project();
  const standard = readFileSync(join(folder, "standard.yaml"), "utf8");
  await ui.commands.get("ingestron.addConnection")!();
  expect(existsSync(join(folder, "connections/azure_sql_database.yaml"))).toBe(true);
  expect(existsSync(join(folder, "flows"))).toBe(false);
  expect(ui.notices.at(-1)).toContain("Add a flow when you are ready");
  await ui.commands.get("ingestron.addFlow")!();
  expect(readFileSync(join(folder, "flows/azure_sql_database.yaml"), "utf8")).toContain(
    "northwind.dbo.Order Details",
  );
  expect(readFileSync(join(folder, "standard.yaml"), "utf8")).toBe(standard);
  // Each section's first file imports its folder; project.yaml had no unsaved changes, so it is
  // saved, its block list kept.
  expect(ui.notices).toContain(
    "Added connections/azure_sql_database.yaml; project.yaml now imports connections/*.yaml.",
  );
  expect(ui.notices).toContain(
    "Added flows/azure_sql_database.yaml; project.yaml now imports flows/*.yaml.",
  );
  const manifest = readFileSync(join(folder, "project.yaml"), "utf8");
  expect(manifest).toContain("  - platform.yaml\n  - connections/*.yaml\n  - flows/*.yaml\n");
  expect(ui.saved).toContain(join(folder, "project.yaml"));
});

it("keeps a project.yaml with unsaved changes unsaved, and names it", async () => {
  ui.cancel = false;
  const folder = project();
  const manifest = join(folder, "project.yaml");
  const before = readFileSync(manifest, "utf8");
  ui.dirty.push(manifest);
  await ui.commands.get("ingestron.addConnection")!();
  expect(readFileSync(manifest, "utf8")).toBe(before);
  expect(ui.buffers[manifest]!.text).toContain("  - connections/*.yaml\n");
  expect(ui.notices).toContain(
    "Added connections/azure_sql_database.yaml; project.yaml now imports connections/*.yaml. project.yaml had unsaved changes, so it stays unsaved: save to keep the change.",
  );
});

it("cancels connector selection without writing anything", async () => {
  const folder = project();
  ui.cancel = true;
  await ui.commands.get("ingestron.addConnection")!();
  expect(existsSync(join(folder, "connections"))).toBe(false);
  ui.cancel = false;
});
