# GreenCalculus for Google Sheets

`=GC_FACTOR("grid.gbr.electricity.location_based")` → a sourced emission factor in a cell, with the publisher's exact source cell, the data version and a citation one column over. The spreadsheet is where carbon accounting actually happens; this puts cited factors inside it.

Keyless by default — the GreenCalculus corpus is open to read. An API key (free) adds `as_of` version pinning.

## Functions

| Formula | Returns |
|---|---|
| `=GC_FACTOR(key, [field], [as_of])` | the value, or one field: `unit` `name` `source` `publisher` `cell` `retrieved` `licence` `version` `gwp` `basis` `scope` `citation` `proof`. `key` may be a range. |
| `=GC_FACTOR_ROW(key, [headers])` | one row: value · unit · source · cell · version · citation |
| `=GC_CITE(key, [style])` | the citation line, printed exactly as the API returns it (`citation.text`); `"short"` gives the cell-sized form *DEFRA_2026, 'UK electricity'!E25, v2026.186*. Linked: `=HYPERLINK(GC_FACTOR(key,"proof"), GC_CITE(key,"short"))` — custom functions cannot return links, HYPERLINK can wrap them. Full form e.g. *UK grid electricity — location-based (generation). UK Government GHG Conversion Factors 2026 — Department for Energy Security and Net Zero (DESNZ), cell 'UK electricity'!E25, retrieved 2026-06-18. via GreenCalculus data version 2026.186, factor grid.gbr… https://verify.greencalculus.com/grid.gbr.electricity.location_based@2026.186* |
| `=GC_EMISSIONS(key, quantity)` | quantity × factor (kWh × kg CO2e/kWh = kg CO2e). Ranges fill a column. |
| `=GC_SEARCH("diesel litre", [limit])` | key · name · value · unit · source, one match per row |
| `=GC_VERSION()` | the data version this workbook's formulas read: the pin if set, else current |

