// Runs inside VS Code: problems follow an unsaved edit, and go to definition
// jumps across files. Throws on the first failure.
const assert = require("node:assert/strict");
const path = require("node:path");
const vscode = require("vscode");

/** A problem's code; VS Code keeps it with its docs link when it has one. */
const codeOf = (item) => (typeof item.code === "object" ? item.code.value : item.code);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check, what) {
  for (let tries = 0; tries < 60; tries += 1) {
    const value = await check();
    if (value) return value;
    await wait(250);
  }
  const all = vscode.languages
    .getDiagnostics()
    .map(
      ([uri, items]) =>
        `${uri.fsPath}: ${items.map((item) => `${codeOf(item)} ${item.message}`).join("; ")}`,
    );
  throw new Error(`Timed out waiting for ${what}. Diagnostics:\n${all.join("\n")}`);
}

const fs = require("node:fs");

/** A generated file changed on disk, outside the editor, then deleted: the warning follows both. */
async function editedOnDisk(folder) {
  const generated = path.join(folder, "build/dev/src/retail/bronze/customers.sql");
  const uri = vscode.Uri.file(generated);
  const edited = () =>
    vscode.languages.getDiagnostics(uri).some((item) => codeOf(item) === "EDITED");
  fs.appendFileSync(generated, "-- changed by hand\n");
  await until(edited, "the EDITED warning after a change on disk");
  fs.rmSync(generated);
  await until(() => !edited(), "the EDITED warning to clear after the file was deleted");
}

/** With auto-apply on, saving a flow regenerates its table's SQL on disk. */
async function autoApply(folder) {
  await vscode.commands.executeCommand("ingestron.toggleAutoApply");
  const flow = vscode.Uri.file(path.join(folder, "flows/shop.yaml"));
  const document = await vscode.workspace.openTextDocument(flow);
  const edit = new vscode.WorkspaceEdit();
  const at = document.getText().indexOf("check: total >= 0");
  edit.replace(
    flow,
    new vscode.Range(document.positionAt(at), document.positionAt(at + 17)),
    "check: total >= 1",
  );
  await vscode.workspace.applyEdit(edit);
  await document.save();
  const sql = path.join(folder, "build/dev/src/retail/bronze/orders.sql");
  await until(
    // The file appears after the debounced apply, so a missing file is not yet a failure.
    () => fs.existsSync(sql) && fs.readFileSync(sql, "utf8").includes("total >= 1"),
    "auto-apply to regenerate orders.sql",
  );
  await vscode.commands.executeCommand("ingestron.toggleAutoApply");
}

/** An empty file in flows/ is offered a Flow skeleton as a snippet. */
async function newFile(folder) {
  const file = vscode.Uri.file(path.join(folder, "flows/web.yaml"));
  fs.writeFileSync(file.fsPath, "");
  const document = await vscode.workspace.openTextDocument(file);
  await vscode.window.showTextDocument(document);
  const list = await vscode.commands.executeCommand(
    "vscode.executeCompletionItemProvider",
    file,
    new vscode.Position(0, 0),
  );
  const skeleton = list.items.find((item) => item.label === "Flow document");
  assert.ok(skeleton, "no Flow document skeleton");
  assert.match(skeleton.insertText.value, /kind: Flow\nid: \$\{1:web\}/);

  // Accepted straight after "uses:", a value brings its space.
  const edit = new vscode.WorkspaceEdit();
  edit.insert(file, new vscode.Position(0, 0), "kind: Flow\nstore:\n  uses:");
  await vscode.workspace.applyEdit(edit);
  const after = await vscode.commands.executeCommand(
    "vscode.executeCompletionItemProvider",
    file,
    new vscode.Position(2, 7),
  );
  const method = after.items.find((item) => item.label === "streaming-table");
  assert.equal(method?.insertText, " streaming-table");
  await vscode.commands.executeCommand("workbench.action.files.revert");

  // Straight after a list's "-", items are inserted after the dash, not filtered by it.
  const dash = new vscode.WorkspaceEdit();
  dash.insert(file, new vscode.Position(0, 0), "kind: DataContract\nschema:\n  -");
  await vscode.workspace.applyEdit(dash);
  const items = await vscode.commands.executeCommand(
    "vscode.executeCompletionItemProvider",
    file,
    new vscode.Position(2, 3),
  );
  const first = items.items.find((item) => item.label === "name");
  assert.ok(first, "no field after the dash");
  assert.ok(first.range && first.range.isEmpty, "the dash would be replaced");
  await vscode.commands.executeCommand("workbench.action.files.revert");
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  fs.rmSync(file.fsPath);
  await until(
    () =>
      vscode.languages
        .getDiagnostics()
        .every(([uri, found]) => uri.fsPath !== file.fsPath || found.length === 0),
    "the empty file's problem to clear",
  );
}

