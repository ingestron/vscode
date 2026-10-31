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

**New project** asks for the source category, connection, supported route
and standard, then the settings and destination folder.
