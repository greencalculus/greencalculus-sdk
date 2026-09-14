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

**The documenter PAGE is head-only server-rendered — but there is a content API
behind it, and that IS how you verify a re-import.** The `<head>` carries real
title/og/twitter/description metadata; the `<body>` yields **zero** characters of
visible text. So fetching the page tells you what the *documentation settings*
say and nothing about the *collection*. The page's own client fetches:

```
https://documenter.gw.postman.com/api/collections/58173296/2sBYAyt8wZ?segregateAuth=true&versionTag=latest
```

which returns the **published collection as JSON**, keyless, `cf-cache-status:
DYNAMIC` (no caching to fight). Diff that against
`greencalculus.postman_collection.json` and you know, rather than assume,
whether an import reached the published collection. The two ids in the URL come
from the page head: `ownerId` and `publishedId`.

## Cleaned up 2026-09-14 — the duplicates are gone and the published copy is current

The Postman API had 500'd on every `/collections` endpoint since 2026-09-13,
which is why this sat. **It recovered.** With `GET` working, `PUT` was safe —
the earlier warning was only ever about writing blind while reads were down.

- **Three collections deleted**, each backed up first and each proved
  disposable before deletion: `0fa5f072` and `ba4b5988` (the import duplicates —
  diffed against the published one, **zero requests unique to either**) and
  `d06c43c2` "My Collection" (Postman's default `postman-echo.com` samples).
  One collection remains: the published `2ee06139`.
- **The published collection was re-synced by `PUT`** from
  `greencalculus.postman_collection.json`. It had been stale since 2026-09-12
  and still carried *"the exact source cell behind each value"* in the
  open-data feed description. Now 0 occurrences of "source cell", 1 of "source
  reference", 28 operations intact, documenter and workspace both 200.

**Verify a write the same way every time**: the content API above, not the
documenter page and not a `postman.com` 200.

**STILL PENDING — console only, no API route.** Two things cannot be done from
here; `api-keys`, `me/api-keys`, `account/api-keys` and
`collections/<uid>/documentation` all return **404**.

**BOTH DONE 2026-09-14 in the console.**

1. **Title changed** to *"GreenCalculus API — emission factors and their
   sources"* (54 chars), and it propagated to `<title>`, `og:title` and
   `twitter:title`. **The Title field caps at 60 characters** — the replacement
   this file previously suggested, *"…with their source reference"*, is **64**
   and would have been silently truncated, the same trap as the 140-char
   workspace summary. Count before pasting. The chosen wording is also true of
   100% of the corpus: zero rows lack a source reference, where "cell" described
   only 5.8%.
   Path, for next time: **Items** → **Collections** → the collection →
   **Overview** → **View complete documentation** → **Docs published** icon →
   **Edit published documentation** → **Edit settings** → **SEO** → **Title** →
   **Save and republish**.
2. **The `admin`/`billing`/`user` key was revoked** — `/me` and `/collections`
   both 401 afterwards — and `POSTMAN_API_KEY` was removed from `~/.gc-secrets`.
   Mint a narrower one at `go.postman.co/settings/me/api-keys` if the collection
   ever needs scripted updates again; it is only needed for the `PUT`.

**STILL `noindex,nofollow`, and it is not ours to change.** The SEO section
holds exactly two fields — Title and Description. Postman exposes **no**
indexing toggle, no "allow search engines" option, nothing. Re-measured
2026-09-14: the meta tag is present in the raw HTML and under a Googlebot
user-agent, there is no `X-Robots-Tag` header, and the host's `robots.txt` is
empty, so the meta tag is the whole of it. The only open lever is the support
thread opened 2026-09-13. **Do not count this page as an SEO surface** — plan
around it, as [[reference_huggingface_spaces_org_plan]] does.

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
