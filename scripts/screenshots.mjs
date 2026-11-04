// Screenshots for the docs: the packaged extension in a downloaded VS Code
// (never the user's own). Run `pnpm test:integration` once first to download
// VS Code. `pnpm screenshots <folder>` writes them to <folder> (default
// `.tmp/screenshots`); the docs keep them in `public/images/vscode`.
//
// Every shot is captured twice, in Default Light Modern and Default Dark
// Modern, as `<name>-light.png` and `<name>-dark.png`. The editor font is 15
// and every crop is exactly `width` CSS pixels wide at device scale 2, so
// every image is 1600 pixels wide and its text shows at about body size on
// the page. The window has no activity bar or status bar unless a shot is
// about them. A crop takes whole parts of the window (editor, side bars,
// panel) side by side and ends on a line, row or widget boundary; `frame`
// refuses to save a crop that cuts a line, a popup or a tab. The docs add the
// window bar, the radius and the shadow in the page
// (`components/screenshot.tsx`), not here.
//
// `--only=<name>,<name>` captures only those shots, `--theme=light` or
// `--theme=dark` only that theme, and `--keep` saves a refused crop as
// `<name>-<theme>.rejected.png` instead of stopping.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const installs = join(root, ".vscode-test");
const application = join(
  installs,
  readdirSync(installs).find((name) => name.startsWith("vscode-")),
  "Visual Studio Code.app",
);
const cli = join(root, "node_modules/@ingestron/cli/dist/main.js");
/** Every crop's width in CSS pixels, at device scale 2: 1600 image pixels. */
const width = 800;
const scale = 2;
/** VS Code insets its parts 4 pixels from each side of the window. */
const inset = 4;
const themes = { light: "Default Light Modern", dark: "Default Dark Modern" };

const option = (name) =>
  process.argv
    .slice(2)
    .find((argument) => argument.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
const only = option("only") ? new Set(option("only").split(",")) : undefined;
const themeNames = option("theme") ? [option("theme")] : Object.keys(themes);
const folderArgument = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const out = resolve(folderArgument ?? join(root, ".tmp/screenshots"));
const wanted = (name) => !only || only.has(name);
/** `--keep` saves a refused crop as `<name>-<theme>.rejected.png`, to see why, and goes on. */
const keep = process.argv.includes("--keep");

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
  "editor.fontSize": 15,
  "editor.minimap.enabled": false,
  "editor.autoIndent": "none",
  "editor.autoClosingBrackets": "never",
  "editor.hover.delay": 100,
  "editor.hover.above": false,
  "editor.scrollbar.vertical": "hidden",
  "editor.scrollbar.verticalScrollbarSize": 0,
  "editor.overviewRulerLanes": 0,
  "editor.hideCursorInOverviewRuler": true,
  "editor.renderLineHighlight": "none",
  "editor.showFoldingControls": "never",
  "editor.foldingHighlight": false,
  "breadcrumbs.enabled": false,
  "chat.disableAIFeatures": true,
  "explorer.compactFolders": false,
  "extensions.ignoreRecommendations": true,
  "window.commandCenter": false,
  "window.menuStyle": "custom",
  "workbench.activityBar.location": "hidden",
  "workbench.statusBar.visible": false,
  "workbench.layoutControl.enabled": false,
  "workbench.tips.enabled": false,
  "workbench.startupEditor": "none",
  "workbench.editor.enablePreview": false,
  "workbench.secondarySideBar.defaultVisibility": "hidden",
  "telemetry.telemetryLevel": "off",
  "update.mode": "none",
  "security.workspace.trust.enabled": false,
  "window.title": "${activeEditorShort} — ${rootName}",
};

/**
 * Creates projects from starters with `ingestron init`, as a reader would,
 * opens them in VS Code and returns helpers to drive it. `projects` is a list
 * of [starter, folder]; with one, the folder is the workspace, and with
 * several, the workspace is a folder named `projects` that holds them.
 */