exports.run = async function run() {
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const flow = vscode.Uri.file(path.join(folder, "flows/shop.yaml"));
  const document = await vscode.workspace.openTextDocument(flow);
  await vscode.window.showTextDocument(document);
  await until(
    () => vscode.extensions.getExtension("ingestron.ingestron-vscode")?.isActive,
    "activation",
  );
  await vscode.commands.executeCommand(
    "workbench.action.openWalkthrough",
    "ingestron.ingestron-vscode#start",
    false,
  );
  await vscode.window.showTextDocument(document);
  await autoApply(folder);
  await newFile(folder);
  // The Reference tab opens beside chat; the command fails if the view is not contributed.
  await vscode.commands.executeCommand("ingestron.showReference");

  const at = document.getText().indexOf("source: shop") + 9;
  const locations = await vscode.commands.executeCommand(
    "vscode.executeDefinitionProvider",
    flow,
    document.positionAt(at),
  );
  assert.equal(
    path.relative(folder, locations[0].uri.fsPath),
    path.join("connections", "shop.yaml"),
  );

  const tablePosition = document.positionAt(document.getText().indexOf("  orders:") + 3);
  const explained = await vscode.commands.executeCommand(
    "vscode.executeHoverProvider",
    flow,
    tablePosition,
  );
  const explanation = explained
    .flatMap((item) => item.contents.map((content) => content.value ?? String(content)))
    .join("\n");
  assert.match(explanation, /\*\*store\*\*: `streaming-table` \(databricks\)/);

  await annotations(flow, document);
  await renameRefused(flow, document);
  await codeFileMoves(folder);
  await symbols(folder, flow);
  await coreLoop();
  await moveToStandard(flow, document);
  await vscode.commands.executeCommand("ingestron.compareEnvironments");
  await until(
    () => vscode.window.activeTextEditor?.document.getText().startsWith("# dev ↔ prod: retail"),
    "the environment comparison",
  );
  await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
  await vscode.window.showTextDocument(document);
  await draftContract(folder);
  await vscode.window.showTextDocument(document);
  await vscode.commands.executeCommand("ingestron.platformRequest");
  await until(
    () =>
      vscode.window.activeTextEditor?.document
        .getText()
        .startsWith("# Platform request: retail (dev)"),
    "the platform request",
  );
  await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
  await vscode.window.showTextDocument(document);

  const editor = vscode.window.activeTextEditor;
  editor.selection = new vscode.Selection(tablePosition, tablePosition);
  await vscode.commands.executeCommand("ingestron.showGenerated");
  const preview = await until(() => {
    const active = vscode.window.activeTextEditor;
    return active && active.document.uri.scheme === "ingestron-generated" && active.document;
  }, "the generated file preview");
  assert.match(
    preview.getText(),
    /CREATE OR REFRESH STREAMING TABLE `dev_sales`\.`bronze`\.`orders`/,
  );
  await previewsPerProject(folder, preview);
  await previewEnvironment(folder, document, preview);
  await vscode.window.showTextDocument(document);

  const value = document.getText().indexOf("source: shop") + "source: ".length;
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    flow,
    new vscode.Range(document.positionAt(value), document.positionAt(value + 4)),
    "shops",
  );
  await vscode.workspace.applyEdit(edit);
  const problems = await until(() => {
    const found = vscode.languages
      .getDiagnostics(flow)
      .filter((item) => codeOf(item) === "BROKEN_LINK");
    return found.length > 0 && found;
  }, "the BROKEN_LINK problem");
  assert.equal(problems[0].range.start.line, document.positionAt(at).line);
  assert.equal(
    problems[0].code.target.toString(true),
    "https://docs.ingestron.io/docs/reference/errors#BROKEN_LINK",
  );

  const hover = await vscode.commands.executeCommand(
    "vscode.executeHoverProvider",
    flow,
    document.positionAt(document.getText().indexOf("  orders:") + 3),
  );
  await editedOnDisk(folder);

  const shown = hover
    .flatMap((item) => item.contents.map((content) => content.value ?? String(content)))
    .join("\n");
  assert.match(shown, /The project has problems; fix them to see how this table resolves\./);

  await quickFix(flow, problems[0].range);
};

