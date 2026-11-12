// The coding assistants a project can carry guidance for: what the pickers offer, and what a
// choice becomes on the command line. Which files each one writes is the CLI's to say.

/** The names the CLI's `--assistant` and `assistant add` take. */
export type AssistantName = "copilot" | "claude" | "codex" | "cursor" | "agents";

/** What a picker offers, in the order the CLI lists them. */
export const assistantItems: readonly { label: string; name: AssistantName }[] = [
  { label: "GitHub Copilot", name: "copilot" },
  { label: "Claude Code", name: "claude" },
  { label: "Codex", name: "codex" },
  { label: "Cursor", name: "cursor" },
  { label: "Another tool that reads AGENTS.md", name: "agents" },
];

/** The title of New project's picker: the step is optional. */
export const newProjectTitle = "New project: AI assistant files (optional)";

/** The picker's placeholder: Enter with nothing ticked is an answer. */
export const assistantPlaceholder = "Choose any, or press Enter for none";

/** init's flag for the chosen names; none for an empty choice. */
export function assistantFlags(names: readonly string[]): string[] {
  return names.length === 0 ? [] : ["--assistant", names.join(",")];
}

/** The notice after the files were written. */
export const addedMessage = "Added the assistant files. The Ingestron output lists each one.";

/** The button that opens the guide. */
export const openGuide = "Open AGENTS.md";
