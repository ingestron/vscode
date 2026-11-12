// Every limit the project view and the context keys work within, in one place.

/** The limits, with their defaults. Change a number here, not at a call site. */
export const limits = {
  /** Milliseconds changes settle before the Project view is rebuilt, so typing does not redraw it each key. */
  projectViewSettleMs: 150,
  /** Milliseconds structural changes settle before the context keys list the files again. */
  contextKeysSettleMs: 200,
  /** Milliseconds the saves of one source file settle before it is imported, so one save imports once. */
  sourceImportSettleMs: 500,
  /** The most YAML files read from one project; a project with more is keyed for its first ones only. */
  yamlFilesPerProject: 5000,
  /** The most project folders found in a workspace; more are ignored. */
  projectsPerWorkspace: 1000,
};
