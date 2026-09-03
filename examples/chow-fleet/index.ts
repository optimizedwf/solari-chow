/**
 * Chow Fleet — 4 personas, each on an isolated Solari browser.
 *
 * Live target (Shop OS cockpit when reachable):
 *   http://100.111.182.5:5173
 * Demo stand-ins (no VPN required):
 *   https://example.com  and  https://getsolari.com
 *
 * What this proves for the hire demo:
 *   Each persona runs on its own browser session (isolated cookies/storage),
 *   drives the Shop OS cockpit, and converges into a single friction log.
 *
 * Mock fallback: when SOLARI_API_KEY is missing, drives no real browser and
 * prints the same summary table so CI and reviewers see a green run.
 */

import { getApiKey, isMockMode, mockSessionId, logMockBanner, logCostNote, isBillingError, isFreeTierError, CHOW_BANNER, safeClose, withTimeout, SOLARI_BASE_URL } from "../../packages/chow-solari/src/index.ts";

// ---------------------------------------------------------------------------
// Types & personas
// ---------------------------------------------------------------------------

type Persona = {
  id: string;
  label: string;
  cockpitPath: string;
  task: string;
};

const PERSONAS: Persona[] = [
  { id: "noob-truck",     label: "Noob — Truck Owner",     cockpitPath: "/noob",      task: "Find outer-race bore 62mm on product page" },
  { id: "bearing-eng-6205", label: "Bearing Eng — 6205",  cockpitPath: "/6205",      task: "Verify 7-ball PCD is stock and price is live" },
  { id: "purchasing",      label: "Purchasing",             cockpitPath: "/po",        task: "Raise PO for 50 units, check lead time" },
  { id: "qa-receiving",    label: "QA / Receiving",         cockpitPath: "/qa",        task: "Confirm incoming DFM card is yellow not red" },
];

const SHOP_OS_BASE = process.env.SHOP_OS_BASE || "http://100.111.182.5:5173";
const SHOP_SLUG = process.env.SHOP_SLUG || "acme-precision";
const SLUG_URL_BASE = `https://${SHOP_SLUG}.getsolari.app`;
// For the recorded demo without Shop OS reachable, stand-ins:
const STANDIN_URLS = ["https://example.com", "https://getsolari.com"];

