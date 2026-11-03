// Which project the Project view opens: the one of the active editor's file.
import { describe, expect, it } from "vitest";
import {
  followedFolder,
  foldOf,
  owningFolder,
  projectTree,
  type TreeNode,
} from "../src/features/project-tree.js";

const retail = {
  folder: "/work/retail",
  id: "retail",
  environments: ["dev", "test", "prod"],
  chosen: "test",
};

describe("foldOf", () => {
  const sales = { folder: "/work/sales", id: "sales", environments: ["dev"] };
  const [first, second] = projectTree([retail, sales]);

  it("opens only the active project of several, and folds the others", () => {
    expect(foldOf(first as TreeNode, "/work/retail")).toBe("expanded");
    expect(foldOf(second as TreeNode, "/work/retail")).toBe("collapsed");
    expect(foldOf(first as TreeNode, "/work/sales")).toBe("collapsed");
  });

  it("folds every project when none is active", () => {
    expect(projectTree([retail, sales]).map((node) => foldOf(node, undefined))).toEqual([
      "collapsed",
      "collapsed",
    ]);
  });

  it("leaves the rows inside a project open, and rows without children unfoldable", () => {
    const inside = first?.children ?? [];
    expect(foldOf(inside[0] as TreeNode, "/work/sales")).toBe("expanded");
    expect(foldOf(inside[1] as TreeNode, "/work/sales")).toBe("none");
  });

  it("opens the rows of a single project, which has no project level", () => {
    const rows = projectTree([retail]);
    expect(rows.map((node) => foldOf(node, undefined))).toEqual([
      "expanded",
      "none",
      "none",
      "none",
      "none",
      "none",
      "none",
    ]);
  });
});

describe("owningFolder", () => {
  const folders = ["/work/retail", "/work/retail/nested", "/work/sales"];

  it("finds the project that holds the file", () => {
    expect(owningFolder(folders, "/work/sales/flows/a.yaml")).toBe("/work/sales");
    expect(owningFolder(folders, "/work/retail/project.yaml")).toBe("/work/retail");
  });

  it("prefers the innermost of nested projects", () => {
    expect(owningFolder(folders, "/work/retail/nested/flows/a.yaml")).toBe("/work/retail/nested");
  });

  it("takes a folder for its own project, as a preview names one", () => {
    expect(owningFolder(folders, "/work/sales")).toBe("/work/sales");
  });

  it("does not take a folder that only starts with the same letters", () => {
    expect(owningFolder(folders, "/work/sales-other/a.yaml")).toBeUndefined();
    expect(owningFolder(folders, "/elsewhere/a.yaml")).toBeUndefined();
  });
});

describe("followedFolder", () => {
  const folders = ["/work/retail", "/work/sales"];

  it("moves to the project of the file that became active", () => {
    expect(followedFolder(folders, "/work/sales/a.yaml", undefined)).toBe("/work/sales");
    expect(followedFolder(folders, "/work/sales/a.yaml", "/work/retail")).toBe("/work/sales");
  });

  it("stays on the project it has for a file outside every project", () => {
    expect(followedFolder(folders, "/tmp/notes.md", "/work/retail")).toBe("/work/retail");
  });

  it("stays on the project it has when no editor is open", () => {
    expect(followedFolder(folders, undefined, "/work/sales")).toBe("/work/sales");
  });

  it("follows nothing until a file of a project is active", () => {
    expect(followedFolder(folders, undefined, undefined)).toBeUndefined();
    expect(followedFolder(folders, "/tmp/notes.md", undefined)).toBeUndefined();
  });

  it("lets go of a project that is gone", () => {
    expect(followedFolder(folders, undefined, "/work/removed")).toBeUndefined();
  });

  it("follows nothing with one project or none", () => {
    expect(followedFolder(["/work/retail"], "/work/retail/a.yaml", "/work/retail")).toBeUndefined();
    expect(followedFolder([], "/work/retail/a.yaml", undefined)).toBeUndefined();
  });
});
