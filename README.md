# Chow 🤝 Harry Chow — Optimized Manufacturing on Solari

![OM — Optimized Manufacturing · Shop OS on Solari](https://img.shields.io/badge/OM-OPTIMIZED%20MANUFACTURING.-20b8cd?style=for-the-badge) ![Studio #08090b](https://img.shields.io/badge/studio-%2308090b-08090b?style=flat-square) ![Deterministic STEP](https://img.shields.io/badge/STEP-c3259a26%E2%80%A6-7de3ef?style=flat-square) ![DFM PASS](https://img.shields.io/badge/DFM-7%20balls%20%3D%3D%207%20grooves%20%E2%9C%93-f59e0b?style=flat-square) ![Solari](https://img.shields.io/badge/solari-browsers%20%2B%20sandboxes%20%2B%20desktops-111214?style=flat-square)

[![Hero — live demo](https://img.shields.io/badge/demo-hero.html%20%E2%96%B6-20b8cd?style=for-the-badge)](./docs/hero.html) [![Watch 60s](https://img.shields.io/badge/watch-demo--60s.mp4-08090b?style=for-the-badge)](./docs/demo-60s.mp4) ![60fps](https://img.shields.io/badge/60fps-1920x1080%20H.264%20yuv420p-7de3ef?style=flat-square)

> **Watch:** [`docs/hero.html`](./docs/hero.html) (interactive) · [`docs/demo-60s.mp4`](./docs/demo-60s.mp4) (60s · 1920×1080 · 60fps · H.264 · 13.6 MiB) — deterministic `hero60-cine.html#__cineFrame` → `playwright` → `ffmpeg-static` (`libx264 preset medium crf12 yuv420p lanczos bt709 g60 bf0 6000k faststart`). Fallback B-roll: `docs/slewing-bearing.html#cine` (Three.js r160 cinematic, same `__cineFrame` pipeline).

## Turn your shop into a real business. You make parts. We handle the office.

If you have machines — or want to buy your first one — we set up the whole business side: your website, your quote portal, and the checks that keep you honest. You make parts. We handle the office. Works for CNC, sheet, print, or any shop that makes parts — 6205 bearing is the demo, the flow is the same.

This is Optimized Manufacturing's Shop OS running on [Solari](https://getsolari.com) infra. No buzzwords. Watch the 60-second demo above, pick your path below, and run it yourself.

Submission to [Harry Chow's $300K Solari intern challenge](https://x.com/harrychow_/status/2094437473912844480). Chow (the Shop OS agent) 🤝 Harry Chow — a name coincidence, and nothing more. See [PROOF.md](./PROOF.md) for what is actually proven.

## Office-in-a-Box — 4 steps

Plain English. No jargon.

1. **Claim your shop** — tell us your shop name. We reserve your spot.
2. **Website + RFQ live** — your site goes live with a real quote portal. Customers can find parts and request quotes. Built and tested in isolated Solari browsers.
3. **Instant quotes — CAD proof** — upload a STEP. We check it in a sandbox with real build123d geometry and hash it deterministically (`c3259a26…`[^hash]). No "we'll get back to you."
4. **Honest answers — yellow REFUSED** — if it can't be made, you get a yellow card, not a fake part. Audited with a desktop screenshot so you can see it and fix it.

**Time to First RFQ: Mock: <3s, no key · Live: ~4 min (Starter)** — mock is green with no billing; same flow hits real Solari infra with `slr_live_`.

[^hash]: Display `c3259a26…` (8 + ellipsis) = full `c3259a261f868443` (16-char `sha256[:16]`) from the live build123d sandbox path. Running with no `SOLARI_API_KEY` exercises the deterministic mock path, which prints its own placeholder hash instead — set `slr_live_` to reproduce `c3259a26…` exactly.

Footnote only: Browsers · Sandboxes · Desktops on one `slr_live_` key.

> Video source of truth: [docs/video-spec.md](./docs/video-spec.md). Interactive landing: [docs/hero.html](./docs/hero.html). Cinematic fallback B-roll: [docs/slewing-bearing.html#cine](./docs/slewing-bearing.html).

## Pick your path

Two funnels. Same Office-in-a-Box.

| Bring Your Shop | Start Your Shop |
| --- | --- |
| **You already have machines.** We claim your shop and put it online — website + RFQ portal live so customers can find you. | **No machines yet.** We help you plan the first one and prove it pays before you buy. |
| Website + RFQ portal live. Quote inbox that actually works. | Pick a part, price it, see real demand. |
| For shops with 1–10 CNCs who want the office off their plate. | **Break-even math:** At 2/wk you do not break even (≈$849/mo vs $1200 payment) — we show that. At 3/wk → net positive but long. No hype. |

Pick one and run the demo below — both paths use the same 4 steps.

## Try it — no key needed

```bash
git clone https://github.com/optimizedwf/solari-chow.git
cd solari-chow
npm install
npm run demo
```

- **Without a key:** mock mode — all green, no billing. Good for reviewers and CI.
- **With a key:** `export SOLARI_API_KEY=slr_live_...` — same commands hit real Solari (browsers + sandboxes + desktops) on one key.
- **Starter code (single-use, dashboard only):** `STARTER1MO-XXXX` — suffix `-XXXX` is random per code; redact to `STARTER1MO-XXXX` after use / don't share. No SDK redeem endpoint — redeem at `https://console.getsolari.com` → Billing → Apply code → Create API key → `export SOLARI_API_KEY=slr_live_...`. Never commit a real `slr_live_...` value (placeholder only); `.env` is gitignored. Secret-scan: `grep -R "slr_live_[A-Za-z0-9]\{20,\}"` must be empty.
- **If you're on Free tier:** `402`/`403` falls back to mock automatically. Starter is needed for stealth browsers.

Other entry points:

```bash
npm run fleet    # 4 shop personas × isolated browsers → friction log
npm run factory  # sandbox CAD + deterministic hash (c3259a26…[^hash])
npm run honesty  # desktop honesty probe → yellow REFUSED card
npm run verify:full  # generate the per-run artifacts, then check everything (no key)
```

`npm run verify` on its own checks what is already on disk. Two of the things it checks —
`part-card.html` and `honesty-proof.{png,html}` — are **generated per run and gitignored**, so on a
fresh clone they do not exist yet and it will report them missing. `npm run verify:full` generates
them first, then runs the same checks. That is the one to run on a clean clone.

Full 60s outline and gotchas: [docs/demo.md](./docs/demo.md).

## Under the hood

<details>
<summary><strong>Show technical proof</strong> — Fleet / Factory / Honesty one-liners (collapsed so the pitch stays clean)</summary>

- **Fleet (browsers):** 4 personas × isolated Solari browsers (separate session + storage) → one friction backlog. Stealth + recording at create, `402` retry without, `replayUrl` ~30s after close, `close()` → `solari.close()` in `finally`.
- **Factory (sandboxes):** two microVMs build the same 6205 STEP (build123d) → identical bytes, timestamp normalized to `1970-01-01`, `sha256[:16] = c3259a261f868443`. `commands.run` with `{args:[]}`, `sandbox kill()`.
- **Honesty (desktops):** non-manifold STEP in → DFM FAIL → yellow REFUSED card (no fake STL), audited via 1280×720 desktop `screenshot` + `humanize:true`, `destroy(id)` in `finally`.

Solari primitives covered: **browsers** (stealth, proxy, recording, profiles) · **sandboxes** (microVM, determinism) · **desktops** (VNC, screenshot, humanize). Solari is the runtime; Shop OS is the product that lives on it.

Links: [chow-fleet](./examples/chow-fleet/) · [part-card-factory](./examples/part-card-factory/part-card.html) · [honesty-desktop](./examples/honesty-desktop/honesty-proof.html) · [slewing-bearing cinematic](./docs/slewing-bearing.html) · [hero60-cine.html](./docs/hero60-cine.html) · [video-spec.md](./docs/video-spec.md) · [PROOF.md](./PROOF.md)

</details>

## Examples

| Example | What it does |
| --- | --- |
| `chow-fleet` | 4 shop personas on isolated browsers, converging on a friction log |
| `part-card-factory` | Sandbox 6205 bearing CAD (build123d STEP) with deterministic hash, browser-verified card |
| `honesty-desktop` | DFM refusal as yellow card on a Solari desktop (VNC + screenshot) |
| `onboarding-wizard` | Office-in-a-Box — Bring/Start funnel, 4 steps, Time to First RFQ Mock: <3s, no key · Live: ~4 min (Starter), break-even math |

Each under `examples/` — run via `npm --workspace=<name> start`. Wizard also via `npm run onboarding -- --bring --shop "Acme Precision"` (mock <3s) or `--start` for break-even.

## Billing

One `slr_live_` key for browsers, sandboxes, and desktops. Free tier degrades gracefully — `402`/`403` → mock, no crash. Starter needed for stealth.

Fork-inspired from the [Solari cookbook](https://github.com/solari-sdk/solari-cookbook). Built with it, tagged @harrychow_ @getsolari.

OM studio · dark `#08090b` · signal `#9df0f8 → #20b8cd → #077e93` · deterministic STEP `c3259a26…` = `c3259a261f868443`.

Toy scrapes don't compound. A Shop OS does — every shop → browser customer, every part → sandbox job, every check → desktop session. That's recurring Solari usage.

## License

MIT — see [LICENSE](./LICENSE).
