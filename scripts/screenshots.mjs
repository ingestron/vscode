// Screenshots for the docs: the packaged extension in a downloaded VS Code
// (never the user's own), light theme. Every shot is cropped to the same
// width from the editor's left edge and scaled to the same size, so all of
// them show at one scale in the docs. Run `pnpm test:integration` once first
// to download VS Code. `pnpm screenshots <folder>` writes them to <folder>
// (default `.tmp/screenshots`); the docs keep them in `public/images/vscode`.
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(process.argv[2] ?? join(root, ".tmp/screenshots"));
const installs = join(root, ".vscode-test");
const application = join(
  installs,
  readdirSync(installs).find((name) => name.startsWith("vscode-")),
  "Visual Studio Code.app",
);
/** Crop width in CSS pixels and the final width in image pixels: the same for every shot. */
const cropWidth = 900;
const imageWidth = 1600;

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const extensions = mkdtempSync(join(tmpdir(), "ingestron-shots-extensions-"));
execFileSync("node", ["scripts/package.mjs"], { cwd: root, stdio: "inherit" });
execFileSync(
  join(application, "Contents/Resources/app/bin/code"),
  ["--extensions-dir", extensions, "--install-extension", join(root, "ingestron.vsix")],
  { env, stdio: "inherit" },
);
mkdirSync(out, { recursive: true });

const settings = {
  "workbench.colorTheme": "Default Light Modern",
  "editor.fontSize": 13,
  "editor.minimap.enabled": false,
  "editor.autoIndent": "none",
  "editor.autoClosingBrackets": "never",
  "editor.hover.delay": 100,
  "breadcrumbs.enabled": false,
  "chat.disableAIFeatures": true,
  "window.commandCenter": false,
  "workbench.layoutControl.enabled": false,
  "workbench.tips.enabled": false,
  "workbench.startupEditor": "none",
  "workbench.editor.enablePreview": false,
  "telemetry.telemetryLevel": "off",
  "update.mode": "none",
  "security.workspace.trust.enabled": false,
  "workbench.secondarySideBar.defaultVisibility": "hidden",
  "window.title": "${activeEditorShort} — ${rootName}",
};

/** Opens a copy of an example in VS Code and returns helpers to drive it. */
async function session(example, name, { withoutBuild = false, theme } = {}) {
  const workspace = join(mkdtempSync(join(tmpdir(), "ingestron-shots-")), name);
  cpSync(join(root, "node_modules/@ingestron/cli/project-templates", example), workspace, {
    recursive: true,
  });
  if (withoutBuild) rmSync(join(workspace, "build"), { recursive: true, force: true });
  const profile = mkdtempSync(join(tmpdir(), "ingestron-shots-profile-"));
  mkdirSync(join(profile, "User"), { recursive: true });
  const themed = theme ? { ...settings, "workbench.colorTheme": theme } : settings;
  writeFileSync(join(profile, "User/settings.json"), JSON.stringify(themed));
  const vscode = await electron.launch({
    executablePath: join(application, "Contents/MacOS/Code"),
    args: [
      workspace,
      `--extensions-dir=${extensions}`,
      `--user-data-dir=${profile}`,
      "--skip-welcome",
      "--skip-release-notes",
    ],
    env,
  });
  const window = await vscode.firstWindow();
  await vscode.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1280, 760),
  );
  const pause = (ms) => window.waitForTimeout(ms);
  const keys = async (...sequence) => {
    for (const key of sequence) await window.keyboard.press(key);
  };
  const type = (text) => window.keyboard.type(text, { delay: 15 });
  const palette = async (command) => {
    await keys("Meta+Shift+P");
    await pause(300);
    await type(command);
    await pause(400);
    await keys("Enter");
  };
  const open = async (file) => {
    // Quick Open from the editor: focus may be in a panel or the Reference tab.
    await palette("View: Focus Active Editor Group");
    await pause(300);
    await keys("Meta+P");
    await pause(300);
    await type(file);
    await pause(500);
    await keys("Enter");
    await pause(800);
  };
  const lineOf = (file, text) =>
    readFileSync(join(workspace, file), "utf8")
      .split("\n")
      .findIndex((line) => line.includes(text)) + 1;
  const goto = async (line, column) => {
    await keys("Control+G");
    await pause(200);
    await type(`${line}:${column}`);
    await keys("Enter");
    await pause(300);
  };
  // The empty secondary side bar (where chat would be) can open on its own.
  const hideSideBar = async () => {
    const width = await window.evaluate(
      () => document.querySelector(".part.auxiliarybar")?.getBoundingClientRect().width ?? 0,
    );
    if (width > 0) await keys("Alt+Meta+B");
  };
  /**
   * cropWidth wide from the editor's left edge (or the popup's, if further
   * left); from the top of the editor, or of `focus` with `fromFocus`; to
   * just below `focus`.
   */
  const shot = async (file, focus, { fromFocus = false, right = false, folder = out } = {}) => {
    await pause(1200);
    if (!right) await hideSideBar();
    await pause(400);
    const clip = await window.evaluate(
      ({ selector, width, fromFocus, right }) => {
        const editor = document.querySelector(".part.editor").getBoundingClientRect();
        if (right) {
          const x = Math.max(0, window.innerWidth - width);
          return { x, y: editor.top, width: window.innerWidth - x, height: editor.height };
        }
        const shown = [...document.querySelectorAll(selector)]
          .map((item) => item.getBoundingClientRect())
          .filter((box) => box.width > 0 && box.height > 0);
        const focusTop = Math.min(...shown.map((box) => box.top - 8));
        const top = Math.max(0, fromFocus ? focusTop : Math.min(editor.top, focusTop));
        const left = Math.max(0, Math.min(editor.left, ...shown.map((box) => box.left - 8)));
        const bottom = Math.min(
          window.innerHeight,
          Math.max(top + 200, ...shown.map((box) => box.bottom + 8)),
        );
        return {
          x: left,
          y: top,
          width: Math.min(width, window.innerWidth - left),
          height: bottom - top,
        };
      },
      { selector: focus, width: cropWidth, fromFocus, right },
    );
    const path = join(folder, `${file}.png`);
    await window.screenshot({ path, clip });
    execFileSync("sips", ["--resampleWidth", String(imageWidth), path], { stdio: "ignore" });
    console.log(`✓ ${file}.png`);
  };
  await pause(4000);
  return { vscode, window, keys, type, palette, open, lineOf, goto, shot, pause, workspace };
}

