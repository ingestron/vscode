// The context keys' pure parts: which files belong to a project, and updates that never overlap.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fileInProject,
  inBuildFolder,
  projectFilesOf,
  serialised,
} from "../src/features/context-keys.js";

const root = join("/", "work");

describe("projectFilesOf", () => {
  it("keys every YAML file inside a project folder, and nothing outside", () => {
    const retail = join(root, "retail");
    const files = [
      join(retail, "project.yaml"),
      join(retail, "flows", "shop.yml"),
      join(root, "other", "chart.yaml"),
      join(root, "retail-two", "x.yaml"),
    ];
    expect(projectFilesOf(files, [retail])).toEqual({
      [join(retail, "project.yaml")]: true,
      [join(retail, "flows", "shop.yml")]: true,
    });
  });

  it("leaves out the project's build folder and files that are not YAML", () => {
    const retail = join(root, "retail");
    const files = [
      join(retail, "build", "dev", "pipeline.yaml"),
      join(retail, "README.md"),
      join(retail, "contracts", "orders.yaml"),
    ];
    expect(Object.keys(projectFilesOf(files, [retail]))).toEqual([
      join(retail, "contracts", "orders.yaml"),
    ]);
  });

  it("is empty without projects", () => {
    expect(projectFilesOf([join(root, "a.yaml")], [])).toEqual({});
  });
});

describe("inBuildFolder", () => {
  const retail = join(root, "retail");

  it("is true for a path under the project's build folder", () => {
    expect(inBuildFolder(join(retail, "build", "dev", "pipeline.yaml"), [retail])).toBe(true);
  });

  it("is false for a path elsewhere in the project, even one named build deeper down", () => {
    expect(inBuildFolder(join(retail, "flows", "shop.yaml"), [retail])).toBe(false);
    expect(inBuildFolder(join(retail, "flows", "build", "shop.yaml"), [retail])).toBe(false);
  });

  it("is false for a project that sits under a folder named build", () => {
    const nested = join(root, "build", "retail");
    expect(inBuildFolder(join(nested, "flows", "shop.yaml"), [nested])).toBe(false);
    expect(inBuildFolder(join(nested, "project.yaml"), [nested])).toBe(false);
    // The nested project's own build folder is still left out.
    expect(inBuildFolder(join(nested, "build", "dev", "x.yaml"), [nested])).toBe(true);
  });

  it("uses the nearest project when projects are nested", () => {
    const inner = join(retail, "build", "inner");
    expect(inBuildFolder(join(inner, "flows", "a.yaml"), [retail, inner])).toBe(false);
    expect(inBuildFolder(join(inner, "build", "a.yaml"), [retail, inner])).toBe(true);
  });

  it("is false for a path in no known project, so a new project is noticed", () => {
    expect(inBuildFolder(join(root, "new", "project.yaml"), [retail])).toBe(false);
    expect(inBuildFolder(join(root, "build", "new", "project.yaml"), [])).toBe(false);
  });
});

describe("serialised", () => {
  const deferred = () => {
    let finish!: () => void;
    const done = new Promise<void>((resolve) => (finish = resolve));
    return { done, finish };
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("never runs two updates at once, and runs once more for requests made meanwhile", async () => {
    const log: string[] = [];
    const gates = [deferred(), deferred(), deferred()];
    let run = 0;
    const request = serialised(async (full) => {
      const mine = run++;
      log.push(`start ${mine} ${full ? "full" : "editor"}`);
      await gates[mine]!.done;
      log.push(`end ${mine}`);
    });
    request(false);
    request(false);
    request(true);
    await tick();
    expect(log).toEqual(["start 0 editor"]);
    gates[0]!.finish();
    await tick();
    expect(log).toEqual(["start 0 editor", "end 0", "start 1 full"]);
    gates[1]!.finish();
    await tick();
    expect(log.at(-1)).toBe("end 1");
    expect(run).toBe(2);
  });

  it("keeps going after an update fails", async () => {
    let calls = 0;
    const request = serialised(async () => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
    });
    request(true);
    await tick();
    request(true);
    await tick();
    expect(calls).toBe(2);
  });
});

describe("fileInProject", () => {
  it("is true for a file inside a project folder, and false outside any", () => {
    const base = mkdtempSync(join(tmpdir(), "ingestron-keys-"));
    mkdirSync(join(base, "retail", "flows"), { recursive: true });
    mkdirSync(join(base, "elsewhere"));
    writeFileSync(join(base, "retail", "project.yaml"), "id: retail\n");
    expect(fileInProject(join(base, "retail", "project.yaml"))).toBe(true);
    expect(fileInProject(join(base, "retail", "flows", "shop.yaml"))).toBe(true);
    expect(fileInProject(join(base, "elsewhere", "chart.yaml"))).toBe(false);
  });
});
