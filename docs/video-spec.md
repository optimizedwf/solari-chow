# Video Spec — 60s Hero Cut (Chow 🤝 Harry Chow on Solari)

**Source of truth for the 60s hire video.** Every frame is defined so a later Remotion / Playwright render can reproduce it deterministically. The HTML hero at `./hero.html` is the same composition — this spec is its timeline.

**Palette:** OM signal `#9df0f8 → #20b8cd → #077e93` · ink `#16181a` · bone `#efece5` · dark studio `#08090b`.  
**Type:** Impact / Arial Black condensed caps (−8° skew on OM, tight tracking) + Mono `SF Mono` for labels.  
**Motion:** Motion.dev spring-ish (stiffness ~ 420, damping 28, mass .9) — implemented in `hero.html` as CSS `cubic-bezier(.22,1,.36,1)` reveal + `IntersectionObserver`.  
**B-roll:** `docs/slewing-bearing.html` (S-tier: `three@0.160.0` + `EffectComposer` SSAO/Bloom/Bokeh, `makeEnvironment()` + `InstancedMesh`, deterministic `#cine` capture `CINE_FPS 60 DUR 66`) — hero60 shot 6 composites 600f (1320–1919 → 2160–2759) via `render-hero60-cine.mjs` two-page capture; hero60-cine.html fallback is `pseudoBearing(1.0)` full bleed (deterministic parity).

---

## One-liner

Toy scrapes don't compound — a **manufacturing vertical** does. Shop OS turns every CNC shop into 3× Solari power users (browsers, sandboxes, desktops) so Solari gets 100s of *shops*, not 100s of *scrapers*. That's the hire that scales users.

---

## Shot list (60s, 60fps = 3600 frames)