/** The Reference tab beside the editor, with the cursor on a setting's value. */
async function referenceShot(theme, folder, file) {
  const { vscode, window, palette, open, lineOf, goto, shot, type, keys, pause, workspace } =
    await session("private-sql-server", "erp", {
      theme,
    });
  await open("standard.yaml");
  await goto(lineOf("standard.yaml", "mode: incremental"), 15);
  await palette("Ingestron: Show reference");
  await shot(file, ".part.auxiliarybar", { right: true, folder });
  // A problem on the line comes first, with its meaning and quick fixes.
  if (folder !== out) {
    await open("platform.yaml");
    await goto(lineOf("platform.yaml", "adf-copy:"), 6);
    await shot(`${file}-method`, ".part.auxiliarybar", { right: true, folder });
    // A link in the tab opens its entry in the tab, with Back and Open in browser.
    // The tab's page is the webview's inner frame.
    const panel = window.frames().find((frame) => frame.url().includes("/fake.html"));
    await panel.locator("a", { hasText: "landing" }).first().click();
    await pause(800);
    await shot(`${file}-browse`, ".part.auxiliarybar", { right: true, folder });
    await open("contracts/invoices.yaml");
    await goto(lineOf("contracts/invoices.yaml", "logicalType: integer"), 34);
    await shot(`${file}-contract`, ".part.auxiliarybar", { right: true, folder });
    // A new quality rule under a contract column: ready-made rules and the rule's fields.
    const customers = join(workspace, "contracts/customers.yaml");
    writeFileSync(
      customers,
      readFileSync(customers, "utf8").replace(
        "{ name: country, logicalType: string }",
        "name: country\n        logicalType: string\n        physicalName: ctry\n        unique: true\n        quality:\n          - { name: not-null, metric: nullValues, mustBe: 0,  }",
      ),
    );
    await pause(1000);
    await open("contracts/customers.yaml");
    await goto(lineOf("contracts/customers.yaml", "quality:") + 1, 55);
    await keys("Control+Space");
    await shot(`${file}-quality`, ".part.auxiliarybar, .suggest-widget", { right: true, folder });
    await keys("Escape");
    // A field that needs a capability the platform has off: how to turn it on.
    await goto(lineOf("contracts/customers.yaml", "unique: true"), 12);
    await shot(`${file}-capability`, ".part.auxiliarybar", { right: true, folder });
    await open("flows/erp.yaml");
    await goto(lineOf("flows/erp.yaml", "source: erp"), 12);
    await type("x");
    await shot(`${file}-problem`, ".part.auxiliarybar", { right: true, folder });
  }
  await vscode.close();
}

