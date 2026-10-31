// The bundled extension loads with every data folder in place and activates.
// VS Code is replaced by a stand-in that accepts any call.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const stub = `
const any = new Proxy(function () {}, {
  get: (_target, key) => (key === "then" ? undefined : key === Symbol.toPrimitive ? () => "" : any),
  apply: () => any,
  construct: () => any,
});
const names = ["commands", "languages", "window", "workspace", "Uri", "Range", "Location", "Hover",
  "MarkdownString", "CompletionItem", "CompletionItemKind", "Diagnostic", "DiagnosticSeverity",
  "StatusBarAlignment", "WorkspaceEdit", "CodeAction", "CodeActionKind", "SnippetString",
  "EventEmitter", "InlayHint", "CodeLens", "SymbolKind", "DocumentSymbol", "SymbolInformation"];
module.exports = Object.fromEntries(names.map((name) => [name, any]));
`;

describe("bundle", () => {
  it("loads and activates", () => {
    const modules = mkdtempSync(join(tmpdir(), "ingestron-vscode-stub-"));
    mkdirSync(join(modules, "vscode"));
    writeFileSync(join(modules, "vscode", "index.js"), stub);
    const script = `
      const extension = require(${JSON.stringify(join(import.meta.dirname, "../dist/extension.cjs"))});
      const context = { subscriptions: [], extension: { id: "ingestron.ingestron-vscode" }, workspaceState: { get: () => undefined, update: () => undefined } };
      extension.activate(context);
      console.log("activated");
    `;
    const output = execFileSync(process.execPath, ["-e", script], {
      env: { ...process.env, NODE_PATH: modules },
      encoding: "utf8",
    });
    expect(output.trim()).toBe("activated");
  });
});
