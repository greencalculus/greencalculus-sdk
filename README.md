# GreenCalculus SDKs

[![CI](https://github.com/greencalculus/greencalculus-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/greencalculus/greencalculus-sdk/actions/workflows/ci.yml)
[![PyPI](https://img.shields.io/pypi/v/greencalculus?label=pypi)](https://pypi.org/project/greencalculus/)
[![npm](https://img.shields.io/npm/v/greencalculus?label=npm)](https://www.npmjs.com/package/greencalculus)
[![MIT](https://img.shields.io/badge/licence-MIT-blue)](./LICENSE)
[![Free tier — no card](https://img.shields.io/badge/free%20tier-no%20card-brightgreen)](https://greencalculus.com/developers/welcome?plan=free&ref=github-sdk-badge)
[![smithery](https://smithery.ai/badge/greencalculus/api)](https://smithery.ai/servers/greencalculus/api)

Official client libraries for the **[GreenCalculus API](https://greencalculus.com/developers?ref=github-sdk)** — sourced greenhouse-gas emission factors and audit-traced calculations. Every value comes back with **the exact cell it came from and the data version it was read at**, so you return citable numbers instead of guesses.

## Try it with no API key

The corpus is open to read. Nothing to sign up for:

```python
pip install greencalculus
```

```python
from greencalculus import GreenCalculus

gc = GreenCalculus()                                    # no key

f = gc.factor("grid.gbr.electricity.location_based")
print(f["value"], f["unit"])                       # 0.13096 kg CO2e per kWh
print(f["factor"]["source"]["cell_ref"])           # 'UK electricity'!E25
print(f["factor"]["citation"]["proof_url"])        # a page anyone can check it on
```

```ts
import { GreenCalculus } from "greencalculus";

const gc = new GreenCalculus();                         // no key
const f = await gc.factor("grid.gbr.electricity.location_based");
console.log(f.value, f.unit, f.factor.source.cell_ref);
```

Don't know the key? Search for it — also keyless:

```python
for row in gc.search("diesel litre")["factors"]:
    print(row["key"], row["factor"]["value"], row["factor"]["unit"])
```

**A [free key](https://greencalculus.com/developers/welcome?plan=free&ref=github-sdk) (no card) adds** the seven calculation engines and `as_of=` version pinning:

```python
gc = GreenCalculus(api_key="gc_live_...")
r = gc.ghg_activity(activity={"value": 1000, "unit": "kWh"},
                    factor_key="grid.gbr.electricity.location_based")
print(r["emissions"]["value"], r["source"]["id"])
```

| Language | Package | Install |
|---|---|---|
| Python | [`./python`](./python) | `pip install greencalculus` |
| JavaScript / TypeScript | [`./js`](./js) | `npm install greencalculus` |
| Google Sheets | [`./sheets`](./sheets) | `=GC_FACTOR("grid.gbr.electricity.location_based")` |
| Postman | [`./postman`](./postman) | import the collection |

## What you get

- **16,000+ sourced factors** across grid, fuels, freight, refrigerants, AFOLU, CBAM, construction and spend-based EEIO. Every value returns its source cell, licence and uncertainty.
- **Seven calculation engines** — GHG Protocol activity, PCAF financed emissions, embodied EN 15978, electricity, freight, spend-based, business travel. The full working, never just a total.
- **Reproducible** — a deterministic receipt hash on every result, and `as_of=` pins any factor to a past data version so a figure re-runs identically in an audit.
- **Checkable by the reader** — every factor has a permanent verification page showing the publisher, the document, the exact cell and whether it may be republished.
- **Agent-native** — the same data over MCP at `mcp.greencalculus.com`.

## Use it from an AI agent (MCP)

GreenCalculus runs as a remote MCP server, so Claude — or any MCP client — can look up a factor or run a calculation mid-conversation and hand back the **source** with the answer, not just a number.

```json
{ "mcpServers": { "greencalculus": { "url": "https://mcp.greencalculus.com", "headers": { "Authorization": "Bearer gc_live_..." } } } }
```

**12 tools:** `lookup_factor` · `lookup_factors` · `search_factors` · `resolve_factor` · `explain_absence` · `calculate_activity` · `calculate_embodied` · `calculate_pcaf` · `calculate_electricity` · `calculate_freight` · `calculate_spend` · `calculate_business_travel`

`lookup_factors` batches a list of keys into one call instead of one per key; `explain_absence` answers why a factor you expected is not there, which is usually the question behind "do you have X?".

Listed on the [official MCP registry](https://registry.modelcontextprotocol.io) as `com.greencalculus/api` and on [Smithery](https://smithery.ai/servers/greencalculus/api). Discovery (listing tools) is open; calling a tool needs a free key.

## Missing a factor? Think a number is wrong?

- [**Request a factor**](https://github.com/greencalculus/greencalculus-sdk/issues/new?template=factor-request.yml) — the corpus grows from these.
- [**Report a wrong value**](https://github.com/greencalculus/greencalculus-sdk/issues/new?template=wrong-value.yml) — a carbon figure that is quietly wrong is worse than one that is missing. Every factor's verification page names the cell we read; if it doesn't say what we say it says, tell us in public.
- [**Discussions**](https://github.com/greencalculus/greencalculus-sdk/discussions) — questions, ideas, and what you've built.

## Links

- **Docs:** https://greencalculus.com/developers/docs
- **Data rights, continuity & redistribution:** https://greencalculus.com/developers/trust
- **Status:** https://greencalculus.com/developers/status
- **Contributing:** [CONTRIBUTING.md](./CONTRIBUTING.md) · **Security:** [SECURITY.md](./SECURITY.md)

MIT licensed. The licence covers these clients; emission-factor data carries the licence of its underlying source, named in every response.
