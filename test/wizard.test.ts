// Exercise the actual command and shared CLI with synthetic picker/input responses.
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
const state = vi.hoisted(() => ({
  command: undefined as undefined | (() => Promise<void>),
  choices: [] as (string | undefined)[],
  inputs: [] as (string | undefined)[],
  menus: [] as string[][],
  folder: "",
  output: "",
  folderAsked: false,
}));
vi.mock("vscode", () => ({
  commands: {
    registerCommand: (_id: string, action: () => Promise<void>) => {
      state.command = action;
    },
  },
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  workspace: { getWorkspaceFolder: () => true },
  window: {
    showQuickPick: async (items: (string | { label: string; id?: string; via?: string })[]) => {
      state.menus.push(items.map((item) => (typeof item === "string" ? item : item.label)));
      const choice = state.choices.shift();
      if (choice === undefined) return undefined;
      return items.find((item) =>
        typeof item === "string"
          ? item === choice
          : [item.label, item.id, item.via].includes(choice),
      );
    },
    showInputBox: async (options: { value?: string }) =>
      state.inputs.length ? state.inputs.shift() : (options.value ?? ""),
    showOpenDialog: async () => {
      state.folderAsked = true;
      return [{ fsPath: state.folder }];
    },
    showTextDocument: async () => {},
    showErrorMessage: async (message: string) => {
      throw new Error(message);
    },
  },
}));
import { registerWizard } from "../src/vscode/wizard.js";
beforeEach(() => {
  state.choices = [];
  state.inputs = [];
  state.menus = [];
  state.folderAsked = false;
  state.output = "";
  state.folder = join(mkdtempSync(join(tmpdir(), "ingestron-wizard-")), "project");
  registerWizard(
    { subscriptions: [] } as unknown as vscode.ExtensionContext,
    {
      clear: () => {},
      show: () => {},
      append: (text: string) => {
        state.output += text;
      },
    } as unknown as vscode.OutputChannel,
  );
});
it("creates the selected ADF connection with the shared CLI questions", async () => {
  state.choices = ["All sources", "postgresql", "private"];
  await state.command!();
  expect(state.folderAsked).toBe(true);
  expect(state.output).toContain("Created");
  expect(readFileSync(join(state.folder, "connections/postgresql.yaml"), "utf8")).toContain(
    "connector: postgresql",
  );
  expect(readFileSync(join(state.folder, "standard.yaml"), "utf8")).toContain("adf@1");
  expect(state.menus).toHaveLength(3);
});
it("offers both routes for public files and creates the chosen direct project", async () => {
  state.choices = ["Files and storage", "files", "public", "databricks"];
  await state.command!();
  expect(state.menus[3]).toEqual(["Databricks directly", "ADF ingestion into Databricks"]);
  expect(state.output).toContain("Created");
  expect(readFileSync(join(state.folder, "standard.yaml"), "utf8")).not.toContain("adf@1");
});
it.each([0, 1, 2, 3])(
  "cancels at source-choice step %s without asking for a folder",
  async (step) => {
    state.choices = ["All sources", "files", "public", "adf"].slice(0, step);
    await state.command!();
    expect(state.folderAsked).toBe(false);
    expect(existsSync(state.folder)).toBe(false);
  },
);
it("cancels configuration without writing or asking for the folder", async () => {
  state.choices = ["All sources", "postgresql", "private"];
  state.inputs = ["orders", "dev", "", undefined];
  await state.command!();
  expect(state.folderAsked).toBe(false);
  expect(existsSync(state.folder)).toBe(false);
});
