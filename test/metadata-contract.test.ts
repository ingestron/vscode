// Optional drafts preserve the selected object and unrelated user edits, with safe file creation.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { nodeFiles } from "@ingestron/config";
import { parse, stringify } from "yaml";
import { metadataContractEdits, metadataDrafts } from "../src/features/metadata-contract.js";

import { metadataProject as project, removeMetadataProjects } from "./metadata-contract-project.js";
afterAll(removeMetadataProjects);
function changed(text: string, edits: { start: number; end: number; text: string }[]): string {
  for (const edit of [...edits].sort((a, b) => b.start - a.start))
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return text;
}

it("drafts an optional contract and links it while preserving the source and unrelated user text", () => {
  const test = project();
  const original =
    test.files.read(test.file)! + "  temp: # a user-owned table\n    object: ERP.dbo.Temporary\n";
  const files = {
    list: () => test.files.list(),
    read: (path: string) => (path === test.file ? original : test.files.read(path)),
  };
  const source = files.read("sources/erp.yaml");
  const draft = metadataDrafts(files, test.file, "dev").drafts.get("customers")!;
  expect(draft.text).toContain("name: CustomerID");
  expect(draft.text).toContain("primaryKey: true");
  const edits = metadataContractEdits(files, test.file, "customers", draft, "dev");
  const result = changed(
    original,
    edits.filter((edit) => edit.file === test.file),
  );
  expect(parse(result).tables.customers).toEqual({
    object: "ERP.dbo.Customers",
    contract: "erp.customers",
  });
  expect(result).toContain("temp: # a user-owned table");
  expect(parse(result).tables.temp).toEqual({ object: "ERP.dbo.Temporary" });
  expect(files.read("sources/erp.yaml")).toBe(source);
  expect(files.read(draft.path)).toBeUndefined();
});

it("adds a contract to a custom import list in the same edit", () => {
  const test = project();
  const manifest = parse(test.files.read("project.yaml")!);
  manifest.imports = manifest.imports.filter((item: string) => !item.startsWith("contracts/"));
  writeFileSync(join(test.folder, "project.yaml"), stringify(manifest));
  const files = nodeFiles(test.folder);
  const draft = metadataDrafts(files, test.file, "dev").drafts.get("customers")!;
  const edits = metadataContractEdits(files, test.file, "customers", draft, "dev");
  const after = changed(
    files.read("project.yaml")!,
    edits.filter((edit) => edit.file === "project.yaml"),
  );
  // The first contract imports its folder, one line added to the block list and nothing else
  // changed, as Add connection and Add flow do; a later one is then already imported.
  const before = files.read("project.yaml")!;
  const last = before.match(/^ {2}- .*$/gm)!.at(-1)!;
  expect(before).toMatch(/^imports:\n {2}- /m);
  expect(after).toBe(before.replace(`${last}\n`, `${last}\n  - contracts/*.yaml\n`));
});

it("adds only the contract's own path when its folder holds another YAML file", () => {
  const test = project();
  mkdirSync(join(test.folder, "contracts"), { recursive: true });
  writeFileSync(join(test.folder, "contracts/legacy.yaml"), "kind: DataContract\n");
  const files = nodeFiles(test.folder);
  const draft = metadataDrafts(files, test.file, "dev").drafts.get("customers")!;
  const edits = metadataContractEdits(files, test.file, "customers", draft, "dev");
  const after = changed(
    files.read("project.yaml")!,
    edits.filter((edit) => edit.file === "project.yaml"),
  );
  expect(parse(after).imports.at(-1)).toBe(draft.path);
});

it("refuses to overwrite a contract or convert a table that already names one", () => {
  const test = project();
  const draft = metadataDrafts(test.files, test.file, "dev").drafts.get("customers")!;
  writeFileSync(join(test.folder, "existing.yaml"), "preserve me");
  expect(() =>
    metadataContractEdits(
      test.files,
      test.file,
      "customers",
      { ...draft, path: "existing.yaml" },
      "dev",
    ),
  ).toThrow("already exists");
  expect(readFileSync(join(test.folder, "existing.yaml"), "utf8")).toBe("preserve me");
  const text = test.files
    .read(test.file)!
    .replace("    object:", "    contract: erp.customers\n    object:");
  const files = {
    list: () => [...test.files.list(), draft.path],
    read: (path: string) =>
      path === test.file ? text : path === draft.path ? draft.text : test.files.read(path),
  };
  expect(metadataDrafts(files, test.file, "dev").drafts.size).toBe(0);
});
