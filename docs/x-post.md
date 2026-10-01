# X post draft — tag @harrychow_ @getsolari

## Main post (copy/paste)

```
Chow 🤝 Harry Chow — we turned CNC machines into a real business on Solari.

You make chips. We handle the office:
• Your site + RFQ portal live in ~4 min
• Upload STEP → same hash from 2 sandboxes (c3259a26)
• Can't be made? Yellow REFUSED, not a fake part

@harrychow_ @getsolari
https://github.com/optimizedwf/solari-chow
```

## Thread reply 1 — how to run (optional)

```
Fork-inspired from solari-sdk/solari-cookbook. Mock by default — reviewers see green:
git clone https://github.com/optimizedwf/solari-chow.git
cd solari-chow && npm install && npm run demo
# live: export SOLARI_API_KEY=slr_live_... && npm run fleet / factory / honesty / onboarding
```

## Thread reply 2 — destiny note (only if asked)

```
Chow (Shop OS agent) 🤝 Harry Chow — a name coincidence, nothing more. No 2024 history exists (solari-chow created 2026-09-01; our CNC repo's oldest commit is 2026-06-14, and it's private so you can't check that). What is actually proven: two independent Solari sandboxes build bearing 6205 and produce byte-identical STEP — sha256[:16]=c3259a261f868443. See PROOF.md.
```

## Video

Attach `docs/demo-60s.mp4` native to the main post (13.6MB, under 512MB limit) — do not link-only. Record per `docs/demo.md` (fleet → factory → desktop → teardown) if re-cutting, but the tracked 1920×1080 60fps H.264 yuv420p is the source of truth. Landing video is `docs/hero.html` hero. Even mock mode is green.

Pre-publish checks: `node_modules/ffmpeg-static/ffmpeg -hide_banner -i docs/demo-60s.mp4` and `open file://$(pwd)/docs/hero.html` (also `docs/demo-60s.mp4` plays).

## Checklist before tagging

- [x] Repo is public — anonymous `GET /repos/optimizedwf/solari-chow` → `200`, `"private": false`, `"visibility": "public"`, default branch `main`
- [x] README link is solari-sdk/solari-cookbook (not getsolari/cookbook) — `README.md:100`
- [x] `git clone && npm install && npm run demo` prints FLEET SUMMARY with no errors — fresh clone, 45 packages, exit `0`, prints `FLEET SUMMARY — persona → sessionId → title found  [MOCK (no key — sess_mock_…)]`, zero error lines
- [x] No SOLARI_API_KEY or .env committed — sound test: `git rev-list --all | while read c; do git grep -n -I -E 'slr_live_[A-Za-z0-9_-]{20,}' "$c"; done` → only deliberate placeholders (`.env.example:3`, `docs/howto-setup-cine.html:199`, `scripts/render-howto-setup-30s.mjs:79`). No real key.
      NOTE: `git log --all -S "slr_live"` is NOT a valid test — `-S` matches a change in the string's OCCURRENCE COUNT, so it flags any prose that merely mentions the prefix (including this file's own footnote). Use the `git rev-list` form above.
- [x] Tags are exactly `@harrychow_` and `@getsolari` — `grep -o -E '@[A-Za-z0-9_]+' docs/x-post.md | sort -u` → exactly those two
- [x] Hash display is `c3259a26…` (8 + ellipsis) = `c3259a261f868443` full 16 — consistent across README/badges/docs
- [x] Video attached natively: `docs/demo-60s.mp4` — measured `h264 (High)`, `yuv420p`, `1920x1080`, `60 fps`, `00:01:00.00`, 14,304,863 B (13.64 MiB) < 512 MB
