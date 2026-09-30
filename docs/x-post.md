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
Chow (Shop OS agent) was named 2024-25. Harry's post is 2026-08-31 — not a rename.
Proof in PROOF.md: git log --all -S "chow" --before="2026-08-31"
```

## Video

Attach `docs/demo-60s.mp4` native to the main post (9.3MB, under 512MB limit) — do not link-only. Record per `docs/demo.md` (fleet → factory → desktop → teardown) if re-cutting, but the tracked 1920×1080 60fps H.264 yuv420p is the source of truth. Landing video is `docs/hero.html` hero. Even mock mode is green.

Pre-publish checks: `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,avg_frame_rate,pix_fmt,duration -of default=nw=1 docs/demo-60s.mp4` and `open file://$(pwd)/docs/hero.html` (also `docs/demo-60s.mp4` plays).

## Checklist before tagging

- [ ] Repo is public
- [ ] README link is solari-sdk/solari-cookbook (not getsolari/cookbook)
- [ ] `git clone && npm install && npm run demo` prints FLEET SUMMARY with no errors
- [ ] No SOLARI_API_KEY or .env committed (`git log --all -S "slr_live"`)
- [ ] Tags are exactly `@harrychow_` and `@getsolari`
- [ ] Hash display is `c3259a26…` (8 + ellipsis) = `c3259a261f868443` full 16 — consistent across README/badges/docs
- [ ] Video attached natively: `docs/demo-60s.mp4` (9.3MB, H.264 yuv420p 60fps) under 512MB
