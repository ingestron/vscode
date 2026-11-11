// Bundles the extension and the Ingestron packages into dist/extension.js,
// and copies the data folders the packages ship beside it: the definitions'
// schemas, the Databricks pack's SQL templates, the ADF pack's connector
// recipes, the starters (core's project templates) and the published standards (the
// standards package's kits). In the bundle, import.meta.url is the bundle's own file, so
// "../schemas" and the others resolve to these copies. The bundle cannot resolve
// @ingestron/standards; core looks for the kits at "../kits" first.
import { cpSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { thirdPartyNotices } from "./third-party-notices.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

rmSync(join(root, "dist"), { recursive: true, force: true });
const { metafile } = await build({
  entryPoints: [join(root, "src/extension.ts")],
  outfile: join(root, "dist/extension.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  external: ["vscode"],
  define: { "import.meta.url": "__importMetaUrl" },
  banner: { js: 'var __importMetaUrl = require("node:url").pathToFileURL(__filename).href;' },
  metafile: true,
  absWorkingDir: root,
  logLevel: "warning",
});
writeFileSync(join(root, "THIRD_PARTY_NOTICES"), thirdPartyNotices(metafile, root));

// The data folders come from the packages @ingestron/core itself resolves, the
// same versions the bundle's code comes from, not whatever the extension lists.
const core = realpathSync(join(root, "node_modules/@ingestron/core"));
const installed = (name) => (name === "core" ? core : join(dirname(core), name));
const notGenerated = (path) => !/\/(build|\.generated\.json)(\/|$)/.test(path);
for (const [from, to] of [
  ["definitions/schemas", "schemas"],
  ["pack-databricks/templates", "templates"],
  ["pack-adf/recipes", "recipes"],
  ["core/project-templates", "project-templates"],
  ["standards/kits", "kits"],
]) {
  rmSync(join(root, to), { recursive: true, force: true });
  cpSync(installed(from), join(root, to), { recursive: true, filter: notGenerated });
}
console.log("✓ dist/extension.cjs and data folders");
