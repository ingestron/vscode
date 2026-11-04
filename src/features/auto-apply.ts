// Auto-apply: generate after each save of a project's definitions, and log
// what each run did in the output panel. The run itself is the CLI's apply,
// which generates every environment together, into one folder per pack.
import { firstSentence } from "./stopped.js";

/** True for files whose change can change the generated files; never for generated files. */
export function triggers(file: string): boolean {
  if (file.startsWith("build/") || file.includes("/build/")) return false;
  return /\.(ya?ml|sql|py)$/.test(file);
}

/** The project's environments, and the one the Problems panel shows (`default` when none is declared). */
export interface Shown {
  environments: string[];
  selected: string;
}

const pad = " ".repeat(10);
const changeLine = /^(create|update|delete|adopt|forget|conflict) /;

/**
 * The activity lines for one run, from the CLI's apply output: a line for each output
 * folder, such as `databricks (dev, prod): up to date`, with the files that changed below
 * it, then a line for each folder that is no longer generated. When the definitions have
 * problems, one line says which environments have them and where to see them.
 */
export function activity(output: string, at: Date, shown: Shown): string {
  const time = at.toTimeString().slice(0, 8);
  const stopped = problemsLine(output, shown);
  if (stopped) return `${time}  not applied: ${stopped}\n`;
  const lines = output.split("\n");
  const folders = sections(lines).map(
    ({ heading, body }) => `${time}  ${heading}: ${summary(body)}`,
  );
  const retired = lines
    .filter((line) => / no longer generated\./.test(line))
    .map((line) => `${time}  ${line}\n`);
  if (folders.length === 0 && retired.length === 0)
    return `${time}  nothing applied: ${firstSentence(lines) ?? "nothing to generate"}\n`;
  return [...folders, ...retired].join("");
}

/**
 * When the definitions have problems: which environments have them, and how to see them.
 * The Problems panel shows only the selected environment's, and every pack's.
 */
function problemsLine(output: string, { environments, selected }: Shown): string | undefined {
  const headings = output
    .split("\n")
    .flatMap((line) => /^(.+): the definitions have problems$/.exec(line)?.[1]?.split(", ") ?? []);
  if (headings.length === 0) return undefined;
  const others = [...new Set(headings)].filter((name) => name !== selected);
  const packs = headings.some((name) => !environments.includes(name) && name !== "default");
  if (packs || others.length < new Set(headings).size)
    return "the definitions have problems (see the Problems panel)";
  const have = others.length > 1 ? "have" : "has";
  return `${others.join(", ")} ${have} problems (select ${others[0]} to see them in the Problems panel)`;
}

/** Each output folder's part of the output: its name and environments, then its lines. */
function sections(lines: string[]): { heading: string; body: string[] }[] {
  const found: { heading: string; body: string[] }[] = [];
  for (const line of lines) {
    const folder = /^(\S+) → \S+ (\(.*\))$/.exec(line);
    if (folder) found.push({ heading: `${folder[1]} ${folder[2]}`, body: [] });
    else if (!/ no longer generated\./.test(line)) found.at(-1)?.body.push(line);
  }
  return found;
}

/** What happened to one output folder, then the files that changed, one per line. */
function summary(body: string[]): string {
  const changes = body.filter((line) => changeLine.test(line));
  const detail = changes.map((line) => `${pad}${line}\n`).join("");
  const conflicts = changes.filter((line) => line.startsWith("conflict")).length;
  if (conflicts > 0)
    return `not applied: ${conflicts} conflict${conflicts > 1 ? "s" : ""}\n${detail}`;
  const text = body.join("\n");
  if (/Up to date\./.test(text)) return "up to date\n";
  const files = /files?: ([^.]+)\./.exec(text)?.[1] ?? "";
  if (body.includes("Applied.")) return `applied: ${files}\n${detail}`;
  return `not applied: ${reason(body)}\n`;
}

/** Why a folder was not written: a problem in its plan, or the CLI's message after the plan. */
function reason(body: string[]): string {
  const problem = body.findIndex((line) => line.startsWith("problem "));
  if (problem !== -1) return body[problem + 1]?.trim() ?? body[problem]!.trim();
  const verdict = body.findIndex((line) => /^\d+ files?[:.]/.test(line));
  const after = body.slice(verdict + 1).find((line) => line.trim() !== "");
  return after?.trim() ?? "the plan was not applied";
}
