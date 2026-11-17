// Per-table actions stay compact while retaining full paths behind their picker.
import { join } from "node:path";
import { afterAll, expect, it, vi } from "vitest";
import { ProjectSnapshot } from "@ingestron/authoring";
import type * as vscode from "vscode";
import type { ExtensionState } from "../src/vscode/state/index.js";
import { metadataProject, removeMetadataProjects } from "./metadata-contract-project.js";
const captured = vi.hoisted(() => ({
  provide: undefined as
    | undefined
    | ((document: unknown) => {
        command: { title: string; tooltip?: string; command: string; arguments: unknown[] };
      }[]),
}));
vi.mock("vscode", () => ({
  Range: class {},
  Position: class {
    constructor(
      public line: number,
      public character: number,
    ) {}
  },
  CodeLens: class {
    constructor(
      public range: unknown,
      public command: unknown,
    ) {}
  },
  languages: {
    registerInlayHintsProvider: () => ({ dispose: () => {} }),
    registerCodeLensProvider: (
      _selector: unknown,
      provider: { provideCodeLenses: typeof captured.provide },
    ) => {
      captured.provide = provider.provideCodeLenses;
      return { dispose: () => {} };
    },
  },
}));
import { registerAnnotations } from "../src/vscode/editor/annotations.js";
afterAll(removeMetadataProjects);

it("offers a bounded generated-file picker and optional contract draft at the table", () => {
  const test = metadataProject();
  const project = ProjectSnapshot.open(test.folder);
  const text = project.files.read(test.file)!;
  const uri = { scheme: "file", fsPath: join(test.folder, test.file) };
  const state = {
    onProjectChange: () => {},
    projectAt: () => ({ project, file: test.file }),
    environmentOf: () => "dev",
  } as unknown as ExtensionState;
  registerAnnotations({ subscriptions: [] } as unknown as vscode.ExtensionContext, state);
  const lenses = captured.provide!({
    uri,
    getText: () => text,
    offsetAt: (position: { line: number; character: number }) =>
      text
        .split("\n")
        .slice(0, position.line)
        .reduce((offset, line) => offset + line.length + 1, 0) + position.character,
  });
  expect(lenses).toHaveLength(2);
  expect(lenses.every((lens) => lens.command.title.length < 50)).toBe(true);
  const preview = lenses.find((lens) => lens.command.command === "ingestron.showGenerated")!;
  expect(preview.command.title).toMatch(/^Generated files \(\d+\)$/);
  expect(preview.command.arguments[1]).toEqual(
    expect.arrayContaining([expect.stringContaining("/pipeline/")]),
  );
  expect(preview.command.tooltip).toContain("nothing runs or deploys");
  const draft = lenses.find(
    (lens) => lens.command.command === "ingestron.draftContractFromMetadata",
  )!;
  expect(draft.command.arguments).toEqual([uri, "customers"]);
});
