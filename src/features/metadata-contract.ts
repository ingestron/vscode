// Optional contract conversion uses the same drafts as the CLI, with editor text edits.
import { fixEdits, formatDiagnostics, resolveProject, type FileSource } from "@ingestron/config";
import {
  definitionImport,
  draftContracts,
  type AddedImport,
  type ContractDraft,
} from "@ingestron/core";
import { textChange } from "./text-change.js";
import { kinds } from "@ingestron/definitions";

/** Available drafts for one flow, indexed by its table key. */
export interface MetadataDrafts {
  drafts: Map<string, ContractDraft>;
  problems: string[];
}
const cached = new WeakMap<FileSource, Map<string, MetadataDrafts>>();

/** Metadata-only tables, including those the standard does not require a contract for. */
export function metadataDrafts(
  files: FileSource,
  file: string,
  environment?: string,
): MetadataDrafts {
  let byFile = cached.get(files);
  if (!byFile) cached.set(files, (byFile = new Map()));
  const key = JSON.stringify([file, environment]);
  let found = byFile.get(key);
  if (!found) {
    found = flowDrafts(files, file, environment);
    byFile.set(key, found);
  }
  return found;
}

function flowDrafts(files: FileSource, file: string, environment?: string): MetadataDrafts {
  const loaded = resolveProject(files, {
    kinds: Object.values(kinds),
    ...(environment && { environment }),
    envvars: {},
    missingEnvvars: "information",
  });
  if (!loaded.ok) return { drafts: new Map(), problems: [formatDiagnostics(loaded.diagnostics)] };
  const flow = loaded.project.all(kinds.flow).find((item) => item.file === file)?.value;
  if (!flow) return { drafts: new Map(), problems: [] };
  const tables = Object.entries(flow.tables)
    .filter(([, table]) => !table.contract)
    .map(([name]) => `${flow.id}.${name}`);
  const found = draftContracts(files, { tables, ...(environment && { environment }), envvars: {} });
  return {
    drafts: new Map(found.drafts.map((draft) => [draft.table.slice(flow.id.length + 1), draft])),
    problems: found.problems,
  };
}

/** The draft and flow reference become one workspace edit; existing contracts are refused. */
export function metadataContractEdits(
  files: FileSource,
  file: string,
  table: string,
  draft: ContractDraft,
  environment?: string,
): ReturnType<typeof fixEdits> {
  if (files.read(draft.path) !== undefined)
    throw new Error(
      `${draft.path} already exists. Review it and add contract: ${draft.id} yourself; nothing changed.`,
    );
  const edits: Parameters<typeof fixEdits>[0]["edits"] = [
    {
      file,
      pointer: `/tables/${table.replaceAll("~", "~0").replaceAll("/", "~1")}/contract`,
      set: draft.id,
    },
  ];
  const linked = fixEdits({ title: "Draft contract from metadata", edits }, (path) =>
    files.read(path),
  );
  const imported = contractImport(files, draft, environment);
  if (!imported) return linked;
  return [...linked, textChange("project.yaml", files.read("project.yaml")!, imported.project)];
}

/**
 * The import that loads the draft, as Add connection and Add flow make it (spec/cli/projects.md,
 * "The new file's import"): the folder's pattern for its first contract, otherwise its own path,
 * keeping project.yaml's layout; none when an import loads it already.
 */
export function contractImport(
  files: FileSource,
  draft: ContractDraft,
  environment?: string,
): AddedImport | undefined {
  if (importsDraft(files, draft, environment)) return undefined;
  return definitionImport(files, draft.path);
}

function importsDraft(files: FileSource, draft: ContractDraft, environment?: string): boolean {
  const added: FileSource = {
    list: () => [...files.list(), draft.path],
    read: (path) => (path === draft.path ? draft.text : files.read(path)),
  };
  const loaded = resolveProject(added, {
    kinds: Object.values(kinds),
    ...(environment && { environment }),
    envvars: {},
    missingEnvvars: "information",
  });
  return loaded.project?.documents.some((document) => document.file === draft.path) ?? false;
}
