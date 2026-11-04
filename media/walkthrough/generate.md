# See it, then write it

- Click a generated file above a table, or run **Show generated files**, to
  read what will be written, before anything is.
- **Plan** lists what would change in `build/`; **Apply** writes it. Files
  edited by hand are never overwritten.
- Turn on auto-apply from the status bar to write on every save.

Plan and Apply generate every environment together, into one folder for each
platform, such as `build/databricks/` and `build/adf/`. Deploy each with your
platform's own tools: the Databricks bundle with the Databricks CLI, one
target for each environment; ADF's `factory/` with that environment's
`parameters/<environment>.json`; Synapse views with `views.sql`; or DuckDB's
`build/duckdb/<environment>/run.sql` with DuckDB.
