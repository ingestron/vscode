// ExtensionState: the projects the extension has open, the environment chosen for
// each, kept in the workspace's memory so a restart keeps it, and the change events.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";

vi.mock("vscode", () => {
  class EventEmitter<T> {
    listeners: ((value: T) => void)[] = [];
    event = (listener: (value: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => {} };
    };
    fire(value: T) {
      for (const listener of this.listeners) listener(value);
    }
    dispose() {
      this.listeners = [];
    }
  }
  const file = (fsPath: string) => ({ scheme: "file", fsPath, query: "" });
  return {
    EventEmitter,
    Uri: { file },
    workspace: { textDocuments: [] },
    window: { activeTextEditor: undefined },
  };
});
import { ExtensionState } from "../src/vscode/state/index.js";

/** A memento that keeps what it is given, as the workspace's memory does. */
function memento(saved: Record<string, unknown> = {}): vscode.Memento {
  const values = new Map(Object.entries(saved));
  return {
    keys: () => [...values.keys()],
    get: <T>(key: string) => values.get(key) as T,
    update: async (key: string, value: unknown) => {
      values.set(key, value);
    },
  } as vscode.Memento;
}

/** A project folder declaring dev and prod. */
function projectFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), "ingestron-state-"));
  writeFileSync(
    join(folder, "project.yaml"),
    "apiVersion: ingestron.io/v1\nkind: Project\nid: shop\nenvironments:\n  dev: {}\n  prod: {}\n",
  );
  return folder;
}
const fileIn = (folder: string) =>
  ({ scheme: "file", fsPath: join(folder, "project.yaml") }) as vscode.Uri;

describe("ExtensionState", () => {
  it("opens one snapshot per project folder until a path in it is forgotten", () => {
    const folder = projectFolder();
    const state = new ExtensionState(memento());
    const here = state.projectAt(fileIn(folder))!;
    expect(here.file).toBe("project.yaml");
    expect(here.project.environments).toEqual(["dev", "prod"]);
    expect(state.projectAt(fileIn(folder))!.project).toBe(here.project);
    state.forget(join(folder, "flows/shop.yaml"));
    expect(state.projectAt(fileIn(folder))!.project).not.toBe(here.project);
  });

  it("chooses the first environment until another is chosen", () => {
    const folder = projectFolder();
    const state = new ExtensionState(memento());
    const { project } = state.projectAt(fileIn(folder))!;
    expect(state.environmentOf(project)).toBe("dev");
    state.chooseEnvironment(project, "prod");
    expect(state.environmentOf(project)).toBe("prod");
  });

  it("keeps the chosen environment in the workspace's memory, for after a restart", () => {
    const folder = projectFolder();
    const memory = memento();
    const first = new ExtensionState(memory);
    first.chooseEnvironment(first.projectAt(fileIn(folder))!.project, "prod");
    const restarted = new ExtensionState(memory);
    expect(restarted.environmentOf(restarted.projectAt(fileIn(folder))!.project)).toBe("prod");
  });

  it("ignores a remembered environment the project no longer declares", () => {
    const folder = projectFolder();
    const state = new ExtensionState(memento({ "ingestron.environments": { [folder]: "test" } }));
    expect(state.environmentOf(state.projectAt(fileIn(folder))!.project)).toBe("dev");
  });

  it("tells listeners when an environment is chosen, and when files change", () => {
    const folder = projectFolder();
    const state = new ExtensionState(memento());
    const seen: string[] = [];
    state.onProjectChange(() => seen.push("project"));
    state.onEnvironmentChange(() => seen.push("environment"));
    state.chooseEnvironment(state.projectAt(fileIn(folder))!.project, "prod");
    state.forget(folder);
    expect(seen).toEqual(["project", "environment", "project"]);
  });

  it("gives a preview's own environment over the chosen one", () => {
    const folder = projectFolder();
    const state = new ExtensionState(memento());
    const here = state.projectAt(fileIn(folder))!;
    expect(state.environmentHere(here)).toBe("dev");
    expect(state.environmentHere({ ...here, environment: "prod" })).toBe("prod");
  });
});