/**
 * A second copy of the project, with the same output paths: its preview is
 * its own, follows edits to its flow, and Apply run from it applies it.
 */
async function previewsPerProject(folder, firstPreview) {
  const other = path.join(
    fs.mkdtempSync(path.join(require("node:os").tmpdir(), "ingestron-")),
    "retail",
  );
  fs.cpSync(folder, other, {
    recursive: true,
    filter: (item) => !item.includes(`${path.sep}build`),
  });
  const flow = vscode.Uri.file(path.join(other, "flows/shop.yaml"));
  const text = fs
    .readFileSync(flow.fsPath, "utf8")
    .replace(/check: total >= \d+/, "check: total >= 999");
  fs.writeFileSync(flow.fsPath, text);
  const document = await vscode.workspace.openTextDocument(flow);
  const editor = await vscode.window.showTextDocument(document);
  const table = document.positionAt(document.getText().indexOf("  orders:") + 3);
  editor.selection = new vscode.Selection(table, table);
  await vscode.commands.executeCommand("ingestron.showGenerated");
  const preview = await until(() => {
    const active = vscode.window.activeTextEditor?.document;
    return active?.uri.scheme === "ingestron-generated" && active !== firstPreview && active;
  }, "the second project's preview");
  assert.notEqual(preview.uri.toString(), firstPreview.uri.toString());
  assert.match(preview.getText(), /total >= 999/);

  const at = document.getText().indexOf("total >= 999") + "total >= ".length;
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    flow,
    new vscode.Range(document.positionAt(at), document.positionAt(at + 3)),
    "1000",
  );
  await vscode.workspace.applyEdit(edit);
  await document.save();
  await until(() => preview.getText().includes("total >= 1000"), "the open preview to refresh");

  await vscode.window.showTextDocument(preview);
  await vscode.commands.executeCommand("ingestron.apply");
  const written = path.join(other, "build/dev/src/retail/bronze/orders.sql");
  await until(() => fs.existsSync(written), "Apply from the preview to write its project");
  assert.match(fs.readFileSync(written, "utf8"), /total >= 1000/);
}

/** Renaming a table to a name another table has is refused, with the reason. */
async function renameRefused(flow, document) {
  const orders = document.positionAt(document.getText().indexOf("  orders:") + 3);
  await assert.rejects(
    vscode.commands.executeCommand(
      "vscode.executeDocumentRenameProvider",
      flow,
      orders,
      "customers",
    ),
    /"customers" is already the name of a table/,
  );
}

/**
 * Moving a transform's SQL file changes its ${file:…} in the same edit, and
 * back. VS Code leaves such edits unsaved, as it does for imports.
 */
async function codeFileMoves(folder) {
  const yaml = vscode.Uri.file(path.join(folder, "transforms/daily_sales.yaml"));
  const move = async (from, to) => {
    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(
      vscode.Uri.file(path.join(folder, from)),
      vscode.Uri.file(path.join(folder, to)),
    );
    assert.ok(await vscode.workspace.applyEdit(edit), `moving ${from}`);
    const document = await vscode.workspace.openTextDocument(yaml);
    await document.save();
    return document.getText();
  };
  assert.match(
    await move("transforms/daily_sales.sql", "transforms/sql/daily.sql"),
    /\$\{file:sql\/daily\.sql\}/,
  );
  assert.match(
    await move("transforms/sql/daily.sql", "transforms/daily_sales.sql"),
    /\$\{file:daily_sales\.sql\}/,
  );
}

