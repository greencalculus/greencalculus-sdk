# OpenAPI

`openapi.json` — the OpenAPI 3.1 description of the GreenCalculus API, 26 paths.

## Why it is committed here as well as served live

The authority is the gateway, which serves it at
<https://api.greencalculus.com/openapi.json>. That URL is what
`postman/generate.py` reads, and it is the one to integrate against.

But a live URL is not a discoverable one. It was not linked from the developer
docs, it is not in any repository, and nothing that crawls GitHub could find it.
A spec that tools cannot discover is, for most purposes, a spec that does not
exist — the same point `src/openapi.ts` makes upstream about a capability absent
from the machine-readable contract.

So this is a published mirror, for GitHub code search, API directories, codegen
and coding assistants.

## It cannot go stale

`.github/workflows/openapi-sync.yml` refetches the live spec every Monday and
commits it if it changed. A committed copy of a remote truth is a stale copy
waiting to happen unless something re-reads the remote on a schedule, so
something does.

The file is re-serialised with sorted keys and 2-space indent, so a diff is a
real contract change rather than key-order churn from the gateway.

## Using it

```bash
# codegen, straight from the live spec
npx @openapitools/openapi-generator-cli generate \
  -i https://api.greencalculus.com/openapi.json -g python -o ./client

# or from this mirror
npx @openapitools/openapi-generator-cli generate \
  -i spec/openapi.json -g typescript-fetch -o ./client
```

Most of the corpus reads without a key. `GET /v1/factors?key_prefix=…` is
keyless; single-factor lookups and every calculation route need
`Authorization: Bearer gc_…`, free at <https://greencalculus.com/developers/>.
