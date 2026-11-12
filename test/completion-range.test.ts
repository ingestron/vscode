// Completion of a dotted value replaces all of it: the editor's word before the cursor stops at
// a dot, so `object: ERP.d` accepting `ERP.dbo.Customers` would otherwise give
// `object: ERP.ERP.dbo.Customers`. VS Code is replaced by a stand-in that records what the
// provider hands it; the project, its source metadata and the suggestions are real.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { positionAt, ProjectSnapshot } from "@ingestron/authoring";

interface Point {
  line: number;
  character: number;
}
type Provider = {
  provideCompletionItems(
    document: unknown,
    position: Point,
  ): { label: string; range?: { start: Point; end: Point }; insertText?: unknown }[];
};

const registered = vi.hoisted(() => ({ completion: undefined as unknown }));

vi.mock("vscode", () => {
  const nothing = () => ({ dispose() {} });
  return {
    languages: new Proxy(
      {
        registerCompletionItemProvider: (_selector: unknown, provider: unknown) => {
          registered.completion = provider;
          return nothing();
        },
      },
      { get: (target, key) => (key in target ? target[key as never] : nothing) },
    ),
    commands: { registerCommand: nothing },
    Range: class {
      constructor(
        readonly start: Point,
        readonly end: Point,
      ) {}
    },
    CompletionItem: class {
      constructor(
        readonly label: string,
        readonly kind: number,
      ) {}
    },
    CompletionItemKind: new Proxy({}, { get: () => 0 }),
    SnippetString: class {},
    MarkdownString: class {},
  };
});

const files: Record<string, string> = {
  "project.yaml":
    "id: retail\nenvironments:\n  dev: {}\nimports:\n  - standard.yaml\n  - connections/*.yaml\n  - flows/*.yaml\n  - sources/*.yaml\n",
  "standard.yaml":
    "apiVersion: ingestron.io/v1\nkind: Standard\nid: retail\npacks: [databricks@2]\nlayers:\n  - { name: bronze, does: raw }\n",
  "connections/erp.yaml":
    "apiVersion: ingestron.io/v1\nkind: Connection\nid: erp\nconnector: sqlserver\nconnectivity: workspace\nsettings:\n  uc_connection: erp_connection\n",
  "flows/erp.yaml":
    "apiVersion: ingestron.io/v1\nkind: Flow\nid: erp\nsource: erp\ntables:\n  customers:\n    object: ERP.d|\n",
  "sources/erp.yaml": [
    "apiVersion: ingestron.io/v1",
    "kind: SourceMetadata",
    "id: erp",
    "connection: erp",
    "names: { parts: 3, caseSensitive: false }",
    "tables:",
    "  - object: ERP.dbo.Customers",
    "    captured: { at: 2026-11-12T09:30:00Z, from: catalog, recipe: sqlserver, file: sources/erp.columns.csv }",
    "    columns:",
    "      - { name: CustomerID, sourceType: int, logicalType: integer, required: true }",
    "",
  ].join("\n"),
};

let folder = "";
beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "completion-range-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), text.replace("|", ""));
  }
});
afterAll(() => rmSync(folder, { recursive: true, force: true }));

describe("completion of a dotted value", () => {
  it("replaces everything typed of it, up to the cursor", async () => {
    const { registerProviders } = await import("../src/vscode/editor/providers.js");
    const project = ProjectSnapshot.open(folder);
    const state = {
      projectAt: () => ({ project, file: "flows/erp.yaml" }),
      environmentOf: () => "dev",
    };
    registerProviders({ subscriptions: [] } as never, state as never);
    const provider = registered.completion as Provider;

    const marked = files["flows/erp.yaml"]!;
    const text = marked.replace("|", "");
    const offset = marked.indexOf("|");
    const document = {
      uri: { scheme: "file", fsPath: join(folder, "flows/erp.yaml") },
      getText: () => text,
      offsetAt: () => offset,
      positionAt: (at: number) => positionAt(text, at),
    };
    const cursor = positionAt(text, offset);

    const item = provider
      .provideCompletionItems(document, cursor)
      .find((candidate) => candidate.label === "ERP.dbo.Customers");
    expect(item).toBeDefined();
    const { start, end } = item!.range!;
    const typed = text.split("\n")[start.line]!.slice(start.character, end.character);
    expect(typed).toBe("ERP.d");
    expect(end).toEqual(cursor);
    // Accepting it gives the whole object name once.
    const line = text.split("\n")[cursor.line]!;
    expect(line.slice(0, start.character) + (item!.insertText ?? item!.label)).toBe(
      "    object: ERP.dbo.Customers",
    );
  });
});
