# Part Card Factory — Sandbox-Isolated CAD, Browser-Verified

Story: the factory generates a real 6205 bearing STEP inside a Solari sandbox (isolated filesystem, no host pollution) via **build123d**, proves the build is deterministic (same params → same STEP hash in two sandboxes, timestamp-normalized), then a Solari browser opens the resulting HTML card and verifies it visually.

## Flow

```
sandbox create({ template: "base", timeoutMs: 5*60_000 }) → connect()
  → commands.run("pip", { args: ["install", "-q", "build123d"] })
  → files.write("/tmp/build_6205.py", build123d script) → files.write params
  → commands.run("python3", { args: ["/tmp/build_6205.py"] }) → /tmp/6205.step
  → python: normalize STEP FILE_NAME timestamp → 1970-01-01T00:00:00 → sha256[:16]
  → launch 2 sandboxes with same params, assert hashes equal (determinism proof)
  → kill() in finally
→ write part-card.html to /tmp (and ./part-card.html)
→ browser goto file://… + title/screenshot verify
→ PASS / FAIL
```

Determinism matters: if the same 6205 params produce a different STEP hash on two machines, the factory is not reproducible. Two sandboxes with identical input must yield identical output — the STEP header timestamp is normalized before hashing.

## Run

```bash
npm install
# Mock (no key, no billing) — runs locally via python3 + fs, still prints PASS/FAIL:
npm start
# Live (requires SOLARI_API_KEY):
export SOLARI_API_KEY=slr_live_...
npm start
```

Without a key the factory runs entirely local: `python3 -c` via `child_process`, `build123d` if installed (else `hashlib` fallback), `fs` for file round-trip, and `crypto`/`hashlib` for the hash. With a key it does the same work inside real Solari sandboxes.

## What this proves

- **Sandbox-isolated CAD generation** — real build123d geometry and file I/O happen in an ephemeral VM, not on the host.
- **Determinism** — two sandboxes, same params → same normalized STEP hash.
- **Browser-verified visuals** — the card HTML is opened in a Solari browser and its title/badge asserted.

## Gotchas demonstrated in code

- `commands.run("pip", { args: ["install", "-q", "build123d"] })` / `commands.run("python3", { args: [script] })` — argv via `args`, not a shell string.
- Sandbox uses `kill()` not `close()` (desktop uses `destroy()`, browser uses `close()` — each primitive differs).
- `timeoutMs` is a rolling window — it resets on activity, it is not a hard wall-clock deadline.
- STEP `FILE_NAME` timestamps are normalized to `1970-01-01T00:00:00` before hashing, otherwise two identical builds hash differently.
- `recording` (browser) is per-session at create time — cannot be enabled after.
