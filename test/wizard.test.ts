// Exercise the actual command and shared CLI with synthetic picker/input responses.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  state.suggested = [];
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
  state.choices = ["From a connection", "All sources", "postgresql", "private", "adf"];
  await state.command!();
  expect(state.menus[4]).toEqual([
    "ADF ingestion into Databricks",
    "ADF ingestion, served as Synapse serverless SQL views",
    "ADF ingestion into DuckDB tables",
    "ADF ingestion, ending at the landed files",
  ]);
  expect(state.folderAsked).toBe(true);
  expect(state.output).toContain("Created");
  expect(readFileSync(join(state.folder, "connections/postgresql.yaml"), "utf8")).toContain(
    "connector: postgresql",
  );
  expect(readFileSync(join(state.folder, "standard.yaml"), "utf8")).toContain("adf@1");
  expect(state.menus).toHaveLength(5);
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
  expect(readFileSync(join(state.folder, "standard.yaml"), "utf8")).not.toContain("adf@1");
});
it.each([0, 1, 2, 3, 4])(
  "cancels at source-choice step %s without asking for a folder",
  async (step) => {
    state.choices = ["From a connection", "All sources", "files", "public", "adf"].slice(0, step);
    await state.command!();
    expect(state.folderAsked).toBe(false);
    expect(existsSync(state.folder)).toBe(false);
  },
);
it("cancels configuration without writing or asking for the folder", async () => {
  state.choices = ["From a connection", "All sources", "postgresql", "private"];
  state.inputs = ["orders", "dev", "", undefined];
  await state.command!();
  expect(state.folderAsked).toBe(false);
  expect(existsSync(state.folder)).toBe(false);
});
it("creates a project from a starter, with the starter's environments", async () => {
  state.choices = ["From a starter", "duckdb"];
  await state.command!();
  expect(state.menus[0]).toEqual(["From a connection", "From a starter"]);
  expect(state.menus[1]).toContain("DuckDB on a laptop");
  expect(state.output).toContain("Created");
  expect(existsSync(join(state.folder, "samples/orders.csv"))).toBe(true);
  expect(readFileSync(join(state.folder, "standard.yaml"), "utf8")).toContain("duckdb@1");
  const project = readFileSync(join(state.folder, "project.yaml"), "utf8");
  expect(project).toContain("dev: {}");
  expect(project).not.toContain("prod");
});
it.each([1, 2, 3, 4])(
  "cancels a starter at question %s without asking for a folder or writing",
  async (step) => {
    state.choices = ["From a starter", "minimal"];
    state.inputs = ["shop", "dev", "", "/Volumes/x"].map((value, index) =>
      index === step - 1 ? undefined : value,
    );
    await state.command!();
    expect(state.folderAsked).toBe(false);
    expect(existsSync(state.folder)).toBe(false);
  },
);

it("cancels choosing a starter without asking for a folder", async () => {
  state.choices = ["From a starter"];
  await state.command!();
  expect(state.folderAsked).toBe(false);
  expect(existsSync(state.folder)).toBe(false);
});

it("suggests the starter's project id as the name, and takes a standard", async () => {
  const outside = mkdtempSync(join(tmpdir(), "ingestron-standard-"));
  mkdirSync(outside, { recursive: true });
  const standard = join(outside, "acme.yaml");
  const own = join(
    import.meta.dirname,
    "../node_modules/@ingestron/cli/project-templates/private-files/standard.yaml",
  );
  writeFileSync(standard, readFileSync(own, "utf8").replace(/^id: .*$/m, "id: acme"));
  state.choices = ["From a starter", "private-files"];
  state.inputs = ["<default>", "dev", standard];
  await state.command!();
  expect(state.suggested[0]).toBe("stores");
  expect(state.output).toContain("Created");
  expect(readFileSync(join(state.folder, "standard.yaml"), "utf8")).toContain("id: acme");
});
