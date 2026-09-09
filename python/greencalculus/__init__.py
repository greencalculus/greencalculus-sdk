"""GreenCalculus — the carbon-accounting API.

Sourced greenhouse-gas emission factors and audit-traced calculations, every
value traceable to its source cell and data version.

    from greencalculus import GreenCalculus

    gc = GreenCalculus(api_key="gc_live_...")           # free key: greencalculus.com/developers

    # a sourced factor
    f = gc.factor("grid.gbr.electricity.location_based")
    print(f["factor"]["value"], f["factor"]["unit"])

    # an audit-traced calculation
    r = gc.ghg_activity(activity={"value": 1000, "unit": "kWh"},
                        factor_key="grid.gbr.electricity.location_based")
    print(r["emissions"]["value"], r["emissions"]["unit"])

    # plain language -> the right factor
    m = gc.resolve("UK grid electricity")

Zero third-party dependencies (standard library only).
"""
from __future__ import annotations

import json as _json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

__version__ = "0.1.0"
__all__ = ["GreenCalculus", "GreenCalculusError"]

DEFAULT_BASE_URL = "https://api.greencalculus.com"


class GreenCalculusError(Exception):
    """Raised when the API returns a non-2xx response."""

    def __init__(self, status: int, code: str, message: str) -> None:
        self.status = status
        self.code = code
        self.message = message
        super().__init__(f"[{status} {code}] {message}")


class GreenCalculus:
    """A thin, typed client for the GreenCalculus API."""

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 30.0,
    ) -> None:
        if not api_key:
            raise ValueError(
                "api_key is required — free, no card: "
                "https://greencalculus.com/developers/welcome?plan=free&ref=sdk-python"
            )
        self.api_key = api_key
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
        req = urllib.request.Request(
            url,
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": f"greencalculus-python/{__version__}",
                "X-GC-Client": f"python/{__version__}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return _json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            err: Dict[str, Any] = {}
            try:
                err = _json.loads(exc.read().decode("utf-8")).get("error", {})
            except Exception:
                pass
            raise GreenCalculusError(
                exc.code, err.get("code", "http_error"), err.get("message", str(exc))
            ) from None

    # ── factors ──────────────────────────────────────────────────────────
    def factor(self, key: str, as_of: Optional[str] = None) -> Dict[str, Any]:
        """Look up a single emission factor by its canonical key.

        Pass ``as_of="2026.111"`` to pin a past data version for reproducibility.
        """
        return self._request(
            "GET", "/v1/factors/" + urllib.parse.quote(key, safe=""), params={"as_of": as_of}
        )

    def resolve(self, description: str, **kwargs: Any) -> Dict[str, Any]:
        """Resolve a plain-language description to the best-matched factor(s),
        each with a confidence score."""
        return self._request("POST", "/v1/calculate/resolve", body={"description": description, **kwargs})

    # ── calculations ─────────────────────────────────────────────────────
    def calculate(self, methodology: str, **body: Any) -> Dict[str, Any]:
        """Run a calculation. ``methodology`` is one of: ghg-activity, pcaf,
        embodied, electricity, freight, spend-based, business-travel, batch."""
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
