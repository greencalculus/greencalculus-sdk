# GreenCalculus SDKs

[![smithery badge](https://smithery.ai/badge/greencalculus/api)](https://smithery.ai/servers/greencalculus/api)

Official client libraries for the **[GreenCalculus API](https://greencalculus.com/developers)** — sourced greenhouse-gas emission factors and audit-traced calculations. Every value comes back with its **source cell and data version**, so you return citable numbers instead of guesses.

| Language | Package | Install |
|---|---|---|
| Python | [`./python`](./python) | `pip install greencalculus` |
| JavaScript / TypeScript | [`./js`](./js) | `npm install greencalculus` |
| Postman | [`./postman`](./postman) | import the collection |

Get a **free API key** (1,000 calls/month, no card) at **[greencalculus.com/developers](https://greencalculus.com/developers)**.

**Google Sheets:** `=GC_FACTOR("grid.gbr.electricity.location_based")` — see [`sheets/`](./sheets/) (add-in, Marketplace listing pending).

## Quickstart

**Python**
```python
from greencalculus import GreenCalculus
gc = GreenCalculus(api_key="gc_live_...")

f = gc.factor("grid.gbr.electricity.location_based")
print(f["value"], f["unit"])  # 0.13096 kg CO2e per kWh

r = gc.ghg_activity(activity={"value": 1000, "unit": "kWh"},
                    factor_key="grid.gbr.electricity.location_based")
print(r["emissions"]["value"], r["source"]["id"])
```

**JavaScript / TypeScript**
```ts
import { GreenCalculus } from "greencalculus";
const gc = new GreenCalculus({ apiKey: "gc_live_..." });

const f = await gc.factor("grid.gbr.electricity.location_based");
console.log(f.value, f.unit);

const r = await gc.ghgActivity({
  activity: { value: 1000, unit: "kWh" },
  factor_key: "grid.gbr.electricity.location_based",
});
console.log(r.emissions.value, r.source.id);
```

## What you get

- **13,000+ sourced factors** across 50+ categories — grid, fuels, freight, refrigerants, AFOLU, CBAM, construction, spend-based EEIO. Every value returns its source cell, licence and uncertainty.
- **Seven calculation engines** — GHG Protocol activity, PCAF financed emissions, embodied EN 15978, electricity, freight, spend-based, business travel. The full working, never just a total.
- **Reproducible** — a deterministic receipt hash on every result, and `?as_of=` pins any factor to a past data version.
- **Agent-native** — the same data over MCP at `mcp.greencalculus.com`.

## Use it from an AI agent (MCP)

GreenCalculus runs as a remote MCP server, so Claude — or any MCP client — can look up a factor or run a calculation mid-conversation and hand back the **source** with the answer, not just a number.

Add it to your MCP client config:

```json
{ "mcpServers": { "greencalculus": { "url": "https://mcp.greencalculus.com", "headers": { "Authorization": "Bearer gc_live_..." } } } }
```

**12 tools:** `lookup_factor` · `lookup_factors` · `search_factors` · `resolve_factor` · `explain_absence` · `calculate_activity` · `calculate_embodied` · `calculate_pcaf` · `calculate_electricity` · `calculate_freight` · `calculate_spend` · `calculate_business_travel`

`lookup_factors` batches a list of keys into one call instead of one per key; `explain_absence` answers why a factor you expected is not there, which is usually the question behind "do you have X?".

Listed on the [official MCP registry](https://registry.modelcontextprotocol.io) as `com.greencalculus/api` and on [Smithery](https://smithery.ai/servers/greencalculus/api). Discovery (listing tools) is open; calling a tool needs a free key.

## Links

- **Docs:** https://greencalculus.com/developers/docs
- **Data rights, continuity & redistribution:** https://greencalculus.com/developers/trust
- **Status:** https://greencalculus.com/developers/status

MIT licensed. Issues and PRs welcome.
