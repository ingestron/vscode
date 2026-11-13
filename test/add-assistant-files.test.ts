// Add assistant files: the notice after the files are written, and the warning when the command
// exits 1 because some were not.
import { beforeEach, expect, it, vi } from "vitest";
import type * as vscode from "vscode";

const host = vi.hoisted(() => ({
  command: undefined as undefined | (() => Promise<void>),
  exitCode: 0,
  ran: [] as string[][],
  information: [] as [string, string[]][],
  warnings: [] as [string, string[]][],
  opened: [] as string[],
}));
vi.mock("@ingestron/cli", () => ({
  run: (args: string[]) => {
    host.ran.push(args);
    return host.exitCode;
  },
}));
vi.mock("vscode", () => ({
  commands: {
    registerCommand: (_id: string, action: () => Promise<void>) => {
      host.command = action;
    },
  },
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  window: {
    showQuickPick: async (items: { label: string }[]) => [items[0]],
    showInformationMessage: async (message: string, ...buttons: string[]) => {
      host.information.push([message, buttons]);
      return buttons[0];
    },
    showWarningMessage: async (message: string, ...buttons: string[]) => {
      host.warnings.push([message, buttons]);
      return undefined;
    },
    showTextDocument: async (uri: { fsPath: string }) => void host.opened.push(uri.fsPath),
  },
}));
import { registerAddAssistantFiles } from "../src/vscode/wizard/wizard-assistants.js";

beforeEach(() => {
  host.exitCode = 0;
  host.ran = [];
  host.information = [];
  host.warnings = [];
  host.opened = [];
  registerAddAssistantFiles(
    { subscriptions: [] } as unknown as vscode.ExtensionContext,
    { hereFor: () => ({ project: { folder: "/work/shop" } }) } as never,
    { clear: () => {}, show: () => {}, append: () => {} } as unknown as vscode.OutputChannel,
  );
});

it("says the files were added, with the button that opens the guide, when the command succeeds", async () => {
  await host.command!();
  expect(host.ran).toHaveLength(1);
  expect(host.information).toEqual([
    ["Added the assistant files. The Ingestron output lists each one.", ["Open AGENTS.md"]],
  ]);
  expect(host.warnings).toEqual([]);
  expect(host.opened).toEqual(["/work/shop/AGENTS.md"]);
});

it("warns that some files were not written when the command exits 1, and says nothing was added", async () => {
  host.exitCode = 1;
  await host.command!();
  expect(host.warnings).toEqual([
    ["Some assistant files were not written. The Ingestron output says why.", []],
  ]);
  expect(host.information).toEqual([]);
  expect(host.opened).toEqual([]);
});
