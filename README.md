# Ingestron for VS Code

Write Ingestron projects with problems marked as you type, completion that
knows your project, and previews of the files Ingestron generates.

![Six definition files on the left, the command ingestron plan and apply in the middle, and the six Databricks files it generates on the right: you describe, Ingestron generates, then you review it in a pull request and deploy it with your platform's own tools.](media/readme/concept.gif)

Ingestron turns YAML your team reviews into the files you would otherwise write
by hand: Databricks bundles and pipelines, Azure Data Factory pipelines,
Synapse serverless views and DuckDB SQL, with your organisation's standard
applied. It runs on your machine, never connects to your sources or your cloud,
and never overwrites a file someone edited by hand.

## Write the definitions

A project is a folder of YAML files: connections, flows, contracts and
transforms. The extension reads them as you type.

![A flow file in VS Code: hovering a setting says it was set by this table at flows/shop.yaml line 11, a misspelt source is marked and offers to change it to shop, and completion lists the settings a store accepts.](media/readme/definitions.gif)

- **Problems as you type:** a broken link, a setting the standard fixes, a
  method that cannot read a source. Quick fixes repair a broken link.
- **Hover:** says what a setting means and where its value came from.
- **Completion:** offers only what the project allows.
- **Navigation:** go to definition, find references and rename across files.

## See what it generates

Plan lists what would change, Apply writes it, and the files appear in your
project, one set for every environment.

![Ingestron: Plan lists six files, Apply writes them, the build folder shows them in the project tree, orders.sql opens as Ingestron wrote it, and switching the environment from dev to prod changes the table names from dev_sales to prod_sales.](media/readme/outcomes.gif)

- **Plan, Apply and Check** from the Command Palette, the editor title and the
  right-click menu. Check reports generated files that are out of date.
- **Show generated files** opens what a table becomes, next to its flow.
- **Select environment** chooses the environment the editor shows: problems,
  previews and what each line becomes.
- **Auto-apply** writes the files each time you save, if you turn it on.

New project starts a project in one of three ways: from a connection, a
starter or a published standard. The Project and Reference views sit beside
the editor.

## Know what a source holds

Ingestron never connects to your sources, so someone who can reach one sends
the columns and types of its tables as a file.

- **Request source metadata** writes what to ask for, filled in for your
  project: who to ask, the query or call to run and where to save the result.
- **Import source metadata** reads the file they send into
  `sources/<connection>.yaml`, and tells you what changed. It keeps names and
  types, never the values in a row.

## Add a guide for coding assistants

**Add assistant files** writes `AGENTS.md`, a guide to your project for coding
assistants, and a short file for each assistant that needs one. Plan and Apply
keep it current, and leave a section you edited by hand.

Documentation: [docs.ingestron.io](https://docs.ingestron.io/docs/tools/vscode).

## Install

Requires Visual Studio Code 1.104 or later.

Install [Ingestron from the Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=ingestron.ingestron-vscode),
or search for "Ingestron" in the Extensions view, or run:

```sh
code --install-extension ingestron.ingestron-vscode
```

Open a folder that holds a `project.yaml`, or run **Ingestron: New project**
from the Command Palette. The extension includes its Ingestron dependencies;
you do not need to install the CLI separately.

## Privacy

The extension sends no telemetry and makes no network calls of its own. It
reads and writes only the files in your workspace. Questions: privacy@ingestron.io.

## Contact

Questions and feedback: hello@ingestron.io. Security reports: security@ingestron.io
(see [SECURITY.md](SECURITY.md)). Privacy: privacy@ingestron.io.

## Licence

Licensed under the [Apache License 2.0](LICENSE); see [NOTICE](NOTICE).
