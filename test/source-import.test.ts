// What the source metadata commands say: the notification after an import, the warning when
// an import stops, and which refusal asks for the table's name.
import { describe, expect, it } from "vitest";
import {
  connectionChoice,
  importFailureNotice,
  importNotice,
  needsObject,
  refusalNotice,
  requestChoices,
} from "../src/features/source-import.js";

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

  it("offers no button when there is nothing more to show", () => {
    expect(importNotice({ summary: "sources/erp.yaml: no changes.\n", breaking: 0 })).toEqual({
      message: "sources/erp.yaml: no changes.",
      buttons: [],
    });
  });

  it("offers the button for a note of the readers, even with no change", () => {
    const withNote = "sources/erp.yaml: no changes.\nA note about the file.\n";
    expect(importNotice({ summary: withNote, breaking: 0 }).buttons).toEqual(["Show all changes"]);
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

describe("requestChoices", () => {
  it("puts all connections first when there are two or more", () => {
    expect(requestChoices(["erp", "crm"])).toEqual([
      { label: "All connections" },
      { label: "erp", connection: "erp" },
      { label: "crm", connection: "crm" },
    ]);
  });

  it("asks nothing of a project with fewer than two connections", () => {
    expect(requestChoices(["erp"])).toBeUndefined();
    expect(requestChoices([])).toBeUndefined();
  });
});

describe("connectionChoice", () => {
  it("takes the connection the path names, whatever the project has", () => {
    expect(connectionChoice(true, ["erp", "crm"])).toEqual({ kind: "path" });
    expect(connectionChoice(true, [])).toEqual({ kind: "path" });
  });

  it("uses the only connection, without asking", () => {
    expect(connectionChoice(false, ["erp"])).toEqual({ kind: "use", connection: "erp" });
  });

  it("asks which of several, in the project's order", () => {
    expect(connectionChoice(false, ["erp", "crm"])).toEqual({
      kind: "pick",
      connections: ["erp", "crm"],
    });
  });

  it("has nothing to import for when the project has no connection", () => {
    expect(connectionChoice(false, [])).toEqual({ kind: "none" });
  });
});

describe("importFailureNotice", () => {
  it("says a file could not be written", () => {
    expect(importFailureNotice({ file: "sources/erp.yaml", step: "write" })).toBe(
      "Could not write sources/erp.yaml.",
    );
  });

  it("says a file could not be saved after the import was written", () => {
    expect(importFailureNotice({ file: "sources/erp.yaml", step: "save" })).toBe(
      "Wrote the import, but could not save sources/erp.yaml.",
    );
  });
});