/** Go to Symbol in Workspace finds a table; the flow's outline lists its tables. */
async function symbols(folder, flow) {
  const found = await vscode.commands.executeCommand(
    "vscode.executeWorkspaceSymbolProvider",
    "orders",
  );
  assert.ok(
    found.some(
      (item) =>
        item.name === "orders" && item.location.uri.fsPath === path.join(folder, "flows/shop.yaml"),
    ),
    "orders in Go to Symbol in Workspace",
  );
  const outline = await vscode.commands.executeCommand(
    "vscode.executeDocumentSymbolProvider",
    flow,
  );
  const names = outline.map((item) => item.name);
  assert.ok(
    names.includes("orders") && names.includes("customers"),
    `outline: ${names.join(", ")}`,
  );
}

/** Accepts the completion item with `label` at `position`, as the editor would. */
async function accept(uri, position, label) {
  const list = await vscode.commands.executeCommand(
    "vscode.executeCompletionItemProvider",
    uri,
    position,
  );
  const item = list.items.find((candidate) => candidate.label === label);
  assert.ok(item, `no "${label}" in ${list.items.map((candidate) => candidate.label).join(", ")}`);
  const editor = await vscode.window.showTextDocument(uri);
  const text = item.insertText ?? item.label;
  if (typeof text === "string") await editor.edit((edit) => edit.insert(position, text));
  else await editor.insertSnippet(text, position);
  if (item.command?.command === "ingestron.applyEdits")
    await vscode.commands.executeCommand(item.command.command, ...item.command.arguments);
  await editor.document.save();
  return item;
}

/**
 * The core authoring loop on a copy of the minimal starter: draft a contract
 * from a sample, add the table from completion, add a transform (importing
 * its folder with the quick fix, declaring its input from completion), then
 * apply: every output is generated and no problem is left.
 */
