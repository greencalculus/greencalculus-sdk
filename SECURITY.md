# Security

## Reporting a vulnerability

Email **security@greencalculus.com** with the details and, if you have one, a
proof of concept. Please don't open a public issue for a vulnerability.

We aim to acknowledge within two working days and to keep you updated while we
work on it. If you'd like credit in the fix notes, say so and we'll include you.

## Scope

In scope: these client libraries, the Sheets add-in, the API at
`api.greencalculus.com`, the MCP server at `mcp.greencalculus.com`, and
`verify.greencalculus.com`.

Out of scope: volumetric denial of service, findings from automated scanners
with no demonstrated impact, and reports about missing headers on pages that
serve no user data.

## API keys

Keys look like `gc_live_…`. If one is exposed — in a commit, an issue, a log,
a screenshot — rotate it at
[greencalculus.com/developers](https://greencalculus.com/developers) and let us
know so we can check for misuse.

The corpus reads without a key, so please don't put a key in example code,
notebooks or bug reports. `GreenCalculus()` with no arguments is enough to
reproduce most things.
