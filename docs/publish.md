# Publish checklist — solari-chow

## 1) Create the public repo — SQUASH FIRST (mandatory)

Dev history stays private: old blobs contain the since-redacted starter code
(`STARTER1MO-…`, introduced in ea905a5). A plain push would publish it via
`git show`. Publish ONE fresh commit instead:

```bash
cd /Users/adam26/.zcode/workspace/default/solari-chow
git branch dev-history main          # local-only pointer to the dev history (NEVER push)
git checkout --orphan publish-main
git add -A
git commit -m "solari-chow: Optimized Manufacturing on Solari — one key for browsers, sandboxes, desktops"
git branch -D main
git branch -m main
# On GitHub, create an empty repo named solari-chow (no README, no .gitignore), then:
git remote add origin https://github.com/optimizedwf/solari-chow.git
git push -u origin main
```

Or via `gh` (after the squash above):

```bash
gh repo create optimizedwf/solari-chow --public --source=. --remote=origin --push
```

Post-push leak check (must print nothing):

```bash
git log --oneline | wc -l                                  # must be 1
# any FULL starter code (placeholder is exactly STARTER1MO-XXXX, 4 chars — must not match):
git grep -E 'STARTER1MO-[A-Z0-9]{6,}' $(git rev-list --all)   # must be empty
```

## 2) Verify public clone works (no key)

```bash
# In a temp dir:
git clone https://github.com/optimizedwf/solari-chow.git /tmp/solari-chow-verify
cd /tmp/solari-chow-verify && npm install
npm run demo       # fleet PASS
npm run factory    # factory PASS — hash c3259a26…
npm run honesty    # honesty PASS — writes honesty-proof.png
npm run onboarding -- --bring --shop "Acme Precision"  # onboarding PASS — <3s mock, writes onboarding.html + shop-config.json
```

Expected: fleet/factory/honesty/onboarding all print PASS without SOLARI_API_KEY. Generated png/html (part-card/honesty-proof) are gitignored and recreated; onboarding.html + shop-config.json are tracked stand-ins.

## 3) (Optional) Verify live with key

```bash
export SOLARI_API_KEY=slr_live_...
npm run fleet    # stealth+recording when on Starter; 402 → retry without → mock fallback
npm run factory
npm run honesty  # remember: desktop bills $0.02/hr until destroy(id) — demo does this in finally
```

Check Solari dashboard for replay URLs (poll up to ~30s after browser.close() if recording).

## 4) Post to X

Copy `docs/x-post.md` main post (already set to `optimizedwf/solari-chow`), attach 60s video per `docs/demo.md`, tag `@harrychow_` `@getsolari`.

After step 4 — publish verification:

```bash
# Video sanity (H.264 yuv420p 60fps, 1920x1080)
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,avg_frame_rate,pix_fmt,duration -of default=nw=1 docs/demo-60s.mp4
# Landing opens via file:// (also on GitHub Pages relative links)
open "file://$(pwd)/docs/hero.html"
xdg-open "file://$(pwd)/docs/hero.html"  # linux fallback
# Tracked intentionally vs ignored (honesty):
#   tracked: examples/onboarding-wizard/onboarding.html + shop-config.json (stand-ins visible without a run)
#   ignored: examples/honesty-desktop/honesty-proof.* + examples/part-card-factory/part-card.html (generated per-run)
git check-ignore -v examples/onboarding-wizard/onboarding.html examples/onboarding-wizard/shop-config.json examples/honesty-desktop/honesty-proof.png examples/part-card-factory/part-card.html || true
git status --short
```

## 5) Reply to Harry Chow's post

Quote or reply to https://x.com/harrychow_/status/2094437473912844480 with the same text + repo link so it shows in his notifications.

## 6) Next rich-grain re-render (documented, not run now)

Current `docs/demo-60s.mp4` is 7.38 MB (~1.03 Mbps, 0.008 bpp) — starved for
1920×1080 60fps grain. Target 45–60 MB (6.3–8.4 Mbps, 0.05–0.07 bpp) is 6–8× larger.
`scripts/render-hero60-stream.mjs` is already env-driven so the *next* render can
hit the target without touching frames — `hero60-cine.html` is deterministic via
`xorshift` seeded by `i*9973+k*7919` (no `Math.random` at runtime).

```bash
# Recommended: lower CRF (visually near-lossless) — keeps slow preset + bt709
CRF=12 PRESET=medium node scripts/render-hero60-stream.mjs
# or pin a floor if CRF alone stays lean on synthetic flat areas:
CRF=14 MAXRATE=8000k BUFSIZE=16000k node scripts/render-hero60-stream.mjs
# for hard CBR-ish floor:
BV=6000k node scripts/render-hero60-stream.mjs
# equivalent raw ffmpeg (what the script spawns):
# ffmpeg -r 60 -i - -c:v libx264 -preset medium -crf 12 -pix_fmt yuv420p \
#   -vf scale=1920:1080:flags=lanczos,format=yuv420p -r 60 -movflags +faststart \
#   -colorspace bt709 -color_primaries bt709 -color_trc bt709 docs/demo-60s.mp4
```

Verify after render (same as § publish verification, plus bitrate):

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,avg_frame_rate,pix_fmt,duration -of default=nw=1 docs/demo-60s.mp4
ls -lh docs/demo-60s.mp4  # expect 45–60 MB
```

Do NOT re-render in CI now (expensive: 3600 frames via Playwright); this note is the
source of truth until the next manual run. `file://$(pwd)/docs/hero.html` note in §
publish verification stays the canonical way to open the landing without a server.

## Safety

- No real secrets in git: `git log --all -S "slr_live" --oneline` shows only `slr_live_...` placeholders; `grep -R "slr_live_[A-Za-z0-9]\{20,\}"` must be empty
- No starter code anywhere: `grep -rnE 'STARTER1MO-[A-Z0-9]{6,}' .` (excluding node_modules) and the same pattern via `git grep` on the PUBLISHED (squashed) history must be empty — the only allowed form is the `STARTER1MO-XXXX` placeholder
- `.env` is gitignored
- `honesty-proof.png/html` and `part-card.html` are gitignored (generated)
- `PROOF.md` — only run git log against the origin Chow repo if Harry asks; no need to over-claim
