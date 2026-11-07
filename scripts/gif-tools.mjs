// What `scripts/gifs.mjs` needs: the packaged extension in a downloaded VS Code
// (never the user's own), a way to drive it, and a recorder that turns a
// scripted run into an animated GIF. Like the screenshots, every GIF comes from
// projects `ingestron init` creates, so nothing in them is real data.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { _electron as electron } from "playwright-core";

export const root = join(import.meta.dirname, "..");
/** Every GIF is this many CSS pixels wide, at device scale 1. */
export const width = 800;

/** `test:integration` downloads each new stable release beside the last: use the newest. */
function newestVscode() {
  const versionOf = (name) => name.split("-").at(-1).split(".").map(Number);
  const newer = (a, b) => {
    const [x, y] = [versionOf(a), versionOf(b)];
    const differs = x.findIndex((part, index) => part !== y[index]);
    return differs === -1 ? 0 : y[differs] - x[differs];
  };
  const installs = join(root, ".vscode-test");
  const install = readdirSync(installs)
    .filter((name) => /^vscode-.*-\d+\.\d+\.\d+$/.test(name))
    .sort(newer)[0];
  if (!install)
    throw new Error("No VS Code in .vscode-test: run pnpm test:integration once first.");
  return join(installs, install, "Visual Studio Code.app");
}

const settings = {
  "editor.fontSize": 14,
  "editor.minimap.enabled": false,
  "editor.autoIndent": "none",
  "editor.autoClosingBrackets": "never",
  "editor.hover.delay": 100,
  "editor.hover.above": false,
  "editor.scrollbar.vertical": "hidden",
  "editor.scrollbar.verticalScrollbarSize": 0,
  "editor.overviewRulerLanes": 0,
  "editor.renderLineHighlight": "none",
  "editor.showFoldingControls": "never",
  "editor.wordWrap": "on",
  "editor.cursorBlinking": "solid",
  "breadcrumbs.enabled": false,
  "chat.disableAIFeatures": true,
  "explorer.compactFolders": false,
  "extensions.ignoreRecommendations": true,
  "window.commandCenter": false,
  "window.menuStyle": "custom",
  "workbench.colorTheme": "Default Dark Modern",
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

/** Builds the extension and installs it in a folder of its own: `{ application, extensions }`. */
export function installExtension() {
  const application = newestVscode();
  const extensions = mkdtempSync(join(tmpdir(), "ingestron-gifs-extensions-"));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  execFileSync("node", ["scripts/package.mjs"], { cwd: root, stdio: "inherit" });
  execFileSync(
    join(application, "Contents/Resources/app/bin/code"),
    ["--extensions-dir", extensions, "--install-extension", join(root, "ingestron.vsix")],
    { env, stdio: "inherit" },
  );
  return { application, extensions, env };
}

/**
 * Creates one project from a starter with `ingestron init`, as a reader would,
 * opens it in VS Code and returns helpers to drive it, plus `snap`, which saves
 * the window as the next frame of the GIF and keeps it on screen for `ms`.
 * `fill` writes synthetic values over the starter's REPLACE_ME, in order.
 */
export async function launch(installed, starter, { height = 600, files = {}, fill = [] } = {}) {
  const parent = mkdtempSync(join(tmpdir(), "ingestron-gifs-"));
  const cli = join(root, "node_modules/@ingestron/cli/dist/main.js");
  execFileSync("node", [cli, "init", "project", "--template", starter, "--yes"], {
    cwd: parent,
    stdio: "ignore",
  });
  const workspace = join(parent, "project");
  for (const [file, text] of Object.entries(files)) writeFileSync(join(workspace, file), text);
  // The starter writes REPLACE_ME where only its owner knows a value: write each, in order.
  const projectFile = join(workspace, "project.yaml");
  let project = readFileSync(projectFile, "utf8");
  for (const value of fill) project = project.replace("REPLACE_ME", value);
  writeFileSync(projectFile, project);
  const profile = mkdtempSync(join(tmpdir(), "ingestron-gifs-profile-"));
  mkdirSync(join(profile, "User"), { recursive: true });
  writeFileSync(join(profile, "User/settings.json"), JSON.stringify(settings));
  const vscode = await electron.launch({
    executablePath: join(installed.application, "Contents/MacOS/Code"),
    args: [
      workspace,
      `--extensions-dir=${installed.extensions}`,
      `--user-data-dir=${profile}`,
      "--skip-welcome",
      "--skip-release-notes",
      "--force-device-scale-factor=1",
    ],
    env: installed.env,
  });
  const window = await vscode.firstWindow();
  await vscode.evaluate(
    ({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h),
    [width, height],
  );
  const pause = (ms) => window.waitForTimeout(ms);
  await pause(4000);
  const frames = [];
  const folder = mkdtempSync(join(tmpdir(), "ingestron-gifs-frames-"));
  const helpers = driver(window, workspace, pause);
  return {
    ...helpers,
    window,
    workspace,
    pause,
    frames,
    /** Saves the window as the next frame, shown for `ms` milliseconds. */
    async snap(ms) {
      const file = join(folder, `${String(frames.length).padStart(4, "0")}.png`);
      writeFileSync(file, await window.screenshot());
      frames.push({ file, ms });
    },
    async close() {
      await vscode.close();
      for (const path of [parent, profile]) rmSync(path, { recursive: true, force: true });
    },
  };
}

/** Keyboard helpers shared by every scene. */
function driver(window, workspace, pause) {
  const keys = async (...sequence) => {
    for (const key of sequence) await window.keyboard.press(key);
  };
  const type = (text, delay = 15) => window.keyboard.type(text, { delay });
  const palette = async (command) => {
    await keys("Meta+Shift+P");
    await pause(300);
    await type(command);
    await pause(500);
    await keys("Enter");
    await pause(300);
  };
  const open = async (file) => {
    await palette("View: Close All Editors");
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
  return { keys, type, palette, open, lineOf, goto };
}

/** Writes the GIF: the frames in order, each held for its time, in a shared palette. */
export function encode(frames, out, { colors = 128 } = {}) {
  const list = mkdtempSync(join(tmpdir(), "ingestron-gifs-list-"));
  const lines = frames.flatMap(({ file, ms }) => [`file '${file}'`, `duration ${ms / 1000}`]);
  // The concat demuxer ignores the last duration unless the file is listed again.
  lines.push(`file '${frames.at(-1).file}'`);
  writeFileSync(join(list, "frames.txt"), lines.join("\n"));
  const filter =
    `scale=${width}:-1:flags=lanczos,split[a][b];` +
    `[a]palettegen=max_colors=${colors}:stats_mode=diff[p];` +
    `[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
  mkdirSync(dirname(out), { recursive: true });
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      join(list, "frames.txt"),
    ].concat(["-vf", filter, "-fps_mode", "vfr", "-loop", "0", out]),
    { stdio: "inherit" },
  );
  // The frames belong to the encoding: they go once it has them.
  for (const path of [list, dirname(frames[0].file)])
    rmSync(path, { recursive: true, force: true });
}
