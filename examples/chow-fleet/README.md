# Chow Fleet — 4 Personas × Isolated Solari Browsers

What this proves: Shop OS is exercised by real personas. Each persona gets its own isolated Solari browser (separate cookies, storage, profile). They drive the Shop OS cockpit in parallel and converge into a single friction log, the way real shops surface UX debt.

## Personas

| Persona | Role | Task on cockpit |
|---|---|---|
| `noob-truck` | Truck owner (first-time buyer) | Find outer-race bore 62 mm on the product page |
| `bearing-eng-6205` | Bearing engineer | Verify 7-ball PCD is stock and price is live |
| `purchasing` | Purchasing | Raise a PO for 50 units, check lead time |
| `qa-receiving` | QA / Receiving | Confirm incoming DFM card is yellow not red |

## What fleet proves

- **Isolated desktops/browsers per persona** — no shared state leaks between sessions.
- **Converging friction log** — each persona appends one friction note; the fleet summary is the friction backlog for the next Shop OS iteration.
- **Graceful Free-tier degrade** — `stealth:true, recording:true` at create time; on `402 Payment Required` retries without them. Recording is per-session, so it must be set at creation.

## Run

```bash
npm install
# Mock (no key, no billing, works in CI):
npm start
# Live (Starter+ recommended for stealth/recording):
export SOLARI_API_KEY=slr_live_...
npm start
```

Live target (private tailnet; host shown as a placeholder): `http://shop-os.example.invalid:5173{persona.cockpitPath}`. Without the tailnet the demo drives `https://example.com` and `https://getsolari.com` as stand-ins — swap the base URL in `index.ts` (see `SHOP_OS_BASE` comment).

## Gotchas demonstrated in code

- `stealth:true, recording:true` → `try/catch` on `402` and retry without.
- `proxy: { country: "us", tier: "residential" }` is paid-only — left commented with a note.
- `profileId` reuse pattern: `profiles.list()` → `profiles.create({ name })` → pass `profileId` to `browser.create` → `profiles.save(id)` after close.
- `replayUrl` may not be ready immediately — poll up to ~30 s after `browser.close()`.
- Always `await browser.close(); await solari.close()` in `finally`, browser first (otherwise `solari.close()` can hang).

## Output

A summary table `persona → sessionId → title found` plus replay URLs when recording is on, and a converged friction log for the Shop OS backlog.
