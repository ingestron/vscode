// Editor interaction for core's independent connection/flow drafts; no connector protocols.
import { askSettings } from "./connection-settings.js";
import { join } from "node:path";
import * as vscode from "vscode";
import {
  writeDefinitionDraft,
  draftConnection,
  draftFlow,
  nameProblem,
  projectAdditions,
  type DefinitionDraft,
} from "@ingestron/core";
import type { ExtensionState, Here } from "../state/index.js";
import { addedNote, importIn } from "./import-in.js";

/** Register the source and flow actions for project menus and the Command Palette. */
export function registerAddDefinitions(
  context: vscode.ExtensionContext,
  state: ExtensionState,
): void {
  for (const kind of ["Connection", "Flow"] as const)
    context.subscriptions.push(
      vscode.commands.registerCommand(`ingestron.add${kind}`, (uri?: vscode.Uri) =>
        addDefinition(state, kind, uri),
      ),
    );
}

async function addDefinition(
  state: ExtensionState,
  kind: "Connection" | "Flow",
  uri?: vscode.Uri,
): Promise<void> {
  const here = state.hereFor(uri);
  if (!here)
    return void vscode.window.showWarningMessage(
      "Open a project file or choose the action in its Project panel.",
    );
  try {
    const environment = state.environmentHere(here);
    const draft =
      kind === "Connection"
        ? await connectionDraft(here, environment)
        : await flowDraft(here, environment);
    if (!draft) return;
    const { imports, ...file } = draft;
    const manifest = here.project.files.read("project.yaml") ?? "";
    writeDefinitionDraft(here.project.folder, file);
    const unsaved = imports ? await importIn(here.project.folder, manifest, imports) : [];
    const target = vscode.Uri.file(join(here.project.folder, draft.file));
    state.forget(target.fsPath);
    await vscode.window.showTextDocument(target);
    if (imports) void vscode.window.showInformationMessage(addedNote(draft.file, imports, unsaved));
    if (kind === "Connection") await offerMetadata(here);
  } catch (cause) {
    await vscode.window.showErrorMessage(cause instanceof Error ? cause.message : String(cause));
  }
}

async function connectionDraft(
  here: Here,
  environment?: string,
): Promise<DefinitionDraft | undefined> {
  const choices = projectAdditions(here.project.files, environment).connectors;
  const unique = choices.filter(
    (item, index) => choices.findIndex((other) => other.connector === item.connector) === index,
  );
  if (!unique.length)
    throw new Error("The standard has no supported ingestion connectors; review its packs.");
  const picked = await vscode.window.showQuickPick(
    unique.map((choice) => ({ label: choice.title, description: choice.connector, choice })),
    {
      title: "Add connection: connector",
      placeHolder: "Connectors supported by this project's standard",
    },
  );
  if (!picked) return;
  const networks = connectorNetworks(choices, picked.choice.connector);
  const connectivity = await vscode.window.showQuickPick(networks, {
    title: "Add connection: reachability",
    placeHolder: "Where can the target platform reach this source?",
  });
  if (!connectivity) return;
  const profile = await connectionProfile(choices, picked.choice.connector, connectivity);
  if (!profile) return;
  const id = await newId("connection", picked.choice.connector.replaceAll("-", "_"));
  if (!id) return;
  const settings = await askSettings(profile, id);
  if (!settings) return;
  return draftConnection(here.project.files, {
    id,
    connector: profile.connector,
    method: profile.method,
    connectivity,
    settings,
    ...(environment && { environment }),
  });
}

async function flowDraft(here: Here, environment?: string): Promise<DefinitionDraft | undefined> {
  const choices = projectAdditions(here.project.files, environment);
  const connection = await vscode.window.showQuickPick(
    choices.connections.map((item) => ({
      label: item.id,
      description: item.connector,
      connection: item,
    })),
    { title: "Add flow: connection", placeHolder: "Choose an existing connection" },
  );
  if (!connection) return;
  const source = connection.connection;
  const available = [
    ...new Set(
      choices.connectors
        .filter(
          (item) =>
            item.connector === source.connector && item.connectivity.includes(source.connectivity),
        )
        .map((item) => item.method),
    ),
  ];
  const method =
    available.length === 1
      ? available[0]
      : await vscode.window.showQuickPick(available, { title: "Add flow: ingestion method" });
  if (!method) return;
  const objects = await chooseObjects(choices.objects[source.id] ?? []);
  if (!objects?.length) return;
  const id = await newId("flow", source.id);
  return id
    ? draftFlow(here.project.files, {
        id,
        connection: source.id,
        objects,
        method,
        ...(environment && { environment }),
      })
    : undefined;
}

async function chooseObjects(objects: string[]): Promise<string[] | undefined> {
  if (objects.length)
    return vscode.window.showQuickPick(objects, {
      title: "Add flow: source objects",
      placeHolder: "Select the objects to ingest",
      canPickMany: true,
    });
  const object = await vscode.window.showInputBox({
    title: "Add flow: source object",
    prompt:
      "No imported catalogue yet. Enter the complete source object, or cancel and import metadata first.",
  });
  return object ? [object] : undefined;
}

async function newId(kind: string, value: string): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title: `Add ${kind}: id`,
    value,
    prompt: "Lowercase letters, digits and underscores",
    validateInput: (text) => nameProblem(text, "project"),
  });
}

async function offerMetadata(here: Here): Promise<void> {
  const chosen = await vscode.window.showInformationMessage(
    "Connection added. Review its settings, then request or import source metadata. Add a flow when you are ready.",
    "Request metadata",
    "Import metadata",
  );
  const command =
    chosen === "Request metadata"
      ? "ingestron.requestSourceMetadata"
      : chosen === "Import metadata"
        ? "ingestron.importSourceMetadata"
        : undefined;
  if (command) await vscode.commands.executeCommand(command, vscode.Uri.file(here.project.folder));
}

function connectorNetworks(
  choices: ReturnType<typeof projectAdditions>["connectors"],
  connector: string,
): string[] {
  const networks = [
    ...new Set(
      choices.filter((item) => item.connector === connector).flatMap((item) => item.connectivity),
    ),
  ];
  return networks;
}

async function connectionProfile(
  choices: ReturnType<typeof projectAdditions>["connectors"],
  connector: string,
  connectivity: string,
) {
  const profiles = choices.filter(
    (item) => item.connector === connector && item.connectivity.includes(connectivity),
  );
  if (profiles.length === 1) return profiles[0];
  const picked = await vscode.window.showQuickPick(
    profiles.map((profile) => ({ label: profile.method, profile })),
    {
      title: "Add connection: ingestion method",
      placeHolder: "Choose the connection settings for this method",
    },
  );
  return picked?.profile;
}
