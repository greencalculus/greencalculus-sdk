# Contributing

Two kinds of contribution matter most here, and neither one requires writing code.

## Tell us a factor is missing

[Request a factor](https://github.com/greencalculus/greencalculus-sdk/issues/new?template=factor-request.yml).
The corpus grows from these. Describe the real activity rather than a category —
"HVO renewable diesel, well-to-tank, Netherlands, per litre" is actionable;
"biofuels" is not.

Worth 30 seconds first: `GreenCalculus().search("your thing")` needs no key, and
names often differ from what you'd guess.

## Tell us a number is wrong

[Report a wrong value](https://github.com/greencalculus/greencalculus-sdk/issues/new?template=wrong-value.yml).
A carbon figure that is quietly wrong is worse than one that is missing. Every
factor carries a verification link (`citation.proof_url`) showing the publisher,
the document and the exact cell — if that cell doesn't say what we say it says,
we want to know, and we'd rather hear it in public.

## Code

```bash
# Python — no dependencies, stdlib only
cd python && python -m unittest discover -s tests -v

# JavaScript / TypeScript
cd js && npm install && npx tsc --noEmit && npm run build

# Sheets add-in
cd sheets && node --test test/core.test.mjs
```

Then open a pull request. CI runs all three plus a live check that the corpus
still reads without an API key.

A few conventions worth knowing:

- **The keyless path is a contract, not a convenience.** `factor()`, `browse()`
  and `search()` must keep working with no key. There's a CI job that fails the
  build if that stops being true.
- **Refuse rather than guess.** Anything needing a key — calculations, `as_of`
  pinning — must raise a message naming the next action, never return a current
  value under a past label.
- **Error messages are written for the person reading them**, not for a status
  code. Name what to do next.
- **No new runtime dependencies.** Both clients are deliberately dependency-free.

## Releasing

**Bump the version in the manifest, merge to `main`. That's the whole procedure.**

`python/pyproject.toml` and `js/package.json` are the only source of truth for
what's released. The [Release workflow](.github/workflows/release.yml) asks PyPI
and npm whether they already have that version and publishes only when they
don't, so a merge that bumps ships it and a merge that doesn't is a no-op. There
are no release tags to cut and no publish checklist to forget.

It also runs weekly and on demand. That is the point: if a publish fails —
expired token, registry outage, credentials not yet wired — the next run picks it
up without needing a new commit. The registry converges on the repo instead of
drifting from it.

The two packages version independently; they are separate libraries that happen
to share a repo.

One-time setup, recorded here so it can be checked or rebuilt:

**[PyPI](https://docs.pypi.org/trusted-publishers/)** — Manage the project →
*Publishing* → GitHub Actions:

| Field | Value |
|---|---|
| Repository owner | `greencalculus` |
| Repository name | `greencalculus-sdk` |
| Workflow filename | `release.yml` |
| Environment name | `release` |

**[npm](https://docs.npmjs.com/trusted-publishers)** — the package →
*Settings* → *Trusted publishing* → GitHub Actions:

| Field | Value |
|---|---|
| Organization or user | `greencalculus` |
| Repository | `greencalculus-sdk` |
| Workflow filename | `release.yml` |
| Environment name | `release` |

Both are self-serve for whoever owns the project. Neither registry needs a
secret in this repo — the job exchanges its OIDC identity for a short-lived
credential, and the publish carries
[provenance](https://docs.npmjs.com/generating-provenance-statements): a signed
link from the published artefact back to the commit that built it.

npm is retiring the automation tokens that bypass 2FA, so a stored `NPM_TOKEN`
would be the next thing to break. That's why there isn't one. Note the CI box
runs Node 22 — npm's OIDC publishing needs npm >= 11.5.1 and Node >= 22.14.0.
The libraries themselves still support Node 18 and Python 3.9.

## Questions and what you built

[Discussions](https://github.com/greencalculus/greencalculus-sdk/discussions) —
questions, ideas, and things you've built with the API.
