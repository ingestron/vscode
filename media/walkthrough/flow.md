# A flow

Which tables to bring from a connection, each with its contract. The
standard chooses how; a table says only what differs.

```yaml
apiVersion: ingestron.io/v1
kind: Flow
id: shop
source: shop
tables:
  orders: { object: orders, contract: shop.orders }
```

Beside each table the editor shows its full name; above it, the methods that
build it and the files generated for it.
