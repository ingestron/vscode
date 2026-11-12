// New project's assistants step: where it comes, what is ticked, and that Escape cancels.
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import type * as vscode from "vscode";

interface Item {
  label: string;
  id?: string;
  picked?: boolean;
}
const state = vi.hoisted(() => ({
  command: undefined as undefined | (() => Promise<void>),
  choices: [] as string[],
  // The positions ticked in the many-choice picker; undefined is Escape.
  ticks: [] as number[] | undefined,
  tickable: [] as { title?: string; placeHolder?: string; picked: string[] }[],
  folder: "",
  folderAsked: false,
}));
vi.mock("vscode", () => ({
  commands: {
    registerCommand: (_id: string, action: () => Promise<void>) => {
      state.command = action;
    },
    executeCommand: async () => {},
  },
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  workspace: { getWorkspaceFolder: () => true },
  window: {
    showQuickPick: async (
      items: Item[],
      options?: { canPickMany?: boolean; title?: string; placeHolder?: string },
    ) => {
      if (options?.canPickMany) {
        const picked = items.filter((item) => item.picked).map((item) => item.label);
        state.tickable.push({ title: options.title, placeHolder: options.placeHolder, picked });
        return state.ticks?.map((index) => items[index]);
      }
      const choice = state.choices.shift();
      return items.find((item) => [item.label, item.id].includes(choice));
    },
    showOpenDialog: async () => {
      state.folderAsked = true;
      return [{ fsPath: state.folder }];
    },
    showInformationMessage: async () => undefined,
  },
}));
import { assistantPlaceholder, newProjectTitle } from "../src/features/assistants.js";
import { registerWizard } from "../src/vscode/wizard/wizard.js";

beforeEach(() => {
  state.choices = ["From a starter", "minimal"];
  state.ticks = [];
  state.tickable = [];
  state.folderAsked = false;
  state.folder = join(mkdtempSync(join(tmpdir(), "ingestron-wizard-")), "project");
  registerWizard(
    { subscriptions: [] } as unknown as vscode.ExtensionContext,
    { clear: () => {}, show: () => {}, append: () => {} } as unknown as vscode.OutputChannel,
  );
});

it("asks which assistants to write files for, with none ticked, and writes the guide for the ticked", async () => {
  state.ticks = [2];
  await state.command!();
  expect(state.tickable).toEqual([
    { title: newProjectTitle, placeHolder: assistantPlaceholder, picked: [] },
  ]);
  expect(readFileSync(join(state.folder, "AGENTS.md"), "utf8")).toContain("Ingestron");
});

it("writes no assistant file when none is ticked", async () => {
  await state.command!();
  expect(state.folderAsked).toBe(true);
  expect(existsSync(join(state.folder, "project.yaml"))).toBe(true);
  expect(existsSync(join(state.folder, "AGENTS.md"))).toBe(false);
});

it("cancels the wizard at the assistants step, without asking for a folder", async () => {
  state.ticks = undefined;
  await state.command!();
  expect(state.tickable).toHaveLength(1);
  expect(state.folderAsked).toBe(false);
  expect(existsSync(state.folder)).toBe(false);
});
