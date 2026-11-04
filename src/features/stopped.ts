// What the CLI printed when plan would stop, said in one line for a message: which
// environments have problems, or a diagnostic's own sentence, such as a pack that
// cannot be loaded.

/**
 * The first thing the CLI printed: for a diagnostic, such as a pack that cannot be loaded,
 * its message, not its code line.
 */
export function firstSentence(lines: readonly string[]): string | undefined {
  const first = lines.findIndex((line) => line.trim() !== "");
  if (first === -1) return undefined;
  const diagnostic = /^\S+ {2}(error|warning|information) {2}[A-Z_]+$/.test(lines[first]!);
  return (diagnostic ? (lines[first + 1] ?? lines[first]!) : lines[first]!).trim();
}

/**
 * Why no generated file can be shown, from what plan prints before it stops: the
 * environments or packs with problems, and to run Plan to see them; or the sentence of
 * the problem that stopped it.
 */
export function stoppedMessage(problems: string): string {
  const lines = problems.split("\n");
  const names = /^(.+): the definitions have problems$/.exec(lines[0] ?? "")?.[1];
  if (names) {
    const have = names.includes(", ") ? "have" : "has";
    return `Nothing is generated while plan would stop: ${names} ${have} problems. Run Plan to see them.`;
  }
  return `Nothing is generated: ${firstSentence(lines) ?? "plan would stop"}`;
}
