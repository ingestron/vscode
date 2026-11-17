# A contract

A table's columns, types, keys and quality rules, in the Open Data Contract
Standard.

```yaml
apiVersion: v3.1.0
kind: DataContract
id: shop.orders
version: 1.0.0
status: active
schema:
  - name: orders
    properties:
      - { name: id, logicalType: integer, required: true, primaryKey: true }
      - { name: total, logicalType: number }
```

Right-click a CSV or JSON sample in the Explorer and choose **Draft contract
from sample** to start one from its columns.

For a flow table described by imported source metadata, click **Draft contract**
above the table, or put the cursor in it and run **Ingestron: Draft contract from
metadata**. Review the ODCS draft before saving. It is linked automatically and
the source observation is kept for comparison; one undo reverts the conversion.
