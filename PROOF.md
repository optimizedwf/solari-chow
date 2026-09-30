# PROOF — determinism, not destiny

**The claim:** the same part, built twice, hashes the same. You can check that yourself, with no
Solari key:

```bash
git clone https://github.com/optimizedwf/solari-chow.git
cd solari-chow && npm install
npm run factory          # exits 0 with no key set
```

Two independent builds of bearing `6205` (bore 25 / OD 52 / width 15 / 7 balls), each normalized
before hashing. The determinism check is `hashA === hashB`. The DFM invariant is asserted in code
(`assert params["balls"] == params["grooves"]`), not printed as a slogan.

## Which hash you get, and why they differ

`npm run factory` has three paths and they print **different** hashes, because they hash **different
things**. We would rather tell you that up front than let you discover it.

| path | how to run | what is hashed | hash |
|---|---|---|---|
| live Solari sandbox | `SOLARI_API_KEY=slr_live_… npm run factory` | normalized **STEP bytes** | `c3259a261f868443` |
| local build123d | `pip install build123d && npm run factory` | normalized **STEP bytes** | asserted against the pinned `c3259a261f868443`; a serializer-version move prints `golden drift (warn)` instead of a false pass |
| no build123d (the default) | `npm run factory` | the **params JSON** | `a856e73e30dd0ff5` |

**Measured on a clean clone, no key, no build123d.** This is the actual output, not an illustration:

```
Params (primary): {"boreMm":25,"odMm":52,"widthMm":15,"balls":7,"grooves":7,"model":"6205","family":"6205"}

Params (bracket check): {"family":"bracket","width":100,"height":60,"thickness":6,"holes":4,"holeDiam":5.4}

→ Local factory (mock sandboxes)…
  check: 7 balls == 7 grooves ✓
  files round-trip ✓
  mock hashlib fallback (build123d not installed)
  determinism: a856e73e30dd0ff5 == a856e73e30dd0ff5 ✓
  golden not checked (hashlib fallback — build123d not installed)
  mock hashlib fallback (build123d not installed)
  determinism: d95263ef4bf0f1ef == d95263ef4bf0f1ef ✓
  golden not checked (hashlib fallback — build123d not installed)

hash (hashlib fallback — no STEP built) hash A: a856e73e30dd0ff5   B: a856e73e30dd0ff5   → EQUAL ✓
```

…and the run ends:

```
FACTORY RESULT: PASS ✓
Local mock (hashlib) build, deterministic hash (params JSON — not STEP bytes), browser-verified card.
```

`a856e73e30dd0ff5` is not a magic number. It is `sha256` of the params JSON above, first 16 hex
chars — check it in one line, no Python needed:

```bash
printf '%s' '{"boreMm":25,"odMm":52,"widthMm":15,"balls":7,"grooves":7,"model":"6205","family":"6205"}' | shasum -a 256 | cut -c1-16
# a856e73e30dd0ff5
```

On this path the factory prints `golden not checked` **on purpose**. It will not claim the pinned
STEP hash when it has not built a STEP. Where it *does* build one, it asserts the value and prints
`golden hash c3259a261f868443 ✓`, or `golden drift (warn)` if a build123d serializer version moved
the bytes without moving the geometry. A check that cannot fail is not a check, so we made this one
able to fail.

**One thing that looks like a mismatch and is not:** the part card is written as
`chow-part-card-c3259a26.html` and displays `c3259a26…` even in mock mode. The card is a showcase
artifact pinned to the published reference hash so it stays byte-stable across machines. It is not
the determinism check. The determinism check is `hashA === hashB` in the terminal above.

## What this does NOT claim

That "Chow" predates Harry Chow's post. An earlier draft of this file asserted the Shop OS agent was
named Chow "2024–25" and that our CNC repo had "history back to 2024". Both were wrong. Measured:

| Repo | created | oldest commit |
|---|---|---|
| `optimizedwf/solari-chow` | 2026-09-01T01:48:17Z | `d3bf1d8` 2026-09-03 |

There is no 2024 history. Our CNC repo's oldest commit is 2026-06-14 — four months before the post,
not years — and it is private, so you cannot check it, which is precisely why we are not asking you
to. **The name overlap is a coincidence we turned into a hook. It is not evidence of anything.**
