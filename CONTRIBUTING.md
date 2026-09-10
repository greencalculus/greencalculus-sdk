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

## Questions and what you built

[Discussions](https://github.com/greencalculus/greencalculus-sdk/discussions) —
questions, ideas, and things you've built with the API.