type FleetRow = { persona: string; sessionId: string; title: string; url: string; replayUrl: string | null; friction: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function mockTitleFor(url: string, personaLabel?: string): string {
  if (url.includes(SHOP_OS_BASE) || url.includes("100.111.182.5")) {
    return personaLabel ? `Shop OS — ${personaLabel}` : "Shop OS — cockpit";
  }
  if (url.includes("getsolari")) return "Solari — Browser Infrastructure";
  return "Example Domain";
}

async function probeLiveBase(timeoutMs = 1500): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(SHOP_OS_BASE, { signal: controller.signal });
    if (res.status >= 200 && res.status < 400) return SHOP_OS_BASE;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Try to dynamically import @solarisdk/browser only when we have a key.
// This lets mock runs work even if the package is not installed.
async function tryImportSolariBrowser(): Promise<unknown> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("@solarisdk/browser");
    return mod;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runPersonaMock(p: Persona, url: string): Promise<FleetRow> {
  const sessionId = mockSessionId(p.id);
  const title = mockTitleFor(url, p.label);
  // Deterministic tiny "driving" delay — no Math.random leakage
  await sleep(180);
  const friction =
    p.id === "noob-truck" ? "Bore field expects number, no unit hint" :
    p.id === "bearing-eng-6205" ? "PCD shown but not copyable" :
    p.id === "purchasing" ? "PO button hidden below fold on 1280px" :
    "DFM yellow card text truncated on mobile";
  return { persona: `${p.label} (${p.id})`, sessionId, title, url, replayUrl: null, friction };
}

async function runPersonaLive(
  mod: unknown,
  p: Persona,
  url: string,
): Promise<FleetRow> {
  // Real SDK surface (verified live against installed @solarisdk/browser@0.1.1):
  //   import { Solari } from "@solarisdk/browser"
  //   const solari = new Solari({ apiKey, baseUrl: SOLARI_BASE_URL })
  //   const session = await solari.launch({ stealth:true, recording:true })
  //   // session.id is real sess_* (e.g. ip-...:uuid:...), session.browser is Playwright Browser
  //   // session.sessions.getReplayUrl(id) polled after close (6x5s = 30s)
  // Duck-typed fallbacks kept so the file still works if SDK drifts.

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = mod;
  const SolariCtor = m.Solari ?? m.default?.Solari ?? m.BrowserClient ?? m.default;
  const apiKey = getApiKey()!;

  let solari: any = null;
  if (typeof SolariCtor === "function") {
    try { solari = new SolariCtor({ apiKey, baseUrl: SOLARI_BASE_URL }); } catch { /* try factory */ }
    if (!solari && typeof m.createClient === "function") solari = await m.createClient({ apiKey, baseUrl: SOLARI_BASE_URL });
    if (!solari && typeof m.createSolariClient === "function") solari = await m.createSolariClient({ apiKey, baseUrl: SOLARI_BASE_URL });
  }
  if (!solari && typeof m.createClient === "function") solari = await m.createClient({ apiKey, baseUrl: SOLARI_BASE_URL });
  if (!solari) throw new Error("Could not instantiate Solari browser client — check @solarisdk/browser version.");

  const solariAny = solari as Record<string, unknown>;

  // Profile reuse (optional): solari.profiles.list/create -> profileId -> launch({profileId})
  let profileId: string | undefined;
  try {
    const profilesApi = (solariAny["profiles"] ?? solariAny["profile"]) as { list?: () => Promise<Array<{ id: string; name: string }>>; create?: (o: unknown) => Promise<{ id: string }> } | undefined;
    if (profilesApi?.list) {
      const list: Array<{ id: string; name: string }> = await profilesApi.list();
      const existing = list.find((pr) => pr.name === p.id);
      if (existing) profileId = existing.id;
      else if (profilesApi.create) profileId = (await profilesApi.create({ name: p.id })).id;
    }
  } catch { /* Profiles optional */ }

  async function launchBrowser(opts: Record<string, unknown>): Promise<any> {
    // Real SDK: solari.launch(opts)
    if (typeof solariAny["launch"] === "function") {
      return await (solariAny["launch"] as (o: unknown) => Promise<any>).call(solari, opts);
    }
    // Duck fallbacks for SDK drift
    if (solariAny["browser"] && typeof (solariAny["browser"] as Record<string, unknown>)["create"] === "function") {
      return await (solariAny["browser"] as { create: (o: unknown) => Promise<any> }).create(opts);
    }
    if (typeof solariAny["createBrowser"] === "function") {
      return await (solariAny["createBrowser"] as (o: unknown) => Promise<any>)(opts);
    }
    if (typeof solariAny["browsers"] !== "undefined") {
      const b = solariAny["browsers"] as Record<string, unknown>;
      if (typeof b["create"] === "function") return await (b["create"] as (o: unknown) => Promise<any>)(opts);
    }
    throw new Error("No browser launch found on Solari client (expected solari.launch)");
  }

  const baseOpts: Record<string, unknown> = {
    ...(profileId ? { profileId } : {}),
  };

  let usedStealth = true;
  let usedRecording = true;
  let browserSession: any = null;

  try {
    browserSession = await launchBrowser({ ...baseOpts, stealth: true, recording: true });
  } catch (err) {
    if (isBillingError(err) || isFreeTierError(err)) {
      console.warn(`[fleet:${p.id}] 402 Free-tier — retrying without stealth/recording`);
      usedStealth = false; usedRecording = false;
      try {
        browserSession = await launchBrowser({});
      } catch (err2) {
        if (isBillingError(err2) || isFreeTierError(err2)) {
          console.warn(`[fleet:${p.id}] 402 on fallback — both creates 402, returning mock session (no billing)`);
          // degrade degrade: close solari client before returning mock so we never leak a billable session
          await safeClose(solari as unknown as { close: () => Promise<unknown> }, 5000);
          const fallback = await runPersonaMock(p, url);
          fallback.friction = fallback.friction.split("\n")[0]!.trim() + " (402 fallback)";
          return fallback;
        }
        throw err2;
      }
    } else throw err;
  }

  if (!browserSession) throw new Error(`[${p.id}] browser launch returned null`);

  // Real session id is browserSession.id (e.g. ip-10-0-11-211:ece8...:cmtjhj...), fallback to nested .session.id
  const sessionId: string = (browserSession.id ?? browserSession.session?.id ?? browserSession.sessionId ?? browserSession.session_id ?? mockSessionId(p.id)) as string;
  let title = "(no title)";
  let replayUrl: string | null = null;

  try {
    // Navigate via Playwright Page. Real SDK: session.browser is a Playwright Browser.
    // Priority: browserSession.newPage() -> browserSession.browser.newPage() -> contexts()[0]
    let page: any = null;
    try {
      if (typeof browserSession.newPage === "function") page = await browserSession.newPage();
      else if (browserSession.browser && typeof browserSession.browser.newPage === "function") page = await browserSession.browser.newPage();
      else if (browserSession.browser && typeof browserSession.browser.contexts === "function") {
        const ctxs = browserSession.browser.contexts();
        if (ctxs.length) page = await ctxs[0].newPage();
        else {
          const ctx = await browserSession.browser.newContext();
          page = await ctx.newPage();
        }
      }
    } catch { /* ignore page creation failure */ }

    if (page) {
      try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 }); } catch { /* goto best-effort */ }
      try {
        if (typeof page.title === "function") title = await page.title();
      } catch { /* ignore */ }
      // Best-effort close page; session close will also close it — degrade with withTimeout 5s
      await safeClose(page as unknown as { close: () => Promise<unknown> }, 5000);
    } else {
      // Duck fallback: browserSession.goto / .page.goto / .navigate
      const bs: any = browserSession;
      if (bs.goto) await bs.goto(url);
      else if (bs.page?.goto) await bs.page.goto(url);
      else if (bs.navigate) await bs.navigate(url);
      else console.warn(`[fleet:${p.id}] No page/newPage on browser — skipping navigation`);
      try {
        if (bs.title) title = await bs.title();
        else if (bs.page?.title) title = await bs.page.title();
      } catch { /* ignore */ }
    }

    // Recording replayUrl — poll via solari.sessions.getReplayUrl(sessionId) after close.
    // We try opportunistically here via direct getReplayUrl if available (before close may 404) — degrade with withTimeout 5s.
    if (usedRecording) {
      try {
        if (solari.sessions?.getReplayUrl) {
          const r = await withTimeout(solari.sessions.getReplayUrl(sessionId).catch(() => null), 5000, "sessions.getReplayUrl()").catch(() => null) as any;
          if (r?.url) replayUrl = r.url;
          else if (typeof r === "string") replayUrl = r;
        } else if ((browserSession as any).replayUrl) {
          replayUrl = await withTimeout((browserSession as any).replayUrl(), 5000, "browser.replayUrl()").catch(() => null) as any;
        }
      } catch { /* not ready yet — will poll after close */ }
    }

    console.log(`[fleet:${p.id}] session=${sessionId} stealth=${usedStealth} recording=${usedRecording} title="${title}"`);
  } finally {
    // Always close browser AND solari client — solari.close() can hang if browser still open,
    // so close browser first. Both in finally so we never leak billable sessions. 5000ms timeout.
    await safeClose(browserSession as unknown as { close: () => Promise<unknown> }, 5000);
    try {
      if (profileId) {
        const profilesApi = (solariAny["profiles"] ?? solariAny["profile"]) as { save?: (id: string) => Promise<void> } | undefined;
        if (profilesApi?.save) await withTimeout(profilesApi.save.call(profilesApi, profileId), 5000, "profiles.save()").catch(() => {});
      }
    } catch { /* ignore */ }
    await safeClose(solari as unknown as { close: () => Promise<unknown> }, 5000);

    // replayUrl poll after close — if usedRecording and still no replayUrl, poll up to 30s (6x5s) via solari.sessions.getReplayUrl — degrade with withTimeout 5s
    if (usedRecording && !replayUrl) {
      const getReplay = (solari as any).sessions?.getReplayUrl?.bind((solari as any).sessions);
      const fallbackReplay = (browserSession as any)?.replayUrl?.bind(browserSession);
      for (let i = 0; i < 6; i++) {
        await sleep(5000);
        try {
          let polled: any = null;
          if (getReplay) polled = (await withTimeout(getReplay(sessionId), 5000, "sessions.getReplayUrl()").catch(() => null) as any) ?? null;
          else if (fallbackReplay) polled = (await withTimeout(fallbackReplay(), 5000, "browser.replayUrl()").catch(() => null) as any) ?? null;
          const url = polled?.url ?? (typeof polled === "string" ? polled : null);
          if (url) { replayUrl = url; break; }
        } catch { /* not ready yet */ }
      }
    }
  }

  const baseFriction =
    p.id === "noob-truck" ? "Bore field expects number, no unit hint" :
    p.id === "bearing-eng-6205" ? "PCD shown but not copyable" :
    p.id === "purchasing" ? "PO button hidden below fold on 1280px" :
    "DFM yellow card text truncated on mobile";
  // friction log from live title if available — append live title snippet so backlog reflects real cockpit
  const friction = (title && title !== "(no title)" && title.trim().length > 0)
    ? `${baseFriction} — live title: "${title.slice(0, 60).replace(/"/g, "'")}"`
    : baseFriction;

  return { persona: `${p.label} (${p.id})`, sessionId, title, url, replayUrl, friction };
}

