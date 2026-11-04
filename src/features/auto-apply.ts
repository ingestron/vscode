// Auto-apply: generate after each save of a project's definitions, and log
// what each run did in the output panel. The run itself is the CLI's apply,
// which generates every environment together, into one folder per pack.

/** True for files whose change can change the generated files; never for generated files. */
export function triggers(file: string): boolean {
  if (file.startsWith("build/") || file.includes("/build/")) return false;
  return /\.(ya?ml|sql|py)$/.test(file);
}

const pad = " ".repeat(10);

/**
 * The activity lines for one run, from the CLI's apply output: a line for each output
 * folder, such as `databricks (dev, prod): up to date`, with the files that changed below
 * it, then any folder that is no longer generated.
 */
export function activity(output: string, at: Date): string {
  const time = at.toTimeString().slice(0, 8);
  if (/the definitions have problems/.test(output))
    return `${time}  not applied: the definitions have problems (see the Problems panel)\n`;
  const folders = sections(output).map(
    ({ heading, lines }) => `${time}  ${heading}: ${summary(lines)}`,
  );
  const retired = output
    .split("\n")
    .filter((line) => / no longer generated\./.test(line))
    .map((line) => `${pad}${line.slice(0, line.indexOf(":"))}: no longer generated\n`);
  return [...folders, ...retired].join("");
}

/** Each output folder's part of the output: its name and environments, then its lines. */
function sections(output: string): { heading: string; lines: string[] }[] {
  const found: { heading: string; lines: string[] }[] = [];
  for (const line of output.split("\n")) {
    const folder = /^(\S+) → \S+ (\(.*\))$/.exec(line);
    if (folder) found.push({ heading: `${folder[1]} ${folder[2]}`, lines: [] });
    else found.at(-1)?.lines.push(line);
  }
  return found;
}

/** What happened to one output folder, then the files that changed, one per line. */
function summary(lines: string[]): string {
  const changes = lines.filter((line) => /^(create|update|delete|conflict) /.test(line));
  const detail = changes.map((line) => `${pad}${line}\n`).join("");
  const conflicts = changes.filter((line) => line.startsWith("conflict")).length;
  if (conflicts > 0)
    return `not applied: ${conflicts} conflict${conflicts > 1 ? "s" : ""}\n${detail}`;
  const text = lines.join("\n");
  if (/Up to date/.test(text)) return "up to date\n";
  const files = /files: ([^.]+)\./.exec(text)?.[1] ?? "";
  return `applied: ${files}\n${detail}`;
}
