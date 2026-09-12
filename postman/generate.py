#!/usr/bin/env python3
"""Build the Postman collection from the live OpenAPI document.

WHY THIS FILE EXISTS. check-collection-parity.mjs says it well: generation is
not a property a file keeps, it is an event that happened to it. That event
happened on 2026-09-12 in a throwaway script, which meant the next person to
regenerate would have written a different one. This is that script, in the repo.

TWO THINGS IT DOES THAT A STOCK OPENAPI-TO-POSTMAN CONVERTER DOES NOT:

  1. AUTH IS MEASURED, NOT READ. Whether a request needs a key is decided by
     sending it without one and seeing what comes back — not by trusting the
     spec's `security` block. The two disagreed on six endpoints until
     gc-api-gateway#118, and measurement was the half that was right. A request
     marked "needs a key" that actually runs keyless is a request nobody pastes,
     and the keyless ten are the reason to publish a collection at all.

  2. THE KEYLESS REQUESTS SORT FIRST inside every folder, because the first
     thing a stranger does with an imported collection is press Send on
     whatever is at the top.

The description is read from description.md so the listing copy can be rewritten
without touching code — it is marketing, it will change more often than this
will, and it should not need a Python review to do it.

    python3 generate.py                 # regenerate in place
    python3 generate.py --dry-run       # report what would change

Then: node check-collection.mjs && node check-collection-parity.mjs
"""
import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC_URL = "https://api.greencalculus.com/openapi.json"
OUT = HERE / "greencalculus.postman_collection.json"
DESCRIPTION = HERE / "description.md"

TAG_ORDER = ["Factors", "Calculate", "Bulk", "Discovery", "Account"]
FOLDER_DESC = {
    "Factors": "Look up a factor by its canonical key, or read what it has been in every past data version.",
    "Calculate": "The calculation engines. Each returns the full working — inputs, the factor used, its source and version — not a bare total.",
    "Bulk": "Up to 100 mixed-methodology calculations in one request.",
    "Discovery": "Browse the corpus, see what we hold and what we deliberately do not. Most of this folder needs no key: it runs the moment you import it.",
    "Account": "Factor Watch — the keys this account is alerted on when a publisher revises them.",
}
METHODS = ("get", "post", "put", "patch", "delete")


def fetch_json(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": "gc-postman-generate"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8"))


def example_of(param):
    if param.get("example") is not None:
        return param["example"]
    schema = param.get("schema") or {}
    for field in ("example", "default"):
        if schema.get(field) is not None:
            return schema[field]
    return None


def body_example(op, spec):
    content = ((op.get("requestBody") or {}).get("content") or {}).get("application/json")
    if not content:
        return None
    if content.get("example") is not None:
        return content["example"]
    examples = content.get("examples") or {}
    for named in examples.values():
        if named.get("value") is not None:
            return named["value"]
    return None


def build_url(path, op):
    """Returns (raw_url, path_vars, query) with every value percent-encoded.

    A spec example like `search=UK electricity` carries a space. Postman would
    encode it on send, but the raw string is what a reader copies into a
    terminal, and curl refuses it outright.
    """
    built, path_vars, query = path, [], []
    for param in op.get("parameters") or []:
        value = example_of(param)
        if param["in"] == "path":
            shown = value if value is not None else f":{param['name']}"
            built = built.replace("{%s}" % param["name"], urllib.parse.quote(str(shown), safe=""))
            path_vars.append({"key": param["name"], "value": str(shown),
                              "description": param.get("description", "")})
        elif param["in"] == "query":
            entry = {"key": param["name"], "value": "" if value is None else str(value),
                     "description": param.get("description", "")}
            # Only params with a worked example are enabled, so the request runs
            # as-is; the rest ship disabled, as documentation of the option.
            if value is None:
                entry["disabled"] = True
            query.append(entry)

    enabled = [q for q in query if not q.get("disabled")]
    qs = "&".join(f"{q['key']}={urllib.parse.quote(str(q['value']), safe='')}" for q in enabled)
    url = {"raw": "{{base_url}}" + built + (f"?{qs}" if qs else ""),
           "host": ["{{base_url}}"],
           "path": [s for s in built.strip("/").split("/") if s]}
    if query:
        url["query"] = query
    if path_vars:
        url["variable"] = path_vars
    return url


