// The Problems view shows what the snapshot's problems give, so an accepted warning is not
// marked there: the Platform's accept list takes it out, and a stale entry is marked instead.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ProjectSnapshot } from "@ingestron/authoring";
import { describe, expect, it } from "vitest";

const files: Record<string, string> = {
  "project.yaml": `id: shop
environments:
  dev: {}
imports: [standard.yaml, platform.yaml, "connections/*.yaml", "flows/*.yaml", "contracts/*.yaml"]
`,
  "standard.yaml":
    "apiVersion: ingestron.io/v1\nkind: Standard\nid: defaults\npacks: [duckdb@2]\ningest:\n  settings:\n    duckdb-files: { format: csv }\n",
  "platform.yaml":
    "apiVersion: ingestron.io/v1\nkind: Platform\nid: laptop\nsettings:\n  duckdb-table: { published: ./published }\n",
  "connections/shop.yaml": `apiVersion: ingestron.io/v1
kind: Connection
id: shop
connector: files
connectivity: public
settings: { path: ./samples }
`,
  "flows/orders.yaml": `apiVersion: ingestron.io/v1
kind: Flow
id: orders
source: shop
tables:
  orders: { object: orders.csv, contract: shop.orders }
`,
  // No layer lists `check`, so DuckDB does not apply the notNull rule and says so.
  "contracts/orders.yaml": `apiVersion: v3.1.0
kind: DataContract
id: shop.orders
version: 1.0.0
status: active
schema:
  - name: orders
    logicalType: object
    properties:
      - { name: order_id, logicalType: integer, required: true, primaryKey: true }
`,
};

/** A project in a new folder, with `accept` entries added to its Platform. */
function projectWith(accept = ""): ProjectSnapshot {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-accepted-"));
  const all = { ...files, "platform.yaml": `${files["platform.yaml"]}${accept}` };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  return ProjectSnapshot.open(folder);
}

const codes = (project: ProjectSnapshot) => project.problems("dev").map((item) => item.code);

describe("the problems the Problems view shows", () => {
  it("mark a warning that is not applied", () => {
    expect(codes(projectWith())).toEqual(["NOT_APPLIED"]);
  });

  it("leave out a warning the Platform accepts", () => {
    const accepted = projectWith(
      "accept:\n  - code: NOT_APPLIED\n    about: { feature: notNull }\n    reason: The nightly job checks it.\n",
    );
    expect(accepted.problems("dev")).toEqual([]);
  });

  it("mark an entry that accepts nothing, at the Platform", () => {
    const stale = projectWith(
      "accept:\n  - code: DEDUPLICATE_MODE\n    reason: Left over from an earlier standard.\n",
    );
    expect(stale.problems("dev").map((item) => [item.file, item.code])).toEqual([
      ["contracts/orders.yaml", "NOT_APPLIED"],
      ["platform.yaml", "ACCEPT_UNUSED"],
    ]);
  });
});
