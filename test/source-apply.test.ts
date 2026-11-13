// What the person is told after imports: one notice for the imports of one drain of the queue,
// a lone import as it always was, refusals never folded in, and a file that cannot be read.
import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  /** Files by path: text, or an error stat gives for it. */
  files: new Map<string, string | Error>(),
  information: [] as [string, string[]][],
  warnings: [] as [string, string[]][],
  /** The button pressed for the next notice, if any. */
  press: undefined as string | undefined,
  applied: 0,
}));
vi.mock("vscode", () => {
  class FileSystemError extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message);
    }
  }
  class Range {
    constructor(
      readonly start: number,
      readonly end: number,
    ) {}
  }
  class WorkspaceEdit {
    replace() {}
    createFile() {}
  }
  const notice =
    (into: [string, string[]][]) =>
    async (message: string, ...buttons: string[]) => {
      into.push([message, buttons]);
      return host.press && buttons.includes(host.press) ? host.press : undefined;
    };
  return {
    FileSystemError,
    Range,
    WorkspaceEdit,
    Uri: { file: (fsPath: string) => ({ fsPath }) },
    workspace: {
      fs: {
        stat: async (uri: { fsPath: string }) => {
          const file = host.files.get(uri.fsPath);
          if (file === undefined) throw new FileSystemError("not there", "FileNotFound");
          if (file instanceof Error) throw file;
          return { type: 1, size: file.length };
        },
      },
      applyEdit: async () => {
        host.applied += 1;
        return true;
      },
      openTextDocument: async (uri: { fsPath: string }) => ({
        getText: () => String(host.files.get(uri.fsPath)),
        positionAt: (offset: number) => offset,
        isDirty: false,
      }),
    },
    window: {
      showInformationMessage: notice(host.information),
      showWarningMessage: notice(host.warnings),
    },
  };
});
import type * as vscode from "vscode";
import { applyImport, reportImport, reportRefusal } from "../src/vscode/editor/source-apply.js";
import { queued, registerImportQueue } from "../src/vscode/editor/source-queue.js";

const folder = "/work/shop";
const edit = (summary: string, breaking = 0) => ({
  files: [{ file: "sources/erp.yaml", text: "new" }],
  summary,
  breaking,
});
const changes =
  "sources/erp.yaml: 1 added, 0 changed, 0 removed.\nCompatible:\n  ERP.dbo.A: added\n";
const shown: string[] = [];
const show = async (text: string) => void shown.push(text);

beforeEach(() => {
  registerImportQueue({ subscriptions: [] } as unknown as vscode.ExtensionContext);
  host.files.clear();
  host.files.set(`${folder}/sources/erp.yaml`, "old");
  host.information.length = 0;
  host.warnings.length = 0;
  host.press = undefined;
  host.applied = 0;
  shown.length = 0;
});

describe("one notice per batch of imports", () => {
  it("tells a lone import as it always was, with its changes behind the button", async () => {
    host.press = "Show all changes";
    await queued(() => reportImport(edit(changes), "sources/erp/A.csv", folder, show));
    expect(host.information).toEqual([
      ["sources/erp.yaml: 1 added, 0 changed, 0 removed.", ["Show all changes"]],
    ]);
    await vi.waitFor(() => expect(shown).toEqual([changes]));
  });

  it("tells five imports that finish while the queue drains as one notice", async () => {
    host.press = "Show all changes";
    const names = ["A", "B", "C", "D", "E"].map((name) => `sources/erp/${name}.csv`);
    await Promise.all(
      names.map((name) => queued(() => reportImport(edit(changes, 1), name, folder, show))),
    );
    expect(host.information).toEqual([
      ["Imported 5 files: 5 tables changed, 5 breaking.", ["Show all changes"]],
    ]);
    await vi.waitFor(() => expect(shown).toHaveLength(1));
    expect(shown[0]).toBe(
      names.map((name) => `## ${name}\n\n\`\`\`text\n${changes.trimEnd()}\n\`\`\`\n`).join("\n"),
    );
  });

  it("tells imports that are not queued together as separate notices", async () => {
    await queued(() => reportImport(edit(changes), "sources/erp/A.csv", folder, show));
    await queued(() => reportImport(edit(changes), "sources/erp/B.csv", folder, show));
    expect(host.information).toHaveLength(2);
  });

  it("warns of several refusals once, with their reasons behind the button", async () => {
    host.press = "Show reasons";
    await Promise.all(
      ["A", "B"].map((name) =>
        queued(async () =>
          reportRefusal(
            `sources/erp/${name}.csv`,
            `${name}: Nothing was imported. Empty.`,
            ["Empty."],
            show,
          ),
        ),
      ),
    );
    expect(host.warnings).toEqual([["2 files could not be imported.", ["Show reasons"]]]);
    await vi.waitFor(() => expect(shown).toHaveLength(1));
    expect(shown[0]).toBe("## sources/erp/A.csv\n\n- Empty.\n\n## sources/erp/B.csv\n\n- Empty.\n");
  });

  it("never hides a refusal among imports", async () => {
    await Promise.all([
      queued(() => reportImport(edit(changes), "sources/erp/A.csv", folder, show)),
      queued(() => reportImport(edit(changes), "sources/erp/B.csv", folder, show)),
      queued(async () =>
        reportRefusal("sources/erp/C.csv", "C: Nothing was imported. Empty.", ["Empty."], show),
      ),
    ]);
    expect(host.information.map(([message]) => message)).toEqual([
      "Imported 2 files: 2 tables changed.",
    ]);
    expect(host.warnings).toEqual([["C: Nothing was imported. Empty.", []]]);
  });

  it("tells a refusal made outside the queue at once", async () => {
    reportRefusal("sources/erp/C.csv", "C: Nothing was imported. Empty.", ["Empty."], show);
    expect(host.warnings).toEqual([["C: Nothing was imported. Empty.", []]]);
  });
});

describe("a file that cannot be read", () => {
  it("is caught and named, with the reason and no absolute path", async () => {
    host.files.set(
      `${folder}/sources/erp.yaml`,
      Object.assign(new Error(`Unable to read ${folder}/sources/erp.yaml`), {
        code: "NoPermissions",
      }),
    );
    const failure = await applyImport(edit(changes), folder);
    expect(failure).toMatchObject({ file: "sources/erp.yaml", step: "read" });
    await queued(() => reportImport(edit(changes), "sources/erp/A.csv", folder, show));
    expect(host.warnings).toEqual([["Could not read sources/erp.yaml: NoPermissions.", []]]);
    expect(host.information).toEqual([]);
    expect(host.applied).toBe(0);
  });

  it("is not a missing file, which the import creates", async () => {
    host.files.delete(`${folder}/sources/erp.yaml`);
    expect(await applyImport(edit(changes), folder)).toBeUndefined();
    expect(host.applied).toBe(1);
  });
});
