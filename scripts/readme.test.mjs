// The README is the Marketplace page: its images must exist, say what they show
// and stay small enough that the page loads quickly.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const readme = readFileSync(join(root, "README.md"), "utf8");
const images = [...readme.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)].map(([, alt, path]) => ({
  alt,
  path,
}));
const kilobytes = (path) => statSync(join(root, path)).size / 1024;

test("the README shows the three GIFs: the idea, the definitions and the generated files", () => {
  assert.deepEqual(
    images.map(({ path }) => path),
    ["media/readme/concept.gif", "media/readme/definitions.gif", "media/readme/outcomes.gif"],
  );
});

test("every image has alt text that says what it shows", () => {
  for (const { alt, path } of images) assert.ok(alt.length >= 40, `${path}: alt text too short`);
});

test("each GIF is 800 pixels wide and under 400 KB, and together under 800 KB", () => {
  let total = 0;
  for (const { path } of images) {
    const header = readFileSync(join(root, path));
    assert.equal(header.subarray(0, 3).toString(), "GIF", path);
    assert.equal(header.readUInt16LE(6), 800, `${path}: width`);
    assert.ok(kilobytes(path) < 400, `${path}: ${Math.round(kilobytes(path))} KB`);
    total += kilobytes(path);
  }
  assert.ok(total < 800, `together ${Math.round(total)} KB`);
});

test("the README uses no SVG image: the Marketplace refuses them", () => {
  assert.doesNotMatch(readme, /!\[[^\]]*\]\([^)]*\.svg/);
  assert.doesNotMatch(readme, /<img[^>]*\.svg/);
});