async function coreLoop() {
  const folder = path.join(
    fs.mkdtempSync(path.join(require("node:os").tmpdir(), "ingestron-loop-")),
    "shop",
  );
  fs.cpSync(
    path.join(__dirname, "../../node_modules/@ingestron/cli/project-templates/minimal"),
    folder,
    {
      recursive: true,
    },
  );
  fs.rmSync(path.join(folder, "build"), { recursive: true, force: true });
  const file = (name) => vscode.Uri.file(path.join(folder, name));

  // 1. A contract from a sample with codes that must stay text.
  const sample = path.join(folder, "returns.csv");
  fs.writeFileSync(sample, "return_code,amount\n00123,12.5\n00456,3\n");
  const input = vscode.window.showInputBox;
  vscode.window.showInputBox = async () => "shop.returns";
  try {
    await vscode.commands.executeCommand("ingestron.draftContract", vscode.Uri.file(sample));
  } finally {
    vscode.window.showInputBox = input;
  }
  const contract = path.join(folder, "contracts/shop.returns.yaml");
  await until(() => fs.existsSync(contract), "the drafted contract");
  assert.match(fs.readFileSync(contract, "utf8"), /name: return_code, logicalType: string/);
  fs.rmSync(sample);

  // 2. The table, from completion under the flow's tables.
  const flow = file("flows/orders.yaml");
  const flowText = fs.readFileSync(flow.fsPath, "utf8");
  fs.writeFileSync(flow.fsPath, `${flowText}  `);
  const lines = `${flowText}  `.split("\n");
  await accept(flow, new vscode.Position(lines.length - 1, 2), "returns");
  assert.match(
    fs.readFileSync(flow.fsPath, "utf8"),
    /returns: \{ object: returns, contract: shop.returns \}/,
  );

  // 3. A transform in a folder the project does not import yet: the quick fix imports it.
  fs.mkdirSync(path.join(folder, "transforms"));
  fs.writeFileSync(
    path.join(folder, "contracts/shop.big_returns.yaml"),
    fs
      .readFileSync(contract, "utf8")
      .replace("id: shop.returns", "id: shop.big_returns")
      .replace("name: returns", "name: big_returns"),
  );
  const transform = file("transforms/big_returns.yaml");
  fs.writeFileSync(
    transform.fsPath,
    "apiVersion: ingestron.io/v1\nkind: Transform\nid: big_returns\ninputs: []\ncode: ${file:big_returns.sql}\ncontract: shop.big_returns\n",
  );
  const sql = file("transforms/big_returns.sql");
  fs.writeFileSync(sql.fsPath, "SELECT * FROM {{ tables.");
  await vscode.workspace.openTextDocument(transform);
  const imported = await until(async () => {
    const actions = await vscode.commands.executeCommand(
      "vscode.executeCodeActionProvider",
      transform,
      new vscode.Range(0, 0, 0, 0),
    );
    return actions.find((action) => action.title.startsWith('Import "transforms/*.yaml"'));
  }, "the import quick fix");
  await vscode.workspace.applyEdit(imported.edit);
  const manifest = await vscode.workspace.openTextDocument(file("project.yaml"));
  assert.match(manifest.getText(), /- transforms\/\*\.yaml/);
  // Left unsaved, as a person would: Apply saves it first.

  // 4. Its input, from completion in the SQL: choosing it declares it.
  const chosen = await accept(sql, new vscode.Position(0, 24), "returns");
  assert.equal(chosen.detail, "not an input yet: adds it to inputs");
  const declared = await vscode.workspace.openTextDocument(transform);
  assert.match(declared.getText(), /inputs: \[ ?returns ?\]/);
  assert.ok(await declared.save(), "saving the transform");
  const query = await vscode.window.showTextDocument(sql);
  await query.edit((edit) =>
    edit.insert(
      query.document.positionAt(query.document.getText().length),
      " }} WHERE amount > 10\n",
    ),
  );
  assert.ok(await query.document.save(), "saving the SQL");

  // 5. Apply: the transform is generated, and the project has no problems.
  await vscode.window.showTextDocument(transform);
  await vscode.commands.executeCommand("ingestron.apply");
  const generated = path.join(folder, "build/dev/src/shop/silver/big_returns.sql");
  await until(() => fs.existsSync(generated), "Apply to generate the transform");
  assert.match(fs.readFileSync(generated, "utf8"), /FROM `dev`\.`bronze`\.`returns`/);
  await until(
    () =>
      vscode.languages
        .getDiagnostics()
        .filter(([uri]) => uri.fsPath.startsWith(folder))
        .every(([, items]) => items.length === 0),
    "no problems left in the new project",
  );
}

/** Picks `choice` in the next quick pick, as a person would. */
async function choosing(choice, action) {
  const original = vscode.window.showQuickPick;
  vscode.window.showQuickPick = async () => choice;
  try {
    await action();
  } finally {
    vscode.window.showQuickPick = original;
  }
}

/**
 * With prod selected for the project, Apply run from a dev preview applies
 * dev: the environment the preview shows.
 */
async function previewEnvironment(folder, source, devPreview) {
  await vscode.window.showTextDocument(source);
  await choosing("prod", () => vscode.commands.executeCommand("ingestron.selectEnvironment"));
  const dev = path.join(folder, "build/dev/src/retail/bronze/orders.sql");
  fs.rmSync(path.join(folder, "build/prod"), { recursive: true, force: true });
  fs.rmSync(dev);
  await vscode.window.showTextDocument(devPreview);
  await vscode.commands.executeCommand("ingestron.apply");
  await until(() => fs.existsSync(dev), "Apply from the dev preview to write build/dev");
  assert.equal(fs.existsSync(path.join(folder, "build/prod")), false, "build/prod was written");
  await vscode.window.showTextDocument(source);
  await choosing("dev", () => vscode.commands.executeCommand("ingestron.selectEnvironment"));
}

