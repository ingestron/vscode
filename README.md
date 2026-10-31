# Ingestron for VS Code

Problems as you type, go to definition, references and rename, completion that
knows your project, hover that explains where each setting came from, previews
of the generated files, and the Plan, Apply, Check and New project commands, for
Ingestron projects.

Documentation: [docs.ingestron.io](https://docs.ingestron.io/docs/tools/vscode).

## Install

Build the extension and install it (Node 22.13 or later, pnpm 10):

```sh
pnpm install
pnpm package
code --install-extension ingestron.vsix
```

## Develop

```sh
pnpm install
pnpm validate          # format, licences, lint, types, bundle, unit tests
pnpm test:integration  # in a downloaded VS Code
```

The editor features (problems, completion, hover, fixes) are plain functions in
[`@ingestron/authoring`](https://www.npmjs.com/package/@ingestron/authoring),
tested without VS Code; `src/vscode/` registers them with VS Code. The bundle
is `dist/extension.cjs`; `scripts/build.mjs` copies the schemas, SQL templates,
ADF recipes and project templates beside it, from the installed packages.

## Privacy

The extension sends no telemetry and makes no network calls of its own. It
reads and writes only the files in your workspace. Questions: privacy@ingestron.io.

## Contact

Questions and feedback: hello@ingestron.io. Security reports: security@ingestron.io
(see [SECURITY.md](SECURITY.md)). Privacy: privacy@ingestron.io.

## Licence

Licensed under the [Apache License 2.0](LICENSE); see [NOTICE](NOTICE). Made by
[IntentLabs](https://intentlabs.dev).
