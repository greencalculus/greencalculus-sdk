# greencalculus

The official JavaScript / TypeScript client for the [GreenCalculus API](https://greencalculus.com/developers?ref=npm) — sourced greenhouse-gas emission factors and audit-traced calculations. Every value comes back with the exact cell it came from and the data version it was read at.

Zero dependencies. Uses the platform `fetch` (Node 18+ or any browser). Ships with TypeScript types.

## Install

```bash
npm install greencalculus
```

## No API key needed to read the corpus

```ts
import { GreenCalculus } from "greencalculus";

const gc = new GreenCalculus();                      // no key

// value & unit are lifted to the top level for convenience; the full sourced
// row stays under `.factor`, with `.source`, `.licence` and `.citation` beside it.
const f = await gc.factor("grid.gbr.electricity.location_based");
console.log(f.value, f.unit);            // 0.13096 kg CO2e per kWh
console.log(f.source.id);                // DEFRA_2026
console.log(f.source.cell_ref);          // 'UK electricity'!E25
console.log(f.citation.proof_url);       // a page your reader can check it on
```

Don't know the key? Search, or browse a family — also keyless:

```ts
const hits = await gc.search("diesel litre", 5);
for (const row of hits.factors) console.log(row.key, row.factor.value, row.factor.unit);

await gc.browse({ key_prefix: "grid.gbr", limit: 20 });
await gc.browse({ section: "fuels", limit: 50 });
```

## A free key adds calculations and version pinning

Get one at **[greencalculus.com/developers](https://greencalculus.com/developers/welcome?plan=free&ref=sdk-js)** — 1,000 calls a month, no card.

```ts
const gc = new GreenCalculus({ apiKey: "gc_live_..." });

// An audit-traced calculation — the full working, not just a total
const r = await gc.ghgActivity({
  activity: { value: 1000, unit: "kWh" },
  factor_key: "grid.gbr.electricity.location_based",
});
console.log(r.emissions.value, r.emissions.unit, r.source.id);

// Plain language -> the right factor, with a confidence score
const m = await gc.resolve("UK grid electricity");
```

## Calculations

```ts
await gc.pcaf({
  asset_class: "listed_equity_corporate_bonds",
  holdings: [{
    outstanding_amount: 1_000_000,
    denominator: { type: "evic", value: 2_500_000_000_000 },
    company_emissions: { value: 20_000_000 },
    data_quality_score: 2,
  }],
});

await gc.embodied({
  materials: [{
    material_key: "materials.concrete.ready_mix.c8_10",
    quantity: { value: 50, unit: "m3" },
    boundary: "A1-C",
  }],
});

await gc.freight({
  mass: { value: 1, unit: "tonne" },
  distance: { value: 100, unit: "km" },
  factor_key: "freight.rail.tonne_km",
});
```

Also: `electricity`, `spendBased`, `businessTravel`, and `batch([...])`. Any methodology via `gc.calculate("<methodology>", body)`.

## CO2.js

**Using [CO2.js](https://github.com/thegreenwebfoundation/co2.js) for web carbon?** Feed it a sourced, versioned grid intensity instead of the unversioned bundled average, and keep the citation:

```js
import { co2 } from "@tgwf/co2";
import { GreenCalculus, gridIntensity, toCo2jsOptions } from "greencalculus";

const gc = new GreenCalculus();
const gb = await gridIntensity(gc, "GBR");          // Ember lifecycle row, all 214 countries
const est = new co2({ model: "swd", version: 4 })
  .perVisitTrace(2_000_000, false, toCo2jsOptions(gb));
console.log(est.co2, "g CO2e per visit");   // a number
console.log(gb.citation);                    // the API's citation.text, verbatim
// UK grid electricity — lifecycle intensity. Ember Yearly Electricity Data (2025 release) — Ember Climate,
// cell …, retrieved …. via GreenCalculus data version 2026.186, factor grid.gbr.electricity.lifecycle_intensity.
// https://verify.greencalculus.com/grid.gbr.electricity.lifecycle_intensity@2026.186
```

`gridIntensity(gc, "GBR", { basis: "location_based" })` returns the national inventory factor (DEFRA, NGA, …) where one exists and throws, listing the keys that do exist, where it does not. `co2jsOptionsFor(gc, { device: "AUS", dataCenter: "USA", network: "DEU" })` gives per-segment figures with three citations. Boundary is reported on every result — CO2.js's own bundled numbers are generation-based, the default here is lifecycle.

## Reproducibility & errors

```ts
// Pin a past data version so a figure reproduces exactly in an audit.
// Reading the archive needs a key: a keyless call with asOf rejects rather
// than returning a current value under a past label.
await gc.factor("grid.gbr.electricity.location_based", "2026.111");

import { GreenCalculusError } from "greencalculus";
try {
  await gc.factor("does.not.exist");
} catch (e) {
  if (e instanceof GreenCalculusError) console.log(e.status, e.code, e.message);
}
```

## Links

- Docs: https://greencalculus.com/developers/docs
- Data rights & continuity: https://greencalculus.com/developers/trust
- MCP server (agents): `mcp.greencalculus.com`

MIT licensed.
