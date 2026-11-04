# See it, then write it

- Click a generated file above a table, or run **Show generated files**, to
  read what will be written, before anything is.
- **Plan** lists what would change in `build/`; **Apply** writes it. Files
  edited by hand are never overwritten.
- Turn on auto-apply from the status bar to write on every save.

Plan and Apply generate every environment together, one folder for each
platform, such as `build/databricks/` and `build/adf/`. Deploy each with its
own tools: the Databricks bundle with `databricks bundle deploy -t
<environment>`; ADF's `factory/` through the factory's Git and Microsoft's
CI/CD, with `parameters/<environment>.json`; Synapse views with `views.sql`;
DuckDB's `build/duckdb/<environment>/run.sql` with DuckDB.
