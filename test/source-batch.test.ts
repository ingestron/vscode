// What is told after imports: a file that could not be read, and the imports of one drain of the
// queue as one notice.
import { describe, expect, it } from "vitest";
import { batchNotices, type BatchEntry } from "../src/features/source-batch.js";
import { readFailureNotice } from "../src/features/source-import.js";

describe("readFailureNotice", () => {
  it("says which file could not be read and why: the code of a file system error", () => {
    const error = Object.assign(new Error("Unable to read file '/home/me/shop/project.yaml'"), {
      code: "NoPermissions",
    });
    expect(readFailureNotice("project.yaml", error, "/home/me/shop")).toBe(
      "Could not read project.yaml: NoPermissions.",
    );
  });

  it("gives the message of any other error with the project's folder left out of its paths", () => {
    expect(
      readFailureNotice(
        "sources/erp.yaml",
        new Error("Cannot open /home/me/shop/sources/erp.yaml"),
        "/home/me/shop",
      ),
    ).toBe("Could not read sources/erp.yaml: Cannot open sources/erp.yaml");
  });

  it("does not say more than it knows of something that is not an error", () => {
    expect(readFailureNotice("sources/erp.yaml", "boom", "/home/me/shop")).toBe(
      "Could not read sources/erp.yaml.",
    );
  });
});

describe("batchNotices", () => {
  const imported = (file: string, summary: string, breaking = 0): BatchEntry => ({
    kind: "imported",
    file,
    summary,
    breaking,
  });
  const orders = imported(
    "sources/erp/Orders.csv",
    "sources/erp.yaml: 1 added, 1 changed, 0 removed.\nBreaking:\n  ERP.dbo.Orders: column Total type changed\n",
    1,
  );
  const customers = imported(
    "sources/erp/Customers.csv",
    "sources/erp.yaml: 0 added, 2 changed, 1 removed.\nBreaking:\n  ERP.dbo.Archive: removed\n",
    1,
  );
  const same = imported("sources/erp/Same.csv", "sources/erp.yaml: no changes.\n");
  const refused = (file: string, reason: string): BatchEntry => ({
    kind: "refused",
    file,
    message: `${file}: Nothing was imported. ${reason}`,
    refused: [reason],
  });

  it("gives nothing for nothing", () => {
    expect(batchNotices([])).toEqual([]);
  });

  it("gives today's notice, and the changes as they are, for one import", () => {
    expect(batchNotices([orders])).toEqual([
      {
        level: "information",
        message: "sources/erp.yaml: 1 added, 1 changed, 0 removed. 1 breaking.",
        button: "Show all changes",
        document: orders.kind === "imported" ? orders.summary : "",
      },
    ]);
  });

  it("gives today's notice without a button for one import with nothing more to show", () => {
    expect(batchNotices([same])).toEqual([
      { level: "information", message: "sources/erp.yaml: no changes." },
    ]);
  });

  it("gives one notice for several imports: files, tables changed, breaking", () => {
    const [notice, ...others] = batchNotices([orders, same, customers]);
    expect(others).toEqual([]);
    expect(notice).toMatchObject({
      level: "information",
      message: "Imported 3 files: 5 tables changed, 2 breaking.",
      button: "Show all changes",
    });
  });

  it("leaves out the breaking count when none of the changes break", () => {
    const added = imported(
      "sources/erp/A.csv",
      "sources/erp.yaml: 2 added, 0 changed, 0 removed.\n",
    );
    const other = imported(
      "sources/erp/B.csv",
      "sources/erp.yaml: 0 added, 0 changed, 1 removed.\n",
    );
    expect(batchNotices([added, other])[0]?.message).toBe("Imported 2 files: 3 tables changed.");
  });

  it("says table, not tables, for one", () => {
    const added = imported(
      "sources/erp/A.csv",
      "sources/erp.yaml: 1 added, 0 changed, 0 removed.\n",
    );
    expect(batchNotices([added, same])[0]?.message).toBe("Imported 2 files: 1 table changed.");
  });

  it("opens one document with a section per imported file, in import order", () => {
    const [notice] = batchNotices([orders, same, customers]);
    expect(notice?.document).toBe(
      [
        "## sources/erp/Orders.csv",
        "",
        "```text",
        "sources/erp.yaml: 1 added, 1 changed, 0 removed.",
        "Breaking:",
        "  ERP.dbo.Orders: column Total type changed",
        "```",
        "",
        "## sources/erp/Same.csv",
        "",
        "```text",
        "sources/erp.yaml: no changes.",
        "```",
        "",
        "## sources/erp/Customers.csv",
        "",
        "```text",
        "sources/erp.yaml: 0 added, 2 changed, 1 removed.",
        "Breaking:",
        "  ERP.dbo.Archive: removed",
        "```",
        "",
      ].join("\n"),
    );
  });

  it("gives a refusal on its own, as today, for one", () => {
    expect(batchNotices([refused("sources/erp/A.csv", "The file is empty.")])).toEqual([
      { level: "warning", message: "sources/erp/A.csv: Nothing was imported. The file is empty." },
    ]);
  });

  it("gives one warning for several refusals, with a section of reasons per file", () => {
    const notices = batchNotices([
      refused("sources/erp/A.csv", "The file is empty."),
      refused("sources/erp/B.csv", "The file has no header."),
    ]);
    expect(notices).toEqual([
      {
        level: "warning",
        message: "2 files could not be imported.",
        button: "Show reasons",
        document: [
          "## sources/erp/A.csv",
          "",
          "- The file is empty.",
          "",
          "## sources/erp/B.csv",
          "",
          "- The file has no header.",
          "",
        ].join("\n"),
      },
    ]);
  });

  it("never hides a refusal among imports: the imports are summed up and the refusals warned of", () => {
    const notices = batchNotices([
      orders,
      refused("sources/erp/A.csv", "The file is empty."),
      customers,
      refused("sources/erp/B.csv", "The file has no header."),
    ]);
    expect(notices.map((notice) => [notice.level, notice.message])).toEqual([
      ["information", "Imported 2 files: 5 tables changed, 2 breaking."],
      ["warning", "2 files could not be imported."],
    ]);
    // The document of the changes holds no refused file.
    expect(notices[0]?.document).not.toContain("A.csv");
  });

  it("gives today's notice for the one import and today's warning for the one refusal", () => {
    const notices = batchNotices([orders, refused("sources/erp/A.csv", "The file is empty.")]);
    expect(notices.map((notice) => notice.level)).toEqual(["information", "warning"]);
    expect(notices[1]?.message).toBe("sources/erp/A.csv: Nothing was imported. The file is empty.");
    expect(notices[1]?.button).toBeUndefined();
  });
});
