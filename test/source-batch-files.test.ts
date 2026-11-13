// A batch counts files, not imports: a file imported twice in a drain is one file, with the
// result of its last import. And how many tables a summary says changed, against core's own text.
import { sourceChangesText, type SourceChange } from "@ingestron/core";
import { describe, expect, it } from "vitest";
import { batchNotices, tablesChanged, type BatchEntry } from "../src/features/source-batch.js";

const imported = (file: string, summary: string, breaking = 0): BatchEntry => ({
  kind: "imported",
  file,
  summary,
  breaking,
});
const refused = (file: string, reason: string): BatchEntry => ({
  kind: "refused",
  file,
  message: `${file}: Nothing was imported. ${reason}`,
  refused: [reason],
});
const added = "sources/erp.yaml: 1 added, 0 changed, 0 removed.\n";
const removed = "sources/erp.yaml: 0 added, 0 changed, 1 removed.\n";
const messages = (entries: BatchEntry[]) => batchNotices(entries).map((notice) => notice.message);

describe("a batch counts files", () => {
  it("tells a file imported twice as the one file it is, with its last result", () => {
    const first = imported("sources/erp/A.csv", added);
    const second = imported("sources/erp/A.csv", "sources/erp.yaml: no changes.\n");
    expect(batchNotices([first, second])).toEqual([
      { level: "information", message: "sources/erp.yaml: no changes." },
    ]);
  });

  it("counts a file once among others, keeping the place it first appeared", () => {
    const entries = [
      imported("sources/erp/A.csv", added),
      imported("sources/erp/B.csv", added),
      imported("sources/erp/A.csv", removed, 1),
    ];
    const [notice] = batchNotices(entries);
    expect(notice?.message).toBe("Imported 2 files: 2 tables changed, 1 breaking.");
    expect(notice?.document?.split("\n").filter((line) => line.startsWith("## "))).toEqual([
      "## sources/erp/A.csv",
      "## sources/erp/B.csv",
    ]);
    expect(notice?.document).toContain(removed.trimEnd());
  });

  it("tells a file imported and then refused as a refusal only", () => {
    expect(
      messages([
        imported("sources/erp/A.csv", added),
        refused("sources/erp/A.csv", "The file is empty."),
      ]),
    ).toEqual(["sources/erp/A.csv: Nothing was imported. The file is empty."]);
  });

  it("tells a file refused and then imported as an import only", () => {
    expect(
      messages([
        refused("sources/erp/A.csv", "The file is empty."),
        imported("sources/erp/A.csv", added),
      ]),
    ).toEqual(["sources/erp.yaml: 1 added, 0 changed, 0 removed."]);
  });

  it("counts a refused file once for the warning of several", () => {
    const entries = [
      refused("sources/erp/A.csv", "Empty."),
      refused("sources/erp/B.csv", "No header."),
      refused("sources/erp/A.csv", "Still empty."),
    ];
    const [notice] = batchNotices(entries);
    expect(notice?.message).toBe("2 files could not be imported.");
    expect(notice?.document).toBe(
      "## sources/erp/A.csv\n\n- Still empty.\n\n## sources/erp/B.csv\n\n- No header.\n",
    );
  });
});

describe("tablesChanged", () => {
  const change = (object: string, kind: SourceChange["change"]): SourceChange => ({
    object,
    change: kind,
    breaking: kind === "removed",
    differences:
      kind === "changed"
        ? [{ kind: "compatible", code: "SOURCE_COLUMN_NEW", column: "Total" } as never]
        : [],
  });

  it("reads the count line of the text core writes: added, changed and removed", () => {
    const text = sourceChangesText(
      "erp",
      [
        change("ERP.dbo.A", "added"),
        change("ERP.dbo.B", "added"),
        change("ERP.dbo.C", "changed"),
        change("ERP.dbo.D", "removed"),
      ],
      ["A note of the readers."],
    );
    expect(text.split("\n")[0]).toBe("sources/erp.yaml: 2 added, 1 changed, 1 removed.");
    expect(tablesChanged(text)).toBe(4);
  });

  it("is none for the text of no changes", () => {
    expect(tablesChanged(sourceChangesText("erp", [], []))).toBe(0);
  });
});
