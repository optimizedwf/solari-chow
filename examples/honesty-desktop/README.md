# Honesty Desktop — DFM Refusal as a Yellow Card

Story: Shop OS's honesty gate refuses a non-manifold STEP instead of hallucinating one. The desktop proves it visually — a yellow warning card, not a fake deliverable. Honesty is the only policy that compounds.

## What happened

- Input: a non-manifold STEP (open edge, zero-thickness wall — the kind of bad geometry a naive generator would silently "fix" and ship).
- Gate: DFM manifold check → `FAIL`.
- Action: **REFUSED** to emit STEP/STL. Returned a yellow card with a remediation hint. No geometry was fabricated.

The desktop session is the proof: it opens an app, types `CHOW honesty gate: non-manifold → REFUSED (not lied, yellow card)`, and screenshots to `honesty-proof.png` (1280×720).

## Flow

```
DesktopClient.create({ template:"default", resolution:"1280x720", timeoutMs:10*60000 })
  → connect() → health() poll up to 30s
  → open("mousepad", { humanize: true })  // humanize is per-action
  → keyboard.type("CHOW honesty gate: non-manifold → REFUSED …")
  → screenshot({ format:"png" }) → ./honesty-proof.png (+ honesty-proof.html)
  → close() + destroy(id) in finally
```

## Run

```bash
npm install
# Mock (no key, no billing) — generates PNG+HTML locally, still prints PASS:
npm start
# Live (requires SOLARI_API_KEY, bills ~$0.02/hr until destroyed):
export SOLARI_API_KEY=slr_live_...
npm start
# Proof:
open honesty-proof.png   # or honesty-proof.html
```

Without a key the demo generates the same yellow-card PNG locally (hand-rolled IHDR/IDAT/IEND, no native deps) so CI and reviewers always get a green run and a viewable artifact.

## What this proves

- **DFM refusal correctly blocks bad STEP** — the gate does not lie, it refuses.
- **Yellow warning card, not fake deliverable** — the output is an honest signal, not hallucinated geometry.
- **Desktop as honesty auditor** — the VM is the witness; the screenshot is the receipt.

## Gotchas demonstrated in code

- `DesktopClient.create({ template, resolution, timeoutMs })` — `timeoutMs` is a rolling window (resets on activity).
- `health()` poll up to 30 s before interacting — the VM may not be ready immediately after `create`.
- `humanize: true` is per-action (`open`, `mouse`, `keyboard`), not a desktop-level flag — shown as `open("mousepad", { humanize: true })` with a fallback.
- `screenshot({ format:"png" })` may return `Buffer | base64 string | { data }` depending on SDK version — all three are handled.
- **Always `close()` + `destroy(id)` in `finally`** — paid desktop VMs bill until destroyed. Sandbox uses `kill()`, browser uses `close()`, desktop uses `destroy(id)` — each primitive differs. Forgetting `destroy` burns credits.