def measure_keyless(method, path, op, spec):
    """Send the documented request with NO Authorization header.

    401 means a key is required. Anything else — including a 400 from an empty
    probe body — means the endpoint answered us, so it is open. POSTs are probed
    with `{}` rather than the real example: we are testing the door, not running
    somebody's calculation.
    """
    url_obj = build_url(path, op)
    url = url_obj["raw"].replace("{{base_url}}", spec["servers"][0]["url"].rstrip("/"))
    data = b"{}" if method != "get" and op.get("requestBody") else None
    headers = {"User-Agent": "gc-postman-generate"}
    if data:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=25) as res:
            return res.status != 401
    except urllib.error.HTTPError as err:
        return err.code != 401
    except Exception as err:                                    # noqa: BLE001
        print(f"  ! could not probe {method.upper()} {path}: {err}", file=sys.stderr)
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", default=SPEC_URL, help="spec URL or local path")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    spec = (json.loads(Path(args.spec).read_text()) if not args.spec.startswith("http")
            else fetch_json(args.spec))

    folders, keyless_count, total = {}, 0, 0
    for path, ops in spec["paths"].items():
        for method, op in ops.items():
            if method not in METHODS:
                continue
            tag = (op.get("tags") or ["Discovery"])[0]
            folders.setdefault(tag, {"name": tag, "description": FOLDER_DESC.get(tag, ""), "item": []})

            keyless = measure_keyless(method, path, op, spec)
            request = {
                "method": method.upper(),
                "header": ([{"key": "Content-Type", "value": "application/json"}]
                           if op.get("requestBody") else []),
                "url": build_url(path, op),
                "description": (op.get("description") or op.get("summary") or "").strip(),
            }
            body = body_example(op, spec)
            if body is not None:
                request["body"] = {"mode": "raw", "raw": json.dumps(body, indent=2),
                                   "options": {"raw": {"language": "json"}}}
            if keyless:
                request["auth"] = {"type": "noauth"}
                keyless_count += 1
            total += 1
            folders[tag]["item"].append(
                {"name": op.get("summary") or f"{method.upper()} {path}",
                 "request": request, "response": []})

    for folder in folders.values():
        folder["item"].sort(key=lambda i: (i["request"].get("auth", {}).get("type") != "noauth",
                                           i["request"]["method"] != "GET"))

    ordered = [folders[t] for t in TAG_ORDER if t in folders and folders[t]["item"]]
    ordered += [f for t, f in folders.items() if t not in TAG_ORDER and f["item"]]

    # A STABLE id, so re-importing REPLACES the collection instead of adding a
    # second copy beside it. Postman matches on info._postman_id; without one it
    # mints a fresh id per import, and a workspace being prepared for publication
    # quietly accumulates "GreenCalculus API" two and three times over. Derived
    # from the name, so it is the same on every machine and every regeneration.
    postman_id = str(uuid.uuid5(uuid.NAMESPACE_URL, "https://greencalculus.com/postman/collection"))

    collection = {
        "info": {
            "_postman_id": postman_id,
            "name": "GreenCalculus API",
            "description": DESCRIPTION.read_text().strip(),
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "auth": {"type": "bearer", "bearer": [{"key": "token", "value": "{{api_key}}", "type": "string"}]},
        "item": ordered,
        "variable": [
            {"key": "base_url", "value": spec["servers"][0]["url"].rstrip("/"),
             "description": "The API host. No trailing slash."},
            {"key": "api_key", "value": "",
             "description": "Your key, e.g. gc_live_… — free at https://greencalculus.com/developers/ . "
                            "Leave blank to run the keyless requests only."},
        ],
    }

    rendered = json.dumps(collection, indent=2, ensure_ascii=False) + "\n"
    if args.dry_run:
        same = OUT.exists() and OUT.read_text() == rendered
        print(f"{total} requests, {keyless_count} keyless — "
              f"{'no change' if same else 'WOULD CHANGE ' + str(OUT.name)}")
        return
    OUT.write_text(rendered)
    print(f"wrote {OUT.name}: {total} requests across {len(ordered)} folders ({keyless_count} keyless)")


if __name__ == "__main__":
    main()
