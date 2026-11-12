// Which saved files are imported straight away, how their events are grouped, and the warning
// for one the import stops for.
import { join } from "node:path";
import { sourceFileFor } from "@ingestron/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  grouped,
  oversizeNotice,
  shouldImport,
  tooLarge,
  failedNotice,
  watchRefusalNotice,
} from "../src/features/source-import.js";

/** Core's rule for the project at `folder`, as the snapshot's sourceFileAt applies it. */
const namedBy = (folder: string) => (file: string) =>
  sourceFileFor(file.slice(folder.length + 1).replaceAll("\\", "/"));

describe("shouldImport", () => {
  const folder = join("/work", "retail");
  const at = (file: string, projectFolder = folder) =>
    shouldImport({ path: join(projectFolder, file), projectFolder }, namedBy(projectFolder));

  it("imports a file saved where the request says", () => {
    expect(at("sources/erp.catalog.csv")).toBe(true);
    expect(at("sources/erp/dbo/Orders.csv")).toBe(true);
    expect(at("sources/erp/Orders.parquet")).toBe(true);
  });

  it("never imports the metadata document, even when it is just written", () => {
    expect(at("sources/erp.yaml")).toBe(false);
    expect(at("sources/erp.yml")).toBe(false);
  });

  it("never imports project.yaml or a file outside sources/", () => {
    expect(at("project.yaml")).toBe(false);
    expect(at("flows/erp.csv")).toBe(false);
    expect(at("contracts/sources/erp.csv")).toBe(false);
    expect(at("sourcesx/erp.csv")).toBe(false);
  });

  it("never imports what an editor or the system leaves beside the file", () => {
    expect(at("sources/erp/.DS_Store")).toBe(false);
    expect(at("sources/erp/.Orders.csv.swp")).toBe(false);
  });

  it("belongs to the nearest project: a file of the inner project is not the outer one's", () => {
    const inner = join(folder, "inner");
    const file = join(inner, "sources", "erp", "Orders.csv");
    expect(shouldImport({ path: file, projectFolder: inner }, namedBy(inner))).toBe(true);
    expect(shouldImport({ path: file, projectFolder: folder }, namedBy(folder))).toBe(false);
  });

  it("never imports a path outside the project", () => {
    expect(
      shouldImport(
        { path: join("/elsewhere", "sources", "erp", "A.csv"), projectFolder: folder },
        namedBy(folder),
      ),
    ).toBe(false);
  });
});

describe("grouped", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs once for events of one key within the delay, after the last", () => {
    const run = vi.fn();
    const { push } = grouped(500, run);
    push("a.csv");
    vi.advanceTimersByTime(300);
    push("a.csv");
    vi.advanceTimersByTime(499);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("a.csv");
    vi.advanceTimersByTime(5000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("keeps each key apart", () => {
    const run = vi.fn();
    const { push } = grouped(500, run);
    push("a.csv");
    push("b.csv");
    vi.advanceTimersByTime(500);
    expect(run.mock.calls).toEqual([["a.csv"], ["b.csv"]]);
  });

  it("runs again for an event after the delay", () => {
    const run = vi.fn();
    const { push } = grouped(500, run);
    push("a.csv");
    vi.advanceTimersByTime(500);
    push("a.csv");
    vi.advanceTimersByTime(500);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("runs nothing once disposed", () => {
    const run = vi.fn();
    const { push, dispose } = grouped(500, run);
    push("a.csv");
    dispose();
    vi.advanceTimersByTime(5000);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("watchRefusalNotice", () => {
  it("names the file and the reasons, and says nothing was imported", () => {
    expect(
      watchRefusalNotice("sources/erp/Orders.csv", { refused: ["Orders.csv has no columns."] }),
    ).toBe("sources/erp/Orders.csv: Nothing was imported. Orders.csv has no columns.");
  });

  it("tells where to save a file of one table when the import needs its name", () => {
    expect(
      watchRefusalNotice("sources/erp.catalog.csv", {
        refused: ["Name the table this file describes with --object."],
        needsObject: true,
      }),
    ).toBe(
      "sources/erp.catalog.csv: Nothing was imported. Name the table this file describes. " +
        'Save it as sources/<connection>/<table> or use "Import source metadata…".',
    );
  });

  it("goes by the import's needsObject, not by the reason's words", () => {
    expect(
      watchRefusalNotice("sources/erp.catalog.csv", {
        refused: ["Name the table this file describes with --object."],
      }),
    ).not.toContain("Save it as");
  });
});

describe("tooLarge", () => {
  const limit = 50 * 1024 * 1024;

  it("is true only for a file over the limit", () => {
    expect(tooLarge(limit, limit)).toBe(false);
    expect(tooLarge(limit + 1, limit)).toBe(true);
    expect(tooLarge(0, limit)).toBe(false);
  });
});

describe("oversizeNotice", () => {
  it("names the file, the limit and the two ways to import it anyway", () => {
    expect(oversizeNotice("sources/erp/Orders.csv", 50 * 1024 * 1024)).toBe(
      "sources/erp/Orders.csv is over 50 MB, so it was not imported when saved. " +
        'Use "Import source metadata…" or ingestron source import.',
    );
  });
});

describe("failedNotice", () => {
  it("names the file and the reason, never more", () => {
    expect(failedNotice("sources/erp/Orders.csv", new Error("disk is full"))).toBe(
      "Could not import sources/erp/Orders.csv: disk is full",
    );
  });

  it("gives a file system error's code, not its message, which can hold an absolute path", () => {
    const denied = Object.assign(
      new Error("EACCES: permission denied, open '/home/someone/a.csv'"),
      {
        code: "EACCES",
      },
    );
    expect(failedNotice("sources/erp/Orders.csv", denied)).toBe(
      "Could not import sources/erp/Orders.csv: EACCES.",
    );
    class FileSystemError extends Error {
      readonly code = "FileNotFound";
    }
    expect(
      failedNotice("returns.csv", new FileSystemError("file:///home/someone/returns.csv")),
    ).toBe("Could not import returns.csv: FileNotFound.");
  });

  it("copes with a reason that is not an error", () => {
    expect(failedNotice("sources/erp/Orders.csv", "odd")).toBe(
      "Could not import sources/erp/Orders.csv.",
    );
  });
});