/** The table's full name beside it, and a lens per generated file that opens it. */
async function annotations(flow, document) {
  const hints = await until(async () => {
    const found = await vscode.commands.executeCommand(
      "vscode.executeInlayHintProvider",
      flow,
      new vscode.Range(0, 0, document.lineCount, 0),
    );
    return found?.length > 0 && found;
  }, "inlay hints");
  const labels = hints.map((hint) => (typeof hint.label === "string" ? hint.label : ""));
  assert.ok(labels.includes("→ dev_sales.bronze.orders"), labels.join());
  const lenses = await vscode.commands.executeCommand("vscode.executeCodeLensProvider", flow);
  assert.ok(lenses.some((item) => item.command?.title === "files → streaming-table"));
  const lens = lenses.find((item) => item.command?.title.endsWith("orders.sql"));
  assert.ok(lens, "no lens for orders.sql");
  await vscode.commands.executeCommand(lens.command.command, ...lens.command.arguments);
  await until(
    () => vscode.window.activeTextEditor?.document.uri.path.endsWith("orders.sql"),
    "the lens to open orders.sql",
  );
  await vscode.window.showTextDocument(document);
}

/** On a setting the standard should hold, the light bulb offers to move it there. */
async function moveToStandard(flow, document) {
  const editor = await vscode.window.showTextDocument(document);
  const old = "      with: { mode: upsert,";
  const at = document.getText().indexOf(old);
  await editor.edit((edit) =>
    edit.replace(
      new vscode.Range(document.positionAt(at), document.positionAt(at + old.length)),
      "      with: { properties: { a: b }, mode: upsert,",
    ),
  );
  const position = document.positionAt(document.getText().indexOf("properties: { a"));
  const actions = await until(async () => {
    const found = await vscode.commands.executeCommand(
      "vscode.executeCodeActionProvider",
      flow,
      new vscode.Range(position, position),
    );
    return found?.some((action) => action.title.startsWith("Move properties")) && found;
  }, "the move action");
  assert.ok(
    actions.some((action) =>
      action.title.startsWith("Move properties to standard.yaml, replacing the value there"),
    ),
    actions.map((action) => action.title).join(", "),
  );
  await vscode.commands.executeCommand("workbench.action.files.revert");
}

/** A contract drafted from a sample CSV, written under contracts/ and opened. */
async function draftContract(folder) {
  const sample = path.join(folder, "returns.csv");
  fs.writeFileSync(sample, "id,amount,sold_at\n1,12.5,2026-10-01T09:00:00Z\n");
  const original = vscode.window.showInputBox;
  vscode.window.showInputBox = async () => "shop.returns";
  try {
    await vscode.commands.executeCommand("ingestron.draftContract", vscode.Uri.file(sample));
  } finally {
    vscode.window.showInputBox = original;
  }
  const written = path.join(folder, "contracts", "shop.returns.yaml");
  await until(() => fs.existsSync(written), "the drafted contract");
  assert.match(fs.readFileSync(written, "utf8"), /- \{ name: amount, logicalType: number \}/);
  fs.rmSync(written);
  fs.rmSync(sample);
}

/** The light bulb offers the closest id for the broken link, and applying it clears the problem. */
async function quickFix(flow, range) {
  const actions = await vscode.commands.executeCommand(
    "vscode.executeCodeActionProvider",
    flow,
    range,
  );
  assert.ok(
    actions.some((action) => action.title === 'Create Connection "shops"'),
    "no create fix",
  );
  const fix = actions.find((action) => action.title === 'Change to "shop"');
  assert.ok(fix, `no "Change to shop" fix among: ${actions.map((item) => item.title).join(", ")}`);
  await vscode.workspace.applyEdit(fix.edit);
  const document = await vscode.workspace.openTextDocument(flow);
  assert.match(document.getText(), /source: shop\n/);
  await until(
    () => vscode.languages.getDiagnostics(flow).every((item) => codeOf(item) !== "BROKEN_LINK"),
    "the BROKEN_LINK problem to clear",
  );
}
