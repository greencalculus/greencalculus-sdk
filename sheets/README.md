# GreenCalculus for Google Sheets

`=GC_FACTOR("grid.gbr.electricity.location_based")` → a sourced emission factor in a cell, with the publisher's exact source cell, the data version and a citation one column over. The spreadsheet is where carbon accounting actually happens; this puts cited factors inside it.

Keyless by default — the GreenCalculus corpus is open to read. An API key (free) adds `as_of` version pinning.

## Functions

| Formula | Returns |
|---|---|
| `=GC_FACTOR(key, [field], [as_of])` | the value, or one field: `unit` `name` `source` `publisher` `cell` `retrieved` `licence` `version` `gwp` `basis` `scope` `citation` `proof`. `key` may be a range. |
| `=GC_FACTOR_ROW(key, [headers])` | one row: value · unit · source · cell · version · citation |
| `=GC_CITE(key)` | the citation line, e.g. *UK Government GHG Conversion Factors 2026 — DESNZ. cell 'UK electricity'!E25, retrieved 2026-06-18. via GreenCalculus data version 2026.186, factor grid.gbr… https://verify.greencalculus.com/grid.gbr.electricity.location_based@2026.186* |
| `=GC_EMISSIONS(key, quantity)` | quantity × factor (kWh × kg CO2e/kWh = kg CO2e). Ranges fill a column. |
| `=GC_SEARCH("diesel litre", [limit])` | key · name · value · unit · source, one match per row |
| `=GC_VERSION()` | the data version this workbook's formulas read: the pin if set, else current |

Find keys at [greencalculus.com/factors](https://greencalculus.com/factors/) or with `GC_SEARCH`.

## Sidebar (Extensions → GreenCalculus → Open GreenCalculus)

Search the corpus in plain text, then **Insert value**, **Value + source** or **Citation** at the selected cell. The same panel holds the workbook version pin and the API key.

## Workbook version pin

*Pin to current version* (or a past one, e.g. `2026.150`) writes the version into a named range `GC_AS_OF` on a `GreenCalculus` sheet. From then on every `GC_` formula reads factors as they stood at that version and every citation carries it, so the workbook re-opens to the same numbers — what an audit re-run needs. The pin is a visible cell: it travels with a copy and an auditor can see it. `=GC_FACTOR(key, "value", "current")` escapes the pin for one cell.

Pinning reads the archive, which needs an API key. A pinned workbook whose owner has no key shows `#GC_ERROR: this workbook is pinned to … needs an API key` — never a current value under a past label.

Why a named range and not a setting: custom functions may read the spreadsheet but not document properties.

## How it behaves

- **One fetch per unique key.** A range of 300 cells with 12 distinct keys makes 12 requests (`UrlFetchApp.fetchAll`), then caches for 6 h. The API edge-caches the same route for an hour, version-keyed, so a data release invalidates every stale answer.
- **Keyed (pinned) fetches are batched** 25 at a time — the free plan allows 30 requests a minute — and a 429 waits for `Retry-After` once within the 30 s budget; anything left shows `#GC_ERROR: rate limited — re-run in a minute; fetched rows are cached`.
- **Errors are readable in the cell:** `#GC_UNKNOWN_KEY: …` for a key not in the corpus, `#GC_ERROR: …` for anything else.
- **Custom functions run as the spreadsheet owner.** The API key set via *Extensions → GreenCalculus → Set API key* is stored in the owner's user properties; editors share the owner's entitlement. `as_of` without a key returns a cell message saying so.
- **Limits (Google's):** 30 s per custom-function call; URL Fetch 20,000/day (consumer) or 100,000/day (Workspace) per user.

**Attribution.** Every request carries `X-GC-Client: sheets/<version>` so the API funnel can see add-in traffic; the key prompt, Help links and cell messages carry `?ref=sheets` so signups attribute to the add-in.

## Layout

```
appsscript.json      manifest — V8, external_request + currentonly + container.ui scopes, urlFetchWhitelist
src/core.js          pure logic (URLs, extraction, citation, batching) — runs in Apps Script AND Node
src/Code.js          Apps Script layer: custom functions, sidebar server functions, workbook pin, fetch + cache
Sidebar.html         the sidebar (HtmlService) — root, not src/: nested HTML fails to load
test/core.test.mjs   unit tests:  npm test
test/gas-harness.live.mjs   pre-push smoke run of Code.js under stubbed Apps Script globals, live against the API
```

## Develop and push

```bash
npm i -g @google/clasp
clasp login                                   # the Google account that will own the Marketplace listing
cd sheets
clasp create --type sheets --title "GreenCalculus" --rootDir .   # writes .clasp.json (gitignored)
npm test && node test/gas-harness.live.mjs
GC_API_KEY=gc_live_… node test/gas-harness.live.mjs   # also exercises the keyed, pinned (as_of) path
clasp push && clasp open                      # then Extensions → GreenCalculus in the bound sheet
```

`.claspignore` pushes only the manifest and `src/`.

## Publish to the Google Workspace Marketplace (owner steps)

1. Create a Google Cloud project; link it to the Apps Script project (Project Settings → GCP project number).
2. OAuth consent screen: app name, logo, homepage `https://greencalculus.com/`, privacy `https://greencalculus.com/privacy/`, terms `https://greencalculus.com/terms/`; verify the `greencalculus.com` domain. Check whether `script.external_request` is flagged sensitive in the scope picker — if so, submit for OAuth verification (Google: most responses within 24–72 h).
3. Enable the **Google Workspace Marketplace SDK**; App configuration → *Sheets add-on*, script deployment ID from `clasp deploy`.
4. Store listing: name, 128×128 + 220×140 icons, ≥1 screenshot, category *Productivity* (or *Business tools*), support URL `https://greencalculus.com/developers/`.
5. Publish → Google review (public listing).

Listing copy, screenshots and the landing page (guide #47 "Emission factors in Google Sheets & Excel") ship in the same fortnight — see the distribution roadmap.
