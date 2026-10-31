// Builds the .vsix: the bundle and data folders, without node_modules.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
execFileSync("node", ["scripts/build.mjs"], { cwd: root, stdio: "inherit" });
execFileSync("npx", ["vsce", "package", "--no-dependencies", "--out", "ingestron.vsix"], {
  cwd: root,
  stdio: "inherit",
});
