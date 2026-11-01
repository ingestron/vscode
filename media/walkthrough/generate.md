# See it, then write it

- Click a generated file above a table, or run **Show generated files**, to
  read what will be written, before anything is.
- **Plan** lists what would change in `build/`; **Apply** writes it. Files
  edited by hand are never overwritten.
- Turn on auto-apply from the status bar to write on every save.

Deploy what `build/<environment>` holds with your platform's own tools: a
Databricks bundle with the Databricks CLI, ADF resources through the factory's
Git, Synapse views with `views.sql`, or DuckDB's `run.sql` with DuckDB.
