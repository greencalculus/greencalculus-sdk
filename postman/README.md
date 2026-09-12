# Postman collection

`greencalculus.postman_collection.json` — the whole API as a Postman v2.1
collection: **28 requests across 5 folders, 10 of which need no API key.**

Import it and the ten keyless requests run immediately. That is the point of
the collection: the corpus is open to read, so browsing factors, the change
feed, coverage, the absence register and a publisher's whole source feed all
answer before you have signed up for anything.

For the rest, set the `api_key` collection variable. Free, no card:
<https://greencalculus.com/developers/>

| Variable | Default | |
|---|---|---|
| `base_url` | `https://api.greencalculus.com` | no trailing slash |
| `api_key` | *(blank)* | leave blank to run the keyless requests only |

## It is generated, not hand-written

The collection is built from the live OpenAPI document, so it cannot fall
behind the API the way a hand-maintained one does. The version this replaced
carried 6 of 26 operations and two years' worth of drift.

Auth per request is set from **measured** behaviour rather than what the spec
declares — the two disagreed on six endpoints until
`gc-api-gateway#118` fixed the spec, and a request marked "needs a key" that
actually runs keyless is a request nobody pastes.

## Check it before publishing

```
node check-collection.mjs                              # the keyless ten
GREENCALCULUS_API_KEY=gc_… node check-collection.mjs   # all 28
```

Every request is sent. Keyless ones go with **no** `Authorization` header at
all, because that is the claim being tested. The three `Account` writes are
skipped unless `GC_CHECK_MUTATIONS=1` — a check should not edit the account it
is checking.

## Publishing to the Postman Public API Network

Not done yet, and it needs a human: publishing requires a Postman account, and
the workspace has to be created under one.

1. Sign in at [postman.com](https://www.postman.com) as `jeremiah@greencalculus.com`.
2. Create a **public** workspace named `GreenCalculus`.
3. **Import** → `greencalculus.postman_collection.json`.
4. Workspace → **Publish**. Add the summary, the docs link
   (<https://greencalculus.com/developers/docs/>) and the free-key link.
5. Grab the **Run in Postman** button markup and add it to the SDK README —
   `public-apis` has a "Call this API" column that wants exactly that link.

Re-run `check-collection.mjs` before every publish. A collection is published
to strangers who press Send before they read anything.
