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
folder. Or it starts from a starter, a ready-made project such as DuckDB on a
laptop, which needs only a name, environments and a folder.
