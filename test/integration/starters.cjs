// The CLI's starters write REPLACE_ME where only the owner knows a value. The integration
// suite works on copies with each written, as a user writes them before deploying, so it
// tests the editor on a project with nothing left to replace.
const fs = require("node:fs");
const path = require("node:path");

/** Each starter's REPLACE_ME, file by file, in the order written, and what each is written as. */
const values = {
  minimal: [["project.yaml", "landing: REPLACE_ME", "landing: /Volumes/dev/landing/shop"]],
  retail: [
    ["project.yaml", "REPLACE_ME", "7f3c2a10-0000-4000-8000-000000000001"],
    ["project.yaml", "REPLACE_ME", "sales-engineers"],
    ["project.yaml", "REPLACE_ME", "sales-analysts"],
    ["project.yaml", "REPLACE_ME", "sales-data@example.com"],
    ["project.yaml", "REPLACE_ME", "https://adb-1111111111111111.1.azuredatabricks.net"],
    ["project.yaml", "REPLACE_ME", "retaildev"],
    ["project.yaml", "REPLACE_ME", "https://adb-2222222222222222.2.azuredatabricks.net"],
    ["project.yaml", "REPLACE_ME", "retailprod"],
  ],
};

/** Writes the starter's values into its copy in `folder`. */
function fillStarter(folder, starter) {
  for (const [file, from, to] of values[starter] ?? []) {
    const at = path.join(folder, file);
    fs.writeFileSync(at, fs.readFileSync(at, "utf8").replace(from, to));
  }
}

module.exports = { fillStarter };
