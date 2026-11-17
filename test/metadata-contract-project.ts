// Synthetic schema-only projects for contract authoring checks.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { run } from "@ingestron/cli";
import { nodeFiles } from "@ingestron/config";

const folders: string[] = [];
/** Remove the temporary synthetic projects after a suite. */
export function removeMetadataProjects(): void {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
}
/** A synthetic optional metadata-based Synapse flow. */
export function metadataProject() {
  const folder = mkdtempSync(join(tmpdir(), "metadata-contract-"));
  folders.push(folder);
  const call = (...args: string[]) => {
    let text = "";
    expect(
      run(args, {
        cwd: folder,
        write: (part) => {
          text += part;
        },
      }),
      text,
    ).toBe(0);
  };
  call("init", ".", "--platform", "synapse", "--yes");
  call("connection", "add", "erp", "--connector", "azure-sql-database", "--connectivity", "public");
  writeFileSync(
    join(folder, "catalog.csv"),
    "table_catalog,table_schema,table_name,column_name,ordinal_position,data_type,is_nullable,primary_key_position\nERP,dbo,Customers,CustomerID,1,nvarchar(5),NO,1\nERP,dbo,Customers,CompanyName,2,nvarchar(40),NO,\nERP,dbo,Temporary,Code,1,int,YES,\n",
  );
  call("source", "import", "erp", "catalog.csv");
  call("flow", "add", "sales", "--connection", "erp", "--object", "ERP.dbo.Customers");
  return { folder, file: "flows/sales.yaml", files: nodeFiles(folder) };
}