// Features, on the retail example.
{
  const { vscode, keys, type, palette, open, lineOf, goto, shot, pause, workspace } = await session(
    "retail",
    "retail",
  );
  const flow = "flows/shop.yaml";
  // What each line resolves to: a variable's value, a table's name and methods, its generated files.
  await open("connections/shop.yaml");
  await pause(1500);
  await shot("annotations-variable", ".part.editor .monaco-editor", { folder: tmpdir() });
  await open(flow);
  await pause(1500);
  await shot("annotations", ".part.editor .monaco-editor");
  await goto(lineOf(flow, "  orders:"), 4);
  await palette("Show or Focus Hover");
  await shot("hover", ".monaco-hover");
  await keys("Escape");

  await goto(lineOf(flow, "contract: shop.customers"), 30);
  // Each new line keeps the previous line's indentation.
  await keys("End", "Enter");
  await type("store:");
  await keys("Enter");
  await type("  with:");
  await keys("Enter");
  await type("  ");
  await keys("Control+Space");
  await shot("completion", ".suggest-widget");
  await keys("Escape");
  await palette("File: Revert File");
  await pause(500);

  await goto(lineOf(flow, "  orders:"), 4);
  await palette("Ingestron: Show generated files");
  await shot("preview", ".part.editor .view-lines");
  await keys("Meta+W");

  await goto(lineOf(flow, "source: shop"), 9);
  await keys("Shift+End");
  await type("shops");
  await pause(1500);
  await keys("Meta+.");
  await shot("quick-fix", ".action-widget");
  await keys("Escape");
  await palette("View: Focus Problems");
  await shot("problems", ".part.panel");
  await palette("File: Revert File");

  // A mapping's value straight after its colon: the pack's defaults, or a new line for its fields.
  await open("standard.yaml");
  await keys("Meta+ArrowDown");
  await type("types:");
  await keys("Control+Space");
  await pause(800);
  await shot("value-defaults", ".part.editor", { folder: tmpdir() });
  await keys("Escape");
  await palette("File: Revert File");
  // The Get started walkthrough, its first steps ticked by the example's files.
  await palette("Welcome: Open Walkthrough...");
  await type("Get started with Ingestron");
  await keys("Enter");
  await pause(4000);
  await shot("walkthrough", ".part.editor", { folder: tmpdir() });
  await keys("Meta+W");
  await palette("Ingestron: Select environment");
  await shot("environment", ".quick-input-widget");
  await keys("Escape");

  // A new flow file: the skeleton, then Tab to the source's choices.
  writeFileSync(join(workspace, "flows/web.yaml"), "");
  await pause(1000);
  await open("flows/web.yaml");
  await keys("Control+Space");
  await pause(800);
  await keys("Enter");
  await pause(300);
  await keys("Tab");
  await shot("new-file", ".part.editor .view-lines, .suggest-widget");
  await vscode.close();
}

// The first tutorial's project, shop, with nothing generated yet.
{
  const { vscode, keys, type, palette, open, lineOf, goto, shot } = await session(
    "minimal",
    "shop",
    {
      withoutBuild: true,
    },
  );
  await open("flows/orders.yaml");
  await palette("Ingestron: New project");
  await shot("new-project", ".quick-input-widget");
  await keys("Escape");

  await palette("Ingestron: Plan");
  await shot("plan", ".part.panel", { fromFocus: true });
  await palette("Ingestron: Apply");
  await shot("apply", ".part.panel", { fromFocus: true });
  await palette("Ingestron: Check");
  await shot("check", ".part.panel", { fromFocus: true });

  // Auto-apply: on, then a setting added to the table and saved.
  await palette("Ingestron: Turn auto-apply on or off");
  const flow = "flows/orders.yaml";
  await open(flow);
  await goto(lineOf(flow, "  orders:"), 1);
  await keys("Shift+End");
  await type(
    "  orders: { object: orders, contract: shop.orders, ingest: { with: { format: csv } } }",
  );
  await keys("Escape", "Meta+S");
  // Without the Explorer, the panel and the status bar fit in one shot.
  await keys("Meta+B");
  await shot("auto-apply", ".part.panel, [aria-label*='Auto-apply']", { fromFocus: true });
  await keys("Meta+B");
  await vscode.close();
}

// The Reference tab, light for the docs and dark to check it reads in both.
await referenceShot(undefined, out, "reference");
await referenceShot("Default Dark Modern", tmpdir(), "reference-dark");
console.log(`  (dark: ${join(tmpdir(), "reference-dark.png")})`);
