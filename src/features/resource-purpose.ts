// Explorer actions follow a document's declared purpose, including custom layouts.
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { inBuildFolder, projectFilesOf } from "./context-keys.js";

type Paths = Record<string, true>;

/** Context keys for manifests, typed files and their folders; invalid drafts get no file actions. */
export function resourcePurposes(
  files: ReadonlyMap<string, string>,
  folders: string[],
): Record<string, Paths> {
  const keys: Record<string, Paths> = {
    projectManifests: {},
    connectionFiles: {},
    flowFiles: {},
    connectionFolders: {},
    flowFolders: {},
    sourceFolders: {},
  };
  for (const folder of folders) {
    keys.projectManifests![join(folder, "project.yaml")] = true;
    keys.connectionFolders![join(folder, "connections")] = true;
    keys.flowFolders![join(folder, "flows")] = true;
    keys.sourceFolders![join(folder, "sources")] = true;
  }
  const members = projectFilesOf([...files.keys()], folders);
  for (const [file, text] of files) {
    if (!members[file] || inBuildFolder(file, folders)) continue;
    const purpose = purposeOf(text);
    if (purpose === "Connection") {
      keys.connectionFiles![file] = true;
      keys.connectionFolders![dirname(file)] = true;
    } else if (purpose === "Flow") {
      keys.flowFiles![file] = true;
      keys.flowFolders![dirname(file)] = true;
    } else if (purpose === "SourceMetadata") keys.sourceFolders![dirname(file)] = true;
  }
  return keys;
}

function purposeOf(text: string): unknown {
  try {
    return (parse(text) as { kind?: unknown } | null)?.kind;
  } catch {
    return undefined;
  }
}
