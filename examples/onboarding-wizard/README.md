# Onboarding Wizard — Office in a Box

Turn your shop into a real business. You make parts. We handle the office. Works for any shop — CNC, sheet, 3D print.

A 4-step, ~3-minute funnel that turns shop intent into a live storefront, an RFQ portal, a deterministic part card, and — when needed — honest math.

## Funnel

| Route | Who | Promise |
|---|---|---|
| **Bring Your Shop** | Have CNCs, want the office off your plate | Website + RFQ portal + quoting + honesty — live in ~4 minutes |
| **Start Your Shop** | No machine yet, planning the first one | Target part + break-even math (no hype) + the same office behind it |

## Steps

1. **Pick funnel** — Bring vs Start.
2. **Claim** — Shop name → slug → domain preview (`Acme Precision` → `acme-precision.getsolari.app` or a custom domain). For Start: also target part (e.g. `6205 bearing`) and expected monthly RFQs.
3. **Website + RFQ portal live** — Solari Browser session creates the storefront + quote inbox. Mock by default; real browser when `SOLARI_API_KEY=slr_live_...` is set. Stealth + recording at create, 402 retry, `replayUrl` after close, trimmed friction log. Metric shown: Time to First RFQ ~4 min.
4. **Instant quote + honesty gate** — Factory sandbox (`build123d` STEP hash `c3259a261f868443`) → deterministic card (7 balls == 7 grooves) plus the Honesty yellow `REFUSED` demo if the STEP is non-manifold. Ends with live shop URL + first RFQ hash + part-card link.
5. **Start-only: break-even calculator** — inputs: `machineCost` ($65k default), `monthlyPayment` ($1200), `avgJobValue` ($280), `winRate` 0.35, `rfqsPerWeek` (2 default, or derived from monthly RFQs).
   `monthlyRevenue = rfqsPerWeek × 4.33 × winRate × avgJobValue` — `monthsToBreakEven = ceil(machineCost / (monthlyRevenue − monthlyPayment))` if net positive else `not break-even`. Formula is rendered visibly; output reads like `2 RFQs/week → break even in X months. No hype.`

## Run

```bash
npm install
# Mock (no key, no billing, works in CI) — completes in <3s:
npm --workspace=onboarding-wizard start -- --bring --shop "Acme Precision"
# Start funnel with target part + RFQ volume:
npm --workspace=onboarding-wizard start -- --start --shop "New Chip Co" --target-part "6205 bearing" --monthly-rfqs 8
# Custom domain / break-even tuning:
npm --workspace=onboarding-wizard start -- --start --shop "Acme" --domain acme.example.com --machine-cost 65000 --monthly-payment 1200 --avg-job 280 --win-rate 0.35 --rfqs-per-week 2
# Interactive (TTY only — prompts for anything not passed as flags):
npm --workspace=onboarding-wizard start
# Also via root script:
npm run onboarding -- --bring --shop "Acme Precision"

# Live (real Solari infra when reachable):
export SOLARI_API_KEY=slr_live_...
npm --workspace=onboarding-wizard start -- --bring --shop "Acme Precision"
```

Non-interactive by default: if flags cover funnel/shop, no prompts. Interactive prompts only if `stdin.isTTY` and funnel not already chosen. Missing optional Start inputs fall back to defaults without blocking. Mock completion is under 3 seconds.

## Artifacts (deterministic, standalone)

- `examples/onboarding-wizard/onboarding.html` — Polished dark studio artifact (`#08090b`, signal `#20b8cd` / `#7de3ef`, hex OM badge, DIN Condensed) with checkmarks for each step, live shop URL + first RFQ hash + part-card link, yellow Honesty `REFUSED` card, and — for Start — a break-even block with the formula shown. Links to `docs/hero.html` and `part-card.html`. Valid standalone HTML; **tracked** in git (not gitignored) so the demo is visible without a run.
- `examples/onboarding-wizard/shop-config.json` — Machine-readable config: funnel/slug/domain/hash/breakEven.

## What this proves

- **Office in a Box is real** — website, RFQ inbox, and quoting live in minutes, not weeks.
- **Browser session durability** — same `stealth+recording at create → 402 retry → replayUrl poll → trimmed friction log` pattern as `chow-fleet`.
- **Factory determinism** — same `build123d` STEP + timestamp-normalized hash as `part-card-factory`.
- **Honesty as feature** — the same yellow `REFUSED` card as `honesty-desktop`: non-manifold STEP in → no geometry fabricated.
- **Honest Start math** — break-even with the formula on screen; `not break-even` shown when net ≤ 0.

## Gotchas demonstrated in code

- `stealth:true, recording:true` at `browser.create` — retry without on 402 (Free-tier); `recording` is per-session at create.
- `replayUrl` may need up to ~30 s after `browser.close()` to become available.
- Always `await browser.close()` before `solari.close()` (otherwise the client can hang); sandwich both in `finally` with a timeout where possible (`safeClose`/`safeKill`/`safeDestroy` helpers in `packages/chow-solari`).
- Sandbox uses `kill()` not `close()`; desktop uses `destroy(id)`.
- `withTimeout` on all teardown paths so a stalled `close()` never blocks the run.
- STEP `FILE_NAME` timestamps are normalized to `1970-01-01T00:00:00` before hashing for determinism.
- `humanize:true` is per-action, not per-desktop.
- `proxy: { country:"us", tier:"residential" }` is paid-only (left commented).

## Tone

Plain English — the same voice as the new hero: *Turn your shop into a real business. You make parts. We handle the office.*
