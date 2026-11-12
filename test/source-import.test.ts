// What the source metadata commands say: the notification after an import, the warning when
// an import stops, and which refusal asks for the table's name.
import { describe, expect, it } from "vitest";
import { importNotice, needsObject, refusalNotice } from "../src/features/source-import.js";

const summary = [
  "sources/erp.yaml: 1 added, 1 changed, 1 removed.",
  "Breaking:",
  "  ERP.dbo.Archive: removed",
  "  ERP.dbo.Orders: column Total type changed",
  "Compatible:",
  "  ERP.dbo.Customers: added",
  "",
].join("\n");

describe("importNotice", () => {
  it("says the first line of the changes, then how many are breaking", () => {
    expect(importNotice({ summary, breaking: 2 })).toEqual({
      message: "sources/erp.yaml: 1 added, 1 changed, 1 removed. 2 breaking.",
      buttons: ["Show all changes"],
    });
  });

  it("says nothing about breaking changes when there are none", () => {
    expect(
      importNotice({ summary: "sources/erp.yaml: 1 added, 0 changed, 0 removed.\n", breaking: 0 })
        .message,
    ).toBe("sources/erp.yaml: 1 added, 0 changed, 0 removed.");
  });

  it("offers the button for an import that changed nothing too", () => {
    expect(importNotice({ summary: "sources/erp.yaml: no changes.\n", breaking: 0 })).toEqual({
      message: "sources/erp.yaml: no changes.",
      buttons: ["Show all changes"],
    });
  });
});

describe("needsObject", () => {
  it("is true only for the refusal that asks for the table", () => {
    expect(needsObject(["Name the table this file describes with --object."])).toBe(true);
    expect(needsObject(["sources/x.csv has no columns."])).toBe(false);
    expect(needsObject([])).toBe(false);
  });
});

describe("refusalNotice", () => {
  it("says nothing was imported, with each reason", () => {
    expect(refusalNotice(["orders.csv has no columns.", "Another reason."])).toBe(
      "Nothing was imported. orders.csv has no columns. Another reason.",
    );
  });

  it("does not ask for the option of a command line", () => {
    expect(refusalNotice(["Name the table this file describes with --object."])).toBe(
      "Nothing was imported. Name the table this file describes.",
    );
  });
});
