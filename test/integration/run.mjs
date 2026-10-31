// Opens a copy of the retail example in a downloaded VS Code (never the
// user's own) with only this extension, and runs suite.cjs inside it.
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = mkdtempSync(join(tmpdir(), "ingestron-vscode-it-"));
// Worktree paths can exceed macOS's Unix socket limit for VS Code's IPC handle.
const userData = mkdtempSync(join(tmpdir(), "ingestron-vscode-"));
cpSync(join(here, "../../node_modules/@ingestron/cli/project-templates/retail"), workspace, {
  recursive: true,
});
// Set when this runs from inside another Electron app (such as VS Code); it
// would make the downloaded VS Code start as plain Node.js.
delete process.env.ELECTRON_RUN_AS_NODE;
await runTests({
  version: "stable",
  extensionDevelopmentPath: join(here, "../.."),
  extensionTestsPath: join(here, "suite.cjs"),
  launchArgs: [
    workspace,
    `--user-data-dir=${userData}`,
    "--disable-extensions",
    "--skip-welcome",
    "--skip-release-notes",
  ],
});
console.log("✓ integration test passed in VS Code");