async function session(
  theme,
  projects,
  { extraSettings = {}, size = [width + 2 * inset, 860] } = {},
) {
  const parent = join(mkdtempSync(join(tmpdir(), "ingestron-shots-")), "projects");
  mkdirSync(parent);
  for (const [starter, folder] of projects) {
    execFileSync("node", [cli, "init", folder, "--template", starter, "--yes"], {
      cwd: parent,
      stdio: "ignore",
    });
  }
  const workspace = projects.length === 1 ? join(parent, projects[0][1]) : parent;
  const profile = mkdtempSync(join(tmpdir(), "ingestron-shots-profile-"));
  mkdirSync(join(profile, "User"), { recursive: true });
  const userSettings = { ...settings, "workbench.colorTheme": themes[theme], ...extraSettings };
  const settingsFile = join(profile, "User/settings.json");
  writeFileSync(settingsFile, JSON.stringify(userSettings));
  const vscode = await electron.launch({
    executablePath: join(application, "Contents/MacOS/Code"),
    args: [
      workspace,
      `--extensions-dir=${extensions}`,
      `--user-data-dir=${profile}`,
      "--skip-welcome",
      "--skip-release-notes",
      `--force-device-scale-factor=${scale}`,
    ],
    env,
  });
  const window = await vscode.firstWindow();
  const pause = (ms) => window.waitForTimeout(ms);
  /** Sets the window's content to `size` CSS pixels; it can come out a few short, so ask again. */
  const resize = async ([wantedWidth, wantedHeight]) => {
    await vscode.evaluate(
      ({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h),
      [wantedWidth, wantedHeight],
    );
    for (let attempt = 0; attempt < 3; attempt++) {
      await pause(300);
      const [got, gotHeight] = await window.evaluate(() => [innerWidth, innerHeight]);
      if (got === wantedWidth && gotHeight === wantedHeight) break;
      await vscode.evaluate(
        ({ BrowserWindow }, [w, h]) => {
          const win = BrowserWindow.getAllWindows()[0];
          const [cw, ch] = win.getContentSize();
          win.setContentSize(cw + w, ch + h);
        },
        [wantedWidth - got, wantedHeight - gotHeight],
      );
    }
  };
  await resize(size);
  /** Changes a user setting while VS Code runs: it reads the file again. */
  const setting = async (key, value) => {
    userSettings[key] = value;
    writeFileSync(settingsFile, JSON.stringify(userSettings));
    await pause(1200);
  };
  const keys = async (...sequence) => {
    for (const key of sequence) await window.keyboard.press(key);
  };
  const type = (text) => window.keyboard.type(text, { delay: 15 });
  const palette = async (command) => {
    await keys("Meta+Shift+P");
    await pause(300);
    await type(command);
    await pause(500);
    await keys("Enter");
    await pause(300);
  };
  /** Opens a file alone in the editor, so no other tab shows; `alone: false` keeps the others. */
  const open = async (file, { alone = true } = {}) => {
    // Quick Open from the editor: focus may be in a panel or a side bar.
    await palette("View: Focus Active Editor Group");
    await pause(300);
    if (alone) {
      await palette("View: Close All Editors");
      await pause(300);
    }
    await keys("Meta+P");
    await pause(300);
    await type(file);
    await pause(600);
    await keys("Enter");
    await pause(1000);
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
  const parts = {
    sidebar: [".part.sidebar", "Meta+B"],
    auxiliarybar: [".part.auxiliarybar", "Alt+Meta+B"],
    panel: [".part.panel", "Meta+J"],
  };
  const shown = (selector) =>
    window.evaluate((s) => {
      const box = document.querySelector(s)?.getBoundingClientRect();
      return box !== undefined && box.width > 0 && box.height > 0;
    }, selector);
  /** Shows or hides a side bar or the panel. */
  const show = async (part, visible = true) => {
    const [selector, key] = parts[part];
    if ((await shown(selector)) !== visible) await keys(key);
    await pause(500);
  };
  /**
   * Drags the sash on a part's edge (`right` of the side bar, `left` of the
   * secondary side bar, `top` of the panel) to `to`, a CSS pixel offset.
   */
  const drag = async (part, edge, to) => {
    const point = await window.evaluate(
      ({ selector, edge }) => {
        const box = document.querySelector(selector).getBoundingClientRect();
        const vertical = edge !== "top";
        const at = box[edge];
        const sash = [
          ...document.querySelectorAll(`.monaco-sash.${vertical ? "vertical" : "horizontal"}`),
        ]
          .map((item) => item.getBoundingClientRect())
          .filter((s) => s.width > 0 && s.height > 0)
          .map((s) => ({ x: s.left + s.width / 2, y: s.top + s.height / 2, s }))
          .filter(({ x, y, s }) =>
            vertical
              ? Math.abs(x - at) < 6 && s.top <= box.top + 20 && s.bottom >= box.top + 20
              : Math.abs(y - at) < 6 && s.left <= box.left + 20 && s.right >= box.left + 20,
          )[0];
        if (!sash)
          return {
            missing: JSON.stringify({
              box,
              sashes: [...document.querySelectorAll(".monaco-sash")]
                .map((item) => item.getBoundingClientRect())
                .filter((s) => s.width > 0)
                .map((s) => [s.left, s.top, s.width, s.height].map(Math.round)),
            }),
          };
        return vertical
          ? { x: sash.x, y: Math.max(box.top + 40, sash.s.top + 40) }
          : { x: Math.max(box.left + 40, sash.s.left + 40), y: sash.y };
      },
      { selector: parts[part][0], edge },
    );
    if (point.missing) throw new Error(`no sash on the ${edge} of the ${part}: ${point.missing}`);
    await window.mouse.move(point.x, point.y);
    await window.mouse.down();
    const target = edge === "top" ? { x: point.x, y: to } : { x: to, y: point.y };
    await window.mouse.move(target.x, target.y, { steps: 8 });
    await window.mouse.up();
    await pause(500);
  };
  /**
   * Makes the open hover taller by dragging its bottom edge, as a reader can:
   * VS Code first shows at most a quarter of the editor's height, or 250 pixels.
   */
  const growHover = async (by) => {
    const edge = await window.evaluate(() => {
      const hover = [...document.querySelectorAll(".monaco-resizable-hover, .monaco-hover")]
        .map((item) => item.getBoundingClientRect())
        .find((box) => box.width > 0 && box.height > 0);
      return hover && { x: hover.left + hover.width / 2, top: hover.top, bottom: hover.bottom };
    });
    if (!edge) throw new Error("no hover to make taller");
    // Into the hover first, so it stays, then onto its bottom edge.
    await window.mouse.move(edge.x, edge.top + 20, { steps: 4 });
    await window.mouse.move(edge.x, edge.bottom - 1, { steps: 4 });
    await pause(300);
    await window.mouse.down();
    await window.mouse.move(edge.x, edge.bottom + by, { steps: 10 });
    await window.mouse.up();
    await pause(600);
  };
  /** Clicks a view's section header, such as the Reference section, to fold or open it. */
  const fold = async (part, title, open) => {
    const header = window
      .locator(`${parts[part][0]} .pane-header`)
      .filter({ has: window.locator(".title", { hasText: new RegExp(`^${title}$`, "i") }) })
      .first();
    const expanded = (await header.getAttribute("aria-expanded")) === "true";
    if (expanded !== open) await header.click();
    await pause(600);
  };

  /**
   * Saves one shot: every part of the window that is showing (editor, side
   * bars, panel, status bar), or those in `include`, side by side and
   * `width` wide. The crop starts at the parts' top and ends at the lowest
   * of: the last line or row with text, each widget in `focus`, and, with
   * `until`, the line holding that text; then on the next line or row edge,
   * so nothing is cut. `below` adds a bottom edge measured outside, such as
   * a webview's content. Refuses to save a crop that cuts a line, a row, a
   * widget or a tab.
   */
  const frame = async (
    name,
    { focus = "", include, until, below = 0, allowScroll = false, keepMouse = false } = {},
  ) => {
    // A shot left out still waits, so the steps after it see the same state.
    if (!wanted(name)) return pause(1500);
    // The mouse rests on the title bar, outside the crop, so it hovers nothing.
    if (!keepMouse) await window.mouse.move(width / 2, 8);
    await pause(1500);
    const result = await window.evaluate(
      ({ focus, include, until, below, inset }) => {
        const rect = (item) => item.getBoundingClientRect();
        const showing = (item) => {
          const box = rect(item);
          return box.width > 0 && box.height > 0;
        };
        const partNames = include ?? ["editor", "sidebar", "auxiliarybar", "panel", "statusbar"];
        const partItems = partNames
          .map((part) => document.querySelector(`.part.${part}`))
          .filter((item) => item && showing(item));
        const boxes = partItems.map(rect);
        // The status bar runs the window's full width; the crop keeps the parts' inset.
        const left = Math.max(inset, Math.min(...boxes.map((box) => box.left)));
        const right = Math.min(innerWidth - inset, Math.max(...boxes.map((box) => box.right)));
        const top = Math.min(...boxes.map((box) => box.top));
        const partsBottom = Math.max(...boxes.map((box) => box.bottom));
        const inParts = (item) => partItems.some((part) => part.contains(item));
        const widgets = focus
          ? [...document.querySelectorAll(focus)].filter(showing).map(rect)
          : [];
        // Each line of an editor, with the editor's visible area.
        const lines = [...document.querySelectorAll(".monaco-editor .view-line")]
          .filter((line) => inParts(line) && showing(line))
          .map((line) => {
            const guard = rect(line.closest(".overflow-guard"));
            const box = rect(line);
            const text = (line.textContent ?? "").replace(/ /g, " ").trim();
            const span = line.firstElementChild ? rect(line.firstElementChild) : box;
            return { box, guard, text, textRight: span.right };
          })
          .filter(({ box, guard }) => box.bottom > guard.top && box.top < guard.bottom);
        const rows = [
          ...document.querySelectorAll(
            ".monaco-list-row, .pane-header, .statusbar-item, .tabs-container .tab, .composite.title",
          ),
        ]
          .filter((row) => inParts(row) && showing(row))
          .map(rect)
          .filter((box) => box.bottom <= partsBottom + 1);
        const problems = [];
        for (const { box, guard, text, textRight } of lines) {
          if (text === "") continue;
          if (box.top < guard.top - 1 || box.bottom > guard.bottom + 1)
            problems.push(`the line "${text.slice(0, 40)}" is cut by its editor's edge`);
          if (textRight > guard.right + 1)
            problems.push(`the line "${text.slice(0, 40)}" runs past its editor's right edge`);
        }
        let target = Math.max(
          below,
          ...lines.filter(({ text }) => text !== "").map(({ box }) => box.bottom),
          ...rows.map((box) => box.bottom),
          ...widgets.map((box) => box.bottom + 4),
        );
        if (until) {
          const line = lines.find(({ text }) => text.includes(until));
          if (!line) problems.push(`no line holds "${until}"`);
          else target = Math.max(line.box.bottom, ...widgets.map((box) => box.bottom + 4));
          // A wrapped line goes on until the next line number.
          const numbers = [...document.querySelectorAll(".part.editor .line-numbers")]
            .filter(showing)
            .map(rect)
            .filter((box) => box.top >= (line?.box.top ?? 0) + 1)
            .sort((a, b) => a.top - b.top);
          if (line && numbers.length > 0)
            target = Math.max(numbers[0].top, ...widgets.map((box) => box.bottom + 4));
        }
        // End on the next line edge at or below the target; past the last line
        // there is only empty part, where a margin cuts nothing.
        const edges = lines
          .map(({ box }) => box.bottom)
          .filter((edge) => edge >= target - 0.5)
          .sort((a, b) => a - b);
        let bottom = Math.min(
          partsBottom,
          until ? target : edges.length > 0 && edges[0] - target < 40 ? edges[0] : target + 12,
        );
        // Nothing may straddle the bottom edge: a line, a row, a widget or a tab.
        const straddles = [
          ...lines.filter(({ text }) => text !== "").map(({ box }) => box),
          ...rows,
          ...widgets,
        ];
        for (let pass = 0; pass < 5; pass++) {
          const cut = straddles.find((box) => box.top < bottom - 1 && box.bottom > bottom + 1);
          if (!cut) break;
          if (until) problems.push(`the crop at "${until}" cuts something below`);
          bottom = Math.min(partsBottom, cut.bottom);
        }
        if (widgets.some((box) => box.left < left - 0.5 || box.right > right + 0.5))
          problems.push("a widget is cut by the left or right edge");
        if (widgets.some((box) => box.bottom > partsBottom + 0.5))
          problems.push("a widget runs below the window");
        const scrolled = [
          ...document.querySelectorAll(
            ".monaco-hover *, .suggest-widget .monaco-list, .monaco-menu",
          ),
        ]
          .filter((box) => box.scrollHeight > box.clientHeight + 1 && box.clientHeight > 0)
          .map((box) => `${box.className}`);
        // A list in a popup (a picker, completion, a menu) that holds more rows than it shows.
        for (const list of document.querySelectorAll(
          ".quick-input-widget .monaco-list, .suggest-widget .monaco-list, .action-widget .monaco-list",
        )) {
          const rows = list.querySelector(".monaco-list-rows");
          if (showing(list) && rows && rows.scrollHeight > list.clientHeight + 1)
            scrolled.push("a list that scrolls");
        }
        if (scrolled.length > 0) problems.push(`a popup has content below its edge: ${scrolled}`);
        const editor = document.querySelector(".part.editor .lines-content");
        const guard = document.querySelector(".part.editor .overflow-guard");
        const moved = editor && guard && rect(editor).top < rect(guard).top - 1;
        return {
          box: {
            x: Math.round(left),
            y: Math.round(top),
            width: Math.round(right - left),
            height: Math.round(bottom) - Math.round(top),
          },
          problems,
          moved,
        };
      },
      { focus, include, until, below, inset },
    );
    const { box, problems } = result;
    if (box.width !== width) problems.push(`the crop is ${box.width} px wide, not ${width}`);
    if (result.moved && !allowScroll) problems.push("the editor has scrolled");
    if (problems.length > 0 && !keep) throw new Error(`${name}-${theme}: ${problems.join("; ")}`);
    const path = join(out, `${name}-${theme}${problems.length > 0 ? ".rejected" : ""}.png`);
    if (problems.length > 0) console.log(`✗ ${name}-${theme}: ${problems.join("; ")}`);
    await window.screenshot({ path, clip: box });
    const image = readFileSync(path);
    if (image.readUInt32BE(16) !== width * scale)
      throw new Error(`${name}-${theme}: the image is ${image.readUInt32BE(16)} px wide`);
    console.log(`✓ ${name}-${theme}.png (${box.width} x ${box.height} CSS px)`);
  };
  await pause(4000);
  return {
    vscode,
    window,
    keys,
    type,
    palette,
    open,
    lineOf,
    goto,
    show,
    drag,
    fold,
    growHover,
    setting,
    frame,
    resize,
    pause,
    workspace,
  };
}

/** The webview's content bottom in the window, for a crop that ends below it. */
async function webviewBottom(window, part) {
  const frame = window.frames().find((item) => item.url().includes("/fake.html"));
  if (!frame) return 0;
  const content = await frame.evaluate(() =>
    Math.max(
      ...[...document.body.querySelectorAll("*")].map(
        (item) => item.getBoundingClientRect().bottom,
      ),
    ),
  );
  const top = await window.evaluate(
    (selector) =>
      document.querySelector(`${selector} iframe.webview`)?.getBoundingClientRect().top ?? 0,
    `.part.${part}`,
  );
  return top + content + 12;
}

/** The retail flow, shortened so every line is narrower than the window. */
const shopFlow = [
  "apiVersion: ingestron.io/v1",
  "kind: Flow",
  "id: shop",
  "description: Orders and customers from the web shop.",
  "source: shop",
  "tables:",
  "  customers:",
  "    object: customers",
  "    contract: shop.customers",
  "    ingest:",
  "      with: { format: csv, options: { header: true } }",
  "  orders:",
  "    object: orders",
  "    contract: shop.orders",
  "    store:",
  "      with: { mode: upsert, sequence_by: updated_at }",
  "",
].join("\n");

/** Each group of shots shares a session; it runs once per theme. */
const groups = [
  {
    // The retail starter in the editor alone.
    shots: [
      "environment",
      "editor",
      "hover",
      "problems",
      "completion",
      "title-buttons",
      "new-file",
    ],
    async run(theme) {
      const s = await session(theme, [["retail", "retail"]]);
      const { keys, type, palette, open, lineOf, goto, show, drag, growHover, frame, pause } = s;
      const { workspace } = s;
      await show("sidebar", false);
      // A popup over the file it belongs to: the environment picker over project.yaml.
      await open("project.yaml");
      await palette("Ingestron: Select environment");
      await frame("environment", { focus: ".quick-input-widget" });
      await keys("Escape");

      const flow = "flows/shop.yaml";
      writeFileSync(join(workspace, flow), shopFlow);
      await pause(1000);
      await open(flow);
      // A setting of the last table: the hover opens below it, over empty
      // editor, so it hides no line and both table labels stay in view.
      await goto(lineOf(flow, "      with: { mode"), 30);
      await palette("Show or Focus Hover");
      await frame("editor", { focus: ".monaco-hover" });
      await keys("Escape");
      // A table's hover: its full name, its methods and each setting's layer.
      // Folded, the table is the last line, so its long hover covers no line;
      // without the final newline, no line number shows beside it either.
      writeFileSync(join(workspace, flow), shopFlow.trimEnd());
      await pause(1000);
      await goto(lineOf(flow, "  orders:"), 4);
      await keys("Alt+Meta+BracketLeft");
      await pause(500);
      await palette("Show or Focus Hover");
      if (wanted("hover")) {
        await growHover(200);
        await frame("hover", { focus: ".monaco-hover", keepMouse: true });
      }
      await keys("Escape");
      await palette("Unfold All");
      writeFileSync(join(workspace, flow), shopFlow);
      await pause(1000);

      // The editor-title buttons, with the … menu open.
      if (wanted("title-buttons")) {
        await s.window.locator('.part.editor [aria-label^="More Actions"]').first().click();
        await pause(800);
        await frame("title-buttons", { focus: ".context-view .monaco-menu" });
        await keys("Escape");
      }

      // A broken link, in the editor and in the Problems panel below it.
      await goto(lineOf(flow, "source: shop"), 9);
      await keys("Shift+End");
      await type("shops");
      await pause(1500);
      if (wanted("problems")) {
        await palette("View: Focus Problems");
        await pause(800);
        await drag("panel", "top", 470);
        await palette("View: Focus Active Editor Group");
        await frame("problems");
        await show("panel", false);
      }
      await palette("View: Focus Active Editor Group");
      await palette("File: Revert File");
      await pause(800);

      // Under a new store's with: the settings of the method the table uses.
      await goto(lineOf(flow, "contract: shop.customers"), 30);
      // Each new line keeps the previous line's indentation.
      await keys("End", "Enter");
      await type("store:");
      await keys("Enter");
      await type("  with:");
      await keys("Enter");
      await type("  ");
      await keys("Control+Space");
      await frame("completion", { focus: ".suggest-widget" });
      await keys("Escape");
      await palette("File: Revert File");
      await pause(800);

      // A new flow file: the skeleton, then Tab to the source's choices.
      writeFileSync(join(workspace, "flows/web.yaml"), "");
      await pause(1000);
      await open("flows/web.yaml");
      await keys("Control+Space");
      await pause(800);
      await keys("Enter");
      await pause(300);
      await keys("Tab");
      await frame("new-file", { focus: ".suggest-widget" });
      await s.vscode.close();
    },
  },
  {
    // The generated file for the orders table, read-only beside its flow.
    shots: ["preview"],
    async run(theme) {
      const s = await session(theme, [["retail", "retail"]], {
        extraSettings: { "editor.wordWrap": "on" },
      });
      const { palette, open, lineOf, goto, show, frame, pause, workspace } = s;
      await show("sidebar", false);
      const flow = "flows/shop.yaml";
      writeFileSync(join(workspace, flow), shopFlow);
      await pause(1000);
      await open(flow);
      await goto(lineOf(flow, "  orders:"), 4);
      await palette("Ingestron: Show generated files");
      await pause(1500);
      await frame("preview");
      await s.vscode.close();
    },
  },
  {
    // The Reference section beside the editor, on the private SQL Server starter.
    shots: ["reference"],
    async run(theme) {
      const s = await session(theme, [["private-sql-server", "erp"]], {
        size: [width + 2 * inset, 640],
        extraSettings: { "editor.wordWrap": "on" },
      });
      const { window, palette, open, lineOf, goto, show, drag, fold, frame, pause } = s;
      await show("sidebar", false);
      await open("standard.yaml");
      await goto(lineOf("standard.yaml", "mode: incremental"), 15);
      await palette("Ingestron: Show reference");
      await pause(1500);
      await drag("auxiliarybar", "left", 430);
      await fold("auxiliarybar", "Project", false);
      await palette("View: Focus Active Editor Group");
      await goto(lineOf("standard.yaml", "mode: incremental"), 15);
      await pause(1500);
      await frame("reference", { below: await webviewBottom(window, "auxiliarybar") });
      await s.vscode.close();
    },
  },
  {
    // The minimal starter, shop: New project, a quick fix, the commands' output,
    // a variable not set.
    shots: [
      "new-project",
      "new-project-starter",
      "quick-fix",
      "plan",
      "check",
      "auto-apply",
      "envvar-info",
      "platform-request",
    ],
    async run(theme) {
      const s = await session(theme, [["minimal", "shop"]], {
        extraSettings: { "editor.wordWrap": "on" },
      });
      const { keys, type, palette, open, lineOf, goto, show, drag, frame, pause, workspace } = s;
      await show("sidebar", false);
      // New project starts from an empty window: the picker covers no line.
      await palette("View: Close All Editors");
      await palette("Ingestron: New project");
      await frame("new-project", { focus: ".quick-input-widget" });
      await type("starter");
      await pause(400);
      await keys("Enter");
      await pause(1000);
      // The first project's starter: the list holds more than the window shows.
      await type("duckdb");
      await frame("new-project-starter", { focus: ".quick-input-widget" });
      await keys("Escape");

      // A broken link's quick fixes. The flow is short, so the menu's lower
      // edge falls below the last line and cuts none.
      const flow = "flows/orders.yaml";
      await open(flow);
      await goto(lineOf(flow, "source: shop"), 9);
      await keys("Shift+End");
      await type("shops");
      await pause(1500);
      await keys("Meta+.");
      await frame("quick-fix", { focus: ".action-widget" });
      await keys("Escape");
      await palette("File: Revert File");
      await pause(800);

      await palette("Ingestron: Plan");
      await drag("panel", "top", 560);
      await frame("plan", { include: ["panel"] });
      await palette("Ingestron: Apply");
      await palette("Ingestron: Check");
      await frame("check", { include: ["panel"] });

      // Auto-apply: on, then a setting added to the table and saved.
      if (wanted("auto-apply")) {
        await palette("View: Toggle Status Bar Visibility");
        await palette("Ingestron: Turn auto-apply on or off");
        await open(flow);
        await goto(lineOf(flow, "  orders:"), 1);
        await keys("Shift+End");
        await type(
          "  orders: { object: orders, contract: shop.orders, ingest: { with: { format: csv } } }",
        );
        await keys("Escape", "Meta+S");
        await drag("panel", "top", 600);
        await frame("auto-apply", { include: ["panel", "statusbar"] });
        await palette("Ingestron: Turn auto-apply on or off");
        await palette("View: Toggle Status Bar Visibility");
        await palette("File: Revert File");
      }
      await show("panel", false);

      // A landing folder from a variable that is set nowhere. The values come
      // last, with no final newline, so the hover below them covers no line.
      writeFileSync(
        join(workspace, "project.yaml"),
        [
          "id: shop",
          "environments:",
          "  dev: {}",
          "imports:",
          "  - standard.yaml",
          "  - connections/*.yaml",
          "  - flows/*.yaml",
          "  - contracts/*.yaml",
          "values:",
          "  landing: ${envvar:LANDING_PATH}",
        ].join("\n"),
      );
      await pause(1000);
      await open("project.yaml");
      await goto(lineOf("project.yaml", "LANDING_PATH"), 20);
      await palette("Show or Focus Hover");
      await frame("envvar-info", { focus: ".monaco-hover" });
      await keys("Escape");
      // The request opens with the variable still to provide.
      await palette("Ingestron: Prepare platform request");
      await pause(2000);
      await frame("platform-request", { until: "Once the values are set" });
      await s.vscode.close();
    },
  },
  {
    // The first project: the DuckDB starter after Apply, with its files beside the flow.
    shots: ["first-project"],
    async run(theme) {
      const s = await session(theme, [["duckdb", "shop"]], {
        size: [width + 2 * inset, 580],
        extraSettings: { "editor.wordWrap": "on" },
      });
      const { window, palette, open, show, drag, frame, pause } = s;
      await open("flows/orders.yaml");
      await palette("Ingestron: Apply");
      await pause(2000);
      await show("panel", false);
      await show("sidebar", true);
      await drag("sidebar", "right", 280);
      for (const folder of ["build", "dev", "tables"]) {
        await window
          .locator(".part.sidebar .monaco-list-row", { hasText: new RegExp(`^${folder}$`) })
          .first()
          .click();
        await pause(500);
      }
      await open("flows/orders.yaml");
      await frame("first-project");
      await s.vscode.close();
    },
  },
  {
    // A workspace with three projects: the Project view, and the Explorer's menu.
    shots: ["project-view", "context-menu"],
    async run(theme) {
      const s = await session(
        theme,
        [
          ["retail", "retail"],
          ["minimal", "shop"],
          ["private-sql-server", "erp"],
        ],
        { size: [width + 2 * inset, 420], extraSettings: { "editor.wordWrap": "on" } },
      );
      const { window, palette, open, show, drag, fold, frame, resize, pause } = s;
      await show("sidebar", false);
      await open("shop/flows/orders.yaml");
      if (wanted("project-view")) {
        await palette("Ingestron: Show reference");
        await pause(1500);
        await drag("auxiliarybar", "left", 430);
        await fold("auxiliarybar", "Reference", false);
        await fold("auxiliarybar", "Project", true);
        await frame("project-view");
        await show("auxiliarybar", false);
      }
      if (wanted("context-menu")) {
        await resize([width + 2 * inset, 760]);
        await show("sidebar", true);
        // A wide side bar, and the menu opened beside the folder's name: it
        // covers no name in the tree and no line in the editor.
        await drag("sidebar", "right", 440);
        await window
          .locator(".part.sidebar .monaco-list-row", { hasText: /^shop$/ })
          .first()
          .click({ button: "right", position: { x: 140, y: 12 } });
        await pause(800);
        await frame("context-menu", { focus: ".context-view .monaco-menu" });
      }
      await s.vscode.close();
    },
  },
];

for (const theme of themeNames) {
  for (const group of groups) {
    if (group.shots.some(wanted)) await group.run(theme);
  }
}
process.exit(0);
