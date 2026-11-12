// The extension's limits live in one documented object, so a change is made in one place.
import { describe, expect, it } from "vitest";
import { limits } from "../src/features/limits.js";

describe("limits", () => {
  it("keeps the debounce times and caps in one object", () => {
    expect(limits).toEqual({
      projectViewSettleMs: 150,
      contextKeysSettleMs: 200,
      yamlFilesPerProject: 5000,
      sourceImportSettleMs: 500,
      sourceImportBytes: 50 * 1024 * 1024,
      projectsPerWorkspace: 1000,
    });
  });
});
