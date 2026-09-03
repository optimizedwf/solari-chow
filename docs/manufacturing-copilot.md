# Codex for Manufacturing — chat to design, engineer, quote and run parts

Codex for manufacturing — chat to design, engineer, quote and run parts.

You describe what you need. It designs the CAD, checks it can be made, prices it, and runs the shop. Shop websites are just one slice.

## Where we are today

Today Chow is a Shop OS on Solari. The landing says it plainly: "You make parts. We handle the office." One file builds a live shop — RFQ inbox, instant quote, orders, break-even math. All on one Solari key (`SOLARI_API_KEY=slr_live_...`) that runs browsers, sandboxes and desktops from one balance.

The next step is not a better shop theme. It is the whole loop before and after the website: from idea to shippable part.

## The four pillars

### 1. DESIGN — text to CAD

#### Plain English
You type what you want. You get a real 3D file back. Not a picture — a STEP and STL you can mill, print or send to a factory. It works for normal parts: a bracket, a housing, a PCB enclosure, a shaft. The 6205 bearing is one example, not the only one.

#### Solari primitive
Sandbox. Your prompt runs as Python (`build123d`) inside an isolated microVM. It writes the STEP to disk and exports. No CAD on your laptop, no installs.

#### What v1 ships now
- Prompt → `build123d` in sandbox → STEP on `/tmp/*.step`
- Deterministic builds: timestamps normalized to `1970-01-01T00:00:00` before hashing, so the same geometry always gives the same hash. Pattern `c3259a261f868443` (first 16 of sha256) is the real example from the 6205 card.
- Dual-sandbox check: run the same script in two sandboxes, compare hashes. If they differ, something is not deterministic.
- Works on one key: set `SOLARI_API_KEY=slr_live_...` and it bills to one balance. No key → mock fallback for local work.

#### Roadmap
- Generic families from chat: bracket with hole pattern, housing with bore and lid, PCB enclosure with standoffs, shaft with keyway. Parametric, not one-offs.
- Text edits: "make the wall 2 mm thicker" re-runs the script and re-exports.
- Browser preview of STEP/STL and one-click download.
- Library of past parts so you can fork and reuse.

### 2. ENGINEER — will it actually make?

#### Plain English
Before you quote or cut, it checks the part is makeable. If something is wrong, it tells you in plain words and stops you. No silent bad quotes.

#### Solari primitive
Desktop + sandbox together. The sandbox does the geometry checks. The desktop proves the honesty gate — a yellow REFUSED card when the input is not makeable.

#### What v1 ships now
- Honesty gate today: non-manifold STEP → `REFUSED` on a yellow card (`#f59e0b`). Message: close open edges, remove zero-thickness walls, re-export manifold and re-submit. No geometry is fabricated.
- Sandbox checks run where the CAD is built, so checks and build cannot drift.
- Desktop at `1280×720` with a 30s health poll renders the gate and captures a screenshot as proof it showed.
- Still one key, one balance — `slr_live_...` covers the desktop minutes too.

#### Roadmap
- DFM: wall thickness, undercuts, draft, hole depth to diameter, bend radius — each with a fix suggestion.
- Tolerance gate: flags tight tolerances that drive cost, suggests what can be opened up.
- FEA later: simple load cases on brackets and housings before you quote.
- Electrical later: wiring harness continuity checks and PCB DRC. Not in v1, but the same gate pattern.

### 3. QUOTE — instant price from a STEP

#### Plain English
You upload a STEP. You get a price in minutes. The price moves when you change material, tolerance, finish or quantity. Same file gives the same price every time.

#### Solari primitive
Sandbox. The file is hashed and priced inside the sandbox so quoting is deterministic and auditable.

#### What v1 ships now
- Hash once: `sha256(normalized STEP).slice(0,16)` — the `c3259a261f868443` pattern you see on the part card. Short form `#c3259a26` shown in the UI.
- Price math today: `material × tolerance × finish × qty`. Example defaults in the shop: base $45, material mult `52100:1 / 440C:1.35 / Ceramic:2.1`, tolerance mult `Standard:1 / P4:1.4 / P2:1.9`, finish add `Coated:+$18`. Lead is `ceil(qty/10) + (P2?3:0)` days.
- Every quote shows the hash so customer and shop are looking at the same file.
- One key, one balance. No extra quoting service to configure.

