// Auto-apply: which saves trigger it, and the activity lines it writes.
import { describe, expect, it } from "vitest";
import { activity, triggers } from "../src/features/auto-apply.js";

const at = new Date(2026, 9, 26, 9, 5, 7);
const dev = { environments: ["dev", "prod"], selected: "dev" };
const log = (output: string[], shown = dev) => activity(output.join("\n"), at, shown);

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
      "adopt     src/shop/bronze/returns.sql",
      "",
      "4 files: 1 create, 1 update, 1 adopt, 1 unchanged. Ready to apply.",
      "Applied.",
      "adf → build/adf (dev, prod)",
      "",
      "11 files: 11 unchanged. Up to date.",
      "",
    ];
    expect(log(output)).toBe(
      [
        "09:05:07  databricks (dev, prod): applied: 1 create, 1 update, 1 adopt, 1 unchanged",
        "          update    src/shop/bronze/orders.sql",
        "          create    src/shop/bronze/refunds.sql",
        "          adopt     src/shop/bronze/returns.sql",
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
    ];
    expect(log(output)).toBe("09:05:07  duckdb (dev): up to date\n");
  });

  it("leaves the count of accepted warnings out of the activity", () => {
    const output = [
      "duckdb: warnings",
      "(project)  warning  PACK_NOTICE",
      "  A notice.",
      "",
      "1 accepted warning (platform.yaml)",
      "duckdb → build/duckdb (dev)",
      "",
      "3 files: 3 unchanged. Up to date.",
      "",
    ];
    expect(log(output)).toBe("09:05:07  duckdb (dev): up to date\n");
  });

  it("sends the reader to the Problems panel when the selected environment or a pack has problems", () => {
    const problems = [
      "dev, prod: the definitions have problems",
      "flows/shop.yaml:5:9  error  BROKEN_LINK",
      "",
    ];
    const panel = "09:05:07  not applied: the definitions have problems (see the Problems panel)\n";
    expect(log(problems)).toBe(panel);
    expect(
      log(["adf: the definitions have problems", "(project)  error  ENVIRONMENTS_DIFFER", ""]),
    ).toBe(panel);
  });

  it("names the environment to select when only another one has problems", () => {
    const problems = [
      "prod: the definitions have problems",
      "project.yaml:8:5  error  DEPLOY_VALUE",
      "",
    ];
    expect(log(problems)).toBe(
      "09:05:07  not applied: prod has problems (select prod to see them in the Problems panel)\n",
    );
  });

  it("says a folder with conflicts, problems or a failed write was not applied", () => {
    const conflict = [
      "databricks → build/databricks (dev)",
      "conflict  src/shop/bronze/orders.sql",
      "          Changed by hand since it was generated.",
      "",
      "3 files: 2 unchanged, 1 conflict. Resolve the conflicts before applying.",
      "",
    ];
    expect(log(conflict)).toBe(
      "09:05:07  databricks (dev): not applied: 1 conflict\n          conflict  src/shop/bronze/orders.sql\n",
    );
    const locked = [
      "databricks → build/databricks (dev)",
      "create    databricks.yml",
      "",
      "5 files: 5 create. Ready to apply.",
      "Another generation is writing to this folder. If none is, delete .generated.lock.",
      "",
    ];
    expect(log(locked)).toBe(
      "09:05:07  databricks (dev): not applied: Another generation is writing to this folder. If none is, delete .generated.lock.\n",
    );
    const problem = [
      "databricks → build/databricks (dev)",
      "problem   src  NOT_A_FOLDER",
      "          A file is where a folder must be.",
      "",
      "5 files: 5 create. Fix the problems before applying.",
      "",
    ];
    expect(log(problem)).toBe(
      "09:05:07  databricks (dev): not applied: A file is where a folder must be.\n",
    );
  });

  it("gives a folder that is no longer generated its own line, with what to do", () => {
    const output = [
      "databricks → build/databricks (dev)",
      "",
      "5 files: 5 unchanged. Up to date.",
      "build/dev: no longer generated. Delete the folder, or delete its .generated.json to keep it as your own.",
      "",
    ];
    expect(log(output)).toBe(
      "09:05:07  databricks (dev): up to date\n09:05:07  build/dev: no longer generated. Delete the folder, or delete its .generated.json to keep it as your own.\n",
    );
  });

  it("says what the CLI printed when no output folder is written", () => {
    expect(log(["", "Nothing to generate yet.", ""])).toBe(
      "09:05:07  nothing applied: Nothing to generate yet.\n",
    );
    expect(log([""])).toBe("09:05:07  nothing applied: nothing to generate\n");
    const refused = [
      "(project)  error  PACK_LOAD",
      '  The pack "broken" lists the platform field "schedule.nowhere", which the Platform document does not have.',
      "  This is a mistake in the pack, not in the project, so nothing is checked or generated.",
      "",
    ];
    expect(log(refused)).toBe(
      '09:05:07  nothing applied: The pack "broken" lists the platform field "schedule.nowhere", which the Platform document does not have.\n',
    );
  });
});
