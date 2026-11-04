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
 * environments or packs with problems, from every group that has an error, and to run Plan
 * to see them; or the sentence of the problem that stopped it.
 */
export function stoppedMessage(problems: string): string {
  const lines = problems.split("\n");
  // Every group with an error, wherever it comes: a group of warnings can be first.
  const names = [
    ...new Set(
      lines.flatMap(
        (line) => /^(.+): the definitions have problems$/.exec(line)?.[1]?.split(", ") ?? [],
      ),
    ),
  ];
  if (names.length > 0) {
    const have = names.length > 1 ? "have" : "has";
    return `Nothing is generated while plan would stop: ${names.join(", ")} ${have} problems. Run Plan to see them.`;
  }
  return `Nothing is generated: ${firstSentence(lines) ?? "plan would stop"}`;
}