#### Roadmap
- Real material and process tables, finish options that map to operations.
- Quantity breaks, setup vs unit cost, lead time by process.
- Versioned pricing: change the file, price updates, old quotes keep their hash.
- Supplier routing later: same hash, multiple shop prices.

### 4. RUN — from RFQ to shipped

#### Plain English
The shop after the quote. Requests come in, you quote, you win work, you ship it. You can see costs are covered.

#### Solari primitive
Browser for isolation, sandbox for hosting, storage for persistence.

#### What v1 ships now
- Browser: each customer RFQ can be isolated in its own browser session (stealth + recording when available, graceful fallback on 402). Replay URL is captured when the browser closes.
- Inbox flow: `RFQ → Quoted → Won → In Production → Shipped` plus `Refused`. Buttons for Quote, Accept, Refuse on each row; status dropdown per row.
- Hosting: sandbox writes the shop HTML to `/tmp/site/index.html`, serves on `python3 -m http.server 3000`, exposed on `previewUrl(3000)` as `https://xxx-3000.preview.getsolari.com?pt_token=...`. Verified with an outside fetch until the shop name appears.
- Persistence: inbox and orders live in `localStorage` under `shop:<slug>:inbox` and `shop:<slug>:orders` so refresh keeps state. First RFQ id and part-card hash are seeded deterministically from the slug.
- Break-even: `monthlyRevenue = rfqsPerWeek × 4.33 × winRate × avgJobValue` and `monthsToBreakEven = ceil(machineCost / (monthlyRevenue − monthlyPayment))` when net is positive, otherwise "not break-even at this volume." All sliders update the math live.
- Domain: `https://<slug>.getsolari.app` derived from shop name.
- Everything above runs on the same `SOLARI_API_KEY=slr_live_...` — one balance for browser, sandbox and desktop.

#### Roadmap
- Payments, invoicing and deposits tied to Won and Shipped.
- Shipping labels and tracking on Shipped.
- Team inbox: assign, comment, due dates.
- Accounting export and real break-even from actuals, not just sliders.

## Why Solari one-key matters

Three primitives, one key, one balance. No glue work between vendors.

- Browsers isolate customer RFQs. Each request is its own session with optional stealth and recording. If the tier does not allow it, it degrades cleanly and the shop still runs.
- Sandboxes build CAD deterministically. The same script in two sandboxes gives the same hash. Quote pricing, DFM checks and file hosting all happen where the file was built.
- Desktops prove the honesty gate. When the answer is no, the yellow `REFUSED` card is rendered on a real desktop, screenshotted and poll-checked. You can show a customer why it stopped.
- One `SOLARI_API_KEY=slr_live_...` pays for all three. Mock mode runs with no key and no billing for local work. Live mode uses the same code path, just with real infra.

That is the point: chat in, part out, and every step between is on one authenticated, billable, replayable stack.

## What this is not

- Not a shop website builder. The website is the shell. The value is design → engineer → quote → run.
- Not a generic chatbot. It writes and runs `build123d`, hashes geometry, checks manifold, prices from STEP and drives a shop OS — all executable.
- Not a CAD replacement. It makes common parts fast so engineers spend time where judgment matters.

## How we know it works

- Design: same prompt run twice gives same STEP hash (`c3259a261f868443` style) across two sandboxes.
- Engineer: non-manifold STEP shows yellow `REFUSED` on desktop and blocks quoting.
- Quote: same STEP with same material, tolerance, finish and qty gives same price and hash in UI and JSON.
- Run: RFQ seeded as `#<8 hex>` moves through `RFQ → Quoted → Won → Shipped`, persists after reload, and `previewUrl(3000)` fetches the shop from outside the sandbox.

## Open questions to settle in v1

- Which five parametric families ship first after 6205 (bracket, housing, enclosure and shaft are the starting set).
- Default price table source of truth before supplier pricing lands.
- How tight the tolerance gate should be by default for the honesty yellow card.
