// What the Project view shows: for each project its environments (the chosen
// one marked; clicking one selects it) and the actions that run on it.

/** One row of the Project view. A row with a `command` runs it when clicked. */
export interface TreeNode {
  label: string;
  description?: string;
  /** A codicon name, without the `$(…)`. */
  icon: string;
  command?: { id: string; args: unknown[] };
  children?: TreeNode[];
}

/** A project as the view needs it. `chosen` is the environment commands use now. */
export interface ProjectInfo {
  folder: string;
  id: string;
  environments: string[];
  chosen?: string;
}

const actions = [
  { id: "ingestron.check", label: "Check", icon: "pass" },
  { id: "ingestron.plan", label: "Plan", icon: "checklist" },
  { id: "ingestron.apply", label: "Apply", icon: "play" },
  { id: "ingestron.compareEnvironments", label: "Compare environments", icon: "diff" },
  { id: "ingestron.platformRequest", label: "Prepare platform request", icon: "mail" },
  { id: "ingestron.showGenerated", label: "Show generated files", icon: "file-code" },
];

/**
 * The rows for the projects: with one project, its environments and actions at
 * the top level; with several, one row for each project holding them.
 * `uriOf` turns a project folder into what the action commands take as their
 * argument (a VS Code Uri); the select-environment command takes the folder's path.
 */
export function projectTree(
  projects: ProjectInfo[],
  uriOf: (folder: string) => unknown = (folder) => folder,
): TreeNode[] {
  const parts = projects.map((project) => projectNodes(project, uriOf));
  const [only] = parts;
  if (only && parts.length === 1) return only;
  return projects.map((project, index) => ({
    label: project.id,
    description: project.folder,
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
            icon: "server-environment",
            children: project.environments.map((name) => environmentNode(project, name)),
          },
        ];
  return [
    ...environments,
    ...actions.map(({ id, label, icon }) => ({ label, icon, command: { id, args: [target] } })),
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
