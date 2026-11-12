// Add assistant files, run with the picker and the notice stubbed, on the project the suite
// opened (a temporary copy): the files are written, listed and removed again.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");

/** Runs the command with `picks` ticked, the notice's button pressed when `press`; returns what it showed. */
async function adding(manifest, picks, press) {
  const { showQuickPick, showInformationMessage } = vscode.window;
  const shown = { titles: [], notices: [] };
  vscode.window.showQuickPick = async (items, options) => {
    shown.titles.push(options.title);
    assert.equal(options.canPickMany, true);
    return picks && items.filter((item) => picks.includes(item.name));
  };
  vscode.window.showInformationMessage = async (message, ...buttons) => {
    shown.notices.push([message, buttons]);
    return press ? buttons[0] : undefined;
  };
  try {
    await vscode.commands.executeCommand("ingestron.addAssistantFiles", manifest);
  } finally {
    vscode.window.showQuickPick = showQuickPick;
    vscode.window.showInformationMessage = showInformationMessage;
  }
  return shown;
}

exports.run = async function run(folder) {
  const manifest = vscode.Uri.file(path.join(folder, "project.yaml"));
  const files = ["AGENTS.md", "CLAUDE.md"].map((name) => path.join(folder, name));
  const clean = () => files.forEach((file) => fs.rmSync(file, { force: true }));
  clean();
  try {
    // Nothing picked, or Escape: nothing is written and nothing is said.
    for (const picks of [[], undefined]) {
      const none = await adding(manifest, picks, false);
      assert.deepEqual(none.notices, []);
      assert.ok(
        files.every((file) => !fs.existsSync(file)),
        "files written for no pick",
      );
    }

    const shown = await adding(manifest, ["claude"], true);
    assert.deepEqual(shown.titles, ["Add assistant files"]);
    assert.deepEqual(shown.notices, [
      ["Added the assistant files. The Ingestron output lists each one.", ["Open AGENTS.md"]],
    ]);
    assert.match(fs.readFileSync(files[0], "utf8"), /Ingestron/);
    assert.match(fs.readFileSync(files[1], "utf8"), /@AGENTS\.md/);
    const active = vscode.window.activeTextEditor?.document.uri.fsPath;
    assert.equal(fs.realpathSync(active), fs.realpathSync(files[0]), "AGENTS.md was not opened");
  } finally {
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    clean();
  }
};
