// The Reference panel's page: plain HTML in the editor's theme, no scripts.
import { describe, expect, it } from "vitest";
import { referenceHtml } from "../src/features/reference-html.js";

const link = (path: string) => `https://docs.example.com${path}`;

describe("referenceHtml", () => {
  it("shows a setting with its values, the written one marked, and its reference link", () => {
    const html = referenceHtml(
      {
        title: "mode",
        subtitle: "Setting of adf-copy",
        text: "What each window copies.",
        values: [
          { value: "full", text: "The whole table." },
          { value: "incremental", text: "Rows changed, by `watermark_column`.", current: true },
        ],
        facts: [
          { label: "Default", value: "full", code: true },
          { label: "Usually in", value: "the platform" },
        ],
        docs: "/docs/reference/packs/adf#adf-copy-mode",
      },
      link,
    );
    expect(html).toContain("<h1>mode</h1>");
    expect(html).toContain('<li class="current"><code>incremental</code>');
    expect(html).toContain("<code>watermark_column</code>");
    expect(html).toContain(
      'href="https://docs.example.com/docs/reference/packs/adf#adf-copy-mode"',
    );
    expect(html).toContain("<dd><code>full</code></dd>");
    expect(html).toContain("<dd>the platform</dd>");
    expect(html).not.toContain("<script");
    expect(html).toContain("default-src 'none'");
  });

  it("shows the problems on the line with their quick fixes", () => {
    const html = referenceHtml(
      {
        title: "source",
        subtitle: "Field of Flow",
        problems: [
          {
            code: "BROKEN_LINK",
            severity: "error",
            message: '"shops" is not the id of a Connection document.',
            meaning: "A document names an id that no document of that kind has.",
            fixes: ['Change to "shop"'],
            docs: "/docs/reference/errors#BROKEN_LINK",
          },
        ],
      },
      link,
    );
    expect(html).toContain("BROKEN_LINK");
    expect(html).toContain("&quot;shops&quot; is not the id");
    expect(html).toContain("Change to &quot;shop&quot;");
  });

  it("escapes everything it shows", () => {
    expect(referenceHtml({ title: "<b>x</b>", subtitle: "s" }, link)).toContain(
      "&lt;b&gt;x&lt;/b&gt;",
    );
  });

  it("says what to do when there is nothing to show", () => {
    expect(referenceHtml(undefined, link)).toContain(
      "Put the cursor on a field, a value or a problem in an Ingestron file.",
    );
  });

  it("lists the tables that use a method and what chose it", () => {
    const html = referenceHtml(
      {
        title: "adf-copy",
        subtitle: "Method of the adf pack (ingest)",
        usedBy: ["`invoices` (ingest): chosen by the adf pack's rule for `connectivity: private`"],
        fields: [{ name: "landing", docs: "/docs/reference/packs/adf#adf-copy-landing" }],
        fieldsHeading: "Settings",
      },
      link,
    );
    expect(html).toContain("<h2>Used by</h2>");
    expect(html.indexOf("Used by")).toBeLessThan(html.indexOf("<h2>Settings</h2>"));
    expect(html).toContain(
      "<code>invoices</code> (ingest): chosen by the adf pack&#39;s rule".replace("&#39;", "'"),
    );
  });

  it("says what each of the project's packs does with a contract field", () => {
    const html = referenceHtml(
      {
        title: "physicalName",
        subtitle: "Field of DataContract",
        packs: [{ pack: "databricks", status: "Not yet", text: "Columns are read by name." }],
      },
      link,
    );
    expect(html).toContain("<h2>In this project</h2>");
    expect(html).toContain(
      "<code>databricks</code>: <strong>Not yet</strong>. Columns are read by name.",
    );
  });
});

describe("referenceHtml for a problem with its own hint", () => {
  it("shows the hint instead of the code's general meaning, and docs links as links", () => {
    const html = referenceHtml(
      {
        title: "quality",
        subtitle: "Field of DataContract",
        problems: [
          {
            code: "SCHEMA",
            severity: "error",
            message: "quality[0] does not match any of the forms allowed here.",
            hint: "Give one of: mustBe, mustNotBe.",
            meaning: "A field is unknown, missing or has the wrong type.",
            fix: "Compare with [Documents](/docs/reference/documents).",
            fixes: [],
          },
          {
            code: "UNKNOWN_KIND",
            severity: "error",
            message: "No kind.",
            meaning: "The document's kind is not one Ingestron knows.",
            fix: "See [Documents](/docs/reference/documents).",
            fixes: [],
          },
        ],
      },
      (path) => `https://docs.example.com${path}`,
    );
    expect(html).toContain("Give one of: mustBe, mustNotBe.");
    expect(html).not.toContain("A field is unknown");
    expect(html).toContain(
      'See <a href="https://docs.example.com/docs/reference/documents">Documents</a>.',
    );
  });
});

describe("referenceHtml for a warning", () => {
  it("marks it in the warning colour, not the error colour", () => {
    const html = referenceHtml(
      {
        title: "unique",
        subtitle: "Field of DataContract",
        problems: [
          { code: "CAPABILITY_OFF", severity: "warning", message: "Off.", fixes: [] },
          { code: "SCHEMA", severity: "error", message: "Wrong.", fixes: [] },
        ],
      },
      (path) => path,
    );
    expect(html).toContain('<div class="problem warning">');
    expect(html).toContain('<div class="problem">');
  });
});

describe("referenceHtml while browsing the reference", () => {
  it("shows Back and Open in browser above the entry", () => {
    const html = referenceHtml(
      { title: "landing", subtitle: "Setting of adf-copy" },
      (path) => path,
      { back: "command:ingestron.referenceBack", external: "https://docs.example.com/x" },
    );
    expect(html).toContain('<a href="command:ingestron.referenceBack">← Back</a>');
    expect(html).toContain('<a href="https://docs.example.com/x">Open in browser ↗</a>');
    expect(html.indexOf("← Back")).toBeLessThan(html.indexOf("<h1>"));
  });
});
