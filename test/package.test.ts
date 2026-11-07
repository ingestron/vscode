// The .vsix carries the licence and notice Apache-2.0 requires, and says where it comes from.
// Like bundle.test.ts, it reads the output of `pnpm build`, which validate runs first.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");

describe("extension package", () => {
  it("includes LICENSE, NOTICE and third-party notices", () => {
    const files = execFileSync("npx", ["vsce", "ls", "--no-dependencies"], {
      cwd: root,
      encoding: "utf8",
    }).split("\n");
    expect(files).toContain("LICENSE");
    expect(files).toContain("NOTICE");
    expect(files).toContain("THIRD_PARTY_NOTICES");
    // Screenshots and other scratch output stay out of the package.
    expect(files.filter((file) => file.startsWith(".tmp/"))).toEqual([]);
    // pnpm's workspace settings can name local paths, such as tarballs to test with.
    expect(files).not.toContain("pnpm-workspace.yaml");
    const notices = readFileSync(join(root, "THIRD_PARTY_NOTICES"), "utf8");
    expect(notices).toMatch(/^## yaml@/m);
    expect(notices).not.toMatch(/@ingestron\//);
  }, 120_000);

  it("names its repository and contacts", () => {
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(manifest.repository).toEqual({
      type: "git",
      url: "git+https://github.com/ingestron/vscode.git",
    });
    expect(manifest.bugs).toEqual({
      url: "https://github.com/ingestron/vscode/issues",
      email: "hello@ingestron.io",
    });
    expect(manifest.homepage).toBe("https://docs.ingestron.io");
  });

  it("has the brand icon, and a sidebar icon that follows the theme", () => {
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    // The Marketplace asks for a PNG, at least 128 pixels square.
    expect(manifest.icon).toBe("media/icon.png");
    const png = readFileSync(join(root, manifest.icon));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([128, 128]);
    // The side bar's icon takes the theme's colour, so it names no colour of its own.
    const sidebar = manifest.contributes.viewsContainers.secondarySidebar[0].icon;
    expect(sidebar).toBe("media/ingestron.svg");
    const svg = readFileSync(join(root, sidebar), "utf8");
    expect(svg).toContain('fill="currentColor"');
    expect(svg).not.toMatch(/#[0-9a-f]{3,6}/i);
    const reference = manifest.contributes.views.ingestron.find(
      (view: { id: string }) => view.id === "ingestron.reference",
    );
    expect(reference.icon).toBe(sidebar);
  });

  it("ships the icon but not the README's demonstration GIFs", () => {
    const files = execFileSync("npx", ["vsce", "ls", "--no-dependencies"], {
      cwd: root,
      encoding: "utf8",
    }).split("\n");
    expect(files).toContain("media/icon.png");
    expect(files).toContain("media/ingestron.svg");
    // The Marketplace loads the README's images from GitHub; they would only add weight here.
    expect(files.filter((file) => file.startsWith("media/readme/"))).toEqual([]);
  }, 120_000);
});
