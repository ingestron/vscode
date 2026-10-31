// The Reference panel's page: a reference entry as plain HTML in the editor's
// own theme colours and fonts. It has no scripts, so the page's content
// security policy allows nothing but its inline style.
import type { ProblemEntry, ReferenceEntry } from "@ingestron/authoring";

const style = `
body { overflow-wrap: anywhere; color: var(--vscode-foreground); font: var(--vscode-font-size) var(--vscode-font-family); padding: 4px 12px 12px; line-height: 1.45; }
h1 { font-size: 1.15em; margin: 8px 0 0; }
h2 { font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vscode-descriptionForeground); margin: 14px 0 4px; font-weight: 600; }
p { margin: 4px 0; }
.sub { color: var(--vscode-descriptionForeground); margin-top: 0; }
code { font-family: var(--vscode-editor-font-family); font-size: 0.95em; background: var(--vscode-textCodeBlock-background); padding: 0 2px; border-radius: 3px; }
ul { margin: 4px 0; padding-left: 18px; }
li { margin: 2px 0; }
li.current { font-weight: 600; }
li.current::marker { content: "▸ "; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 10px; margin: 6px 0; }
dt { color: var(--vscode-descriptionForeground); }
dd { margin: 0; }
a { color: var(--vscode-textLink-foreground); }
.problem { border-left: 3px solid var(--vscode-editorError-foreground); padding: 2px 0 2px 8px; margin: 8px 0; }
.problem.warning { border-left-color: var(--vscode-editorWarning-foreground); }
.empty { color: var(--vscode-descriptionForeground); }
.nav { display: flex; justify-content: space-between; gap: 8px; margin: 6px 0 2px; font-size: 0.9em; }
`;

/** While browsing the reference: where Back goes, and the entry's page on the site. */
export interface Nav {
  back?: string;
  external?: string;
}

/** The panel's page for an entry, or a one-line hint when there is none. */
export function referenceHtml(
  entry: ReferenceEntry | undefined,
  link: (path: string) => string,
  nav?: Nav,
): string {
  const body = entry
    ? [
        nav && navHtml(nav),
        ...(entry.problems ?? []).map((problem) => problemHtml(problem, link)),
        // While browsing, Open in browser above stands for the entry's own link.
        entryHtml(nav ? { ...entry, docs: undefined } : entry, link),
      ]
        .filter(Boolean)
        .join("\n")
    : `<p class="empty">Put the cursor on a field, a value or a problem in an Ingestron file.</p>`;
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>${style}</style></head>
<body>${body}</body></html>`;
}

function entryHtml(entry: ReferenceEntry, link: (path: string) => string): string {
  return [
    `<h1>${escape(entry.title)}</h1>`,
    `<p class="sub">${escape(entry.subtitle)}</p>`,
    entry.text && `<p>${inline(entry.text)}</p>`,
    entry.values &&
      section(
        "Values",
        list(entry.values, (item) => valueHtml(item)),
      ),
    entry.packs && section("In this project", list(entry.packs, packHtml)),
    entry.facts &&
      `<dl>${entry.facts.map((fact) => `<dt>${escape(fact.label)}</dt><dd>${fact.code ? `<code>${escape(fact.value)}</code>` : escape(fact.value)}</dd>`).join("")}</dl>`,
    entry.usedBy &&
      section(
        "Used by",
        entry.usedBy.length > 0
          ? list(entry.usedBy, (use) => inline(use))
          : "<p>No table uses it in this environment.</p>",
      ),
    entry.fields &&
      section(
        entry.fieldsHeading ?? "Fields",
        list(
          entry.fields,
          (field) =>
            `<a href="${escape(link(field.docs))}"><code>${escape(field.name)}</code></a>${field.text ? `: ${inline(field.text)}` : ""}`,
        ),
      ),
    entry.docs && `<p><a href="${escape(link(entry.docs))}">Reference</a></p>`,
  ]
    .filter(Boolean)
    .join("\n");
}

function navHtml({ back, external }: Nav): string {
  return [
    `<div class="nav">`,
    back ? `<a href="${escape(back)}">← Back</a>` : "<span></span>",
    external ? `<a href="${escape(external)}">Open in browser ↗</a>` : "",
    `</div>`,
  ].join("");
}

function packHtml(item: { pack: string; status: string; text: string }): string {
  return `<code>${escape(item.pack)}</code>: <strong>${escape(item.status)}</strong>. ${inline(item.text)}`;
}

function valueHtml(item: { value: string; text?: string; current?: boolean }): string {
  return `<code>${escape(item.value)}</code>${item.text ? `: ${inline(item.text)}` : ""}`;
}

function problemHtml(problem: ProblemEntry, link: (path: string) => string): string {
  const code = problem.docs
    ? `<a href="${escape(link(problem.docs))}">${escape(problem.code)}</a>`
    : escape(problem.code);
  return [
    `<div class="problem${problem.severity === "warning" ? " warning" : ""}">`,
    `<p><strong>${code}</strong>: ${escape(problem.message)}</p>`,
    // The problem's own hint says more than its code's general meaning.
    problem.hint && `<p>${inline(problem.hint, link)}</p>`,
    !problem.hint && problem.meaning && `<p>${inline(problem.meaning, link)}</p>`,
    !problem.hint && problem.fix && `<p>Fix: ${inline(problem.fix, link)}</p>`,
    problem.fixes.length > 0 &&
      `<p>Quick fixes (⌘. or Ctrl+.):</p><ul>${problem.fixes.map((fix) => `<li>${escape(fix)}</li>`).join("")}</ul>`,
    `</div>`,
  ]
    .filter(Boolean)
    .join("\n");
}

function section(heading: string, content: string): string {
  return `<h2>${escape(heading)}</h2>\n${content}`;
}

function list<T>(items: T[], render: (item: T) => string): string {
  const current = (item: T) => (item as { current?: boolean }).current === true;
  return `<ul>${items.map((item) => `<li${current(item) ? ' class="current"' : ""}>${render(item)}</li>`).join("")}</ul>`;
}

/** Text with `code` shown as code and [docs links](/docs/…) as links; everything else escaped. */
function inline(text: string, link?: (path: string) => string): string {
  const coded = escape(text).replace(/`([^`]+)`/g, "<code>$1</code>");
  if (!link) return coded;
  return coded.replace(
    /\[([^\]]+)\]\((\/docs\/[^)\s]+)\)/g,
    (_, words: string, path: string) => `<a href="${escape(link(path))}">${words}</a>`,
  );
}

function escape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
