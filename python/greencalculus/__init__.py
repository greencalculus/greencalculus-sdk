"""GreenCalculus — the carbon-accounting API.

Sourced greenhouse-gas emission factors and audit-traced calculations, every
value traceable to its source cell and data version.

    from greencalculus import GreenCalculus

    gc = GreenCalculus()                      # no key needed to read the corpus

    f = gc.factor("grid.gbr.electricity.location_based")
    print(f["value"], f["unit"])              # 0.13096 kg CO2e per kWh
    print(f["citation"]["text"])              # the line you put in a report

    for row in gc.search("diesel litre")["factors"]:
        print(row["key"], row["factor"]["value"])

A free API key (no card: greencalculus.com/developers) additionally unlocks
calculations and ``as_of=`` version pinning:

    gc = GreenCalculus(api_key="gc_live_...")
    r = gc.ghg_activity(activity={"value": 1000, "unit": "kWh"},
                        factor_key="grid.gbr.electricity.location_based")

Zero third-party dependencies (standard library only).
"""
from __future__ import annotations

import json as _json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

__version__ = "0.2.0"
__all__ = ["GreenCalculus", "GreenCalculusError"]

DEFAULT_BASE_URL = "https://api.greencalculus.com"
SIGNUP_URL = "https://greencalculus.com/developers/welcome?plan=free&ref=sdk-python"


class GreenCalculusError(Exception):
    """Raised when the API returns a non-2xx response."""

    def __init__(self, status: int, code: str, message: str) -> None:
        self.status = status
        self.code = code
        self.message = message
        super().__init__(f"[{status} {code}] {message}")


class GreenCalculus:
    """A thin, typed client for the GreenCalculus API.

    The corpus is open to read, so ``api_key`` is optional. Without one,
    :meth:`factor`, :meth:`browse` and :meth:`search` work. Calculations and
    ``as_of=`` pinning need a free key — https://greencalculus.com/developers
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 30.0,
    ) -> None:
        self.api_key = api_key or ""
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    # ── transport ────────────────────────────────────────────────────────
    def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        body: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        url = self.base_url + path
        if params:
            clean = {k: v for k, v in params.items() if v is not None}
            if clean:
                url += "?" + urllib.parse.urlencode(clean)
        data = _json.dumps(body).encode("utf-8") if body is not None else None
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": f"greencalculus-python/{__version__}",
            "X-GC-Client": f"python/{__version__}",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return _json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            err: Dict[str, Any] = {}
            try:
                err = _json.loads(exc.read().decode("utf-8")).get("error", {})
            except Exception:
                pass
            message = err.get("message", str(exc))
            if exc.code == 401 and not self.api_key:
                message = (
                    "This call needs an API key (factor(), browse() and search() "
                    f"work without one). Free, no card: {SIGNUP_URL} — then "
                    "GreenCalculus(api_key=...)."
                )
            raise GreenCalculusError(
                exc.code, err.get("code", "http_error"), message
            ) from None

    def _require_key(self, what: str) -> None:
        if not self.api_key:
            raise GreenCalculusError(
                401,
                "unauthorized",
                f"{what} requires an API key. Free, no card: {SIGNUP_URL} — then "
                "GreenCalculus(api_key=...).",
            )

    # ── factors ──────────────────────────────────────────────────────────
    def factor(self, key: str, as_of: Optional[str] = None) -> Dict[str, Any]:
        """Look up a single emission factor by its canonical key.

        Works without an API key: the corpus is open to read. ``value`` and
        ``unit`` are lifted to the top level for convenience; the full sourced
        row stays under ``["factor"]``, with ``["source"]``, ``["licence"]``
        and ``["citation"]`` alongside it.

        Pass ``as_of="2026.111"`` to pin a past data version for
        reproducibility. Reading the archive needs a free key, so a keyless
        call with ``as_of`` raises rather than returning a current value under
        a past label.
        """
        if as_of:
            self._require_key("Pinning a past data version (as_of=)")
        if self.api_key:
            return self._request(
                "GET",
                "/v1/factors/" + urllib.parse.quote(key, safe=""),
                params={"as_of": as_of},
            )
        # Keyless: the same row is served by the open browse route.
        page = self.browse(key_prefix=key, limit=1)
        rows = page.get("factors") or []
        row = next((r for r in rows if r.get("key") == key), None)
        if row is None:
            raise GreenCalculusError(
                404, "not_found", f'No factor called "{key}". Try search("{key}").'
            )
        out = dict(row)
        f = row.get("factor") or {}
        out["value"] = f.get("value")
        out["unit"] = f.get("unit")
        out["meta"] = page.get("meta")
        return out

    def browse(self, **params: Any) -> Dict[str, Any]:
        """Browse the corpus — keyless, edge-cached. Full rows including the
        value, source cell and licence.

        Params: ``key_prefix``, ``section``, ``family``, ``search``, ``limit``,
        ``offset``, ``cursor``.
        """
        return self._request("GET", "/v1/factors", params=params)

    def search(self, text: str, limit: int = 10) -> Dict[str, Any]:
        """Free-text search over the corpus — keyless."""
        return self.browse(search=text, limit=limit)

    def resolve(self, description: str, **kwargs: Any) -> Dict[str, Any]:
        """Resolve a plain-language description to the best-matched factor(s),
        each with a confidence score."""
        return self._request(
            "POST", "/v1/calculate/resolve", body={"description": description, **kwargs}
        )

    # ── calculations ─────────────────────────────────────────────────────
    def calculate(self, methodology: str, **body: Any) -> Dict[str, Any]:
        """Run a calculation. ``methodology`` is one of: ghg-activity, pcaf,
        embodied, electricity, freight, spend-based, business-travel, batch."""
        self._require_key("Calculations")
        return self._request("POST", "/v1/calculate/" + methodology, body=body)

    def ghg_activity(self, **body: Any) -> Dict[str, Any]:
        """GHG Protocol activity-based emissions (activity x factor)."""
        return self.calculate("ghg-activity", **body)

    def pcaf(self, **body: Any) -> Dict[str, Any]:
        """PCAF financed emissions."""
        return self.calculate("pcaf", **body)

    def embodied(self, **body: Any) -> Dict[str, Any]:
        """EN 15978 embodied carbon."""
        return self.calculate("embodied", **body)

    def electricity(self, **body: Any) -> Dict[str, Any]:
        """Scope 2 electricity (location/market based)."""
        return self.calculate("electricity", **body)

    def freight(self, **body: Any) -> Dict[str, Any]:
        """Freight / logistics (mass x distance)."""
        return self.calculate("freight", **body)

    def spend_based(self, **body: Any) -> Dict[str, Any]:
        """Spend-based EEIO estimation."""
        return self.calculate("spend-based", **body)

    def business_travel(self, **body: Any) -> Dict[str, Any]:
        """Business travel (passenger transport)."""
        return self.calculate("business-travel", **body)

    def batch(self, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Run many calculations in one request. Each item names a `methodology`
        and carries that methodology's own arguments."""
        return self.calculate("batch", items=items)
