# A project

A project is a folder with `project.yaml`: its id, its environments and the
files it imports.

```yaml
id: retail
environments:
  dev: {}
  prod: {}
imports:
  - standard.yaml
  - platform.yaml
  - connections/*.yaml
  - flows/*.yaml
  - contracts/*.yaml
```

**New project** starts from a connection: it asks for the source category,
connection, supported route and standard, then the settings and destination
folder. Or it copies a starter, a ready-made project such as DuckDB on a
laptop: give it a name, environments, your organisation's standard if you have
one, any settings the starter asks for, and a folder. A standard's path can be
relative to the workspace.

A **data product** is a file in `products/` (import `products/*.yaml`): who
owns it, what it is for, and the contracts whose tables it publishes. A new
empty file there offers a skeleton. Apply writes a plain-language passport per
product to `build/<environment>/products/`, and the standard's `governance`
section can require owners, purposes and column classifications, shown as
problems until they are met.
