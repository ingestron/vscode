// The menus in package.json: which commands appear when a project, its files or its folder are clicked.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Previews of generated files have no project file behind them, so the buttons
// recognise them by their scheme, which the extension names once in state.ts.
const previewScheme = /export const previewScheme = "([^"]+)"/.exec(
  readFileSync(join(import.meta.dirname, "..", "src", "vscode", "state", "state.ts"), "utf8"),
)?.[1];
const editorTitleWhen = `resourceScheme == ${previewScheme} || resourcePath in ingestron.projectFiles`;

interface Entry {
  command: string;
  when?: string;
  group?: string;
}

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"));
const menus: Record<string, Entry[]> = manifest.contributes.menus;
const commands: { command: string; icon?: string }[] = manifest.contributes.commands;
const named = (menu: string, command: string) =>
  menus[menu]!.find((entry) => entry.command === command);

describe("Explorer menu", () => {
  it("offers check, plan, apply, compare and the two requests on a project, in that order", () => {
    const order = [
      "ingestron.check",
      "ingestron.plan",
      "ingestron.apply",
      "ingestron.compareEnvironments",
      "ingestron.platformRequest",
      "ingestron.requestSourceMetadata",
    ];
    order.forEach((command, index) => {
      const entry = named("explorer/context", command);
      expect(entry?.group, command).toBe(`ingestron@${index + 1}`);
      expect(entry?.when, command).toContain("explorerResourceIsFolder");
      expect(entry?.when, command).toContain("resourcePath in ingestron.projectFolders");
      // A file counts only when it is inside a project: never any YAML file.
      expect(entry?.when, command).toContain("resourcePath in ingestron.projectFiles");
      expect(entry?.when, command).not.toContain("hasProjects");
    });
  });

  it("offers Import source metadata on a project folder, and on any file but a project's own once a project is open", () => {
    const entries = menus["explorer/context"]!.filter(
      (entry) => entry.command === "ingestron.importSourceMetadata",
    );
    expect(entries).toEqual([
      {
        command: "ingestron.importSourceMetadata",
        when: "explorerResourceIsFolder && resourcePath in ingestron.projectFolders",
        group: "ingestron@7",
      },
      {
        command: "ingestron.importSourceMetadata",
        when: "!explorerResourceIsFolder && ingestron.hasProjects && !(resourcePath in ingestron.projectFiles)",
        group: "ingestron@7",
      },
    ]);
  });

  it("keeps Draft contract on sample files only", () => {
    expect(named("explorer/context", "ingestron.draftContract")).toEqual({
      command: "ingestron.draftContract",
      when: "resourceExtname =~ /^\\.(csv|json|jsonl|ndjson)$/",
      group: "7_modification",
    });
  });
});

describe("editor title menu", () => {
  it("shows the buttons for a project file or a preview of generated files, in the editor's own group", () => {
    expect(previewScheme).toBe("ingestron-generated");
    for (const entry of menus["editor/title"]!) {
      expect(entry.when, entry.command).toBe(editorTitleWhen);
      // Only per-editor keys: a global key would follow the active group into a split.
      expect(entry.when, entry.command).not.toContain("ingestron.inProject");
    }
  });

  it("shows Plan and Apply as buttons with icons, only in a project", () => {
    for (const [command, icon] of [
      ["ingestron.plan", "$(checklist)"],
      ["ingestron.apply", "$(play)"],
    ] as const) {
      const entry = named("editor/title", command);
      expect(entry?.group, command).toMatch(/^navigation@\d$/);
      expect(entry?.when, command).toBe(editorTitleWhen);
      expect(commands.find((item) => item.command === command)?.icon, command).toBe(icon);
    }
  });

  it("leaves Import source metadata out: a command run from the title would take the open file as the sample", () => {
    expect(named("editor/title", "ingestron.importSourceMetadata")).toBeUndefined();
  });

  it("puts the other commands in the overflow menu, only in a project", () => {
    for (const command of [
      "ingestron.check",
      "ingestron.compareEnvironments",
      "ingestron.platformRequest",
      "ingestron.requestSourceMetadata",
    ]) {
      const entry = named("editor/title", command);
      expect(entry?.group, command).toMatch(/^ingestron@\d$/);
      expect(entry?.when, command).toBe(editorTitleWhen);
    }
  });
});

describe("source metadata commands", () => {
  it("are titled for what they do, with the import asking for a file", () => {
    const title = (id: string) =>
      (commands as { command: string; title: string }[]).find((item) => item.command === id)?.title;
    expect(title("ingestron.requestSourceMetadata")).toBe("Request source metadata");
    expect(title("ingestron.importSourceMetadata")).toBe("Import source metadata…");
  });
});

describe("command palette", () => {
  it("lists only Draft contract and the project-only commands as conditional", () => {
    expect(menus.commandPalette).toEqual([
      {
        command: "ingestron.draftContract",
        when: "resourceExtname =~ /^\\.(csv|json|jsonl|ndjson)$/",
      },
      { command: "ingestron.addAssistantFiles", when: "ingestron.hasProjects" },
    ]);
  });
});
