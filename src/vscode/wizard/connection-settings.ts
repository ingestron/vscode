// Setting prompts use connector metadata and named secret references.
import * as vscode from "vscode";
import type { ConnectionChoice } from "@ingestron/core";

/** Collect required settings without reading any secret value. */
export async function askSettings(
  choice: ConnectionChoice,
  id: string,
): Promise<Record<string, unknown> | undefined> {
  const settings: Record<string, unknown> = {};
  for (const meta of choice.settings.filter((setting) => !setting.optional)) {
    const value = meta.secret
      ? `\${secret:${id.replaceAll("_", "-")}-${meta.name.replaceAll("_", "-")}}`
      : String(meta.default ?? meta.values?.[0] ?? "REPLACE_ME");
    const answer = meta.values
      ? await vscode.window.showQuickPick(meta.values, {
          title: `Add connection: ${meta.name}`,
          placeHolder: meta.description,
        })
      : await vscode.window.showInputBox({
          title: `Add connection: ${meta.name}`,
          prompt: meta.description,
          value,
          validateInput: (text) =>
            meta.secret && !/^\$\{secret:[^}]+\}$/.test(text)
              ? "Use a named ${secret:NAME} reference."
              : undefined,
        });
    if (answer === undefined) return;
    settings[meta.name] = meta.type === "number" ? Number(answer) : answer;
  }
  return settings;
}
