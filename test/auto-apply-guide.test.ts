// Auto-apply's activity: the lines the CLI prints about AGENTS.md pass through.
import { describe, expect, it } from "vitest";
import { activity } from "../src/features/auto-apply.js";

const at = new Date(2026, 9, 26, 9, 5, 7);
const dev = { environments: ["dev", "prod"], selected: "dev" };
const log = (output: string[], shown = dev) => activity(output.join("\n"), at, shown);

describe("auto-apply and the project guide", () => {
  it("passes through every line the CLI printed about AGENTS.md, after the output folders", () => {
    const stale = [
      "databricks → build/databricks (dev)",
      "",
      "5 files: 5 unchanged. Up to date.",
      "AGENTS.md: updated the Ingestron section",
      "",
    ];
    expect(log(stale)).toBe(
      "09:05:07  databricks (dev): up to date\n09:05:07  AGENTS.md: updated the Ingestron section\n",
    );
    const edited =
      "AGENTS.md: the Ingestron section was edited by hand, so it was not updated. Move your notes outside it, or delete both markers to keep it as your own.";
    expect(
      log([
        "databricks → build/databricks (dev)",
        "",
        "5 files: 5 unchanged. Up to date.",
        edited,
        "",
      ]),
    ).toBe(`09:05:07  databricks (dev): up to date\n09:05:07  ${edited}\n`);
  });

  it("keeps an AGENTS.md line out of the folder's reason, and says it when no folder is written", () => {
    const refused = [
      "databricks → build/databricks (dev)",
      "create    databricks.yml",
      "",
      "5 files: 5 create. Ready to apply.",
      "AGENTS.md: updated the Ingestron section",
      "",
    ];
    expect(log(refused)).toBe(
      "09:05:07  databricks (dev): not applied: the plan was not applied\n09:05:07  AGENTS.md: updated the Ingestron section\n",
    );
    expect(
      log(["", "Nothing to generate yet.", "AGENTS.md: updated the Ingestron section", ""]),
    ).toBe(
      "09:05:07  nothing applied: Nothing to generate yet.\n09:05:07  AGENTS.md: updated the Ingestron section\n",
    );
    expect(log(["AGENTS.md: updated the Ingestron section", ""])).toBe(
      "09:05:07  nothing applied: nothing to generate\n09:05:07  AGENTS.md: updated the Ingestron section\n",
    );
  });

  it("passes the AGENTS.md line through when the definitions have problems too", () => {
    const problems = [
      "dev: the definitions have problems",
      "(project)  error  SOME_CODE",
      "",
      "AGENTS.md: updated the Ingestron section",
      "",
    ];
    expect(log(problems)).toBe(
      "09:05:07  not applied: the definitions have problems (see the Problems panel)\n09:05:07  AGENTS.md: updated the Ingestron section\n",
    );
  });

  it("ignores a line that only mentions AGENTS.md", () => {
    expect(log(["", "Nothing to generate yet. See AGENTS.md: it says how.", ""])).toBe(
      "09:05:07  nothing applied: Nothing to generate yet. See AGENTS.md: it says how.\n",
    );
  });
});
