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
const { fillStarter } = require("./starters.cjs");

/** A generated file changed on disk, outside the editor, then deleted: the warning follows both. */
async function editedOnDisk(folder) {
  const generated = path.join(folder, "build/databricks/src/retail/bronze/customers.sql");
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
  const sql = path.join(folder, "build/databricks/src/retail/bronze/orders.sql");
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
  await codeTooltip(folder);
  await dataProducts(folder);
  await unsetVariable(folder);
  await symbols(folder, flow);
  await coreLoop();
  await clickedProject(document);
  await projectView();
  await projectViewFollows(folder, document);
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
  await sourceMetadata(folder);
  await sourceWatching(folder);
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
    // The bundle builds every environment, so the catalog is each target's, not in the SQL.
    /CREATE OR REFRESH STREAMING TABLE `bronze`\.`orders` \(/,
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
  const written = path.join(other, "build/databricks/src/retail/bronze/orders.sql");
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

/** The hint beside a transform's ${file:…} shows the file's SQL as SQL code. */
async function codeTooltip(folder) {
  const yaml = vscode.Uri.file(path.join(folder, "transforms/daily_sales.yaml"));
  const document = await vscode.workspace.openTextDocument(yaml);
  const hints = await until(async () => {
    const found = await vscode.commands.executeCommand(
      "vscode.executeInlayHintProvider",
      yaml,
      new vscode.Range(0, 0, document.lineCount, 0),
    );
    return found?.length > 0 && found;
  }, "inlay hints on the transform");
  const code = hints.find((hint) => typeof hint.tooltip?.value === "string");
  assert.ok(code, "no hint with code in its tooltip");
  assert.match(code.tooltip.value, /```sql\n[\s\S]*SELECT/i);
}

/**
 * A data product gets a passport on Apply; with governance in the standard,
 * its unclassified columns are problems. Both files are restored after.
 */
async function dataProducts(folder) {
  const product = path.join(folder, "contracts/customers.product.yaml");
  const standard = path.join(folder, "standard.yaml");
  const kept = fs.readFileSync(standard, "utf8");
  fs.writeFileSync(
    product,
    "apiVersion: v1.1.0\nkind: DataProduct\nid: customers\nname: Customers\n" +
      "outputPorts:\n  - { name: customers, contractId: shop.customers }\n",
  );
  const passport = path.join(folder, "build/products/dev/customers.md");
  await until(async () => {
    await vscode.commands.executeCommand("ingestron.apply");
    return fs.existsSync(passport);
  }, "the passport after Apply");
  assert.match(fs.readFileSync(passport, "utf8"), /^# Customers/);
  fs.writeFileSync(standard, `${kept}governance:\n  classification: { columns: required }\n`);
  const contract = vscode.Uri.file(path.join(folder, "contracts/customers.yaml"));
  await until(
    () =>
      vscode.languages
        .getDiagnostics(contract)
        .some((item) => codeOf(item) === "COLUMN_UNCLASSIFIED"),
    "the COLUMN_UNCLASSIFIED problem",
  );
  fs.writeFileSync(standard, kept);
  fs.rmSync(product);
  fs.rmSync(path.join(folder, "build/products"), { recursive: true, force: true });
  await until(
    () => vscode.languages.getDiagnostics(contract).length === 0,
    "the problems to clear",
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
    path.join(__dirname, "../../node_modules/@ingestron/core/project-templates/minimal"),
    folder,
    {
      recursive: true,
    },
  );
  fs.rmSync(path.join(folder, "build"), { recursive: true, force: true });
  fillStarter(folder, "minimal");
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
  const generated = path.join(folder, "build/databricks/src/shop/silver/big_returns.sql");
  await until(() => fs.existsSync(generated), "Apply to generate the transform");
  // The catalog is each bundle target's, so the SQL names the schema and table only.
  assert.match(fs.readFileSync(generated, "utf8"), /FROM `bronze`\.`returns` WHERE amount > 10/);
  await until(
    () =>
      vscode.languages
        .getDiagnostics()
        .filter(([uri]) => uri.fsPath.startsWith(folder))
        .every(([, items]) => items.length === 0),
    "no problems left in the new project",
  );
}

/** The text of the Output panel's channels, which Ingestron's commands write to. */
const outputText = () =>
  vscode.workspace.textDocuments
    .filter((item) => item.uri.scheme === "output")
    .map((item) => item.getText())
    .join("\n");

/**
 * A second project, with environments of its own: Plan run from its
 * project.yaml, or from its folder, runs there while a file of the first
 * project is the active editor. Plan names the environments it generates.
 */
async function clickedProject(active) {
  // A fresh copy each time: the extension reads a project's environments once per snapshot.
  const copy = (environment) => {
    const folder = path.join(
      fs.mkdtempSync(path.join(require("node:os").tmpdir(), "ingestron-second-")),
      "retail",
    );
    fs.cpSync(
      path.join(__dirname, "../../node_modules/@ingestron/core/project-templates/retail"),
      folder,
      { recursive: true, filter: (item) => !item.includes(`${path.sep}build`) },
    );
    fillStarter(folder, "retail");
    const manifest = path.join(folder, "project.yaml");
    fs.writeFileSync(
      manifest,
      fs.readFileSync(manifest, "utf8").replace(/^ {2}dev:$/m, `  ${environment}:`),
    );
    return folder;
  };
  const targets = (environment) => `databricks → build/databricks (${environment}, prod)`;
  const plannedIn = async (target, environment, what) => {
    await vscode.window.showTextDocument(active);
    await vscode.commands.executeCommand("ingestron.plan", target);
    await until(() => outputText().includes(targets(environment)), what);
    assert.ok(!outputText().includes(targets("dev")), `${what} ran in the active editor's project`);
  };
  // Without a clicked file, the active editor's project runs.
  await vscode.window.showTextDocument(active);
  await vscode.commands.executeCommand("ingestron.plan");
  await until(() => outputText().includes(targets("dev")), "Plan from the active editor");
  const byFile = copy("uat");
  await plannedIn(vscode.Uri.file(path.join(byFile, "project.yaml")), "uat", "Plan from a file");
  const byFolder = copy("stage");
  await plannedIn(vscode.Uri.file(byFolder), "stage", "Plan from a project folder");
}

/**
 * The Project view lists the project's environments with the selected one
 * marked, and clicking another (running its row's command) moves the mark.
 */
async function projectView() {
  await vscode.commands.executeCommand("ingestron.project.focus");
  const rows = () => vscode.commands.executeCommand("ingestron.projectRows");
  const environments = async () =>
    (await rows()).find((row) => row.label === "Environments").children;
  const before = await environments();
  assert.deepEqual(
    before.map((row) => row.label),
    ["dev", "prod"],
  );
  const selected = (list) => list.filter((row) => row.description === "selected");
  assert.equal(selected(before).length, 1, "one environment is marked selected");
  const other = before.find((row) => row.description !== "selected");
  await vscode.commands.executeCommand(other.command.id, ...other.command.args);
  assert.deepEqual(
    selected(await environments()).map((row) => row.label),
    [other.label],
  );
  const actions = (await rows()).filter((row) => row.command).map((row) => row.label);
  assert.deepEqual(actions, [
    "Check",
    "Plan",
    "Apply",
    "Compare environments",
    "Prepare platform request",
    "Request source metadata",
    "Import source metadata…",
    "Show generated files",
  ]);
  // Later steps expect the environment this one started with.
  const first = selected(before)[0];
  await vscode.commands.executeCommand(first.command.id, ...first.command.args);
  assert.deepEqual(
    selected(await environments()).map((row) => row.label),
    [first.label],
  );
}

/**
 * With two projects the Project view opens the one of the active editor and
 * folds the other. VS Code does not say which rows are open, so this reads
 * what the view last handed it: each project row's collapsible state and its id.
 * That is read without asking the view to draw again, so the rows change only
 * when the view was told to redraw, which the editor listener does.
 * VS Code keeps a row's state by id, so a changed id is what makes it take the
 * new state, and an unchanged id is what leaves a row as the person left it.
 */
async function projectViewFollows(folder, flow) {
  const second = path.join(folder, "second");
  // Inside the workspace, so the view finds it; a second workspace folder would restart VS Code.
  fs.cpSync(
    path.join(__dirname, "../../node_modules/@ingestron/core/project-templates/retail"),
    second,
    { recursive: true, filter: (item) => !item.includes(`${path.sep}build`) },
  );
  fillStarter(second, "retail");
  const items = async () =>
    (await vscode.commands.executeCommand("ingestron.projectItems")).map((item) => ({
      // The workspace's own folder is described by its whole path, the other by its place in it.
      folder: item.description === "second" ? "second" : ".",
      id: item.id,
      state: item.collapsibleState,
    }));
  const open = vscode.TreeItemCollapsibleState.Expanded;
  const folded = vscode.TreeItemCollapsibleState.Collapsed;
  const states = (rows) => Object.fromEntries(rows.map((row) => [row.folder, row.state]));
  const showing = (file, expected, what) =>
    vscode.window.showTextDocument(vscode.Uri.file(file)).then(() =>
      until(async () => {
        const rows = await items();
        return rows.length === 2 && JSON.stringify(states(rows)) === JSON.stringify(expected);
      }, what),
    );
  // The second project's environments, as the rows show them: the name marked "selected".
  const selectedIn = async () => {
    const rows = await vscode.commands.executeCommand("ingestron.projectRows");
    const project = rows.find((row) => row.description === "second");
    const list = project.children.find((row) => row.label === "Environments").children;
    return list.filter((row) => row.description === "selected").map((row) => row.label);
  };
  let outsideFolder;
  const first = { ".": open, second: folded };
  const other = { ".": folded, second: open };
  try {
    await until(async () => (await items()).length === 2, "the Project view to list both projects");
    await showing(flow.uri.fsPath, first, "the first project open and the second folded");
    // Let the rescan the new folder caused finish, so only the editor can move the view on.
    await wait(1500);
    const before = await items();

    // A file of the second project: it opens and the first folds, under new ids.
    const secondFlow = path.join(second, "flows/shop.yaml");
    await showing(secondFlow, other, "the second project to open and the first to fold");
    const after = await items();
    for (const index of [0, 1]) assert.notEqual(after[index].id, before[index].id);

    // Nothing changes for another file of the same project, a choice of
    // environment, a file outside every project, or no editor at all.
    outsideFolder = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "ingestron-"));
    const outside = path.join(outsideFolder, "notes.md");
    fs.writeFileSync(outside, "Not in a project.\n");
    await showing(path.join(second, "connections/shop.yaml"), other, "the same project");
    // The rows opened again under new ids still mark the environment chosen.
    await vscode.commands.executeCommand("ingestron.selectEnvironment", second, "prod");
    assert.deepEqual(await selectedIn(), ["prod"]);
    await vscode.commands.executeCommand("ingestron.selectEnvironment", second, "dev");
    assert.deepEqual(await selectedIn(), ["dev"]);
    await vscode.window.showTextDocument(vscode.Uri.file(outside));
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await wait(1000);
    assert.deepEqual(await items(), after, "rows kept their ids and states");

    // Back to the first project: it opens again and the second folds.
    await showing(flow.uri.fsPath, first, "the first project to open again");
  } finally {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    // The manifest first: deleting a folder does not always report the files inside it.
    fs.rmSync(path.join(second, "project.yaml"), { force: true });
    await wait(500);
    fs.rmSync(second, { recursive: true, force: true });
    if (outsideFolder) fs.rmSync(outsideFolder, { recursive: true, force: true });
  }
  await until(
    async () =>
      (await vscode.commands.executeCommand("ingestron.projectRows"))[0]?.label === "Environments",
    "the Project view to list one project again",
  );
  await vscode.window.showTextDocument(flow);
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
 * With prod selected for the project, Apply run from a dev preview still
 * applies every environment together: one bundle with a target for each.
 */
async function previewEnvironment(folder, source, devPreview) {
  await vscode.window.showTextDocument(source);
  await choosing("prod", () => vscode.commands.executeCommand("ingestron.selectEnvironment"));
  const bundle = path.join(folder, "build/databricks/databricks.yml");
  fs.rmSync(bundle);
  await vscode.window.showTextDocument(devPreview);
  await vscode.commands.executeCommand("ingestron.apply");
  await until(() => fs.existsSync(bundle), "Apply from the dev preview to write the bundle");
  const targets = fs.readFileSync(bundle, "utf8").split("\ntargets:\n")[1] ?? "";
  assert.deepEqual(targets.match(/^ {2}\w+(?=:$)/gm), ["  dev", "  prod"], "the bundle's targets");
  assert.equal(fs.existsSync(path.join(folder, "build/dev")), false, "build/dev was written");
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
  const old = "      with: { except_columns: [op] }";
  const at = document.getText().indexOf(old);
  assert.ok(at >= 0, `the retail starter's flow no longer has "${old.trim()}"`);
  await editor.edit((edit) =>
    edit.replace(
      new vscode.Range(document.positionAt(at), document.positionAt(at + old.length)),
      "      with: { properties: { a: b }, except_columns: [op] }",
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

/**
 * Request source metadata opens the request for the one connection. Import source metadata…
 * reads a sample saved outside sources/, asks for its table once, and writes sources/shop.yaml
 * and project.yaml's import line: both saved when project.yaml had no unsaved changes, and
 * only sources/shop.yaml when it had (its own typing stays unsaved).
 */
async function sourceMetadata(folder) {
  await vscode.commands.executeCommand("ingestron.requestSourceMetadata");
  await until(
    () =>
      vscode.window.activeTextEditor?.document
        .getText()
        .startsWith("# Source request: retail (dev)"),
    "the source request",
  );
  await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");

  const sample = path.join(folder, "returns.csv");
  const manifest = path.join(folder, "project.yaml");
  const written = path.join(folder, "sources", "shop.yaml");
  const kept = fs.readFileSync(manifest, "utf8");
  fs.writeFileSync(sample, "id,amount,sold_at\n1,12.5,2026-10-01T09:00:00Z\n");
  const dirty = () =>
    vscode.workspace.textDocuments.filter((item) => item.isDirty).map((item) => item.uri.fsPath);
  const restore = async () => {
    fs.rmSync(path.join(folder, "sources"), { recursive: true, force: true });
    fs.writeFileSync(manifest, kept);
    await until(
      () =>
        vscode.workspace.textDocuments.every(
          (item) => item.uri.fsPath !== manifest || (!item.isDirty && item.getText() === kept),
        ),
      "project.yaml to be as it was",
    );
  };

  // A file clicked in the Explorer is the sample: no open dialog. project.yaml is clean.
  const asked = await importing(async () => [], sample, vscode.Uri.file(sample));
  assert.equal(asked.length, 1, "the table is asked for once");
  await until(() => fs.existsSync(written), "the source metadata");
  assert.match(fs.readFileSync(written, "utf8"), /kind: SourceMetadata/);
  assert.match(fs.readFileSync(written, "utf8"), /object: returns/);
  assert.match(fs.readFileSync(manifest, "utf8"), /- sources\/shop\.yaml/);
  assert.deepEqual(dirty(), [], "the import saved what it wrote");
  await restore();

  // From the project's folder the dialog picks it. project.yaml has typing that is not saved.
  const editor = await vscode.window.showTextDocument(vscode.Uri.file(manifest));
  await editor.edit((edit) => edit.insert(new vscode.Position(0, 0), "# typed, not saved\n"));
  await importing(async () => [vscode.Uri.file(sample)], sample, vscode.Uri.file(folder));
  await until(() => fs.existsSync(written), "the source metadata, with project.yaml open");
  const text = editor.document.getText();
  assert.match(text, /^# typed, not saved\n/, "the typing stays");
  assert.match(text, /- sources\/shop\.yaml/, "the import line is in the open text");
  assert.equal(editor.document.isDirty, true, "project.yaml is left unsaved");
  assert.equal(fs.readFileSync(manifest, "utf8"), kept, "nothing of it reached the disk");
  assert.deepEqual(dirty(), [manifest], "only project.yaml is unsaved");
  await vscode.commands.executeCommand("workbench.action.files.revert");
  await restore();
  fs.rmSync(sample);
}

/**
 * A file saved under sources/ is imported straight away, once: sources/shop.yaml is written and
 * saved, project.yaml gains its import line, a notice says what changed and the problems follow.
 * The import's own writes start nothing; a refused file writes nothing and warns; a Parquet file
 * is read as bytes; the nearest of two nested projects takes a file; project.yaml's unsaved
 * typing survives.
 */
async function sourceWatching(folder) {
  const manifest = path.join(folder, "project.yaml");
  const written = path.join(folder, "sources", "shop.yaml");
  const kept = fs.readFileSync(manifest, "utf8");
  const dirty = () =>
    vscode.workspace.textDocuments.filter((item) => item.isDirty).map((item) => item.uri.fsPath);
  const notices = captureNotices();
  const put = (file, contents) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };
  const reset = async () => {
    fs.rmSync(path.join(folder, "sources"), { recursive: true, force: true });
    fs.writeFileSync(manifest, kept);
    await until(
      () =>
        vscode.workspace.textDocuments.every(
          (item) => item.uri.fsPath !== manifest || (!item.isDirty && item.getText() === kept),
        ),
      "project.yaml to be as it was",
    );
    notices.clear();
  };
  const columns = path.join(folder, "sources", "shop", "orders.csv");
  const before = vscode.languages
    .getDiagnostics()
    .flatMap(([, items]) => items.map(codeOf))
    .filter((code) => code.startsWith("SOURCE_"));
  assert.deepEqual(before, [], "no source problem before the import");
  try {
    // One save as an editor makes it: a create, then a change. One import, one notice.
    put(
      columns,
      "id,customer_id,ordered_at,updated_at\n1,7,2026-10-01T09:00:00Z,2026-10-01T09:00:00Z\n",
    );
    await wait(100);
    fs.appendFileSync(columns, "2,8,2026-10-02T09:00:00Z,2026-10-02T09:00:00Z\n");
    await until(() => notices.info.length > 0, "the notice");
    assert.ok(saved(written), "the source metadata of the saved file");
    assert.match(fs.readFileSync(written, "utf8"), /kind: SourceMetadata/);
    assert.match(fs.readFileSync(written, "utf8"), /object: orders/);
    assert.match(fs.readFileSync(manifest, "utf8"), /- sources\/shop\.yaml/);
    assert.match(notices.info[0], /sources\/shop\.yaml/);
    await until(
      () =>
        vscode.languages
          .getDiagnostics()
          .some(([, items]) => items.some((item) => codeOf(item).startsWith("SOURCE_"))),
      "the problems to follow the metadata",
    );
    // What the import wrote is not imported in turn, and the second write is not a second import.
    const stamp = fs.statSync(written).mtimeMs;
    await wait(2000);
    assert.equal(notices.info.length, 1, "one notice for one save");
    assert.equal(notices.warnings.length, 0);
    assert.equal(fs.statSync(written).mtimeMs, stamp, "the metadata was written once");
    assert.deepEqual(dirty(), [], "the import saved what it wrote");
    await reset();

    // A Parquet file is bytes, not text.
    put(
      path.join(folder, "sources", "shop", "orders.parquet"),
      fs.readFileSync(path.join(__dirname, "orders.parquet")),
    );
    await until(() => notices.info.length > 0, "the notice of a Parquet file");
    assert.ok(saved(written), "the metadata of a Parquet file");
    assert.match(fs.readFileSync(written, "utf8"), /object: orders/);
    assert.equal(notices.warnings.length, 0, notices.warnings.join("\n"));
    await reset();

    // A file that cannot be read writes nothing: one warning, no document, nothing unsaved.
    put(path.join(folder, "sources", "shop", "empty.csv"), "");
    await until(() => notices.warnings.length > 0, "the warning");
    await wait(1500);
    assert.equal(notices.warnings.length, 1);
    assert.match(notices.warnings[0], /sources\/shop\/empty\.csv: Nothing was imported\./);
    assert.equal(fs.existsSync(written), false);
    assert.equal(fs.readFileSync(manifest, "utf8"), kept);
    assert.deepEqual(dirty(), []);
    await reset();

    // A file over the limit is left alone, with a warning that names it and says what to do.
    const big = path.join(folder, "sources", "shop", "big.csv");
    put(big, Buffer.alloc(50 * 1024 * 1024 + 1, "a"));
    await until(() => notices.warnings.length > 0, "the warning for a large file");
    await wait(1500);
    assert.equal(notices.warnings.length, 1);
    assert.match(notices.warnings[0], /^sources\/shop\/big\.csv is over 50 MB/);
    assert.match(notices.warnings[0], /Import source metadata…/);
    assert.equal(fs.existsSync(written), false);
    assert.deepEqual(dirty(), []);
    await reset();

    await nestedProject(folder, notices, put);
    await withTypingInProject(folder, manifest, kept, written, columns, dirty, put, reset, notices);
  } finally {
    notices.restore();
    fs.rmSync(path.join(folder, "sources"), { recursive: true, force: true });
    fs.rmSync(path.join(folder, "inner"), { recursive: true, force: true });
    fs.writeFileSync(manifest, kept);
  }
}

/** True once the metadata document is on disk with its text (it is created empty, then filled and saved). */
const saved = (file) =>
  fs.existsSync(file) && /kind: SourceMetadata/.test(fs.readFileSync(file, "utf8"));

/** A file under the inner project's sources/ goes to the inner project, not the one around it. */
async function nestedProject(folder, notices, put) {
  const inner = path.join(folder, "inner");
  put(
    path.join(inner, "project.yaml"),
    "id: inner\nname: Inner\nimports:\n  - connections/*.yaml\n",
  );
  put(
    path.join(inner, "connections", "lake.yaml"),
    "apiVersion: ingestron.io/v1\nkind: Connection\nid: lake\nconnector: files\nconnectivity: public\nsettings:\n  path: abfss://landing@lakeaccount.dfs.core.windows.net/lake\n",
  );
  await wait(1000);
  put(path.join(inner, "sources", "lake", "items.csv"), "id,name\n1,Pen\n");
  const document = path.join(inner, "sources", "lake.yaml");
  await until(() => notices.info.length > 0, "the notice of the inner project");
  assert.ok(saved(document), "the inner project's metadata");
  assert.match(fs.readFileSync(path.join(inner, "project.yaml"), "utf8"), /- sources\/lake\.yaml/);
  assert.equal(fs.existsSync(path.join(folder, "sources")), false, "nothing for the outer project");
  fs.rmSync(inner, { recursive: true, force: true });
  notices.clear();
}

/** project.yaml is open with typing that is not saved: the import line joins it and nothing is lost. */
async function withTypingInProject(
  folder,
  manifest,
  kept,
  written,
  columns,
  dirty,
  put,
  reset,
  notices,
) {
  const editor = await vscode.window.showTextDocument(vscode.Uri.file(manifest));
  await editor.edit((edit) => edit.insert(new vscode.Position(0, 0), "# typed, not saved\n"));
  put(columns, "id,customer_id\n1,7\n");
  await until(() => notices.info.length > 0, "the notice, with project.yaml open");
  assert.match(
    editor.document.getText(),
    /- sources\/shop\.yaml/,
    "the import line is in the open text",
  );
  assert.match(editor.document.getText(), /^# typed, not saved\n/, "the typing stays");
  assert.equal(editor.document.isDirty, true, "project.yaml is left unsaved");
  assert.equal(fs.readFileSync(manifest, "utf8"), kept, "nothing of it reached the disk");
  assert.deepEqual(dirty(), [manifest], "only project.yaml is unsaved");
  assert.match(fs.readFileSync(written, "utf8"), /kind: SourceMetadata/);
  await vscode.commands.executeCommand("workbench.action.files.revert");
  await reset();
}

/** Records the notices the extension shows instead of showing them; `restore` puts VS Code's back. */
function captureNotices() {
  const { showInformationMessage, showWarningMessage } = vscode.window;
  const notices = {
    info: [],
    warnings: [],
    clear() {
      notices.info.length = 0;
      notices.warnings.length = 0;
    },
    restore() {
      vscode.window.showInformationMessage = showInformationMessage;
      vscode.window.showWarningMessage = showWarningMessage;
    },
  };
  vscode.window.showInformationMessage = async (message) => void notices.info.push(message);
  vscode.window.showWarningMessage = async (message) => void notices.warnings.push(message);
  return notices;
}

/** Runs Import source metadata… with `dialog` as the open dialog; returns the prompts for the table. */
async function importing(dialog, sample, argument) {
  const opened = vscode.window.showOpenDialog;
  const typed = vscode.window.showInputBox;
  const asked = [];
  vscode.window.showOpenDialog = dialog;
  vscode.window.showInputBox = async (options) => (asked.push(options.prompt), "returns");
  try {
    await vscode.commands.executeCommand("ingestron.importSourceMetadata", argument);
  } finally {
    vscode.window.showOpenDialog = opened;
    vscode.window.showInputBox = typed;
  }
  return asked;
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

/**
 * An unset ${envvar:…} is information, not an error: in a Databricks project
 * the deploying pipeline supplies it, which the information says. Naming it in
 * .env clears it. The connection and .env are restored after.
 */
async function unsetVariable(folder) {
  const connection = vscode.Uri.file(path.join(folder, "connections/shop.yaml"));
  const env = path.join(folder, ".env");
  const kept = fs.readFileSync(connection.fsPath, "utf8");
  fs.writeFileSync(
    connection.fsPath,
    kept.replace(
      "abfss://landing@${values.storage_account}.dfs.core.windows.net/shop",
      "${envvar:INGT_IT_UNSET}/shop",
    ),
  );
  const unset = (item) => codeOf(item) === "ENVVAR_MISSING";
  const found = await until(
    () => vscode.languages.getDiagnostics(connection).find(unset),
    "the ENVVAR_MISSING information",
  );
  assert.equal(found.severity, vscode.DiagnosticSeverity.Information);
  assert.match(
    found.message,
    /^INGT_IT_UNSET is supplied when deploying, as `BUNDLE_VAR_ingt_it_unset` \(databricks\)\. Plan does not read it, so it needs no \.env\.dev entry\.$/,
  );
  const errors = vscode.languages
    .getDiagnostics()
    .flatMap(([, items]) => items)
    .filter((item) => item.severity === vscode.DiagnosticSeverity.Error);
  assert.deepEqual(errors.map(codeOf), []);
  fs.writeFileSync(env, "INGT_IT_UNSET=abfss://landing@retaildev.dfs.core.windows.net\n");
  await until(
    () => !vscode.languages.getDiagnostics(connection).some(unset),
    "the information to clear after .env names the variable",
  );
  fs.rmSync(env);
  fs.writeFileSync(connection.fsPath, kept);
  await until(
    () => vscode.languages.getDiagnostics(connection).length === 0,
    "the connection's problems to clear",
  );
}
