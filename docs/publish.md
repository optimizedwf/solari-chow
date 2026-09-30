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
npm run verify:full   # generates the per-run artifacts, then runs all checks → 32 PASS, 0 FAIL
```

Expected: fleet/factory/honesty/onboarding all print PASS without SOLARI_API_KEY. Generated png/html (part-card/honesty-proof) are gitignored and recreated; onboarding.html + shop-config.json are tracked stand-ins.

**Why `verify:full` and not `verify`:** `verify-mock.mjs` asserts the *existence* of
`examples/part-card-factory/part-card.html` and `examples/honesty-desktop/honesty-proof.{png,html}`.
Those are generated per run and gitignored by design (see §publish verification below), so on a fresh
clone they are absent and bare `npm run verify` reports 2 missing artifacts. `verify:full` runs
`factory` + `honesty` first to create them. `verify` stays a pure on-disk checker.

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

Current `docs/demo-60s.mp4` is 9,798,834 B (9.34 MiB, ~1.31 Mbps) — lean for
1920×1080 60fps grain, but it is **inside the repo weight cap** and must stay there:
`scripts/verify-video.mjs` hard-fails the ship path above **15 MiB** and below 5 MiB.

**The cap, not a bitrate target, is what governs this file.** An earlier draft of this
section said "Target 45–60 MB (6.3–8.4 Mbps, 0.05–0.07 bpp)". That was wrong and
self-defeating: 45–60 MB at this exact path is 3–4× **over** the cap, so following the
documented procedure would make the repo fail its own verifier. The correct shape is
two files, which `.gitignore:15` already anticipates:

| path | role | size rule |
|---|---|---|
| `docs/demo-60s.hq.mp4` | full-quality master, **gitignored** | uncapped |
| `docs/demo-60s.mp4` | the **tracked** ship artifact | `>5 MiB` and `<=15 MiB` |

Render the master, then derive the ship file from it (the remedy
`verify-video.mjs:45` names on its own failure line):

```bash
# 1. master (uncapped) — cine renderer now defaults OUT to the hq path
CRF=12 PRESET=medium node scripts/render-hero60-cine.mjs
#    → docs/demo-60s.hq.mp4

# 2. ship file (capped) — two-pass from the master
node_modules/ffmpeg-static/ffmpeg -y -i docs/demo-60s.hq.mp4 \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p \
  -vf scale=1920:1080:flags=lanczos,format=yuv420p \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -movflags +faststart docs/demo-60s.mp4
```

⚠️ `scripts/render-hero60-stream.mjs:10` **still defaults `OUT` to the ship path** and
has no size guard — `render-hero60-cine.mjs` was fixed, its sibling was not. Do not run
the stream renderer bare against `docs/demo-60s.mp4` until that is repaired; pass
`OUT=docs/demo-60s.hq.mp4` explicitly.

Verify after render (same as the publish verification, plus size):

```bash
node_modules/ffmpeg-static/ffmpeg -hide_banner -i docs/demo-60s.mp4
ls -l docs/demo-60s.mp4  # expect >5242880 and <=15728640 bytes
npm run verify            # the cap is enforced here
```

(`ffprobe` is **not** installed — only `ffmpeg-static` ships — so use `ffmpeg -i`.)

Do NOT re-render in CI now (expensive: 3600 frames via Playwright); this note is the
source of truth until the next manual run. `file://$(pwd)/docs/hero.html` note in §
publish verification stays the canonical way to open the landing without a server.

## Safety

- No real secrets in git: `git log --all -S "slr_live" --oneline` shows only `slr_live_...` placeholders; `grep -R "slr_live_[A-Za-z0-9]\{20,\}"` must be empty
- No starter code anywhere: `grep -rnE 'STARTER1MO-[A-Z0-9]{6,}' .` (excluding node_modules) and the same pattern via `git grep` on the PUBLISHED (squashed) history must be empty — the only allowed form is the `STARTER1MO-XXXX` placeholder
- `.env` is gitignored
- `honesty-proof.png/html` and `part-card.html` are gitignored (generated)
- `PROOF.md` — only run git log against the origin Chow repo if Harry asks; no need to over-claim
