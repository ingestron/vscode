// Auto-apply: which saves trigger it, and the activity lines it writes.
import { describe, expect, it } from "vitest";
import { activity, triggers } from "../src/features/auto-apply.js";

const at = new Date(2026, 9, 26, 9, 5, 7);

describe("auto-apply", () => {
  it("runs after saving definitions or transform code, not generated files", () => {
    expect(
      ["flows/shop.yaml", "transforms/daily.sql", "transforms/m.py", "project.yaml"].map(triggers),
    ).toEqual([true, true, true, true]);
    expect(
      ["build/databricks/databricks.yml", "build/adf/.generated.json", "README.md"].map(triggers),
    ).toEqual([false, false, false]);
  });

  it("logs a line for each output folder, with what changed", () => {
    const output = [
      "databricks → build/databricks (dev, prod)",
      "update    src/shop/bronze/orders.sql",
      "create    src/shop/bronze/refunds.sql",
      "",
      "3 files: 1 create, 1 update, 1 unchanged. Ready to apply.",
      "Applied.",
      "adf → build/adf (dev, prod)",
      "",
      "11 files: 11 unchanged. Up to date.",
      "",
    ].join("\n");
    expect(activity(output, at)).toBe(
      [
        "09:05:07  databricks (dev, prod): applied: 1 create, 1 update, 1 unchanged",
        "          update    src/shop/bronze/orders.sql",
        "          create    src/shop/bronze/refunds.sql",
        "09:05:07  adf (dev, prod): up to date",
        "",
      ].join("\n"),
    );
  });

  it("says when nothing changed, after a pack's warnings", () => {
    const output = [
      "adf: warnings",
      "(project)  warning  PACK_NOTICE",
      "  Integration runtime `shir-stores` (self-hosted): …",
      "duckdb → build/duckdb (dev)",
      "",
      "3 files: 3 unchanged. Up to date.",
      "",
    ].join("\n");
    expect(activity(output, at)).toBe("09:05:07  duckdb (dev): up to date\n");
  });

  it("says why it did not apply", () => {
    const problems =
      "dev, prod: the definitions have problems\nflows/shop.yaml:5:9  error  BROKEN_LINK\n  ...\n";
    expect(activity(problems, at)).toBe(
      "09:05:07  not applied: the definitions have problems (see the Problems panel)\n",
    );
    const conflict = [
      "databricks → build/databricks (dev)",
      "conflict  src/shop/bronze/orders.sql",
      "          Changed by hand since it was generated.",
      "",
      "3 files: 2 unchanged, 1 conflict. Resolve the conflicts before applying.",
      "",
    ].join("\n");
    expect(activity(conflict, at)).toBe(
      "09:05:07  databricks (dev): not applied: 1 conflict\n          conflict  src/shop/bronze/orders.sql\n",
    );
  });

  it("names a folder that is no longer generated", () => {
    const output = [
      "databricks → build/databricks (dev)",
      "",
      "5 files: 5 unchanged. Up to date.",
      "build/dev: no longer generated. Delete the folder, or delete its .generated.json to keep it as your own.",
      "",
    ].join("\n");
    expect(activity(output, at)).toBe(
      "09:05:07  databricks (dev): up to date\n          build/dev: no longer generated\n",
    );
  });
});
