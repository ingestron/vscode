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
    showInformationMessage: async (message: string) => {
      state.messages.push(message);
      return undefined;
    },
    showErrorMessage: async (message: string) => {
      throw new Error(message);
    },
  },
}));
import { createdMessage, registerWizard } from "../src/vscode/wizard.js";
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
it("asks only the connection, its reachability and route, then opens README.md", async () => {
  state.choices = ["From a connection", "All sources", "postgresql", "private", "adf-databricks"];
  await state.command!();
  expect(state.menus[4]).toEqual([
    "ADF ingestion into Databricks",
    "ADF ingestion, served as Synapse serverless SQL views",
    "ADF ingestion into DuckDB tables",
    "ADF ingestion, ending at the landed files",
  ]);
  expect(state.menus).toHaveLength(5);
  expect(state.suggested).toEqual([]);
  expect(state.folderAsked).toBe(true);
  expect(readFileSync(join(state.folder, "connections/postgresql.yaml"), "utf8")).toContain(
    "server: REPLACE_ME",
  );
  expect(readFileSync(join(state.folder, "standard.yaml"), "utf8")).toContain("adf@2");
  // The project id comes from the folder, as in the terminal.
  expect(readFileSync(join(state.folder, "project.yaml"), "utf8")).toContain("id: project");
  expect(state.executed).toEqual([
    ["markdown.showPreview", { fsPath: join(state.folder, "README.md") }],
  ]);
  expect(state.messages[0]).toMatch(
    /^Created the project\. \d+ values are still REPLACE_ME: README\.md lists them\.$/,
  );
});

it("offers both routes for public files and creates the chosen direct project", async () => {
  state.choices = ["From a connection", "Files and storage", "files", "public", "databricks"];
  await state.command!();
  expect(state.menus[4]).toEqual([
    "Databricks directly",
    "ADF ingestion into Databricks",
    "ADF ingestion, ending at the landed files",
  ]);
  expect(state.output).toContain("Created");
  expect(readFileSync(join(state.folder, "standard.yaml"), "utf8")).not.toContain("adf@2");
});

it.each([0, 1, 2, 3, 4])(
  "cancels at source-choice step %s without asking for a folder",
  async (step) => {
    state.choices = ["From a connection", "All sources", "files", "public"].slice(0, step);
    await state.command!();
    expect(state.folderAsked).toBe(false);
    expect(existsSync(state.folder)).toBe(false);
  },
);

it("creates a project from a starter, with the starter's environments, and asks nothing else", async () => {
  state.choices = ["From a starter", "duckdb"];
  await state.command!();
  expect(state.menus[0]).toEqual(["From a connection", "From a starter"]);
  expect(state.menus[1]).toContain("DuckDB on a laptop");
  expect(state.suggested).toEqual([]);
  expect(existsSync(join(state.folder, "samples/orders.csv"))).toBe(true);
  expect(readFileSync(join(state.folder, "standard.yaml"), "utf8")).toContain("duckdb@2");
  const project = readFileSync(join(state.folder, "project.yaml"), "utf8");
  expect(project).toContain("dev: {}");
  expect(project).not.toContain("prod");
  expect(state.messages[0]).toBe("Created the project. Nothing to replace: it runs as written.");
});

it("cancels choosing a starter without asking for a folder", async () => {
  state.choices = ["From a starter"];
  await state.command!();
  expect(state.folderAsked).toBe(false);
  expect(existsSync(state.folder)).toBe(false);
});

it("keeps a README.md the folder already has, and still opens it", async () => {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(state.folder, { recursive: true });
  writeFileSync(join(state.folder, "README.md"), "# Ours\n");
  state.choices = ["From a starter", "minimal"];
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
