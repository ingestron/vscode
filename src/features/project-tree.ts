// What the Project view shows: for each project its environments (the chosen
// one marked; clicking one selects it for problems, previews and the platform
// request) and the actions that run on it. Plan, Apply and Check generate every
// environment together, whichever is selected.

import { basename, sep } from "node:path";

/**
 * True for a project.yaml. It is the one file whose edits change what the
 * view shows (the project's environments), so the view refreshes for it and
 * not for every edit in the workspace.
 */
export function isProjectManifest(path: string): boolean {
  return basename(path) === "project.yaml";
}

/** One row of the Project view. A row with a `command` runs it when clicked. */
export interface TreeNode {
  label: string;
  description?: string;
  /** What the row is for, on hover. */
  tooltip?: string;
  /** A codicon name, without the `$(…)`. */
  icon: string;
  /** Tells rows with the same label apart among their siblings; the label when absent. */
  key?: string;
  command?: { id: string; args: unknown[] };
  children?: TreeNode[];
  /** The project folder a row stands for. Only the rows of several projects have one. */
  folder?: string;
}

/** A project as the view needs it. `chosen` is the environment problems and previews show now. */
export interface ProjectInfo {
  folder: string;
  id: string;
  environments: string[];
  chosen?: string;
}

const actions: { id: string; label: string; icon: string; tooltip?: string }[] = [
  {
    id: "ingestron.check",
    label: "Check",
    icon: "pass",
    tooltip: "Check that build/ is up to date, for every environment",
  },
  {
    id: "ingestron.plan",
    label: "Plan",
    icon: "checklist",
    tooltip: "Show what would change in build/, for every environment",
  },
  {
    id: "ingestron.apply",
    label: "Apply",
    icon: "play",
    tooltip: "Write every environment's files to build/, one folder for each platform",
  },
  { id: "ingestron.compareEnvironments", label: "Compare environments", icon: "diff" },
  {
    id: "ingestron.platformRequest",
    label: "Prepare platform request",
    icon: "mail",
    tooltip: "Write what to ask the platform team, for the selected environment",
  },
  {
    id: "ingestron.showGenerated",
    label: "Show generated files",
    icon: "file-code",
    tooltip: "Show the files generated for the selected environment",
  },
];

/**
 * The rows for the projects: with one project, its environments and actions at
 * the top level; with several, one row for each project holding them.
 * `uriOf` turns a project folder into what the action commands take as their
 * argument (a VS Code Uri); the select-environment command takes the folder's path.
 * `shown` spells a folder for the description of a project's row, such as
 * relative to the workspace; it defaults to the folder as it is.
 */
export function projectTree(
  projects: ProjectInfo[],
  uriOf: (folder: string) => unknown = (folder) => folder,
  shown: (folder: string) => string = (folder) => folder,
): TreeNode[] {
  const parts = projects.map((project) => projectNodes(project, uriOf));
  const [only] = parts;
  if (only && parts.length === 1) return only;
  return projects.map((project, index) => ({
    label: project.id,
    // Two projects can share an id, but not a folder.
    key: project.folder,
    folder: project.folder,
    description: shown(project.folder),
    icon: "folder",
    children: parts[index],
  }));
}

function projectNodes(project: ProjectInfo, uriOf: (folder: string) => unknown): TreeNode[] {
  const target = uriOf(project.folder);
  const environments: TreeNode[] =
    project.environments.length === 0
      ? []
      : [
          {
            label: "Environments",
            tooltip:
              "Problems, previews and the platform request show the selected environment. Plan, Apply and Check work on every environment together.",
            icon: "server-environment",
            children: project.environments.map((name) => environmentNode(project, name)),
          },
        ];
  return [
    ...environments,
    ...actions.map(({ id, label, icon, tooltip }) => ({
      label,
      ...(tooltip && { tooltip }),
      icon,
      command: { id, args: [target] },
    })),
  ];
}

function environmentNode(project: ProjectInfo, name: string): TreeNode {
  const selected = name === project.chosen;
  return {
    label: name,
    ...(selected && { description: "selected" }),
    icon: selected ? "check" : "circle-outline",
    command: { id: "ingestron.selectEnvironment", args: [project.folder, name] },
  };
}

/** A row's identity in the tree: its parent's, then its own key. Unique among all rows. */
export function rowId(parent: string, node: TreeNode): string {
  return `${parent}/${node.key ?? node.label}`;
}

/** How a row starts out in the tree. */
export type Fold = "expanded" | "collapsed" | "none";

/**
 * How a row starts: a row without children has nothing to fold; of several
 * projects only the active one is open, and everything else is open as it is
 * shown. `active` is the folder of the project being worked on.
 */
export function foldOf(node: TreeNode, active: string | undefined): Fold {
  if (!node.children) return "none";
  if (node.folder === undefined || node.folder === active) return "expanded";
  return "collapsed";
}

/**
 * The folder of the project that holds `file` (the innermost, when projects
 * are nested), or undefined when none does. Compares paths and reads nothing.
 */
export function owningFolder(folders: string[], file: string): string | undefined {
  const holders = folders.filter(
    (folder) => file === folder || file.startsWith(folder.endsWith(sep) ? folder : folder + sep),
  );
  return holders.sort((a, b) => b.length - a.length)[0];
}

/**
 * The project the view follows after the active editor shows `file`: that
 * file's project, else the one followed so far (a file outside every project,
 * or no editor, changes nothing) as long as it is still one of `folders`.
 * With fewer than two projects there is nothing to follow.
 */
export function followedFolder(
  folders: string[],
  file: string | undefined,
  followed: string | undefined,
): string | undefined {
  if (folders.length < 2) return undefined;
  const holder = file === undefined ? undefined : owningFolder(folders, file);
  if (holder !== undefined) return holder;
  return followed !== undefined && folders.includes(followed) ? followed : undefined;
}
