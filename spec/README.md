# OpenAPI

`openapi.json` — the OpenAPI 3.1 description of the GreenCalculus API, 26 paths.

## Why it is committed here as well as served live

The authority is the gateway, which serves it at
<https://api.greencalculus.com/openapi.json>. That URL is what
`postman/generate.py` reads, and it is the one to integrate against.

But a documented URL is not the same as a discoverable file. The API reference
at <https://greencalculus.com/developers/docs/> has documented this spec all
along, under "OpenAPI & clients", with a runnable `curl` and instructions to
point openapi-generator, Postman or Insomnia at it. What was missing is narrower
and purely mechanical: the spec existed in no repository, so nothing that crawls
or code-searches GitHub could reach it, and no API directory could index it from
a file.

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
