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

## It is generated, and kept that way

```bash
python3 generate.py              # rebuild from the live spec
python3 generate.py --dry-run    # report what would change
```

The collection is built from the live OpenAPI document. The version it
replaced carried 6 of 26 operations and two years' worth of drift.

**The listing copy lives in `description.md`**, not in the generator — it is
marketing, it changes more often than the code, and rewriting it should not need
a Python review. Edit that file, re-run `generate.py`, re-import in Postman.
Editing the description *in Postman instead* works right up until the next
regeneration silently reverts it.

Generation is an event, though, not a property the file keeps: from the moment
it was committed, this collection and the spec became two independently
editable copies of the same 28 examples. `check-collection-parity.mjs` is what
makes "generated" stay true — it re-reads the live spec and fails the build if
the two documents have drifted apart.

Auth per request is set from **measured** behaviour rather than what the spec
declares — the two disagreed on six endpoints until
`gc-api-gateway#118` fixed the spec, and a request marked "needs a key" that
actually runs keyless is a request nobody pastes.

## Check it before publishing

```
node check-collection.mjs                              # the keyless ten
GREENCALCULUS_API_KEY=gc_… node check-collection.mjs   # all 28
node check-collection-parity.mjs                       # still the same as the spec?
```

Every request is sent. Keyless ones go with **no** `Authorization` header at
all, because that is the claim being tested. The three `Account` writes are
skipped unless `GC_CHECK_MUTATIONS=1` — a check should not edit the account it
is checking.

## Published

**Live since 12 September 2026** —
[postman.com/greencalculus/greencalculus](https://www.postman.com/greencalculus/greencalculus)
· docs at
[documenter.getpostman.com/view/58173296/2sBYAyt8wZ](https://documenter.getpostman.com/view/58173296/2sBYAyt8wZ)

The domain is DNS-verified at the apex and Guided Auth is configured and
verified against `api.greencalculus.com` (Bearer, with prerequisite copy that
points a reader at the keyless folder first).

**Two things to know before trusting it as an SEO surface.** The app pages are
client-rendered — a logged-out fetch of the collection page returns 100 KB of
JavaScript with only the collection *name* in it. And the published
documentation serves `<meta name="robots" content="noindex,nofollow">`, with no
SEO toggle anywhere in the publish flow, while two other public
`documenter.getpostman.com` pages carry no robots meta at all. Support has been
asked. Until that changes, this is a directory listing, not an indexable page.

**THE `_postman_id` WAS DERIVED, AND IT MATCHED NOTHING (fixed 2026-09-13).**
`generate.py` minted it as `uuid5(NAMESPACE_URL, ".../postman/collection")` —
stable across machines, which is what it was chosen for, and wrong, which
nothing checked. **Postman assigns a collection its own id when the collection
is created in the app; it does not adopt one an importer invents.** So every
import created or updated a SECOND "GreenCalculus API" beside the published one,
and the published documentation — bound to the real collection — never moved.

Four symptoms at once, all the same cause: two identically-named collections in
the workspace, a "Replace?" prompt that replaced the wrong one, published docs
still serving pre-correction copy, and **Publish docs greyed out** on the
duplicate (that slot belongs to the other collection).

The id is now pinned to Postman's own:
`2ee06139-6fb5-485d-b1f3-3082efb005ff`. **Where to re-read it if the published
collection is ever recreated:** fetch the published docs URL and take
`<meta name="collectionId">` — its value is `<ownerId>-<collectionId>` and you
want the collection half. Do not invent one.

**The documenter page is HEAD-ONLY server-rendered, so you cannot verify a
collection change by fetching it.** Measured 2026-09-13: the `<head>` carries
real title/og/twitter/description metadata, and the `<body>` yields **zero**
characters of visible text — no folder names, no request names, no collection
description. A `curl` of that URL tells you what the *documentation settings*
say and nothing at all about what the *collection* contains. Verify a re-import
in the Postman app, or against the JSON in this directory.

**PENDING — batch with the next listing change.** The published documentation's
**title** still reads *"GreenCalculus API — emission factors with their source
cell"*, and it is the source of `<title>`, `og:title` and `twitter:title` alike.
It is a Publish-documentation setting, not anything in this repo, so the
2026-09-13 wording sweep could not reach it. The collection copy and every
per-request description are already correct. Suggested: *"GreenCalculus API —
emission factors with their source reference"*. Low urgency: the page is
`noindex`, so this is a browser tab and a social card.

Fields that silently truncate at **140 characters**: the workspace summary and
the team tagline. The first attempt published "…and data versio".

## Republishing after a regeneration

Re-run `generate.py`, then import the file again in Postman and choose
**Replace** — the collection carries a stable `info._postman_id`, so a re-import
updates it rather than dropping a second copy into the workspace.

1. Sign in at [postman.com](https://www.postman.com) as `jeremiah@greencalculus.com`.
2. Create a **public** workspace named `GreenCalculus`.
3. **Import** → `greencalculus.postman_collection.json`.
4. Workspace → **Publish**. Add the summary, the docs link
   (<https://greencalculus.com/developers/docs/>) and the free-key link.
5. Grab the **Run in Postman** button markup and add it to the SDK README —
   `public-apis` has a "Call this API" column that wants exactly that link.

Re-run **both** checks before every publish. A collection is published to
strangers who press Send before they read anything.

The two answer different questions and neither substitutes for the other:
`check-collection.mjs` proves every request still *answers*;
`check-collection-parity.mjs` proves the spec still *asks for that request*.
A stale version pin passes the first and fails the second — which is exactly
how `gc-api-gateway#118` shipped a documented example the API rejects.
