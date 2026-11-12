// Which coding assistants the New project picker and Add assistant files offer, and what they
// become on the command line; and that the package offers the command.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assistantFlags,
  assistantItems,
  addAssistantPlaceholder,
  assistantPlaceholder,
  newProjectTitle,
} from "../src/features/assistants.js";

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"));

describe("assistantFlags", () => {
  it("passes no flag for none", () => {
    expect(assistantFlags([])).toEqual([]);
  });

  it("joins the names into one flag", () => {
    expect(assistantFlags(["copilot", "claude"])).toEqual(["--assistant", "copilot,claude"]);
  });
});

describe("assistantItems", () => {
  it("offers the names the CLI knows, in its order", () => {
    expect(assistantItems.map((item) => item.name)).toEqual([
      "copilot",
      "claude",
      "codex",
      "cursor",
      "agents",
    ]);
  });

  it("labels each for the person", () => {
    expect(assistantItems.map((item) => item.label)).toEqual([
      "GitHub Copilot",
      "Claude Code",
      "Codex",
      "Cursor",
      "Another tool that reads AGENTS.md",
    ]);
  });
});

describe("the New project picker", () => {
  it("is optional, and says so", () => {
    expect(newProjectTitle).toBe("New project: AI assistant files (optional)");
    expect(assistantPlaceholder).toBe("Choose any, or press Enter for none");
  });
});

describe("the Add assistant files picker", () => {
  it("asks for one or more, as Enter with nothing ticked adds nothing", () => {
    expect(addAssistantPlaceholder).toBe("Choose one or more");
    expect(addAssistantPlaceholder).not.toBe(assistantPlaceholder);
  });
});

describe("the package", () => {
  it("contributes Add assistant files, for a project", () => {
    expect(manifest.contributes.commands).toContainEqual({
      command: "ingestron.addAssistantFiles",
      title: "Add assistant files",
      category: "Ingestron",
    });
    expect(manifest.contributes.menus.commandPalette).toContainEqual({
      command: "ingestron.addAssistantFiles",
      when: "ingestron.hasProjects",
    });
    const entry = manifest.contributes.menus["explorer/context"].find(
      (item: { command: string }) => item.command === "ingestron.addAssistantFiles",
    );
    expect(entry.when).toContain("resourcePath in ingestron.projectFolders");
    expect(entry.group).toBe("ingestron@8");
  });
});
