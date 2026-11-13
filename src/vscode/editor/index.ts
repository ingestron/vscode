// The editor module: what the rest of the package uses.
export { docsLink } from "./docs.js";
export { previewUri, registerPreviews } from "./previews.js";
export { registerAnnotations } from "./annotations.js";
export { registerFixes } from "./fixes.js";
export { registerProblems } from "./problems.js";
export { registerProviders } from "./providers.js";
export { applyImport, reportImport, reportRefusal, tellRecorded } from "./source-apply.js";
export { idle, onEmpty, queued, registerImportQueue } from "./source-queue.js";
export { registerSourceWatch } from "./source-watch.js";
export { registerSymbols } from "./symbols.js";
