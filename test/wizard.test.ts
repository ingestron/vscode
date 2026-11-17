// Exercise the actual command and shared CLI with synthetic picker/input responses.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  suggested: [] as (string | undefined)[],
  workspace: "",
  executed: [] as [string, unknown][],
  messages: [] as string[],
  answer: undefined as string | undefined,
}));
vi.mock("vscode", () => ({
  commands: {
    registerCommand: (_id: string, action: () => Promise<void>) => {
      state.command = action;
    },
    executeCommand: async (command: string, argument: unknown) => {
      state.executed.push([command, argument]);
    },
  },
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  workspace: {
    getWorkspaceFolder: () => true,
    get workspaceFolders() {
      return state.workspace ? [{ uri: { fsPath: state.workspace } }] : undefined;
    },
  },
  window: {
    showQuickPick: async (
      items: (string | { label: string; id?: string; via?: string })[],
      options?: { canPickMany?: boolean },
    ) => {
      // The assistants step, with none ticked, is tested in wizard-assistants.test.ts.
      if (options?.canPickMany) return [];
      state.menus.push(items.map((item) => (typeof item === "string" ? item : item.label)));
      const choice = state.choices.shift();
      if (choice === undefined) return undefined;
      return items.find((item) =>
        typeof item === "string"
          ? item === choice
          : [item.label, item.id, item.via].includes(choice),
      );
    },
    showInputBox: async (options: { value?: string }) => {
      state.suggested.push(options.value);
      const next = state.inputs.length ? state.inputs.shift() : "<default>";
      return next === "<default>" ? (options.value ?? "") : next;
    },
    showOpenDialog: async () => {
      state.folderAsked = true;
      return [{ fsPath: state.folder }];
    },
    showTextDocument: async () => {},
    showInformationMessage: async (message: string, ...actions: string[]) => {
      state.messages.push(message);
      return actions.find((action) => action === state.answer);
    },
    showErrorMessage: async (message: string) => {
      throw new Error(message);
    },
  },
}));
import { createdMessage, registerWizard } from "../src/vscode/wizard/wizard.js";
beforeEach(() => {
  state.choices = [];
  state.inputs = [];
  state.menus = [];
  state.folderAsked = false;
  state.suggested = [];
  state.output = "";
  state.workspace = "";
  state.executed = [];
  state.messages = [];
  state.answer = undefined;
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
it.each([0, 1])("cancels at question %s without asking for a folder", async (step) => {
  state.choices = ["synapse"].slice(0, step);
  await state.command!();
  expect(state.folderAsked).toBe(false);
  expect(existsSync(state.folder)).toBe(false);
});

it("creates a sample project, with the sample's environments, and asks nothing else", async () => {
  state.choices = ["sample", "duckdb"];
  await state.command!();
  expect(state.menus[0]).toEqual([
    "Azure Synapse",
    "Databricks",
    "Azure Data Factory",
    "DuckDB",
    "Try a sample project",
  ]);
  expect(state.menus[1]).toContain("DuckDB on a laptop");
  expect(state.suggested).toEqual([]);
  expect(existsSync(join(state.folder, "samples/orders.csv"))).toBe(true);
  expect(readFileSync(join(state.folder, "standard.yaml"), "utf8")).toContain("duckdb@2");
  const project = readFileSync(join(state.folder, "project.yaml"), "utf8");
  expect(project).toContain("dev: {}");
  expect(project).not.toContain("prod");
  expect(state.messages[0]).toBe("Created the project. Nothing to replace: it runs as written.");
});

it("cancels choosing a sample without asking for a folder", async () => {
  state.choices = ["sample"];
  await state.command!();
  expect(state.folderAsked).toBe(false);
  expect(existsSync(state.folder)).toBe(false);
});

it("keeps a README.md the folder already has, and still opens it", async () => {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(state.folder, { recursive: true });
  writeFileSync(join(state.folder, "README.md"), "# Ours\n");
  state.choices = ["sample", "minimal"];
  await state.command!();
  expect(readFileSync(join(state.folder, "README.md"), "utf8")).toBe("# Ours\n");
  expect(state.executed[0]?.[0]).toBe("markdown.showPreview");
  expect(state.messages[0]).toBe(
    "Created the project. 1 value is still REPLACE_ME: the Ingestron output lists them.",
  );
});

it("reads the count from what init printed", () => {
  expect(createdMessage("8 values are still REPLACE_ME: README.md lists each one…\n")).toBe(
    "Created the project. 8 values are still REPLACE_ME: README.md lists them.",
  );
  expect(createdMessage("Nothing to replace: the project runs as written.\n")).toBe(
    "Created the project. Nothing to replace: it runs as written.",
  );
});

it("starts with the target platform and writes no forced source or flow", async () => {
  state.choices = ["synapse", "A new standard for Azure Synapse"];
  state.answer = "Add connection";
  await state.command!();
  expect(state.menus[1]![0]).toBe("A new standard for Azure Synapse");
  expect(state.menus[1]!.at(-1)).toBe("Your team's standard file");
  expect(existsSync(join(state.folder, "platform.yaml"))).toBe(true);
  expect(existsSync(join(state.folder, "connections"))).toBe(false);
  expect(existsSync(join(state.folder, "flows"))).toBe(false);
  expect(readFileSync(join(state.folder, "README.md"), "utf8")).toContain("Add connection");
  expect(state.messages[0]).toContain("Review target settings");
  // The next step is a connection: the notice offers it.
  expect(state.executed.at(-1)).toEqual(["ingestron.addConnection", { fsPath: state.folder }]);
});
