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
});
