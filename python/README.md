# greencalculus

The official Python client for the [GreenCalculus API](https://greencalculus.com/developers?ref=pypi) — sourced greenhouse-gas emission factors and audit-traced calculations. Every value comes back with the exact cell it came from and the data version it was read at, so you hand back citable numbers, not guesses.

Zero third-party dependencies (standard library only).

## Install

```bash
pip install greencalculus
```

## No API key needed to read the corpus

```python
from greencalculus import GreenCalculus

gc = GreenCalculus()                                    # no key

f = gc.factor("grid.gbr.electricity.location_based")
print(f["value"], f["unit"])                    # 0.13096 kg CO2e per kWh
print(f["factor"]["source"]["id"])              # DEFRA_2026
print(f["factor"]["source"]["cell_ref"])        # 'UK electricity'!E25
print(f["factor"]["citation"]["text"])          # the line you put in a report
print(f["factor"]["citation"]["proof_url"])     # a page your reader can check it on
```

`value` and `unit` are at the top level; the full sourced row is under
`f["factor"]`, with `["source"]`, `["licence"]` and `["citation"]` inside it.
**The same accessors work with or without a key** — with one, the response
additionally carries `provenance`, `attribution`, `verification` and
`proof_urls`.

Don't know the key? Search — also keyless:

```python
for row in gc.search("diesel litre", limit=5)["factors"]:
    print(row["key"], row["factor"]["value"], row["factor"]["unit"])
```

Or browse a family:

```python
gc.browse(key_prefix="grid.gbr", limit=20)
gc.browse(section="fuels", limit=50)
```

## A free key adds calculations and version pinning

Get one at [greencalculus.com/developers](https://greencalculus.com/developers/welcome?plan=free&ref=sdk-python) — 1,000 calls a month, no card.

```python
gc = GreenCalculus(api_key="gc_live_...")

r = gc.ghg_activity(
    activity={"value": 1000, "unit": "kWh"},
    factor_key="grid.gbr.electricity.location_based",
)
print(r["emissions"]["value"], r["emissions"]["unit"])
print(r["source"]["id"])
```

Every engine returns the formula, the source, the data version and a
deterministic receipt.

```python
gc.pcaf(asset_class="listed_equity_corporate_bonds", holdings=[{
    "outstanding_amount": 1_000_000,
    "denominator": {"type": "evic", "value": 2_500_000_000_000},
    "company_emissions": {"value": 20_000_000},
    "data_quality_score": 2,
}])

gc.embodied(materials=[{
    "material_key": "materials.concrete.ready_mix.c8_10",
    "quantity": {"value": 50, "unit": "m3"},
    "boundary": "A1-C",
}])

gc.freight(mass={"value": 1, "unit": "tonne"},
           distance={"value": 100, "unit": "km"},
           factor_key="freight.rail.tonne_km")
```

Also available: `electricity`, `spend_based`, `business_travel`, and
`batch(items=[...])`. Any methodology works via `gc.calculate("<methodology>", **body)`.
Plain language to the right factor: `gc.resolve("UK grid electricity")`.

## Reproducibility

Pin any factor to a past data version so a figure reproduces exactly in an audit:

```python
gc.factor("grid.gbr.electricity.location_based", as_of="2026.111")
```

Reading the archive needs a key. A keyless call with `as_of` raises rather than
returning a current value under a past label.

## Errors

Errors name the next action, not an HTTP status.

```python
from greencalculus import GreenCalculusError

try:
    gc.factor("does.not.exist")
except GreenCalculusError as e:
    print(e.status, e.code, e.message)
    # 404 not_found No factor called "does.not.exist". Try search("does.not.exist").
```

## Links

- Docs: https://greencalculus.com/developers/docs
- Data rights & continuity: https://greencalculus.com/developers/trust
- Request a factor / report a wrong value: https://github.com/greencalculus/greencalculus-sdk/issues
- MCP server (agents): `mcp.greencalculus.com`

MIT licensed.
