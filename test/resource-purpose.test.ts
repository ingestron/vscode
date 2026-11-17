// File actions belong to the selected resource, including custom and nested layouts.
import { describe, expect, it } from "vitest";
import { resourcePurposes } from "../src/features/resource-purpose.js";

const root = "/work/retail";

describe("Explorer purposes", () => {
  it("classifies declared kinds in custom folders without showing project actions on contracts", () => {
    const files = new Map([
      [`${root}/project.yaml`, "id: retail"],
      [`${root}/models/orders.yaml`, "kind: Flow\nid: orders"],
      [`${root}/inputs/erp.yaml`, "kind: Connection\nid: erp"],
      [`${root}/observations/erp.yaml`, "kind: SourceMetadata"],
      [`${root}/contracts/orders.yaml`, "kind: DataContract"],
      [`${root}/contracts/temp.yaml`, ""],
    ]);
    const keys = resourcePurposes(files, [root]);
    expect(keys.projectManifests).toEqual({ [`${root}/project.yaml`]: true });
    expect(keys.flowFiles).toEqual({ [`${root}/models/orders.yaml`]: true });
    expect(keys.connectionFiles).toEqual({ [`${root}/inputs/erp.yaml`]: true });
    expect(keys.flowFolders).toHaveProperty(`${root}/models`, true);
    expect(keys.sourceFolders).toHaveProperty(`${root}/observations`, true);
    expect(keys.connectionFolders).toHaveProperty(`${root}/connections`, true);
  });

  it("does not treat unrelated, malformed or generated YAML as an editable definition", () => {
    const inner = `${root}/nested`;
    const files = new Map([
      [`${root}-other/source.yaml`, "kind: Flow"],
      [`${root}/broken.yaml`, "kind: ["],
      [`${inner}/build/pipeline.yaml`, "kind: Flow"],
      [`${inner}/flow.yml`, "kind: Flow"],
    ]);
    expect(resourcePurposes(files, [root, inner]).flowFiles).toEqual({
      [`${inner}/flow.yml`]: true,
    });
    expect(resourcePurposes(files, []).flowFiles).toEqual({});
  });
});