Find keys at [greencalculus.com/factors](https://greencalculus.com/factors/) or with `GC_SEARCH`.

## First run

Installing from the Marketplace opens the sidebar (`onInstall` runs in `AuthMode.FULL`, so it may). Until this user has tried it once, the sidebar leads with a one-line "why" (source cell, data version, citation, stays current) and one button, **Build me a starter sheet**: at the selected cell it writes a header row and two rows — UK grid electricity for 1,000 kWh and UK diesel for 500 litres — each with `=GC_EMISSIONS(key, amount)` and a linked short citation `=HYPERLINK(GC_FACTOR(key,"proof"), GC_CITE(key,"short"))`. Cited numbers in one click, no key needed. **Skip** hides the panel. The same block is under *Extensions → GreenCalculus → Build me a starter sheet*. Seen-state is per user (`GC_WELCOMED` in user properties), not per workbook.

## Sidebar (Extensions → GreenCalculus → Open GreenCalculus)

Search the corpus in plain text, then **Insert value**, **Value + source**, **Citation link** (short citation that links to the proof page) or **Full citation** at the selected cell. Inserts pre-fetch the record so the cell fills from cache; Google still shows "Loading…" for its own round trip. The same panel holds the workbook version pin and the API key.

## Workbook version pin

*Pin to current version* (or a past one, e.g. `2026.150`) writes the version into a named range `GC_AS_OF` on a `GreenCalculus` sheet. From then on every `GC_` formula reads factors as they stood at that version and every citation carries it, so the workbook re-opens to the same numbers — what an audit re-run needs. The pin is a visible cell: it travels with a copy and an auditor can see it. `=GC_FACTOR(key, "value", "current")` escapes the pin for one cell.

Pinning reads the archive, which needs an API key. A pinned workbook whose owner has no key shows `#GC_ERROR: This workbook is pinned to data version … — reading a past version needs a free API key: open the sidebar … → API key` — never a current value under a past label.

Why a named range and not a setting: custom functions may read the spreadsheet but not document properties.

## How it behaves

- **One fetch per unique key.** A range of 300 cells with 12 distinct keys makes 12 requests (`UrlFetchApp.fetchAll`), then caches for 6 h. The API edge-caches the same route for an hour, version-keyed, so a data release invalidates every stale answer.
- **Keyed (pinned) fetches are batched** 25 at a time — the free plan allows 30 requests a minute — and a 429 waits for `Retry-After` once within the 30 s budget; anything left shows `#GC_ERROR: Too many lookups this minute — wait 60 s, then press Enter on the cell again; already-fetched cells are kept`.
- **Errors are readable in the cell**, written for an analyst: `#GC_UNKNOWN_KEY: No factor called "…" — search for it in the sidebar …` for a key not in the corpus, `#GC_ERROR: …` for anything else. Every message names the next action; none names an HTTP status (`gcHttpMessage` + `GC_MSG` in `core.js`, gated by a unit test and by the live harness). The raw detail stays in *Extensions → GreenCalculus → Diagnostics*.
- **Custom functions run as the spreadsheet owner.** The API key set via *Extensions → GreenCalculus → Set API key* is stored in the owner's user properties; editors share the owner's entitlement. `as_of` without a key returns a cell message saying so.
- **Limits (Google's):** 30 s per custom-function call; URL Fetch 20,000/day (consumer) or 100,000/day (Workspace) per user.

**Attribution.** Every request carries `X-GC-Client: sheets/<version>` so the API funnel can see add-in traffic; the key prompt, Help links and cell messages carry `?ref=sheets` so signups attribute to the add-in.

## Layout

```
appsscript.json      manifest — V8, external_request + currentonly + container.ui scopes, urlFetchWhitelist
src/core.js          pure logic (URLs, extraction, citation passthrough + fallback, batching, worked-example block) — runs in Apps Script AND Node
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

## Store assets (`store/`)

Generated 2026-09-09 from the 512 px transparent logo master (`store/icon-source-512.png`, the same mark as the site header, attachment 2028). Google's listing requirements (developers.google.com/workspace/marketplace/create-listing): icons 32×32 and 128×128 required, 48×48 and 96×96 if a web app is included; card banner exactly 220×140; 1–10 screenshots, recommended 1280×800 (640×400 and 2560×1600 also accepted), square corners, no padding; app name ≤ 50 chars, short description ≤ 200, detailed < 16,000.

| File | Use |
|---|---|
| `icon-32.png` `icon-48.png` `icon-96.png` `icon-128.png` | Marketplace SDK → Store Listing → application icons (transparent) |
| `icon-128-consent-white.png` | OAuth consent screen logo (opaque white background) |
| `card-220x140.svg` → `card-220x140.png` | Marketplace card banner. Edit the SVG, re-render: `rsvg-convert -w 220 -h 140 -f png card-220x140.svg -o card-220x140.png` |
| `screenshot-1..4.png` | 1280×800, captured from the test sheet — shot list below |
| `demo.mp4` `demo.gif` | Phase 1.7, recorded 9 Sep: 41 s 1280×800 H.264 for the listing/YouTube; 12 s 800px GIF of the formula + citation for social. Recorded with `screencapture -v -V 90 -R 0,114,1280,800 raw.mov` while the owner performed the moves, then cut with ffmpeg (`-ss 28.5 -to 69.5`, `scale=1280:800`, palettegen/paletteuse for the GIF). Re-record after any UI change; the take should start on an EMPTY tab. |

### Screenshot shot list (1280×800, full bleed, square corners)

Capture from the bound test sheet in a window signed in ONLY as jeremiah@greencalculus.com (the sidebar refuses calls under multiple accounts). Browser zoom 100 %, hide bookmarks bar, crop to the Sheets viewport — Google rejects padding. Every shot must show the add-on inside Google Sheets.

1. **The formula.** Cell A2 `grid.gbr.electricity.location_based`, B2 `1000`, C2 `=GC_EMISSIONS(A2,B2)` showing `130.96`, D2 `=GC_CITE(A2)` showing the full citation. Column D wide enough to read the citation to the proof URL. The formula bar shows `=GC_CITE(A2)`.
2. **The sidebar search.** Sidebar open, search box `diesel litre`, results visible with **Insert value / Value + source / Citation** buttons, a result inserted at the selected cell (toast "Inserted at …" if you are quick).
3. **The workbook pin.** Sidebar "Workbook data version" section showing *Pinned to 2026.186*, and the `GreenCalculus` sheet tab visible at the bottom with `GC_AS_OF` in B1.
4. **A country table.** Ten countries down column A using `grid.<iso3>.electricity.lifecycle_intensity` (deu, fra, usa, gbr, aus, jpn, can, ind, bra, zaf — the lifecycle key exists for every country; `location_based` does NOT), `=GC_FACTOR(A2:A11)` filling B, `=GC_FACTOR(A2:A11,"source")` filling C, `=GC_VERSION()` in E1 — shows ranges and one fetch per unique key.

Keys must be typed or pasted as **text**. A key cell that holds an inserted `=GC_FACTOR()` shows the value, and every formula pointing at it then reads a number as the key (the cell now says so: `That cell holds a number (0.13096), not a factor key`).

**How the 9 Sep set was made** (`screenshot-1..4.png`, 2560×1600): a bound-script menu wrote each state (`Demo shot 1–4`, removed again in the same PR — see git history for `src/Demo.js`), and the capture ran from the terminal: `osascript` raised the Brave window holding the sheet and set its bounds to `{0,33,1280,914}`, then `screencapture -x -R 0,114,1280,800` took exactly the Sheets area below the browser chrome. Gotcha: a Sheets tab that has lost its live connection shows "Changes that you made may not be saved" on reload — server-side writes (including sidebar inserts) do land, but that view never shows them; reload first.

```bash
# macOS: capture the Sheets window region, then normalise to exactly 1280×800 (no letterbox)
screencapture -i store/screenshot-1.png
sips -z 800 1280 store/screenshot-1.png   # only if the capture is already 16:10; otherwise crop first
```

## Observed (hallway test, 9 Sep 2026, five testers, shared bound-script sheet)

Recorded as reported; each becomes a Phase 1 item or a documented non-issue.

| # | Observation | Reading |
|---|---|---|
| O1 | `=GC_FACTOR` takes 3–5 s to show a value. | API measures 0.2–1.1 s per call (edge HIT ≈0.2–0.4 s, MISS ≈0.8 s, keyed ≈0.6 s); the rest is Apps Script's per-call server round trip, inherent to custom functions. Mitigations: ranges (one call for many cells, already supported), sidebar inserts could write the value alongside the formula, and the cell can say "Loading…" is normal. |
| O2 | Extensions → GreenCalculus sometimes missing until the tab is refreshed. | The menu is built by `onOpen`; a tab opened before the script was shared/authorised, or before the menu finished loading, shows nothing until reload. Marketplace installs open the sidebar directly; tester card should say "wait 5 s or reload". |
| O3 | `GC_CITE` output is very long for a cell. | By design (a full citation), but the sheet needs a short form: `GC_CITE(key, "short")` and a HYPERLINK-wrapped insert (`=HYPERLINK(GC_FACTOR(k,"proof"), GC_CITE(k,"short"))`) — custom functions cannot return links themselves, HYPERLINK() can wrap them. |
| O4 | Could hyperlinks be in the sheet? | Yes via HYPERLINK() around our functions (see O3); the sidebar buttons can insert that. |
| O5 | Several testers did not understand why they would use it rather than searching online. | Positioning gap, not a UI gap: the value is the exact publisher cell + version + citation, live-updated; searching gives a number with no provenance that goes stale. Onboarding must say this in one line; the audience is people who report or audit numbers, not the general public. |
| O6 | Onboarding felt heavy; wanted an easier, cleaner first run. | Welcome panel exists; next: open the sidebar automatically on first use, a one-line "why", and a "Build me a starter sheet" button. |
| O7 | Should values be centred/bold by default? | Keep Sheets' native alignment (numbers right, text left) and leave formatting to the user; only bold the header row of blocks we insert. |

## Marketplace deployment

| Deployment | ID | Created |
|---|---|---|
| Marketplace v1 (@1) | `AKfycbxzQIP6tExce7_ywrNPo38fmVUb6nrGVqx8GPbiKYuo8l2bih1-Q0nP7-m6PTi2IJVtmw` | 9 Sep 2026, `clasp deploy --description "Marketplace v1"` |
| Marketplace v2 (@2) | same deployment, moved to script **version 2** | 10 Sep 2026 — case-preserving keys, keyless batches of 25, unpinned 429 → open route, fetchAll exceptions logged (PRs #16–#19) |

The Marketplace SDK's **Editor add-on** integration takes the **script ID + a script VERSION number**, not the deployment ID (that is for Workspace add-ons). The listing currently names version 1; change it to **2** in App Configuration when the listing is next (re)submitted — version 1 has none of the 10 Sep fixes.

After any code change, in this order:

```bash
clasp push -f                                             # head deployment + any test install
clasp create-version "Marketplace vN — <date>: <what changed>"   # immutable; prints the number
clasp update-deployment <deployment id> --versionNumber N --description "Marketplace vN"
```

then set that version number in Marketplace SDK → App Configuration → Sheets add-on. `clasp deploy -i` (older clasp) is the same as `update-deployment`.

**Reading errors:** `clasp tail-logs --simplified` needs `"projectId": "greencalculus-sheets"` in the gitignored `.clasp.json`; it then shows per-function errors (e.g. *Exceeded maximum execution time* for the 30 s custom-function cap) and the message `gcFetchBatch_` logs when a `fetchAll` throws.

**Test deployments do not register custom functions.** Deploy → Test deployments attaches the menu and sidebar to a document, but every `GC_` cell stays `#NAME?`. To test formulas in another workbook before the Marketplace install exists, copy the bound test workbook (File → Make a copy carries the script) — that is also how the by-country template ships.

## Publish to the Google Workspace Marketplace (owner steps)

1. Create a Google Cloud project; link it to the Apps Script project (Project Settings → GCP project number).
2. OAuth consent screen: app name, logo, homepage `https://greencalculus.com/`, privacy `https://greencalculus.com/privacy/`, terms `https://greencalculus.com/terms/`; verify the `greencalculus.com` domain. Check whether `script.external_request` is flagged sensitive in the scope picker — if so, submit for OAuth verification (Google: most responses within 24–72 h).
3. Enable the **Google Workspace Marketplace SDK**; App configuration → *Sheets add-on*, script deployment ID from `clasp deploy`.
4. Store listing: assets from `store/` (icons, 220×140 card, screenshots), category *Productivity* (or *Business tools*), support URL `https://greencalculus.com/developers/`.
5. Publish → Google review (public listing).

Listing copy, screenshots and the landing page (guide #47 "Emission factors in Google Sheets & Excel") ship in the same fortnight — see the distribution roadmap.
