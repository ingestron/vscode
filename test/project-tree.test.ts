// The Project view's content: the project's environments, then the actions on it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isProjectManifest,
  projectTree,
  rowId,
  type TreeNode,
} from "../src/features/project-tree.js";

const retail = {
  folder: "/work/retail",
  id: "retail",
  environments: ["dev", "test", "prod"],
  chosen: "test",
};
const uriOf = (folder: string) => ({ uri: folder });

function environmentsOf(nodes: TreeNode[]): TreeNode[] {
  return nodes.find((node) => node.label === "Environments")?.children ?? [];
}

describe("projectTree", () => {
  it("lists environments with the chosen one marked", () => {
    const environments = environmentsOf(projectTree([retail]));
    expect(environments.map((node) => node.label)).toEqual(["dev", "test", "prod"]);
    expect(environments.find((node) => node.label === "test")).toMatchObject({
      description: "selected",
      icon: "check",
    });
    for (const node of environments.filter((node) => node.label !== "test")) {
      expect(node.description).toBeUndefined();
      expect(node.icon).not.toBe("check");
    }
  });

  it("marks no environment when none is chosen or the chosen one is gone", () => {
    for (const chosen of [undefined, "gone"]) {
      const environments = environmentsOf(
        projectTree([{ ...retail, ...(chosen && { chosen }), environments: ["dev", "prod"] }]),
      );
      expect(environments.filter((node) => node.description === "selected")).toEqual([]);
    }
  });

  it("clicking an environment selects it", () => {
    const environments = environmentsOf(projectTree([retail]));
    expect(environments.map((node) => node.command)).toEqual([
      { id: "ingestron.selectEnvironment", args: ["/work/retail", "dev"] },
      { id: "ingestron.selectEnvironment", args: ["/work/retail", "test"] },
      { id: "ingestron.selectEnvironment", args: ["/work/retail", "prod"] },
    ]);
  });

  it("lists the six actions in order, each carrying the project folder", () => {
    const actions = projectTree([retail], uriOf).filter((node) => node.command);
    expect(actions.map((node) => [node.label, node.command?.id])).toEqual([
      ["Check", "ingestron.check"],
      ["Plan", "ingestron.plan"],
      ["Apply", "ingestron.apply"],
      ["Compare environments", "ingestron.compareEnvironments"],
      ["Prepare platform request", "ingestron.platformRequest"],
      ["Show generated files", "ingestron.showGenerated"],
    ]);
    for (const node of actions) expect(node.command?.args).toEqual([{ uri: "/work/retail" }]);
  });

  it("says Plan, Apply and Check work on every environment, and what the selected one is for", () => {
    const nodes = projectTree([retail]);
    const tooltip = (label: string) => nodes.find((node) => node.label === label)?.tooltip;
    expect(tooltip("Check")).toBe("Check that build/ is up to date, for every environment");
    expect(tooltip("Plan")).toBe("Show what would change in build/, for every environment");
    expect(tooltip("Apply")).toBe(
      "Write every environment's files to build/, one folder for each platform",
    );
    expect(tooltip("Environments")).toBe(
      "Problems, previews and the platform request show the selected environment. Plan, Apply and Check work on every environment together.",
    );
    expect(tooltip("Prepare platform request")).toBe(
      "Write what to ask the platform team, for the selected environment",
    );
    expect(tooltip("Show generated files")).toBe(
      "Show the files generated for the selected environment",
    );
  });

  it("passes the folder's path as it is when no uri is made from it", () => {
    const check = projectTree([retail]).find((node) => node.label === "Check");
    expect(check?.command?.args).toEqual(["/work/retail"]);
  });

  it("puts environments before the actions", () => {
    expect(projectTree([retail])[0]?.label).toBe("Environments");
  });

  it("leaves out the environments when the project declares none", () => {
    const nodes = projectTree([{ ...retail, environments: [] }]);
    expect(nodes.map((node) => node.label)).not.toContain("Environments");
    expect(nodes).toHaveLength(6);
  });

  it("one project shows no project level", () => {
    const nodes = projectTree([retail]);
    expect(nodes.map((node) => node.label)).toEqual([
      "Environments",
      "Check",
      "Plan",
      "Apply",
      "Compare environments",
      "Prepare platform request",
      "Show generated files",
    ]);
  });

  it("two projects show one node each", () => {
    const nodes = projectTree([
      retail,
      { folder: "/work/sales", id: "sales", environments: ["dev"] },
    ]);
    expect(nodes.map((node) => [node.label, node.description])).toEqual([
      ["retail", "/work/retail"],
      ["sales", "/work/sales"],
    ]);
    expect(nodes[1]?.children?.map((node) => node.label)).toContain("Check");
    expect(nodes[1]?.children?.[0]?.children?.[0]?.command?.args).toEqual(["/work/sales", "dev"]);
  });

  it("describes each of several projects by the path the caller makes of its folder", () => {
    const nodes = projectTree(
      [retail, { folder: "/work/sales", id: "sales", environments: ["dev"] }],
      uriOf,
      (folder) => folder.replace("/work/", ""),
    );
    expect(nodes.map((node) => node.description)).toEqual(["retail", "sales"]);
    // The key that tells rows apart stays the full folder.
    expect(nodes.map((node) => node.key)).toEqual(["/work/retail", "/work/sales"]);
  });

  it("is empty without projects", () => {
    expect(projectTree([])).toEqual([]);
  });
});

describe("isProjectManifest", () => {
  it("is true for a project.yaml anywhere, which holds the environments the view lists", () => {
    expect(isProjectManifest("/work/retail/project.yaml")).toBe(true);
    expect(isProjectManifest("project.yaml")).toBe(true);
  });

  it("is false for every other file, so an edit elsewhere does not redraw the view", () => {
    expect(isProjectManifest("/work/retail/flows/shop.yaml")).toBe(false);
    expect(isProjectManifest("/work/retail/my-project.yaml")).toBe(false);
    expect(isProjectManifest("/work/retail/project.yaml/notes.md")).toBe(false);
    expect(isProjectManifest("extension-output-ingestron.ingestron-#1-Ingestron")).toBe(false);
  });
});

describe("rowId", () => {
  const all = (nodes: TreeNode[], parent = ""): string[] =>
    nodes.flatMap((node) => {
      const id = rowId(parent, node);
      return [id, ...all(node.children ?? [], id)];
    });

  it("gives two projects with the same id distinct row ids, all the way down", () => {
    const nodes = projectTree([
      { folder: "/work/a/retail", id: "retail", environments: ["dev"] },
      { folder: "/work/b/retail", id: "retail", environments: ["dev"] },
    ]);
    const ids = all(nodes);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives the rows of one project distinct ids", () => {
    const ids = all(projectTree([retail]));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Project view in the manifest", () => {
  const manifest = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
  );
  const contributes = manifest.contributes;

  it("is a tree before the Reference view in the Ingestron container", () => {
    expect(contributes.views.ingestron.map((view: { id: string }) => view.id)).toEqual([
      "ingestron.project",
      "ingestron.reference",
    ]);
    expect(contributes.views.ingestron[0]).toEqual({
      id: "ingestron.project",
      name: "Project",
      type: "tree",
    });
  });

  it("offers a new project when the workspace has none", () => {
    expect(contributes.viewsWelcome).toEqual([
      {
        view: "ingestron.project",
        contents:
          "No Ingestron project in this workspace.\n[New project](command:ingestron.newProject)",
        when: "!ingestron.hasProjects",
      },
    ]);
  });
});