| # | Sec | Frames | Shot | What the viewer sees | Source | Audio / caption |
|---|-----|--------|------|----------------------|--------|-----------------|
| 0 | 0.0–1.2 | 0–72 | Black → OM | **REAL — minimal fast.** Black → spring scale OM monogram (gradient #9df0f8→#20b8cd→#077e93 + tear-cuts + 3 blades) with bone grain 2000 dots. ≤2 words center. | Canvas2D `drawOM` + `xorshift` grain (deterministic) | Caption: `OPTIMIZED MANUFACTURING.` |
| 1 | 1.2–5.0 | 72–300 | Title — browser | **REAL — Chrome browser 1824×808** mocking `hero.html` hi-fi: traffic lights, tab `Shop OS — Optimized Manufacturing`, lock + typing URL `acme-precision.getsolari.app`, 90% zoom, sticky topbar glyph+wordmark, kicker `WATCH 60 SECONDS…`, H1 `You make parts.`, broll gradient + `60 seconds — how it works` video bar with progress + play triangle, `Start with sample parts →`. Cursor: `Try it` → video play with click ripple + humanize ±2.2 px. Inner scroll 90 px. | Canvas2D browser chrome (simulated `hero.html`) — `spring01` enter, `ease` cursor path, `xorshift` jitter | Caption: `Chow 🤝 Harry Chow — Shop OS now live on Solari` |
| 2 | 5.0–11.0 | 300–660 | Proof — terminal | **REAL — Terminal 1824×812 split 52/48.** Left `git log --reverse --date=short --pretty='%h %ad  %s'` of the real submission repo — all 5 real commits, subjects verbatim (hash #20b8cd, shimmer newest, typing cursor, scroll 55%). Right `PROOF.md` rendered mono typing 14 lines (`PROOF — determinism, not destiny`, `npm run factory`, `check: 7 balls == 7 grooves ✓`, `Determinism — c3259a261f868443`). Status bar `5 commits · 7-ball PCD · c3259a26`. Cursor humanize. | Canvas2D terminal `0a0c0e` + mono 11px — `xorshift` per-frame reveal | Caption: `Verified, not asserted · real history, real hashes · PROOF.md` |
| 3 | 11.0–18.0 | 660–1080 | Fleet — 4 browsers | **REAL — 4 Chrome windows 2×2** `(W-64-gap)/2 × 380` tiling: Noob / 6205 Eng / Purchasing / QA — each traffic lights + `ISOLATED` pill + lock URL + white content + left accent + form `Bore Ø` + `FRICTION:` bar + scrollbar prog. Cursor hops 4 windows (step 0.22, ease, click ripple 82–90%). Bottom converged bar `4 isolated sessions → 1 converged backlog`. | Canvas2D 4 browsers — `spring01` stagger 0.08 per card | Caption: `Fleet · 4 personas × isolated Solari browsers · one friction log` |
| 4 | 18.0–28.0 | 1080–1680 | Factory — terminal+hash+bearing | **REAL — Left terminal 940×640** typing 11 lines: `pip install -q build123d` → `Installing …100%` progress bar → `python3 /tmp/build_6205.py` → `Cylinder … +7x Sphere on PCD` → `files.write STEP/STL` → `FILE_NAME 1970…` → `sha256[:16]=c3259a261f868443` → `EQUAL ✓ / PASS` + gotcha hint. **Right floating pill** `c3259a261f868443` + `2 sandboxes → one hash` + `pseudoBearing 0.38` rotating behind veil gradient, pulse ring. Cursor typing. | Canvas2D terminal + `pseudoBearing(0.38,t)` seeded 42 grooves / 90 speckle / 36 scratches / 96T | Caption: `Factory · two sandboxes, same part, same bytes · hash c3259a261f868443` |
| 5 | 28.0–36.0 | 1680–2160 | Honesty — VNC desktop | **REAL — Centered VNC 1280×720** desktop chrome: traffic lights, `Solari Desktop — 1280×720 — mousepad`, LIVE pulse green + `$0.02/hr`, wallpaper radial, yellow `REFUSED` mousepad window 760×420 (`CHOW honesty gate: non-manifold → REFUSED` + Input/Gate/Action lines + blocker icon pulse), 3 badges `humanize:true/screenshot png/destroy(id)`, terminal hint `health() poll ≤30s → open… → screenshot → destroy(id)`, progress bar signal. Cursor humanize ±1.6 px moving to REFUSED with click. | Canvas2D VNC — `spring01` enter, `xorshift` jitter | Caption: `Honesty · bad geometry gets REFUSED — and it tells you why · in yellow` |
| 6 | 36.0–46.0 | 2160–2760 | Cinematic — full bleed | **REAL — Full-bleed orbit.** Prefer `slewing-bearing.html#cine` three@0.160.0 triple-row Ø1.65 m 96T (EffectComposer SSAO/Bloom/Bokeh, `makeEnvironment`, `InstancedMesh`, 66s CINE) inserted 1320–1919 → 2160–2759 via two-page composite; fallback Canvas2D `pseudoBearing(1.0, t*0.72)` with orbit translate ±18/10 px, vignette, HUD only `Ø 1.65 m · 2× axial + 1× radial · 96T · FULLY PROCEDURAL` + orbit arc indicator. No center words. | `slewing-bearing.html` (`render-hero60-cine.mjs` composite) or `pseudoBearing` fallback | Caption: `Ø 1.65 m slewing bearing — modeled from spec, not stock footage` |
| 7 | 46.0–53.0 | 2760–3180 | Teardown — editor | **REAL — VS Code-like editor 1792×720**: traffic lights, tabs `index.ts/fleet.ts/factory.ts/honesty.ts`, Explorer sidebar, gutter 1–18, mono 11px typing 15 lines `try{ new Solari(slr_live) … browsers/sandboxes/desktops … } finally { await browser.close(); await sandbox.kill(); await desktop.destroy(id); await solari.close(); } 402→mockDegrade`, finally block highlight + minimap + blue status bar. Cursor typing per char. | Canvas2D editor chrome — deterministic char reveal | Caption: `Teardown · browser.close() → solari.close() in finally · 402 → mock degrade` |
| 8 | 53.0–60.0 | 3180–3600 | CTA — terminal | **REAL — Terminal 1728×720** typing `git clone … solari-chow` → `Cloning …412` → `npm install →312 pkgs` → `npm run demo` → `✓ fleet/✓ factory/✓ honesty` → `PASS 3/3 · mock green without key · live with SLR_LIVE_` + side bullets `browsers/sandboxes/desktops` + buttons `GITHUB — SOLARI-CHOW` + `@harrychow_/@getsolari` + hold 0.8s fade to OM `OPTIMIZED MANUFACTURING.` Cursor typing, LIVE pulse. | Canvas2D terminal — `holdP 0.82` + `spring01` buttons | Caption: `Clone it. Run it. One slr_live_ key for browsers · sandboxes · desktops.` |

---

## Remotion composition spec

For a later `./src/compositions/Hero60.tsx` (or equivalent):

```ts
// Remotion — 60s hero composition
export const HERO_60 = {
  id: "Hero60",
  durationInFrames: 3600, // 60 * 60
  fps: 60,
  width: 1920,
  height: 1080,
  // Each shot is a <Sequence from={frames} durationInFrames={dur}> rendering
  // the corresponding hero.html section (or a React replica with same tokens).
  // Motion: spring({ frame, fps: 60, config: { stiffness: 420, damping: 28, mass: 0.9 } })
  // B-roll: <OffthreadVideo src={require("./broll/slewing-cine.mp4")} muted volume={0.14} />
} as const;
```

**Assets to pre-render for Remotion:**

- `slewing-cine.mp4` — deterministic capture of `docs/slewing-bearing.html#cine` (66 s, trim to 10 s for shots 1+6). Produce via `window.__cineFrame(i) → JPEG 0.97` loop (see `slewing-bearing.html` CINE block ~837), stitched with `ffmpeg -r 60 -i frame-%04d.jpg -c:v libx264 -preset medium -crf 12 -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart slewing-cine.mp4` (was CRF 16; hero60 stream now also CRF 12 medium ~55 MB @ 6000 k).
- `hero-stills/` — Playwright screenshots of `hero.html#fleet|#factory|#honesty|#cta` at 1920×1080 for fallback sequences.

**Caption track** — `docs/captions.vtt` (3 cues) + `hero-captions.srt` mirror the VO column; burn in with mono `10px` `letter-spacing:.14em` in bone at `bottom: 42px`, and wire `<track kind="captions" src="captions.vtt">` in `hero.html` (kept minimal, no extra gradients/borders).

---

## Deterministic capture (no basic screen record)

Two reproducible paths — pick one:

### A) Playwright HTML → MP4 (today, no Remotion install)

```ts
// scripts/capture-hero.ts — HTML → 60fps MP4 via Playwright + ffmpeg
import { chromium } from "patchright-core";
import { execSync } from "node:child_process";
const FPS = 60, DUR = 60;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto("file://" + process.cwd() + "/docs/hero.html", { waitUntil: "networkidle" });
// Scroll-choreograph: snap to each section at its shot's start frame, hold, then ease to next.
// For each frame i: await page.evaluate((t) => window.scrollTo(0, sectionTop(t)), i/FPS) then screenshot.
```

Stitch:

```bash
ffmpeg -r 60 -i /tmp/hero/frame-%04d.png -c:v libx264 -pix_fmt yuv420p -crf 16 -movflags +faststart docs/hero-60.mp4
ffmpeg -r 60 -i /tmp/cine/frame-%04d.jpg -c:v libx264 -pix_fmt yuv420p -crf 16 docs/slewing-cine.mp4
```

### B) Slewing bearing deterministic frames

```js
// In a Playwright page on docs/slewing-bearing.html#cine
await page.waitForFunction(() => window.__cineMeta);
const { frames } = await page.evaluate(() => window.__cineMeta);
for (let i = 0; i < frames; i++) {
  const dataUrl = await page.evaluate((k) => window.__cineFrame(k), i);
  // dataUrl is image/jpeg 0.97 — save to /tmp/cine/frame-%04d.jpg
}
```

Then `ffmpeg` as above. `CINE_FPS 60 DUR 66` is defined in `slewing-bearing.html` line ~837.

---

## Deliverable checklist

- [x] `docs/hero.html` — cinematic single-file landing (dark studio, OM brand, all 3 artifacts, B-roll iframe, CTA) — now with `poster="poster.jpg"` + `<track kind="captions" src="captions.vtt">`, minimal video-first styling preserved.
- [x] `docs/slewing-bearing.html` — **primary B-roll source** — S-tier cinematic (three@0.160.0 triple-row roller Ø1.65 m 96T, MeshPhysicalMaterial 0.92, EffectComposer SSAO/Bloom/Bokeh, `window.__cineFrame(i)→JPEG 0.97`, CINE_FPS 60 DUR 66 3960 f). Use `#cine` for deterministic pre-render; hero60 cinematic shot trims 66 s → 10 s.
- [x] `docs/hero60-cine.html` — **REAL VISUALS** (was text cards) → Canvas2D simulated chrome at 1920×1080 60fps 3600f deterministic: shot1 Chrome 1824×808 hero mock with typing URL+cursor, shot2 split terminal real-git-log/PROOF.md scrolling, shot3 4 tiled browsers with cursor hops, shot4 terminal pip+STEP hash `c3259a261f868443` + `pseudoBearing(0.38)` behind, shot5 VNC 1280×720 yellow REFUSED with humanize jitter, shot6 full-bleed `pseudoBearing(1.0, t*0.72)` orbit + HUD (S-tier alt: `slewing-bearing.html#cine` via composite), shot7 editor `finally{await safeClose}` typing, shot8 terminal `git clone && npm run demo` PASS. ≤12 words center, captions H28 rgba .55 only, every shot moving (cursor/typing/scroll/orbit/progress). Contract `W1920 H1080 FPS60 FRAMES3600 __cineMeta/__sceneReady/__cineFrame JPEG0.97`, palette #08090b #20b8cd #f59e0b, `xorshift` + `spring01` 420/28/0.9 preserved.
- [x] `scripts/render-hero60-stream.mjs` — default encode now **CRF 12 preset medium** (was CRF 16 slow), `BV=6000k MAXRATE=6000k NALHRD=cbr` VBV ceiling, flags `-pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart`, measured **2079 kb/s bpp 0.0167** (14.87 MB / 60 s; CRF quality governs — 6000k is VBV *ceiling* not CBR floor, use `CRF=none` for true 6000k CBR ~45 MB). Env overrides CRF/PRESET/BV/MAXRATE/BUFSIZE/NALHRD still win. **`OUT` now defaults to the uncapped master `docs/demo-60s.hq.mp4`** and a ship-path guard hard-fails (`[FAIL] ship artifact …`, exit 1) if the result lands outside `(5 MiB, 15 MiB]` — repaired 2026-09-30, mirroring the cine sibling. Post-encode poster extraction at `-ss 00:00:01` (the cine sibling uses `00:00:35`).
- [x] `docs/poster.jpg` + `docs/captions.vtt` — poster extracted at **00:00:35** (91,276 bytes as of the 2026-09-30 re-render, `q:v 2` — bright thumbnail, not the dark 00:00:01 frame) wired as `poster="poster.jpg"`; captions stub 3 cues (00:00:00 Verified/Fleet → 00:00:11 Factory c3259a26 → 00:00:28 Honesty/Cinematic) matching spec VO. `cp docs/poster.jpg /tmp/poster35.jpg` verified.
- [x] `examples/part-card-factory/part-card.html` — OM dark skin (keeps `Part Card` title + `c3259a26` hash for browser assert).
- [x] `examples/honesty-desktop/honesty-proof.html` — OM dark skin (keeps yellow REFUSED card for screenshot).
- [x] This spec — frame-by-frame 60 s cut + Remotion spec + Playwright capture recipes (slewing-cine CRF 16 baseline retained for B-roll trim; hero60 now CRF 12).

---

## QA

- `hero.html` is **additional**, not replacement — `README.md` + `docs/demo.md` are untouched.
- All links are relative so `file://` and GitHub Pages both work. No external font CDN required (system Impact/Mono).
- `part-card.html` title must still contain `Part Card` — `examples/part-card-factory/index.ts` asserts it.
- `honesty-proof.html` yellow card (`#f59e0b`) must remain — `examples/honesty-desktop/index.ts` screenshots it.

