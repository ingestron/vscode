// What is told after the imports of one drain of the queue: one notice for the imports, one
// warning for the refusals, each with a document of the details. Pure; nothing here shows it.
import { editorReasons, importNotice, showChanges } from "./source-import.js";

/** One import that finished, as a batch of imports sums it up: the file imported and its changes. */
export interface ImportedEntry {
  kind: "imported";
  /** The file imported, relative to the project. */
  file: string;
  /** The changes as the import gives them: their first line, then the rest. */
  summary: string;
  breaking: number;
}

/** One import that stopped: the warning a lone refusal gives (naming its file), and each reason. */
export interface RefusedEntry {
  kind: "refused";
  file: string;
  message: string;
  refused: readonly string[];
}

/** What an import gave. */
export type BatchEntry = ImportedEntry | RefusedEntry;

/** A notice for the person: what to say, and the button that opens `document` when there is one. */
export interface BatchNotice {
  level: "information" | "warning";
  message: string;
  button?: string;
  document?: string;
}

/** The button that opens the reasons of several refusals. */
export const showReasons = "Show reasons";

/** How many tables an import's summary says it changed: its added, changed and removed. */
export function tablesChanged(summary: string): number {
  const counts = /(\d+) added, (\d+) changed, (\d+) removed\.$/.exec(summary.split("\n")[0] ?? "");
  return counts ? Number(counts[1]) + Number(counts[2]) + Number(counts[3]) : 0;
}

/** A Markdown document with a `## <file>` section for each entry, in the order given. */
function sections(entries: readonly { file: string; body: string[] }[]): string {
  return entries.flatMap(({ file, body }) => [`## ${file}`, "", ...body, ""]).join("\n");
}

/**
 * One entry for each file: it keeps the place the file first appeared and the content of its last
 * entry, whether that imported it or refused it. A file saved twice is one file in the batch.
 */
function byFile(entries: readonly BatchEntry[]): BatchEntry[] {
  const last = new Map<string, BatchEntry>();
  for (const entry of entries) {
    last.set(entry.file, entry);
  }
  return [...last.values()];
}

/**
 * What to tell the person once the imports of one drain of the queue are done. One import is told
 * as it always was (`importNotice`), and so is one refusal. Several imports give one notice: how
 * many files, how many tables changed and how many of the changes break, with a document of every
 * file's changes. Several refusals give one warning with a document of the reasons. Imports come
 * first, and a refusal is always a warning of its own, never folded into the imports' notice.
 */
export function batchNotices(all: readonly BatchEntry[]): BatchNotice[] {
  const entries = byFile(all);
  const imports = entries.filter((entry): entry is ImportedEntry => entry.kind === "imported");
  const refusals = entries.filter((entry): entry is RefusedEntry => entry.kind === "refused");
  return [importsNotice(imports), refusalsNotice(refusals)].filter(
    (notice) => notice !== undefined,
  );
}

function importsNotice(imports: readonly ImportedEntry[]): BatchNotice | undefined {
  const [only] = imports;
  if (!only) return undefined;
  if (imports.length === 1) {
    const { message, buttons } = importNotice(only);
    return {
      level: "information",
      message,
      ...(buttons[0] && { button: buttons[0], document: only.summary }),
    };
  }
  const tables = imports.reduce((sum, entry) => sum + tablesChanged(entry.summary), 0);
  const breaking = imports.reduce((sum, entry) => sum + entry.breaking, 0);
  return {
    level: "information",
    message:
      `Imported ${imports.length} files: ${tables} ${tables === 1 ? "table" : "tables"} changed` +
      `${breaking > 0 ? `, ${breaking} breaking` : ""}.`,
    button: showChanges,
    document: sections(
      imports.map(({ file, summary }) => ({
        file,
        body: ["```text", ...summary.replace(/\n+$/, "").split("\n"), "```"],
      })),
    ),
  };
}

function refusalsNotice(refusals: readonly RefusedEntry[]): BatchNotice | undefined {
  const [lone] = refusals;
  if (!lone) return undefined;
  if (refusals.length === 1) return { level: "warning", message: lone.message };
  return {
    level: "warning",
    message: `${refusals.length} files could not be imported.`,
    button: showReasons,
    document: sections(
      refusals.map(({ file, refused }) => ({
        file,
        body: editorReasons(refused).map((reason) => `- ${reason}`),
      })),
    ),
  };
}
