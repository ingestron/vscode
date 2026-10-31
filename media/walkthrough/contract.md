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
