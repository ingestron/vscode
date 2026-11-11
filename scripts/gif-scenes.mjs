// One scene per GIF. A scene drives VS Code and calls `snap(ms)` wherever the
// viewer should see a state; it returns the frames.
import { launch } from "./gif-tools.mjs";

/** The retail flow, shortened so every line is narrower than the window. */
const shopFlow = [
  "apiVersion: ingestron.io/v1",
  "kind: Flow",
  "id: shop",
  "description: Orders and customers from the web shop.",
  "source: shop",
  "tables:",
  "  customers:",
  "    object: customers",
  "    contract: shop.customers",
  "    ingest:",
  "      with: { format: csv, options: { header: true } }",
  "  orders:",
  "    object: orders",
  "    contract: shop.orders",
  "    history: latest",
  "    sequence: updated_at",
  "",
].join("\n");

/** Synthetic values for the retail starter's REPLACE_ME, in the order the file asks. */
const retailValues = [
  "7f3c2a10-0000-4000-8000-000000000001",
  "sales-engineers",
  "sales-analysts",
  "sales-data@example.com",
  "https://adb-1111111111111111.1.azuredatabricks.net",
  "retaildev",
  "https://adb-2222222222222222.2.azuredatabricks.net",
  "retailprod",
];

export const scenes = {
  /** Definition files: hover, a broken link and its fix, completion. */
  async definitions(installed) {
    const s = await launch(installed, "retail", {
      files: { "flows/shop.yaml": shopFlow },
      fill: retailValues,
    });
    const { keys, type, palette, open, lineOf, goto, snap, pause } = s;
    const flow = "flows/shop.yaml";
    await palette("View: Toggle Primary Side Bar Visibility");
    await open(flow);
    await snap(1500);
    // A setting's hover says where its value came from.
    await goto(lineOf(flow, "      with: { format"), 18);
    await palette("Show or Focus Hover");
    await snap(2800);
    await keys("Escape");
    // A broken link is marked as it is typed.
    await goto(lineOf(flow, "source: shop"), 9);
    await keys("Shift+End");
    for (const letter of "shops") {
      await type(letter);
      await snap(110);
    }
    await pause(1500);
    await snap(1500);
    await keys("Meta+.");
    await pause(500);
    await snap(2600);
    await keys("Escape");
    await palette("File: Revert File");
    await pause(800);
    // Completion knows the project.
    await goto(lineOf(flow, "contract: shop.customers"), 30);
    await keys("End", "Enter");
    for (const text of ["store:", "\n  with:", "\n  "]) {
      await type(text);
      await snap(300);
    }
    await keys("Control+Space");
    await pause(600);
    await snap(2800);
    await s.close();
    return s.frames;
  },

  /** Generated outcomes: Plan, Apply, the files in the project, another environment. */
  async outcomes(installed) {
    const s = await launch(installed, "retail", {
      files: { "flows/shop.yaml": shopFlow },
      fill: retailValues,
    });
    const { keys, palette, open, goto, lineOf, snap, pause, window } = s;
    const flow = "flows/shop.yaml";
    await palette("View: Toggle Primary Side Bar Visibility");
    await open(flow);
    await snap(1300);
    await palette("Ingestron: Plan");
    await pause(2500);
    await snap(2400);
    await palette("Ingestron: Apply");
    await pause(2500);
    await snap(1500);
    // The files it wrote, in the project.
    await palette("View: Toggle Panel Visibility");
    await palette("View: Show Explorer");
    const row = (name) =>
      window
        .locator(".part.sidebar .monaco-list-row", { hasText: new RegExp(`^${name}$`) })
        .first();
    for (const folder of ["build", "databricks", "src", "project", "bronze"]) {
      await row(folder).click();
      await pause(400);
    }
    await snap(2400);
    await row("orders.sql").click();
    await pause(1200);
    await snap(3000);
    // The same definitions for another environment.
    await palette("View: Toggle Primary Side Bar Visibility");
    await open(flow);
    await goto(lineOf(flow, "  orders:"), 4);
    await snap(1500);
    await palette("Ingestron: Select environment");
    await pause(800);
    await snap(1400);
    await keys("ArrowDown", "Enter");
    await pause(1800);
    await snap(2800);
    await s.close();
    return s.frames;
  },
};
