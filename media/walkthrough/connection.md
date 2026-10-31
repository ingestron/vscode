# A connection

Where data comes from, how to reach it, and how it signs in. Secrets are
written as `${secret:<name>}`, never as values.

```yaml
apiVersion: ingestron.io/v1
kind: Connection
id: shop
connector: files
connectivity: public
settings:
  path: ${values.storage}/shop
```

In a new, empty file, completion offers a skeleton for each kind of document.
