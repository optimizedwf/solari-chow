# Demo — Optimized Manufacturing on Solari (60s cut)

**Repo:** `solari-chow` — Optimized Manufacturing's Shop OS on Solari. Works for any shop that makes parts — CNC, sheet, print, or fab; the flow is the same.
**Hook:** Chow 🤝 Harry Chow — a name coincidence turned into a hook, not a precedence claim ([PROOF.md](../PROOF.md)).

## 60s video outline

| Sec | Shot | What the viewer sees |
|-----|------|----------------------|
| 0-5 | Title card | "Optimized Manufacturing on Solari — Shop OS, not a scrape" |
| 5-18 | `chow-fleet` | 4 shop personas (Noob / 6205 Eng / Purchasing / QA) each on isolated Solari browsers, hitting Shop OS cockpit → converged friction log |
| 18-32 | `part-card-factory` | Sandbox microVMs boot → build123d check `7 balls == 7 grooves` → `files.write/read` round-trip → 2 sandboxes same STEP hash `c3259a26…` → browser opens `part-card.html` |
| 32-44 | `honesty-desktop` | Desktop 1280×720 → `health()` poll → `open("mousepad", {humanize:true})` → yellow card "non-manifold → REFUSED" → `screenshot({format:"png"})` → `honesty-proof.png` |
| 44-52 | Code + teardown | `kill()` / `destroy(id)` in `finally`, `await solari.close()` hang fix, 402→mock degrade |
| 52-60 | CTA | `git clone && npm install && npm run demo` works without a key · Tag @harrychow_ @getsolari |

## How to reproduce (no key required)

```bash
git clone https://github.com/optimizedwf/solari-chow.git
cd solari-chow
npm install
npm run demo        # fleet (mock)
npm run factory     # sandbox determinism (real build123d STEP)
npm run honesty     # desktop yellow card → honesty-proof.png
npm run onboarding -- --bring --shop "Acme Precision"  # Office-in-a-Box, <3s mock
npm run onboarding -- --start --shop "New Chip Co" --target-part "6205 bearing" --monthly-rfqs 8  # Start + break-even
```

With a key:

```bash
export SOLARI_API_KEY=slr_live_...
npm run fleet       # live Solari browsers (stealth+recording when on Starter)
```

Starter code (single-use, dashboard only): `STARTER1MO-XXXX` — suffix `-XXXX` is random; redact to `STARTER1MO-XXXX` after use. No SDK endpoint. Redeem at `https://console.getsolari.com` → Billing → Apply code → Create API key → `export SOLARI_API_KEY=slr_live_...`. Never commit a real `slr_live_...` value (placeholder `slr_live_...` only); keep `.env` gitignored. Check: `grep -R "slr_live_[A-Za-z0-9]\{20,\}"` must be empty.

## Artifacts produced

- `examples/chow-fleet/` — console fleet summary + replay URLs (poll up to 30s after close if `recording:true`)
- `examples/part-card-factory/part-card.html` + `/tmp/chow-part-card-*.html` — browser-verified Shop OS part card
- `examples/honesty-desktop/honesty-proof.png` + `honesty-proof.html` — yellow refusal card
- `examples/onboarding-wizard/onboarding.html` + `shop-config.json` — Office-in-a-Box (4 steps, Time to First RFQ ~4 min, deterministic STEP + yellow REFUSED + Start break-even) — tracked so reviewers see it without a run

## Solari primitives covered

Browsers (stealth, proxy, recording+replay, profiles), Sandboxes (microVM, `commands.run` with `args`, `files.*`, `kill()`), Desktops (VNC `streamUrl`, `health()`, `humanize`, `screenshot`, `destroy(id)`).

## Gotchas hit (and handled)

- `await solari.close()` can hang — always `finally` + timeout race.
- `recording:true` is per-session at create time; replay URL polls ~30s after close.
- `sandbox.commands.run("python3", { args: [...] })` — argv via `args`, not a shell string.
- `desktop.destroy(id)` not `kill()`; timeoutMs is a rolling window; `humanize:true` is per-action.
- Free tier 402/403 → retry without stealth/proxy → mock fallback (no crash).

## Onboarding — Office-in-a-Box (Bring / Start)

Two funnels, same 4 steps. `Bring Your Shop` (have CNCs → website + RFQ live) and `Start Your Shop` (no machine yet → target part + break-even). Real CLI: `npm run onboarding` — mock <3s, live Solari Browser with `SOLARI_API_KEY` (stealth+recording at create, 402 retry, replayUrl poll, friction log trimmed). `onboarding.html` is the polished artifact; `shop-config.json` is the machine-readable receipt. See `examples/onboarding-wizard/README.md` and the landing's new funnel CTAs in `docs/hero.html`.

## Why Harry should care

Toy scrapes don't compound — a manufacturing vertical does. Shop OS turns every CNC shop into a Solari power user (browsers to test the shop, sandboxes to generate CAD, desktops to audit honesty), so Solari gets 100s of shops, not 100s of scrapers. That's the hire that scales users, not just demos.
