// Builds THIRD_PARTY_NOTICES for a bundle from esbuild's metafile: every
// third-party package whose code went into the bundle, with its licence text.
// MIT, ISC and BSD licences require their notice in every copy.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** The folder of the package that owns `file`: the nearest package.json with a name. */
function packageFolder(file) {
  for (let folder = dirname(file); folder !== dirname(folder); folder = dirname(folder)) {
    const manifest = join(folder, "package.json");
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name) return folder;
  }
  return undefined;
}

function licenceText(folder) {
  const file = readdirSync(folder).find((name) => /^(licen[cs]e|copying)(\.|$)/i.test(name));
  return file ? readFileSync(join(folder, file), "utf8").trim() : undefined;
}

/**
 * The notices text for the packages whose files are inputs of `metafile`.
 * @param metafile esbuild's metafile; input paths are relative to `cwd`.
 */
export function thirdPartyNotices(metafile, cwd) {
  const folders = new Set(
    Object.keys(metafile.inputs)
      .filter((input) => input.includes("node_modules"))
      .map((input) => packageFolder(resolve(cwd, input)))
      .filter(Boolean),
  );
  const entries = [...folders]
    .map((folder) => ({
      folder,
      ...JSON.parse(readFileSync(join(folder, "package.json"), "utf8")),
    }))
    .filter((pkg) => !pkg.name.startsWith("@ingestron/"))
    .sort((a, b) => a.name.localeCompare(b.name));
  const sections = entries.map((pkg) => {
    const text = licenceText(pkg.folder) ?? `Licence: ${pkg.license ?? "not stated"}`;
    return `## ${pkg.name}@${pkg.version}\n\n${text}\n`;
  });
  return [
    "# Third-party notices\n",
    "This software includes the following third-party packages, each under its own licence.\n",
    ...sections,
  ].join("\n");
}
