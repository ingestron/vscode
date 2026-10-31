# Security

## Report a vulnerability

Email security@ingestron.io. Do not open a public issue. Include the version of
the VS Code extension, what you ran, and the smallest definitions that reproduce the problem.
We acknowledge reports within five working days and agree a disclosure date
with you.

## Supported versions

Security fixes go into the latest `1.x` release.

## Design

The extension runs Ingestron locally. It sends no telemetry, makes no network
calls of its own, and reads and writes only the files in your workspace.

Dependencies are pinned exactly and updated one reviewed change at a time;
`pnpm validate` checks their licences.
