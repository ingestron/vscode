// The README's GIFs: scripted runs of the packaged extension in a downloaded
// VS Code. Run `pnpm test:integration` once first to download VS Code, then
// `pnpm gifs [folder] [--only=<name>,<name>]`; the GIFs go to `folder` (default
// `media/readme`). Each scene prints its size: README images stay small.
import { resolve } from "node:path";
import { statSync } from "node:fs";
import { encode, installExtension, root } from "./gif-tools.mjs";
import { scenes } from "./gif-scenes.mjs";

const folderArgument = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const out = resolve(folderArgument ?? `${root}/media/readme`);
const only = process.argv
  .find((argument) => argument.startsWith("--only="))
  ?.slice(7)
  .split(",");

const installed = installExtension();
for (const [name, scene] of Object.entries(scenes)) {
  if (only && !only.includes(name)) continue;
  const frames = await scene(installed);
  const file = `${out}/${name}.gif`;
  encode(frames, file);
  console.log(
    `✓ ${name}.gif: ${frames.length} frames, ${Math.round(statSync(file).size / 1024)} KB`,
  );
}
