// Builds the .vsix: the bundle and data folders, without node_modules.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
execFileSync("node", ["scripts/build.mjs"], { cwd: root, stdio: "inherit" });
execFileSync(
  "npx",
  [
    "vsce",
    "package",
    "--no-dependencies",
    "--githubBranch",
    revision,
    "--baseImagesUrl",
    `https://raw.githubusercontent.com/ingestron/vscode/${revision}/`,
    "--out",
    "ingestron.vsix",
  ],
  { cwd: root, stdio: "inherit" },
);
