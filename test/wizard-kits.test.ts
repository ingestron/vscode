// Starting a project from a published standard: the pick list, and that the extension writes the
// same files as `ingestron init --kit`.
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "@ingestron/cli";
import { installedKits } from "@ingestron/core";
import { beforeEach, expect, it, vi } from "vitest";
import type * as vscode from "vscode";

interface Item {
  label: string;
  description?: string;
  detail?: string;
  spec?: string;
  id?: string;
}
const state = vi.hoisted(() => ({
  command: undefined as undefined | (() => Promise<void>),
  choices: [] as (string | undefined)[],
  menus: [] as unknown[][],
  folder: "",
  folderAsked: false,
  executed: [] as string[],
  messages: [] as string[],
}));
vi.mock("vscode", () => ({
  commands: {
    registerCommand: (_id: string, action: () => Promise<void>) => {
      state.command = action;
    },
    executeCommand: async (command: string) => {
      state.executed.push(command);
    },
  },
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  workspace: { getWorkspaceFolder: () => true },
  window: {
    showQuickPick: async (items: Item[], options?: { canPickMany?: boolean }) => {
      // The many-choice step (none ticked) is not what this file is about.
      if (options?.canPickMany) return [];
      state.menus.push(items);
      const choice = state.choices.shift();
      if (choice === undefined) return undefined;
      return items.find((item) => [item.label, item.id, item.description].includes(choice));
    },
    showOpenDialog: async () => {
      state.folderAsked = true;
      return [{ fsPath: state.folder }];
    },
    showInformationMessage: async (message: string) => {
      state.messages.push(message);
      return undefined;
    },
  },
}));
import { registerWizard } from "../src/vscode/wizard/wizard.js";

const output = { clear: () => {}, show: () => {}, append: () => {} };
const specs = installedKits().map((kit) => `${kit.id}@${kit.version}`);

beforeEach(() => {
  state.choices = [];
  state.menus = [];
  state.folderAsked = false;
  state.executed = [];
  state.messages = [];
  state.folder = join(mkdtempSync(join(tmpdir(), "ingestron-wizard-")), "project");
  registerWizard(
    { subscriptions: [] } as unknown as vscode.ExtensionContext,
    output as unknown as vscode.OutputChannel,
  );
});

/** Every file under a folder, as path to contents. */
function filesIn(root: string, below = ""): Record<string, string> {
  const found: Record<string, string> = {};
  for (const entry of readdirSync(join(root, below), { withFileTypes: true })) {
    const path = join(below, entry.name);
    if (entry.isDirectory()) Object.assign(found, filesIn(root, path));
    else found[path] = readFileSync(join(root, path), "utf8");
  }
  return found;
}

it("offers a third start, the published standard", async () => {
  await state.command!();
  expect(state.menus[0]).toMatchObject([
    { label: "From a connection" },
    { label: "From a starter" },
    {
      label: "From a published standard",
      detail: "A dated standard for your platform, with an example project",
    },
  ]);
});

it("lists the installed standards by title, with id and version, and the summary", async () => {
  state.choices = ["From a published standard"];
  await state.command!();
  const kits = installedKits();
  expect(kits.length).toBeGreaterThan(0);
  expect(state.menus[1]).toMatchObject(
    kits.map((kit) => ({
      label: kit.title,
      description: `${kit.id}@${kit.version}`,
      detail: kit.summary,
    })),
  );
});

it("cancels choosing a published standard without asking for a folder", async () => {
  state.choices = ["From a published standard"];
  await state.command!();
  expect(state.folderAsked).toBe(false);
  expect(existsSync(state.folder)).toBe(false);
});

it.each(specs)("creates the same files from %s as ingestron init --kit", async (spec) => {
  state.choices = ["From a published standard", spec];
  await state.command!();
  const expected = join(mkdtempSync(join(tmpdir(), "ingestron-kit-")), "project");
  expect(run(["init", expected, "--kit", spec, "--yes"], { cwd: expected, write: () => {} })).toBe(
    0,
  );
  const created = filesIn(state.folder);
  expect(Object.keys(created).length).toBeGreaterThan(3);
  expect(created).toEqual(filesIn(expected));
  expect(state.executed).toEqual(["markdown.showPreview"]);
  expect(state.messages[0]).toMatch(/^Created the project\./);
});
