// The one span that turns a file's text into its new text, so an edit leaves the rest alone.
import type { TextEdit } from "@ingestron/config";

/** The smallest single replacement from `before` to `after`: what lies between their common ends. */
export function textChange(file: string, before: string, after: string): TextEdit {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start])
    start += 1;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  )
    end += 1;
  return {
    file,
    start,
    end: before.length - end,
    text: after.slice(start, after.length - end),
  };
}
