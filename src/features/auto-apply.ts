// Auto-apply: generate after each save of a project's definitions, and log
// one line per run in the output panel. The run itself is the CLI's apply.

/** True for files whose change can change the generated files; never for generated files. */
export function triggers(file: string): boolean {
  if (file.startsWith("build/") || file.includes("/build/")) return false;
  return /\.(ya?ml|sql|py)$/.test(file);
}

/** The activity lines for one run, from the CLI's apply output. */
export function activity(output: string, environment: string, at: Date): string {
  const time = at.toTimeString().slice(0, 8);
  const head = `${time}  ${environment}: `;
  if (/the definitions have problems/.test(output))
    return `${head}not applied: the definitions have problems (see the Problems panel)\n`;
  const changes = output
    .split("\n")
    .filter((line) => /^(create|update|delete|conflict) /.test(line));
  const detail = changes.map((line) => `${" ".repeat(10)}${line}\n`).join("");
  const summary = /files: ([^.]+)\./.exec(output)?.[1] ?? "";
  const conflicts = changes.filter((line) => line.startsWith("conflict")).length;
  if (conflicts > 0)
    return `${head}not applied: ${conflicts} conflict${conflicts > 1 ? "s" : ""}\n${detail}`;
  if (/Up to date/.test(output)) return `${head}up to date\n`;
  return `${head}applied: ${summary}\n${detail}`;
}
