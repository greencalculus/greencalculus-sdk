"""Offline tests for the GreenCalculus Python client.

No network: these pin the contract that matters — the corpus is readable
without a key, and anything that needs a key refuses clearly instead of
returning a number that looks right.
"""
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from greencalculus import GreenCalculus, GreenCalculusError, __version__  # noqa: E402

ROW = {
    "key": "grid.gbr.electricity.location_based",
    "name": "UK grid electricity — location-based (generation)",
    "factor": {"value": 0.13096, "unit": "kg CO2e per kWh"},
    "source": {"id": "DEFRA_2026", "cell_ref": "'UK electricity'!E25"},
    "citation": {"text": "…", "proof_url": "https://verify.greencalculus.com/…"},
}
PAGE = {"meta": {"gc_version": "2026.187"}, "factors": [ROW]}


class KeylessReads(unittest.TestCase):
    def test_constructs_without_a_key(self):
        self.assertEqual(GreenCalculus().api_key, "")

    def test_factor_reads_the_open_route_when_keyless(self):
        gc = GreenCalculus()
        with mock.patch.object(gc, "_request", return_value=PAGE) as req:
            f = gc.factor("grid.gbr.electricity.location_based")
        method, path = req.call_args[0][0], req.call_args[0][1]
        self.assertEqual((method, path), ("GET", "/v1/factors"))
        self.assertEqual(req.call_args[1]["params"]["key_prefix"], ROW["key"])
        # value/unit lifted; the sourced row kept intact
        self.assertEqual(f["value"], 0.13096)
        self.assertEqual(f["unit"], "kg CO2e per kWh")
        self.assertEqual(f["source"]["cell_ref"], "'UK electricity'!E25")
        self.assertEqual(f["meta"]["gc_version"], "2026.187")

    def test_factor_uses_the_keyed_route_when_a_key_is_present(self):
        gc = GreenCalculus(api_key="gc_live_x")
        with mock.patch.object(gc, "_request", return_value={"value": 1}) as req:
            gc.factor("a.b")
        self.assertEqual(req.call_args[0][1], "/v1/factors/a.b")

    def test_a_prefix_sibling_is_not_mistaken_for_the_key(self):
        # key_prefix=a.b also matches a.b.c — only an exact key may be returned
        gc = GreenCalculus()
        page = {"meta": {}, "factors": [{"key": "a.b.c", "factor": {}}]}
        with mock.patch.object(gc, "_request", return_value=page):
            with self.assertRaises(GreenCalculusError) as e:
                gc.factor("a.b")
        self.assertEqual(e.exception.status, 404)

    def test_search_is_keyless_and_hits_the_open_route(self):
        gc = GreenCalculus()
        with mock.patch.object(gc, "_request", return_value=PAGE) as req:
            gc.search("diesel", limit=3)
        self.assertEqual(req.call_args[0][1], "/v1/factors")
        self.assertEqual(req.call_args[1]["params"], {"search": "diesel", "limit": 3})


class RefusesRatherThanGuesses(unittest.TestCase):
    def test_as_of_without_a_key_refuses(self):
        with self.assertRaises(GreenCalculusError) as e:
            GreenCalculus().factor("a.b", as_of="2026.150")
        self.assertEqual(e.exception.status, 401)
        self.assertIn("greencalculus.com/developers", e.exception.message)

    def test_calculations_without_a_key_refuse_before_the_network(self):
        gc = GreenCalculus()
        with mock.patch.object(gc, "_request") as req:
            for call in (
                lambda: gc.ghg_activity(activity={}),
                lambda: gc.pcaf(holdings=[]),
                lambda: gc.embodied(materials=[]),
                lambda: gc.batch([]),
            ):
                with self.assertRaises(GreenCalculusError):
                    call()
        req.assert_not_called()

    def test_error_copy_names_the_next_action(self):
        try:
            GreenCalculus().ghg_activity(activity={})
        except GreenCalculusError as e:
            self.assertIn("requires an API key", e.message)
            self.assertIn("no card", e.message)


class Transport(unittest.TestCase):
    def test_no_auth_header_when_keyless(self):
        captured = {}

        def fake_urlopen(req, timeout=None):
            captured["headers"] = dict(req.headers)
            raise AssertionError("stop")

        gc = GreenCalculus()
        with mock.patch("urllib.request.urlopen", fake_urlopen):
            with self.assertRaises(AssertionError):
                gc.browse(limit=1)
        keys = {k.lower() for k in captured["headers"]}
        self.assertNotIn("authorization", keys)
        self.assertIn("x-gc-client", keys)

    def test_client_header_matches_the_package_version(self):
        captured = {}

        def fake_urlopen(req, timeout=None):
            captured["headers"] = {k.lower(): v for k, v in req.headers.items()}
            raise AssertionError("stop")

        with mock.patch("urllib.request.urlopen", fake_urlopen):
            with self.assertRaises(AssertionError):
                GreenCalculus(api_key="k").browse()
        self.assertEqual(captured["headers"]["X-gc-client".lower()], f"python/{__version__}")


if __name__ == "__main__":
    unittest.main()
