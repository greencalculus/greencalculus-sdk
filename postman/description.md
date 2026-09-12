**Emission factors you can cite, and calculations an auditor can re-run.**

16,000+ greenhouse-gas emission factors from 137 publishers — DEFRA, EPA, Ember, IPCC, ECCC, ÖKOBAUDAT. Every value comes back with the exact spreadsheet cell it was read from:

```json
"value": 0.13096,  "unit": "kg CO2e per kWh",
"source":   { "cell_ref": "'UK electricity'!E25", "retrieved": "2026-06-18" },
"licence":  { "name": "Open Government Licence v3.0", "redistributable": true },
"citation": { "proof_url": "https://verify.greencalculus.com/grid.gbr.electricity.location_based@2026.192" }
```

That proof link resolves the value **as it stood at that data version**. So a report re-run in eleven months lands on the same number instead of a quietly-revised one — and the reviewer who asks "where did 0.13096 come from?" gets a cell reference, not a shrug. Most carbon APIs hand you a figure and bury its origin.

## Press Send right now

**Ten of these 28 requests need no key and no signup.** Everything in **Discovery** is open: browse the corpus, read the change feed, check country coverage, and see which factors we deliberately *don't* hold and why. Open any of them and send it — nothing to configure.

## For the other eighteen

Set the `api_key` collection variable. Free, no card: **https://greencalculus.com/developers/**

That unlocks the calculation engines, which return the full working rather than a bare total — GHG Protocol activity, Scope 2 location + market, PCAF financed emissions, EN 15978 embodied carbon, GLEC freight, spend-based EEIO. Each response shows the factor used, its source, and the arithmetic.

## For agents

The same corpus is an MCP server with twelve tools at `https://mcp.greencalculus.com`, on the official MCP registry as `com.greencalculus/api` — so a model can pull a sourced number mid-conversation instead of inventing one.

---

Docs: https://greencalculus.com/developers/docs/ · OpenAPI: https://api.greencalculus.com/openapi.json · SDKs for [Python and JavaScript](https://github.com/greencalculus/greencalculus-sdk) · [Google Sheets add-on](https://workspace.google.com/marketplace/app/greencalculus_emission_factors/172913449875)
