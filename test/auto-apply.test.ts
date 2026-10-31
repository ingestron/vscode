// Auto-apply: which saves trigger it, and the activity lines it writes.
import { describe, expect, it } from "vitest";
import { activity, triggers } from "../src/features/auto-apply.js";

describe("auto-apply", () => {
  it("runs after saving definitions or transform code, not generated files", () => {
    expect(
      ["flows/shop.yaml", "transforms/daily.sql", "transforms/m.py", "project.yaml"].map(triggers),
    ).toEqual([true, true, true, true]);
    expect(
      ["build/dev/databricks.yml", "build/dev/.generated.json", "README.md"].map(triggers),
    ).toEqual([false, false, false]);
  });

  it("logs one line per run with what changed", () => {
    const output =
      "dev → build/dev\nupdate    src/shop/bronze/orders.sql\ncreate    src/shop/bronze/refunds.sql\n\n3 files: 1 create, 1 update, 1 unchanged. Ready to apply.\nApplied.\n";
    expect(activity(output, "dev", new Date(2026, 9, 26, 9, 5, 7))).toBe(
      "09:05:07  dev: applied: 1 create, 1 update, 1 unchanged\n          update    src/shop/bronze/orders.sql\n          create    src/shop/bronze/refunds.sql\n",
    );
  });

  it("says when nothing changed", () => {
    expect(
      activity(
        "dev → build/dev\n\n3 files: 3 unchanged. Up to date.\n",
        "dev",
        new Date(2026, 9, 26, 9, 5, 7),
      ),
    ).toBe("09:05:07  dev: up to date\n");
  });

  it("says why it did not apply", () => {
    const problems =
      "dev: the definitions have problems\nflows/shop.yaml:5:9  error  BROKEN_LINK\n  ...\n";
    expect(activity(problems, "dev", new Date(2026, 9, 26, 9, 5, 7))).toBe(
      "09:05:07  dev: not applied: the definitions have problems (see the Problems panel)\n",
    );
    const conflict =
      "dev → build/dev\nconflict  src/shop/bronze/orders.sql\n          Changed by hand since it was generated.\n\n3 files: 2 unchanged, 1 conflict. Resolve the conflicts before applying.\n";
    expect(activity(conflict, "dev", new Date(2026, 9, 26, 9, 5, 7))).toBe(
      "09:05:07  dev: not applied: 1 conflict\n          conflict  src/shop/bronze/orders.sql\n",
    );
  });
});
