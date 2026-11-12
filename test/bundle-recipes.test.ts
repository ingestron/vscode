// The bundled extension carries the catalogue of source recipes beside its code and uses it
// offline. The bundle and its data folders are copied to a folder with no node_modules, as in
// the installed .vsix, so @ingestron/standards cannot be resolved and the recipes come from the
// source-recipes folder the build copies beside the bundle. Like bundle-kits.test.ts, it reads
// the output of `pnpm build`, which validate runs first.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installedSourceRecipes } from "@ingestron/core";

const root = join(import.meta.dirname, "..");

// A stand-in for VS Code that keeps the Markdown documents the extension opens, with the
// project's file as the active editor.
const stub = `
const any = new Proxy(function () {}, {
  get: (_target, key) => (key === "then" ? undefined : key === Symbol.toPrimitive ? () => "" : any),
  apply: () => any,
  construct: () => any,
});
const some = (own) => new Proxy(own, { get: (target, key) => (key in target ? target[key] : any) });
const registered = new Map();
const opened = [];
globalThis.stand = { registered, opened };
const commands = some({
  registerCommand: (id, run) => (registered.set(id, run), any),
  executeCommand: async () => undefined,
});
const window = some({
  activeTextEditor: { document: { uri: { scheme: "file", fsPath: process.env.PROJECT + "/project.yaml" } } },
  showTextDocument: async () => undefined,
});
const workspace = some({
  textDocuments: [],
  openTextDocument: async (options) => (opened.push(options.content), options),
});
const names = ["languages", "Range", "Location", "Hover", "MarkdownString", "CompletionItem",
  "CompletionItemKind", "Diagnostic", "DiagnosticSeverity", "StatusBarAlignment", "WorkspaceEdit",
  "CodeAction", "CodeActionKind", "SnippetString", "EventEmitter", "InlayHint", "CodeLens",
  "SymbolKind", "DocumentSymbol", "SymbolInformation", "ExtensionMode", "Uri"];
module.exports = { ...Object.fromEntries(names.map((name) => [name, any])), commands, window, workspace };
`;

const project: Record<string, string> = {
  "project.yaml":
    "id: retail\nenvironments:\n  dev: {}\nimports:\n  - standard.yaml\n  - connections/*.yaml\n  - flows/*.yaml\n  - contracts/*.yaml\n",
  "standard.yaml":
    "apiVersion: ingestron.io/v1\nkind: Standard\nid: retail\npacks: [databricks@2]\nlayers:\n  - { name: bronze, does: raw }\n",
  "connections/erp.yaml":
    "apiVersion: ingestron.io/v1\nkind: Connection\nid: erp\nconnector: sqlserver\nconnectivity: workspace\nsettings:\n  uc_connection: erp_connection\n",
  "flows/erp.yaml":
    "apiVersion: ingestron.io/v1\nkind: Flow\nid: erp\nsource: erp\ntables:\n  orders:\n    object: ERP.dbo.Orders\n    contract: erp.orders\n",
  "contracts/orders.yaml":
    "apiVersion: v3.1.0\nkind: DataContract\nid: erp.orders\nversion: 1.0.0\nstatus: active\nschema:\n  - name: orders\n    logicalType: object\n    properties:\n      - name: OrderID\n        logicalType: integer\n",
};

// What the .vsix holds beside node_modules-free code: the bundle, its data folders and the
// extension's package.json, which is the bundle's "../package.json".
const installedFiles = [
  "dist",
  "schemas",
  "templates",
  "recipes",
  "project-templates",
  "kits",
  "source-recipes",
  "package.json",
];

describe("bundle and the source recipe catalogue", () => {
  it("copies the catalogue beside the bundle", () => {
    const recipes = installedSourceRecipes(join(root, "source-recipes")).map(({ id }) => id);
    expect(recipes).toEqual(expect.arrayContaining(["sample", "sqlserver", "postgresql"]));
  });

  it("writes the request from the recipe a connection uses, offline", () => {
    const installed = mkdtempSync(join(tmpdir(), "ingestron-vscode-installed-"));
    for (const file of installedFiles) {
      expect(existsSync(join(root, file)), file).toBe(true);
      cpSync(join(root, file), join(installed, file), { recursive: true });
    }
    const folder = mkdtempSync(join(tmpdir(), "ingestron-vscode-project-"));
    for (const [path, text] of Object.entries(project)) {
      mkdirSync(join(folder, path, ".."), { recursive: true });
      writeFileSync(join(folder, path), text);
    }
    const modules = mkdtempSync(join(tmpdir(), "ingestron-vscode-stub-"));
    mkdirSync(join(modules, "vscode"));
    writeFileSync(join(modules, "vscode", "index.js"), stub);
    const script = `
      const extension = require(${JSON.stringify(join(installed, "dist/extension.cjs"))});
      const context = { subscriptions: [], extensionMode: 1, extension: { id: "ingestron.ingestron-vscode" }, workspaceState: { get: () => undefined, update: () => undefined } };
      extension.activate(context);
      globalThis.stand.registered.get("ingestron.requestSourceMetadata")().then(() => {
        console.log(JSON.stringify(globalThis.stand.opened));
      });
    `;
    const output = execFileSync(process.execPath, ["-e", script], {
      cwd: installed,
      env: { ...process.env, NODE_PATH: modules, PROJECT: folder },
      encoding: "utf8",
    });
    const [request] = JSON.parse(output.trim().split("\n").at(-1)!) as string[];
    expect(request).toMatch(/^# Source request: retail \(dev\)/);
    // The SQL Server recipe asks for a query; with no catalogue the request would offer samples.
    expect(request).toContain("VIEW DEFINITION");
    expect(request).not.toContain("No recipe describes this source");
    expect(readFileSync(join(installed, "source-recipes", "sqlserver.yaml"), "utf8")).toContain(
      "VIEW DEFINITION",
    );
  });
});
