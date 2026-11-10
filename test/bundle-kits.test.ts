// The bundled extension lists the published standards installed with it and creates a project
// from one, offline. The bundle and its data folders are copied to a folder with no
// node_modules, as in the installed .vsix, so @ingestron/standards cannot be resolved and the
// kits come from the kits folder the build copies beside the bundle. Like bundle.test.ts, it
// reads the output of `pnpm build`, which validate runs first.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");

// A stand-in for VS Code: it records the commands registered and the quick picks shown, picks
// "From a published standard", then the DuckDB kit, and gives the folder in TARGET.
const stub = `
const any = new Proxy(function () {}, {
  get: (_target, key) => (key === "then" ? undefined : key === Symbol.toPrimitive ? () => "" : any),
  apply: () => any,
  construct: () => any,
});
const some = (own) => new Proxy(own, { get: (target, key) => (key in target ? target[key] : any) });
const registered = new Map();
const picks = [];
const written = [];
globalThis.stand = { registered, picks, written };
const commands = some({
  registerCommand: (id, run) => (registered.set(id, run), any),
  executeCommand: async () => undefined,
});
const window = some({
  showQuickPick: async (items) => {
    const list = await items;
    picks.push(list.map(({ label, description }) => ({ label, description })));
    return picks.length === 1
      ? list.find((item) => item.id === "kit")
      : list.find((item) => item.description === "duckdb/local-medallion@2026-11-10");
  },
  showOpenDialog: async () => [{ fsPath: process.env.TARGET }],
  showInformationMessage: async () => undefined,
  createOutputChannel: () => some({ append: (text) => written.push(text) }),
});
const workspace = some({ getWorkspaceFolder: () => undefined });
const Uri = some({ file: (path) => ({ fsPath: path }) });
const names = ["languages", "Range", "Location", "Hover", "MarkdownString", "CompletionItem",
  "CompletionItemKind", "Diagnostic", "DiagnosticSeverity", "StatusBarAlignment", "WorkspaceEdit",
  "CodeAction", "CodeActionKind", "SnippetString", "EventEmitter", "InlayHint", "CodeLens",
  "SymbolKind", "DocumentSymbol", "SymbolInformation", "ExtensionMode"];
module.exports = { ...Object.fromEntries(names.map((name) => [name, any])), commands, window, workspace, Uri };
`;

// What the .vsix holds beside node_modules-free code: the bundle, its data folders and the
// extension's package.json, which is the bundle's "../package.json".
const installedFiles = [
  "dist",
  "schemas",
  "templates",
  "recipes",
  "project-templates",
  "kits",
  "package.json",
];

describe("bundle and published standards", () => {
  it("lists the kits copied beside the bundle and creates a project from one, offline", () => {
    const installed = mkdtempSync(join(tmpdir(), "ingestron-vscode-installed-"));
    for (const file of installedFiles)
      cpSync(join(root, file), join(installed, file), { recursive: true });
    const modules = mkdtempSync(join(tmpdir(), "ingestron-vscode-stub-"));
    mkdirSync(join(modules, "vscode"));
    writeFileSync(join(modules, "vscode", "index.js"), stub);
    const target = mkdtempSync(join(tmpdir(), "ingestron-vscode-kit-"));
    const script = `
      const extension = require(${JSON.stringify(join(installed, "dist/extension.cjs"))});
      const context = { subscriptions: [], extensionMode: 1, extension: { id: "ingestron.ingestron-vscode" }, workspaceState: { get: () => undefined, update: () => undefined } };
      extension.activate(context);
      globalThis.stand.registered.get("ingestron.newProject")().then(() => {
        const { picks, written } = globalThis.stand;
        console.log(JSON.stringify({ picks, written: written.join("") }));
      });
    `;
    const output = execFileSync(process.execPath, ["-e", script], {
      cwd: installed,
      env: {
        ...process.env,
        NODE_PATH: modules,
        TARGET: target,
        // Any attempt to read the catalogue fails: the kits must be the installed ones.
        INGESTRON_STANDARDS_REPOSITORY: pathToFileURL(join(installed, "no-such-catalogue.git"))
          .href,
      },
      encoding: "utf8",
    });
    const { picks, written } = JSON.parse(output.trim().split("\n").at(-1)!) as {
      picks: { description?: string }[][];
      written: string;
    };
    expect(picks[1]!.map((item) => item.description)).toEqual([
      "databricks/lakehouse-streaming@2026-11-10",
      "duckdb/local-medallion@2026-11-10",
    ]);
    for (const file of ["project.yaml", "standard.yaml", "STANDARD.md", "README.md", ".gitignore"])
      expect(existsSync(join(target, file)), `${file}\n${written}`).toBe(true);
  });
});