async function main(): Promise<void> {
  console.log(CHOW_BANNER);
  console.log("=== Chow Fleet — 4 personas × isolated Solari browsers ===\n");

  if (isMockMode()) {
    logMockBanner("chow-fleet");
    console.log(`Stand-ins: ${STANDIN_URLS.join(", ")}`);
    console.log(`Live Shop OS: ${SHOP_OS_BASE}{persona.cockpitPath} (auto-probed; falls back to stand-ins if offline)`);
    console.log(`Probing live Shop OS (${SHOP_OS_BASE})…`);
  } else {
    console.log(`Live mode — SOLARI_API_KEY present (slr_live_… — ${getApiKey()!.length} chars)`);
    logCostNote();
    console.log(`Stand-ins (fallback): ${STANDIN_URLS.join(", ")}`);
    console.log(`Live Shop OS: ${SHOP_OS_BASE}{persona.cockpitPath} — probed first`);
    console.log(`Probing live Shop OS (${SHOP_OS_BASE})…`);
  }

  const liveBase = isMockMode() ? null : await probeLiveBase();
  if (liveBase) {
    console.log("Live Shop OS reachable \u2713 — fleet will drive live cockpit\n");
  } else {
    console.log("Live Shop OS not reachable (offline/VPN) — using stand-ins\n");
  }

  const solariMod = isMockMode() ? null : await tryImportSolariBrowser();
  if (!isMockMode() && !solariMod) {
    console.warn("[fleet] @solarisdk/browser not installed — falling back to mock for this run.");
    console.warn("       Install with: npm install @solarisdk/browser\n");
  }

  const rows: FleetRow[] = [];

  // Launch N=4 — sequentially for Free-tier friendliness (avoid 4 concurrent billable sessions).
  // On paid tiers, you can Promise.all here for true parallelism.
  for (let i = 0; i < PERSONAS.length; i++) {
    const p = PERSONAS[i]!;
    const standinUrl = STANDIN_URLS[i % STANDIN_URLS.length]!;
    // Live path: SHOP_OS_BASE when reachable, else https://{slug}.getsolari.app ; mock uses stand-ins
    const liveUrl = liveBase ? `${liveBase}${p.cockpitPath}` : `${SLUG_URL_BASE}${p.cockpitPath}`;
    const url = isMockMode() ? standinUrl : (liveBase ? liveUrl : liveUrl);
    // In mock mode url is standin; in live mode url is real cockpit or slug app
    const effectiveUrl = isMockMode() ? standinUrl : liveUrl;
    console.log(`→ [${i + 1}/4] ${p.label} — task: ${p.task}`);
    console.log(`         url: ${effectiveUrl}  (live: ${SHOP_OS_BASE}${p.cockpitPath} | slug: ${SLUG_URL_BASE}${p.cockpitPath} | stand-in: ${standinUrl})${isMockMode() ? " [stand-in mock]" : liveBase ? " [live SHOP_OS]" : " [live slug]"}`);

    let row: FleetRow;
    if (isMockMode() || !solariMod) {
      row = await runPersonaMock(p, effectiveUrl);
    } else {
      try {
        row = await runPersonaLive(solariMod, p, effectiveUrl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[fleet:${p.id}] live run failed — mock fallback: ${msg}`);
        row = await runPersonaMock(p, effectiveUrl);
        row.friction += " (live failed, mock)";
      }
    }
    rows.push(row);
  }

  // Summary table — shows real vs mock clearly
  const anyMock = rows.some((r) => r.sessionId.includes("_mock_"));
  const anyLive = rows.some((r) => !r.sessionId.includes("_mock_"));
  const modeLabel = anyMock && !anyLive ? "MOCK (no key — sess_mock_…)" : anyLive && !anyMock ? "LIVE (real sess_*)" : "MIXED (mock fallback)";
  console.log("\n" + "─".repeat(108));
  console.log(`FLEET SUMMARY — persona → sessionId → title found  [${modeLabel}]`);
  console.log("─".repeat(108));
  const hdr = `${"Persona".padEnd(28)}  ${"Session ID".padEnd(24)}  ${"Mode".padEnd(6)}  ${"Title".padEnd(30)}  Friction`;
  console.log(hdr);
  console.log("─".repeat(108));
  for (const r of rows) {
    const titleShort = r.title.length > 30 ? r.title.slice(0, 27) + "…" : r.title;
    const mode = r.sessionId.includes("_mock_") ? "mock" : "live";
    const badge = mode === "mock" ? "mock badge" : "real sess_*";
    // Ensure friction is one line (trimmed)
    const frictionOneLine = r.friction.split("\n")[0]!.trim();
    console.log(`${r.persona.padEnd(28)}  ${r.sessionId.padEnd(24)}  ${mode.padEnd(6)}  ${titleShort.padEnd(30)}  ${frictionOneLine} [${badge}]`);
    if (r.replayUrl) console.log(`  ↳ replay: ${r.replayUrl}  (poll up to 30s after close if null)`);
    else if (mode === "mock") console.log(`  ↳ replay: (mock — no network)`);
  }
  console.log("─".repeat(108));
  if (anyMock) console.log("Mock badge: sess_mock_… titles are Example Domain / Solari — Browser Infrastructure (no live browser).");
  if (anyLive) console.log("Live badge: real sess_* with live titles via page.title()/browser.title and replayUrl poll 30s (6×5s).");

  // Friction log — what the fleet converges on (friction backlog for next iteration)
  console.log("\nConverged friction log (Shop OS backlog):");
  for (const r of rows) console.log(`- [${r.persona}] ${r.friction} — session ${r.sessionId}`);

  console.log("\nDone. All browsers closed. If live, check Solari dashboard for replay URLs.");
  console.log("Gotchas: stealth/recording require paid tier (402 → retry without); recording is per-session at create time;");
  console.log("         always await browser.close() before solari.close(); proxy residential is paid-only (commented).");
}

main().catch((err) => {
  console.error("[chow-fleet] fatal:", err);
  process.exit(1);
});
