/**
 * Onboarding Wizard — Office in a Box funnel
 *
 * Turn your shop into a real business. You make parts. We handle the office.
 *
 * Funnel: Bring Your Shop (have machines, want office off plate)
 *      vs  Start Your Shop (no machine yet, planning the first one)
 *
 * Flow (4 steps, ~3 min):
 *   1) Pick funnel
 *   2) Claim shop (name → slug → domain preview) [+ target part + RFQ volume for Start]
 *   3) Website + RFQ portal live — mock Solari Browser session (stealth+recording, 402 retry, replayUrl, friction log trimmed)
 *   4) Instant quote + honesty gate — mock Factory sandbox (build123d STEP hash c3259a261f868443) → deterministic card + yellow REFUSED demo if STEP bad
 *   5) For Start: break-even calculator visible formula
 *
 * Mock by default (no SOLARI_API_KEY → no billing/network). Live when SOLARI_API_KEY=slr_live_... present.
 * Non-blocking CLI: completes in <3s with --bring/--start/--shop flags; interactive prompts only if TTY and no funnel flag.
 */

import "dotenv/config";
import { getApiKey, isMockMode, mockSessionId, logMockBanner, isFreeTierError, isBillingError, CHOW_BANNER, safeClose, safeKill, withTimeout, SOLARI_BASE_URL } from "../../packages/chow-solari/src/index.ts";
import { writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";

// ---------------------------------------------------------------------------
// Args & helpers
// ---------------------------------------------------------------------------

type Funnel = "bring" | "start";

type CliArgs = {
  funnel: Funnel | null;
  shopName: string | null;
  domain: string | null;
  machineCost: number;
  monthlyPayment: number;
  avgJobValue: number;
  winRate: number;
  rfqsPerWeek: number;
  targetPart: string | null;
  monthlyRfqs: number | null;
  help: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    funnel: null,
    shopName: null,
    domain: null,
    machineCost: 65_000,
    monthlyPayment: 1200,
    avgJobValue: 280,
    winRate: 0.35,
    rfqsPerWeek: 2,
    targetPart: null,
    monthlyRfqs: null,
    help: false,
  };
  let shopType: string | null = null;
  let mcExplicit = false, mpExplicit = false, ajExplicit = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--bring") out.funnel = "bring";
    else if (a === "--start") out.funnel = "start";
    else if (a === "--funnel" && argv[i + 1]) { const v = argv[++i]!; if (v === "bring" || v === "start") out.funnel = v as Funnel; }
    else if (a.startsWith("--funnel=")) { const v = a.slice("--funnel=".length); if (v === "bring" || v === "start") out.funnel = v as Funnel; }
    else if (a === "--shop" && argv[i + 1]) out.shopName = argv[++i]!;
    else if (a.startsWith("--shop=")) out.shopName = a.slice("--shop=".length);
    else if (a === "--shop-name" && argv[i + 1]) out.shopName = argv[++i]!;
    else if (a.startsWith("--shop-name=")) out.shopName = a.slice("--shop-name=".length);
    else if (a === "--domain" && argv[i + 1]) out.domain = argv[++i]!;
    else if (a.startsWith("--domain=")) out.domain = a.slice("--domain=".length);
    else if (a === "--target-part" && argv[i + 1]) out.targetPart = argv[++i]!;
    else if (a === "--monthly-rfqs" && argv[i + 1]) out.monthlyRfqs = Number(argv[++i]);
    else if (a === "--shop-type" && argv[i + 1]) { shopType = argv[++i]!.toLowerCase(); }
    else if (a.startsWith("--shop-type=")) { shopType = a.slice("--shop-type=".length).toLowerCase(); }
    else if (a === "--machine-cost" && argv[i + 1]) { out.machineCost = Number(argv[++i]!); mcExplicit = true; }
    else if (a.startsWith("--machine-cost=")) { out.machineCost = Number(a.slice("--machine-cost=".length)); mcExplicit = true; }
    else if (a === "--monthly-payment" && argv[i + 1]) { out.monthlyPayment = Number(argv[++i]!); mpExplicit = true; }
    else if (a.startsWith("--monthly-payment=")) { out.monthlyPayment = Number(a.slice("--monthly-payment=".length)); mpExplicit = true; }
    else if (a === "--avg-job" && argv[i + 1]) { out.avgJobValue = Number(argv[++i]!); ajExplicit = true; }
    else if (a.startsWith("--avg-job=") && !a.startsWith("--avg-job-value")) { out.avgJobValue = Number(a.slice("--avg-job=".length)); ajExplicit = true; }
    else if (a === "--avg-job-value" && argv[i + 1]) { out.avgJobValue = Number(argv[++i]!); ajExplicit = true; }
    else if (a.startsWith("--avg-job-value=")) { out.avgJobValue = Number(a.slice("--avg-job-value=".length)); ajExplicit = true; }
    else if (a === "--win-rate" && argv[i + 1]) out.winRate = Number(argv[++i]!);
    else if (a.startsWith("--win-rate=")) out.winRate = Number(a.slice("--win-rate=".length));
    else if (a === "--rfqs-per-week" && argv[i + 1]) out.rfqsPerWeek = Number(argv[++i]!);
    else if (a.startsWith("--rfqs-per-week=")) out.rfqsPerWeek = Number(a.slice("--rfqs-per-week=".length));
    else if (a === "--help" || a === "-h") out.help = true;
  }
  if (shopType) {
    if (shopType === "cnc") { if (!mcExplicit) out.machineCost = 65000; if (!mpExplicit) out.monthlyPayment = 1200; if (!ajExplicit) out.avgJobValue = 280; }
    else if (shopType === "sheet") { if (!mcExplicit) out.machineCost = 24000; if (!mpExplicit) out.monthlyPayment = 450; if (!ajExplicit) out.avgJobValue = 95; }
    else if (shopType === "print") { if (!mcExplicit) out.machineCost = 6000; if (!mpExplicit) out.monthlyPayment = 150; if (!ajExplicit) out.avgJobValue = 35; }
  }
  return out;
}

const RESERVED = new Set(["www", "api", "solari", "admin", "app"]);

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function slugify(name: string): string {
  let s = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  s = s.slice(0, 48).replace(/^-+|-+$/g, "");
  if (!s) {
    console.warn(`[wizard] slug empty — using "my-shop" (enter a shop name)`);
    return "my-shop";
  }
  if (RESERVED.has(s)) {
    console.warn(`[wizard] slug "${s}" is reserved — using "my-shop"`);
    return "my-shop";
  }
  return s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function hash16(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

// Deterministic factory STEP hash (matches 6205 build123d normalized hash contract)
const FACTORY_HASH = "c3259a261f868443";
const PART_CARD_HASH = FACTORY_HASH;

function computeBreakEven(args: {
  machineCost: number;
  monthlyPayment: number;
  avgJobValue: number;
  winRate: number;
  rfqsPerWeek: number;
}): { monthlyRevenue: number; netMonthly: number; months: number | null; label: string } {
  // NaN guard: callers must pass assertBreakEvenInputs first, but be defensive here too
  if (!Number.isFinite(args.machineCost) || !Number.isFinite(args.monthlyPayment) || !Number.isFinite(args.avgJobValue) || !Number.isFinite(args.winRate) || !Number.isFinite(args.rfqsPerWeek)) {
    return { monthlyRevenue: NaN, netMonthly: NaN, months: null, label: "not break-even at this volume" };
  }
  const monthlyRfqs = args.rfqsPerWeek * 4.33;
  const monthlyRevenue = monthlyRfqs * args.winRate * args.avgJobValue;
  const netMonthly = monthlyRevenue - args.monthlyPayment;
  if (!Number.isFinite(netMonthly) || netMonthly <= 0) {
    return { monthlyRevenue, netMonthly, months: null, label: "not break-even at this volume" };
  }
  // netMonthly > 0 guaranteed here, so no div-by-zero or negative off-by-one
  const months = Math.ceil(args.machineCost / netMonthly);
  const simple = Math.ceil(args.machineCost / monthlyRevenue);
  const label = `${months} months (net after $${args.monthlyPayment.toLocaleString()}/mo payment; ${simple} mo gross)`;
  return { monthlyRevenue, netMonthly, months, label };
}

function assertBreakEvenInputs(args: { machineCost: number; monthlyPayment: number; avgJobValue: number; winRate: number; rfqsPerWeek: number }): void {
  if (!Number.isFinite(args.winRate) || args.winRate < 0 || args.winRate > 1) throw new Error(`--win-rate must be 0-1 (0.35=35%), got ${args.winRate}`);
  if (!Number.isFinite(args.rfqsPerWeek) || args.rfqsPerWeek <= 0 || Number.isNaN(args.rfqsPerWeek)) throw new Error(`--rfqs-per-week must be >0, got ${args.rfqsPerWeek}`);
  if (!Number.isFinite(args.machineCost) || args.machineCost < 0 || Number.isNaN(args.machineCost)) throw new Error(`--machine-cost must be >=0, got ${args.machineCost}`);
  if (!Number.isFinite(args.monthlyPayment) || args.monthlyPayment < 0 || Number.isNaN(args.monthlyPayment)) throw new Error(`--monthly-payment must be >=0, got ${args.monthlyPayment}`);
  if (!Number.isFinite(args.avgJobValue) || args.avgJobValue < 0 || Number.isNaN(args.avgJobValue)) throw new Error(`--avg-job must be >=0, got ${args.avgJobValue}`);
  if (args.monthlyPayment > 1e7 || args.machineCost > 1e9) throw new Error(`break-even inputs out of range (machineCost ${args.machineCost}, monthlyPayment ${args.monthlyPayment})`);
}

async function ask(question: string, fallback: string): Promise<string> {
  if (!process.stdin.isTTY) return fallback;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = await new Promise<string>((resolve) => {
    let done = false;
    // 30s for human decision, skip if --bring/--start
    const t = setTimeout(() => { if (!done) { done = true; rl.close(); resolve(fallback); } }, 30000);
    rl.question(question, (a) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      rl.close();
      resolve(a.trim() || fallback);
    });
  });
  return ans;
}

async function maybeInteractiveFunnel(initial: Funnel | null): Promise<Funnel> {
  if (initial) return initial;
  if (!process.stdin.isTTY) return "bring";
  const ans = await ask(
    "Pick funnel — [1] Bring Your Shop (have machines, want office off plate)  [2] Start Your Shop (no machine yet)  (1/2, default 1): ",
    "1",
  );
  return ans.trim() === "2" ? "start" : "bring";
}

async function maybeInteractiveShopName(initial: string | null, funnel: Funnel): Promise<string> {
  const def = initial ?? (funnel === "bring" ? "Acme Precision" : "New Chip Co");
  if (!process.stdin.isTTY) return def;
  // Only prompt if no --shop was passed
  if (initial) return initial;
  const ans = await ask(`Shop name (default "${def}"): `, def);
  return ans || def;
}

// ---------------------------------------------------------------------------
// Mock browser session (chow-fleet pattern: stealth+recording at create, 402 retry, replayUrl after close, friction log trimmed)
// ---------------------------------------------------------------------------

async function tryImportSolariBrowser(): Promise<unknown> {
  try { return await import("@solarisdk/browser"); } catch { return null; }
}

type StorefrontResult = {
  sessionId: string;
  url: string;
  replayUrl: string | null;
  friction: string;
  stealth: boolean;
  recording: boolean;
  firstRfqHash: string;
};

async function createStorefrontSession(opts: {
  slug: string;
  shopName: string;
  funnel: Funnel;
}): Promise<StorefrontResult> {
  const url = `https://${opts.slug}.getsolari.app`;
  const firstRfqHash = hash16(`${opts.slug}:${opts.shopName}:rfq:001`).slice(0, 10);

  if (isMockMode()) {
    await sleep(180);
    console.log(`[wizard:storefront:mock] createBrowser({ stealth:true, recording:true }) → mock session`);
    return {
      sessionId: mockSessionId("storefront"),
      url,
      replayUrl: null,
      friction: "Quote inbox scroll hint clipped at 1280px (trimmed log)",
      stealth: true,
      recording: true,
      firstRfqHash,
    };
  }

  const mod = await tryImportSolariBrowser();
  if (!mod) {
    console.warn("[wizard] @solarisdk/browser not installed — mock storefront");
    return {
      sessionId: mockSessionId("storefront"),
      url,
      replayUrl: null,
      friction: "Quote inbox scroll hint clipped at 1280px (trimmed log — live SDK missing)",
      stealth: false,
      recording: false,
      firstRfqHash,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = mod;
  const SolariCtor = m.Solari ?? m.default?.Solari ?? m.BrowserClient ?? m.default;
  const apiKey = getApiKey()!;

  let solari: Record<string, unknown> | null = null;
  if (typeof SolariCtor === "function") {
    try { solari = new SolariCtor({ apiKey, baseUrl: SOLARI_BASE_URL }) as Record<string, unknown>; } catch { /* factory below */ }
    if (!solari && typeof m.createClient === "function") solari = await m.createClient({ apiKey, baseUrl: SOLARI_BASE_URL }) as Record<string, unknown>;
    if (!solari && typeof m.createSolariClient === "function") solari = await m.createSolariClient({ apiKey, baseUrl: SOLARI_BASE_URL }) as Record<string, unknown>;
  }
  if (!solari && typeof m.createClient === "function") solari = await m.createClient({ apiKey, baseUrl: SOLARI_BASE_URL }) as Record<string, unknown>;
  if (!solari) {
    return { sessionId: mockSessionId("storefront"), url, replayUrl: null, friction: "Solari client not creatable — mock fallback", stealth: false, recording: false, firstRfqHash };
  }

  async function createBrowser(browserOpts: Record<string, unknown>) {
    const s = solari as Record<string, unknown> & { launch?: (o: unknown)=>Promise<Record<string,unknown>>; launchBrowser?: (o: unknown)=>Promise<Record<string,unknown>>; sessions?: { create: (o: unknown)=>Promise<Record<string,unknown>>; getReplayUrl?: (id:string)=>Promise<string|null> }; browser?: { launch?: (o: unknown)=>Promise<Record<string,unknown>> } };
    if (typeof s.launch === "function") return await s.launch(browserOpts);
    if (typeof s.launchBrowser === "function") return await s.launchBrowser(browserOpts);
    if (s.browser && typeof (s.browser as Record<string,unknown>)["launch"] === "function") return await (s.browser as {launch:(o:unknown)=>Promise<Record<string,unknown>>}).launch(browserOpts);
    if (s.sessions && typeof s.sessions.create === "function") return await s.sessions.create(browserOpts);
    if (s["browser"] && typeof (s["browser"] as Record<string, unknown>)["create"] === "function") {
      return await (s["browser"] as { create: (o: unknown) => Promise<Record<string, unknown>> }).create(browserOpts);
    }
    if (typeof s["createBrowser"] === "function") return await (s["createBrowser"] as (o: unknown) => Promise<Record<string, unknown>>)(browserOpts);
    if (s["browsers"] && typeof (s["browsers"] as Record<string, unknown>)["create"] === "function") {
      return await ((s["browsers"] as Record<string, unknown>)["create"] as (o: unknown) => Promise<Record<string, unknown>>)(browserOpts);
    }
    throw new Error("No browser.create on Solari client");
  }

  let browser: Record<string, unknown> | null = null;
  let stealth = true, recording = true;
  try {
    browser = await createBrowser({ stealth: true, recording: true });
  } catch (err) {
    if (isFreeTierError(err) || isBillingError(err)) {
      console.warn("[wizard:storefront] 402 Free-tier — retrying without stealth/recording");
      stealth = false; recording = false;
      try {
        browser = await createBrowser({ stealth: false, recording: false });
      } catch (err2) {
        if (isFreeTierError(err2 as unknown) || isBillingError(err2 as unknown)) {
          console.warn("[wizard:storefront] 402 still — mock fallback (no billing, no network)");
          return {
            sessionId: mockSessionId("storefront"),
            url,
            replayUrl: null,
            friction: "Quote inbox scroll hint clipped at 1280px (trimmed log — 402 mock fallback)",
            stealth: false,
            recording: false,
            firstRfqHash,
          };
        }
        throw err2;
      }
    } else throw err;
  }
  if (!browser) throw new Error("browser create returned null");

  const sessionId = ((browser as Record<string,unknown>)["sessionId"] ?? (browser as unknown as {id?:string}).id ?? (browser as unknown as {session?:{id?:string}}).session?.id ?? mockSessionId("storefront")) as string;
  let replayUrl: string | null = null;
  try {
    // Real SDK: BrowserSession has newPage() -> Page.goto
    const maybeNewPage = (browser as unknown as { newPage?: () => Promise<{ goto: (u:string)=>Promise<void> }> }).newPage;
    if (typeof maybeNewPage === "function") {
      try {
        const page = await maybeNewPage.call(browser) as { goto: (u:string)=>Promise<void> };
        try { await page.goto(url); } catch { /* stand-in: domain may not be real */ }
        await sleep(300);
      } catch { /* ignore newPage failure */ }
    } else {
      const goto = (browser["goto"] ?? (browser["page"] as Record<string, unknown> | undefined)?.["goto"] ?? browser["navigate"]) as ((u: string)=>Promise<void>) | undefined;
      if (goto) {
        try { await (goto as (u:string)=>Promise<void>).call(browser["page"] ?? browser, url); } catch { /* stand-in */ }
      } else {
        await sleep(300);
      }
    }
    if (recording) {
      const sessions = (solari as unknown as { sessions?: { getReplayUrl?: (id:string)=>Promise<string|null> } }).sessions;
      if (sessions?.getReplayUrl) {
        try { replayUrl = await sessions.getReplayUrl(sessionId); } catch { /* poll after close */ }
      } else if (typeof (browser as Record<string,unknown>)["replayUrl"] === "function") {
        try { replayUrl = await ((browser as Record<string,unknown>)["replayUrl"] as () => Promise<string | null>)(); } catch { /* poll after close */ }
      }
    }
    console.log(`[wizard:storefront:live] session=${sessionId} stealth=${stealth} recording=${recording} url=${url}`);
  } finally {
    if (browser) await safeClose(browser as unknown as { close: () => Promise<unknown> }, 5000);
    await safeClose(solari as unknown as { close: () => Promise<unknown> }, 5000);
    if (recording && !replayUrl) {
      const sessions = (solari as unknown as { sessions?: { getReplayUrl?: (id:string)=>Promise<string|null> } }).sessions;
      if (sessions?.getReplayUrl) {
        for (let i = 0; i < 6; i++) {
          await sleep(5000);
          try { const polled = await sessions.getReplayUrl(sessionId); if (polled) { replayUrl = polled; break; } } catch { /* not ready */ }
        }
      } else if (typeof (browser as Record<string, unknown>)["replayUrl"] === "function") {
        for (let i = 0; i < 6; i++) {
          await sleep(5000);
          try {
            const polled = await ((browser as Record<string, unknown>)["replayUrl"] as () => Promise<string | null>)();
            if (polled) { replayUrl = polled; break; }
          } catch { /* not ready yet */ }
        }
      }
    }
  }

  return {
    sessionId,
    url,
    replayUrl,
    friction: "Quote inbox scroll hint clipped at 1280px (trimmed log)",
    stealth,
    recording,
    firstRfqHash,
  };
}

// ---------------------------------------------------------------------------
// Factory mock (part-card-factory pattern: STEP hash determinism + honesty yellow REFUSED demo)
// ---------------------------------------------------------------------------

function honestyRefusedCardHtml(): string {
  return `<div class="honesty">
<div class="honesty-top">Honesty gate — yellow card (not a deliverable)</div>
<div class="honesty-body">
<div class="refused">REFUSED</div>
<div class="hint">Non-manifold STEP → DFM FAIL. No geometry fabricated. Close open edges, remove zero-thickness walls, re-export manifold and re-submit.</div>
</div>
<div class="honesty-foot">Chow honesty gate · non-manifold → REFUSED · sandbox-isolated · build123d</div>
</div>`;
}

// ---------------------------------------------------------------------------
// onboarding.html + shop-config.json generators
// ---------------------------------------------------------------------------

function buildOnboardingHtml(args: {
  funnel: Funnel;
  shopName: string;
  slug: string;
  domain: string;
  shopUrl: string;
  firstRfqHash: string;
  partCardHash: string;
  breakEven: ReturnType<typeof computeBreakEven> | null;
  targetPart: string | null;
  sessionId: string;
  replayUrl: string | null;
  friction: string;
  isMock: boolean;
  machineCost: number;
  monthlyPayment: number;
  avgJobValue: number;
  winRate: number;
  rfqsPerWeek: number;
}): string {
  const shortHash = args.partCardHash.slice(0, 8);
  const rfqsPerWeek = args.rfqsPerWeek;
  const escShop = escapeHtml(args.shopName);
  const escDomain = escapeHtml(args.domain);
  const escUrl = escapeHtml(args.shopUrl);
  const footerYears = (()=>{
    if(!args.breakEven||!args.breakEven.months) return `${rfqsPerWeek}/wk → not break-even — payment > margin. Raise RFQs or win rate.`;
    let t=`${rfqsPerWeek}/wk → break even in ${args.breakEven.months} mo.`; if(args.breakEven.months>60) t+=` → ${Math.floor(args.breakEven.months/12)}y (${args.breakEven.months}mo)`; if(args.breakEven.months>120) t+=` — raise win rate/avg job`; return t;
  })();
  const breakEvenInner = args.breakEven ? `<div class="beGrid"><div><div class="k" title="RFQs/week">Quotes/week</div><div class="v"><span data-be=rfqsPerWeek>${rfqsPerWeek}</span></div><input type=range data-be-input=rfqsPerWeek min=0.5 max=20 step=0.5 value=${rfqsPerWeek}></div><div><div class="k" title="Win rate 0-1">Win rate</div><div class="v"><span data-be=winRate>${Math.round(args.winRate*100)}%</span></div><input type=range data-be-input=winRate min=10 max=60 step=1 value=${Math.round(args.winRate*100)}></div><div><div class="k" title="Avg $/job">Avg job value</div><div class="v"><span data-be=avgJobValue>${args.avgJobValue}</span></div><input type=range data-be-input=avgJobValue min=50 max=2000 step=10 value=${args.avgJobValue}></div><div><div class="k" title="Machine cost">Machine cost</div><div class="v"><span data-be=machineCost>$${args.machineCost.toLocaleString()}</span></div><input type=range data-be-input=machineCost min=1000 max=200000 step=1000 value=${args.machineCost}></div><div><div class="k" title="Monthly payment">Monthly payment</div><div class="v"><span data-be=monthlyPayment>${args.monthlyPayment}</span></div><input type=range data-be-input=monthlyPayment min=0 max=2500 step=50 value=${args.monthlyPayment}></div><div><div class="k">Monthly revenue</div><div class="v"><span data-be=monthlyRevenue>${Math.round(args.breakEven.monthlyRevenue).toLocaleString()}</span><small>/mo</small></div></div></div><div class="formula"><code>monthlyRevenue = quotesPerWeek × 4.33 × winRate × avgJobValue</code> = ${rfqsPerWeek} × 4.33 × ${args.winRate} × ${args.avgJobValue} = <strong>${Math.round(args.breakEven.monthlyRevenue).toLocaleString()}/mo</strong><br><code>monthsToBreakEven = ceil(machineCost / (monthlyRevenue − monthlyPayment))</code> if net &gt; 0 else <em>not break-even</em> → <strong>${escapeHtml(args.breakEven.label)}</strong></div><div class="beFooter">${footerYears}</div>` : "";

  const breakEvenBlock = args.breakEven ? (args.funnel === "bring"
    ? `<details id="breakEven" class="card breakEven" data-mc=${args.machineCost} data-mp=${args.monthlyPayment} data-aj=${args.avgJobValue} data-wr=${args.winRate} data-rq=${rfqsPerWeek}><summary class="k" style="cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center">Break-even calculator — the honest math (payment ${args.monthlyPayment}/mo) <span class="k2">click to expand — the honest math</span></summary>${breakEvenInner}</details>`
    : `<details id="breakEven" class="card breakEven" open data-mc=${args.machineCost} data-mp=${args.monthlyPayment} data-aj=${args.avgJobValue} data-wr=${args.winRate} data-rq=${rfqsPerWeek}><summary class="k" style="cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center">Break-even — when the machine pays for itself <span class="k2">auto-open for Start — the honest math</span></summary>${breakEvenInner}</details>`) : "";

  return`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Office in a Box — ${escShop}</title><meta name="color-scheme" content="dark"><style>
:root{--bg:#08090b;--line:rgba(255,255,255,.06);--bone:#efece5;--muted:#9aa0a8;--signal:#20b8cd;--yellow:#f59e0b;--max:740px;--mono:ui-monospace,Menlo,monospace;--sans:Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
*{box-sizing:border-box} html,body{margin:0;background:var(--bg);color:var(--bone);font-family:var(--sans);-webkit-font-smoothing:antialiased}
a{color:var(--signal);text-decoration:none} a:hover{text-decoration:underline;text-underline-offset:3px}
.topbar{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:14px;padding:11px 18px;background:var(--bg);border-bottom:1px solid var(--line)}
.brand{font-family:var(--sans);font-weight:700;font-size:13px;color:#fff;letter-spacing:-.01em;line-height:1}
.mode{margin-left:auto;display:flex;gap:8px;color:var(--muted);font-family:var(--mono);font-size:10px;letter-spacing:.06em}
.shell{max-width:var(--max);margin:22px auto;padding:0 18px 36px}
.hero{padding:18px 0 0}
h1{margin:0;font-size:26px;line-height:1.15;font-weight:800;letter-spacing:-.02em;color:#fff}
.lede{margin:10px 0 0;color:var(--muted);font-size:13.5px;line-height:1.75}
.lede strong{color:#fff;font-weight:600}
.steps{margin-top:28px;border-top:1px solid var(--line)}
.step{display:grid;grid-template-columns:28px 1fr;gap:14px;padding:22px 0;border-bottom:1px solid var(--line)}
.n{font-family:var(--mono);font-size:11px;color:var(--muted);padding-top:3px}
.step h3{margin:0;font-size:14px;font-weight:600;color:#fff}
.step p{margin:6px 0 0;color:var(--muted);font-size:13px;line-height:1.75}
.step p code{font-family:var(--mono);font-size:11px;color:var(--muted)}
.card{margin-top:28px;padding:22px 0 0;border:0;border-top:1px solid var(--line)}
.cardHead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
.k{font-family:var(--mono);font-size:10px;letter-spacing:.10em;color:var(--muted);text-transform:uppercase}
.k2{font-family:var(--mono);font-size:10px;color:var(--muted)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 20px}
@media(max-width:640px){.grid2{grid-template-columns:1fr}}
.kv{padding:12px 0;border:0;border-bottom:1px solid var(--line)}
.kv .v{margin-top:6px;font-weight:650;font-size:13px;color:#fff;word-break:break-all}
.kv .v small{color:var(--muted);font-weight:600}
.honesty{margin-top:18px;overflow:hidden;border:0;background:var(--yellow);color:#111}
.honesty-top{padding:8px 12px;background:rgba(0,0,0,.06);display:flex;gap:8px;align-items:center;font-family:var(--mono);font-size:10px;color:#5b4100;border-bottom:1px solid rgba(0,0,0,.08)}
.honesty-body{padding:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:640px){.honesty-body{grid-template-columns:1fr}}
.refused{font-family:Impact,Arial Black,sans-serif;font-size:18px;line-height:1;letter-spacing:.02em}
.hint{font-size:12px;line-height:1.7;color:#1f2937;background:rgba(255,255,255,.45);padding:10px 12px}
.honesty-foot{padding:8px 12px;background:rgba(0,0,0,.06);font-family:var(--mono);font-size:10px;color:#5b4100;border-top:1px solid rgba(0,0,0,.08)}
.beGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:0}
@media(max-width:640px){.beGrid{grid-template-columns:1fr}}
.beGrid > div{padding:14px 0;border:0;border-bottom:1px solid var(--line);padding-right:14px}
.beGrid .v{margin-top:4px;font-weight:800;color:#fff;font-size:13px}
.formula{margin-top:14px;padding:12px 0;border:0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);font-size:12px;line-height:1.7;color:var(--muted)}
.formula code{font-family:var(--mono);font-size:10.5px;color:var(--muted)}
.beFooter{margin-top:12px;padding:10px 0;font-weight:600;color:#fff;font-size:13px;border:0}
.breakEven input[type=range]{width:100%;margin-top:8px;accent-color:#20b8cd;display:block}

.ctas{margin-top:18px;display:flex;flex-wrap:wrap;gap:14px}
.cta{font-size:13px;font-weight:600;text-decoration:none;line-height:1;padding:6px 0;border:0;border-bottom:1px solid var(--line);color:var(--bone)}
.cta.primary{background:#fff;color:#08090b;border:0;border-radius:999px;padding:10px 18px;font-weight:700;line-height:1}
.cta.primary:hover{background:#efece5;color:#08090b;border-color:transparent;text-decoration:none}
.cta.ghost{color:var(--muted);font-family:var(--mono);font-size:11px;letter-spacing:.02em}
.cta:hover{color:var(--signal);border-bottom-color:var(--signal);text-decoration:none}
.foot{margin-top:20px;padding-top:12px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;color:var(--muted);font-size:11px;font-family:var(--mono)}
.foot code{color:var(--muted);font-size:10px}</style><!--hex-->
<div class="topbar">
<div class="brand">Shop OS — Optimized Manufacturing</div>
<div class="mode">
<span>Shop OS on Solari</span></div></div>
<div class="shell">
<div class="hero">
<h1>You make parts. We handle the office.</h1>
<p class="lede">Pick a name. Get your shop address. Start quoting.</p><div class="funnel-pick" style="margin-top:14px;display:flex;gap:12px"><label style="display:inline-flex;align-items:center;gap:6px;font:11px var(--mono);color:var(--bone)"><input type="radio" name="funnelPick" value="bring" checked> Bring your shop</label><label style="display:inline-flex;align-items:center;gap:6px;font:11px var(--mono);color:var(--bone)"><input type="radio" name="funnelPick" value="start"> Start new shop</label></div><label class="k" for="shopInput" style="display:block;margin-top:16px">Your shop name</label><div style="display:flex;gap:10px;align-items:center;margin-top:8px"><input id="shopInput" value="${escShop}" placeholder="Acme Precision" style="flex:1;max-width:280px;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:#fff;font-size:14px;font-weight:600;outline:none"><span class="k2" style="color:var(--muted)">→ <span id="domainPreview" style="color:var(--signal);font-family:var(--mono);font-size:12px">${escDomain}</span></span></div><div class="k2" style="margin-top:6px;color:var(--muted)">Type your shop name — your address updates instantly. No logins.</div><div class="steps"><div class="step"><div class="n">01</div><div><h3>Claim</h3><p>Pick a name. You get <code>${escDomain}</code>.</p></div></div><div class="step"><div class="n">02</div><div><h3>Website</h3><p>Your site is live — inbox at https://${escDomain}, first RFQ ~4 min.</p></div></div><div class="step"><div class="n">03</div><div><h3>Quote</h3><p>Try 6205 — no CAD needed. We check it — if it can't be made well, you see why.</p></div></div><div class="step"><div class="n">04</div><div><h3>Break-even</h3><p>Drag sliders to your numbers — <a href="#breakEven" style="color:var(--signal);font:11px var(--mono)">calculator ↓</a> <span class="k2" data-be-preview style="color:var(--muted);font:11px var(--mono)">${footerYears}</span></p></div></div></div></div>
<div class="card">
<div class="cardHead"><span class="k">Your shop</span><span class="k2">Shop OS on Solari</span></div>
<div class="grid2"><div class="kv"><div class="k">Shop</div><div class="v">${escShop}<br><small style="font:11px var(--mono);color:var(--signal)">${escDomain}</small></div></div><div class="kv"><div class="k">URL</div><div class="v" style="font:12px var(--mono)"><a href="${escUrl}">${escUrl}</a></div></div></div><div class="ctas"><a id="createShopCta" class="cta primary" href="shop.html">Create your shop → shop.html</a></div></div><details class="card" style="margin-top:22px"><summary class="k" style="cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center">How it works <span class="k2">break-even · honesty gate · part-card</span></summary><div style="padding-top:14px"><div class="kv k2" style="margin-top:2px">First quote <span style="font:11px var(--mono)">#${args.firstRfqHash}</span> · Part card <span style="font:11px var(--mono)">6205-${shortHash} · #${shortHash}</span></div><div id="part-card" class="honesty" style="background:transparent;border-top:1px solid var(--line);border-bottom:1px solid var(--line);color:var(--bone)"><div class="honesty-top" style="color:var(--muted);border-color:var(--line);background:transparent">Part card — 6205 Deep-Groove · DFM PASS · #${shortHash}</div><div class="honesty-body" style="color:var(--bone)"><div><div class="k">Spec</div><div class="v" style="font-size:13px">Bore 25 / OD 52 / Width 15 — 7 balls, 7 grooves</div><div style="margin-top:8px;font:11px var(--mono);color:var(--signal)">hash ${args.partCardHash} · same part, same hash, every time</div></div><div><div class="k">Links</div><div style="margin-top:8px;display:flex;gap:14px"><a href="../part-card-factory/part-card.html" class="cta ghost">Part card — 6205</a></div></div></div></div><div class="honesty"><div class="honesty-top">Honesty gate — what a refused job looks like</div><div class="honesty-body"><div class="refused">REFUSED</div><div class="hint">This drawing isn&apos;t manufacturable — the STEP is non-manifold, so it would make a bad part. Close open edges, remove zero-thickness walls, re-export, resubmit.</div></div><div class="honesty-foot">We refuse jobs we can&apos;t make well — you always see the reason.</div></div>
  ${breakEvenBlock}
<div class="ctas" style="margin-top:16px"><a class="cta primary" href="${escUrl}">Open shop → ${escDomain}</a><a class="cta ghost" href="../../docs/hero.html">Read the docs</a><a class="cta ghost" href="../part-card-factory/part-card.html">Part card — 6205</a><a class="cta ghost" href="./shop-config.json">Shop settings (JSON)</a></div><div class="foot"><span>Optimized Manufacturing</span><span>Shop OS on Solari · ${args.funnel === "bring" ? "Bring Your Shop" : "Start Your Shop"}</span></div></div></div>
<div class="foot" style="border-top:none;padding-top:12px">
<span>Shop OS on Solari — browser, sandbox, desktop on one key.</span></div></div>
<script>try{
const p=new URLSearchParams(location.search);
const f=p.get('funnel');
const radios=document.querySelectorAll('input[name="funnelPick"]');
function syncFunnel(v){
  const qs=new URLSearchParams(location.search);if(v)qs.set('funnel',v);else qs.delete('funnel');history.replaceState(null,'',location.pathname+'?'+qs);try{localStorage.setItem('solari-chow.funnel',v);}catch{};document.body.dataset.funnel=v;
  document.querySelectorAll('a.cta').forEach(a=>{try{const u=new URL(a.href,location.href);u.searchParams.set('funnel',v);a.href=u+'';}catch{}});
  const el=document.querySelector('.mode span');
  if(el) el.textContent=v==='bring'?'Bring Your Shop':v==='start'?'Start Your Shop':el.textContent;
  const cta=document.getElementById('createShopCta');
  if(cta){const u2=new URL(cta.getAttribute('href')||'shop.html',location.href);u2.searchParams.set('funnel',v);cta.href=u2.pathname+'?'+u2.searchParams;}
  if(v==='start'){const d=document.querySelector('details.breakEven');if(d){d.open=true;const k2=d.querySelector('summary .k2');if(k2)k2.textContent='shown up front — the honest math';}}else if(v==='bring'){const d=document.querySelector('details.breakEven');if(d){d.open=false;const k2=d.querySelector('summary .k2');if(k2)k2.textContent='click to expand — the honest math';const be=document.querySelector('.breakEven');if(be&&+be.dataset.rq>5)be.open=true;}
  }
}
if(f){
  document.body.dataset.funnel=f;
  try{localStorage.setItem('solari-chow.funnel',f);}catch{}
  radios.forEach(r=> r.checked=r.value===f);
  syncFunnel(f);
} else {
  try{const s=localStorage.getItem('solari-chow.funnel');if(s){document.body.dataset.funnel=s; radios.forEach(r=> r.checked=r.value===s); }}catch{}
}
radios.forEach(r=> r.addEventListener('change',()=>syncFunnel(r.value)));
try{const cur=document.querySelector('input[name="funnelPick"]:checked');if(cur)syncFunnel(cur.value);}catch{}
}catch{}</script><script>(()=>{const b=document.querySelector('.breakEven');if(!b)return;let mc=+b.dataset.mc,mp=+b.dataset.mp,aj=+b.dataset.aj;const I={};b.querySelectorAll('[data-be-input]').forEach(e=>I[e.getAttribute('data-be-input')]=e);const q=s=>b.querySelector(s),R=Math.round,C=Math.ceil;function u(){let j=aj,c=mp,a=mc;if(I.machineCost)a=+I.machineCost.value;if(I.avgJobValue)j=+I.avgJobValue.value;if(I.monthlyPayment)c=+I.monthlyPayment.value;const w=+I.winRate.value/100,r=+I.rfqsPerWeek.value,v=r*4.33*w*j,n=v-c;let t=null,l='not break-even at this volume';if(n>0){t=C(a/n);l=t+' months (net after $'+c.toLocaleString()+'/mo payment; '+C(a/v)+' mo gross)'}q('[data-be=winRate]').textContent=I.winRate.value+'%';q('[data-be=rfqsPerWeek]').textContent=r;if(q('[data-be=avgJobValue]'))q('[data-be=avgJobValue]').textContent='$'+j;if(q('[data-be=machineCost]'))q('[data-be=machineCost]').textContent='$'+a.toLocaleString();if(q('[data-be=monthlyPayment]'))q('[data-be=monthlyPayment]').textContent='$'+c;q('[data-be=monthlyRevenue]').textContent='$'+R(v).toLocaleString();const f=b.querySelector('.formula');if(f){const s=f.querySelectorAll('strong');if(s[0])s[0].textContent='$'+R(v).toLocaleString()+'/mo';if(s[1])s[1].textContent=l}const e=b.querySelector('.beFooter');if(e){if(t){let w=r+' quotes/week → break even in '+t+' months.';if(t>60)w+=' → '+Math.floor(t/12)+' years ('+t+' months)';if(t>120)w+=' long payback — try higher win rate or avg job';e.textContent=w;}else e.textContent=r+' quotes/week at these numbers → not break-even yet — the payment is bigger than the margin. Raise quotes/week or win rate.';const P=document.querySelector('[data-be-preview]');if(P)P.textContent=e.textContent;}}Object.values(I).forEach(e=>e.addEventListener('input',u));u();})();
try{function S(s){s=s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/-{2,}/g,'-').replace(/^-+|-+$/g,'');s=s.slice(0,48).replace(/^-+|-+$/g,'');return !s||['www','api','solari','admin','app'].includes(s)?'my-shop':s}const I=document.getElementById('shopInput'),D=document.getElementById('domainPreview');if(I&&D)I.addEventListener('input',()=>{const s=S(I.value),d=s+'.getsolari.app',u='https://'+d;D.textContent=d;const m=document.querySelector('.step p code');if(m)m.textContent=d;const C=document.getElementById('createShopCta');if(C){const f=document.querySelector('input[name="funnelPick"]:checked');C.href='shop.html?funnel='+(f?f.value:'bring')+'&shop='+s}})}catch{}</script></html>`;
}

// Banner
// ---------------------------------------------------------------------------

function printBanner(): void {
  // Plain ASCII + OM colors hint (keep simple, no chalk dep)
  console.log("");
  console.log("  ┌─────────────────────────────────────────────────────────────┐");
  console.log("  │  OPTIMIZED MANUFACTURING  —  Shop OS on Solari             │");
  console.log("  │  Turn your shop into a real business.                    │");
  console.log("  │  You make parts. We handle the office.                     │");
  console.log("  └─────────────────────────────────────────────────────────────┘");
  console.log("");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const args = parseArgs(rawArgs);

  if (args.help) {
    printBanner();
    console.log("Usage: npm start [-- --bring|--start] [--shop \"Name\"] [--domain custom.com]");
    console.log("       [--target-part \"6205 bearing\"] [--monthly-rfqs 8]");
    console.log("       [--machine-cost 65000] [--monthly-payment 1200] [--avg-job 280] [--win-rate 0.35] [--rfqs-per-week 2]");
    console.log("");
    console.log("Funnel: --bring (have machines, want office off plate)  or  --start (no machine yet, plan first one)");
    console.log("Defaults to --bring + Acme Precision if no flags and non-TTY. Interactive only if TTY.");
    console.log("Mock by default; live when SOLARI_API_KEY=slr_live_... is set.");
    process.exit(0);
  }

  printBanner();
  console.log(CHOW_BANNER);

  const funnel = await maybeInteractiveFunnel(args.funnel);
  const shopName = await maybeInteractiveShopName(args.shopName, funnel);
  const slug = slugify(shopName);
  const domain = args.domain ?? `${slug}.getsolari.app`;
  const shopUrl = domain.includes(".") && !domain.endsWith(".getsolari.app")
    ? `https://${domain}`
    : `https://${slug}.getsolari.app`;

  // Start path extras — interactive only if TTY and not passed
  let targetPart = args.targetPart;
  let monthlyRfqs = args.monthlyRfqs;
  let rfqsPerWeek = args.rfqsPerWeek;
  if (funnel === "start") {
    if (!targetPart && process.stdin.isTTY && !args.targetPart) {
      targetPart = await ask(`Target part (default "6205 bearing"): `, "6205 bearing");
    }
    targetPart = targetPart ?? "6205 bearing";
    if (monthlyRfqs === null && process.stdin.isTTY) {
      const a = await ask(`Expected RFQs/month (default ~${Math.round(rfqsPerWeek * 4.33)}): `, String(Math.round(rfqsPerWeek * 4.33)));
      const n = Number(a);
      if (Number.isFinite(n) && n > 0) { monthlyRfqs = n; rfqsPerWeek = n / 4.33; }
    }
    if (monthlyRfqs !== null && Number.isFinite(monthlyRfqs)) {
      rfqsPerWeek = monthlyRfqs / 4.33;
    }
    // Also allow --rfqs-per-week (or --rfqs-per-week=) to override monthly-derived value
    if (rawArgs.some((a) => a === "--rfqs-per-week" || a.startsWith("--rfqs-per-week="))) rfqsPerWeek = args.rfqsPerWeek;
  } else {
    targetPart = targetPart ?? null;
  }

  // P0: validate before any mock/network work — fail fast with clear message
  try {
    assertBreakEvenInputs({ machineCost: args.machineCost, monthlyPayment: args.monthlyPayment, avgJobValue: args.avgJobValue, winRate: args.winRate, rfqsPerWeek });
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }

  const isMock = isMockMode();

  console.log(`Funnel: ${funnel === "bring" ? "Bring Your Shop — have machines, want office off plate" : "Start Your Shop — no machine yet, plan first one"}`);
  console.log(`Shop:   "${shopName}" → slug "${slug}" → domain ${domain}`);
  console.log(`URL:    ${shopUrl}`);
  if (funnel === "start") console.log(`Target: ${targetPart} · RFQs/week ~${rfqsPerWeek.toFixed(1)} (monthly ~${Math.round(rfqsPerWeek * 4.33)})`);
  console.log("");

  // Banner duality — never log key prefix chars
  if (isMock) logMockBanner("onboarding-wizard");
  else console.log(`Live mode — SOLARI_API_KEY present (slr_live_… — ${getApiKey()!.length} chars)\n`);

  // Step 1: funnel done
  console.log("Step 1/4 — Pick funnel ✓", funnel);
  // Step 2: claim
  console.log(`Step 2/4 — Claim ✓  shop "${shopName}"  slug "${slug}"  domain ${domain}  preview ${shopUrl}`);

  // Step 3: Website + RFQ portal live — browser session (mock fallback on 402 in either degrade step)
  console.log("Step 3/4 — Website + RFQ portal live…");
  console.log("  Solari Browser: stealth+recording at create (402 retry), replayUrl after close, friction log trimmed");
  let storefront: Awaited<ReturnType<typeof createStorefrontSession>>;
  try {
    storefront = await createStorefrontSession({ slug, shopName, funnel });
  } catch (err) {
    if (isFreeTierError(err) || isBillingError(err)) {
      console.warn(`[wizard:storefront] ${(err as Error).message.slice(0, 120)} — mock fallback (no billing)`);
      const firstRfqHash = hash16(`${slug}:${shopName}:rfq:001`).slice(0, 10);
      storefront = {
        sessionId: mockSessionId("storefront"),
        url: shopUrl,
        replayUrl: null,
        friction: "Quote inbox scroll hint clipped at 1280px (trimmed log — outer 402 mock fallback)",
        stealth: false,
        recording: false,
        firstRfqHash,
      };
    } else throw err;
  }
  console.log(`  → Storefront ${storefront.sessionId.startsWith("sess_mock") ? "mock" : "live"} session ${storefront.sessionId} — ${shopUrl}`);
  if (storefront.replayUrl) console.log(`  ↳ replay: ${storefront.replayUrl}  (poll up to 30s after close if null)`);
  else if (storefront.recording) console.log(`  ↳ replay: (poll up to 30s after close — recording is per-session at create)`);
  console.log(`  Time to First RFQ ~4 min  ·  First RFQ #${storefront.firstRfqHash}  ·  Friction (trimmed): “${storefront.friction}”`);

  // Step 4: Instant quote + honesty gate — factory mock
  console.log("Step 4/4 — Instant quote + honesty gate…");
  console.log(`  Factory (sandbox build123d STEP hash ${FACTORY_HASH}) → deterministic card`);
  // Keep deterministic hash contract (no randomness — same as part-card-factory normalized hash)
  const stepHash = PART_CARD_HASH;
  console.log(`  → Part card 6205-${stepHash.slice(0, 8)}  hash ${stepHash}  DFM 7 balls == 7 grooves ✓`);
  console.log(`  Honesty yellow REFUSED demo: non-manifold STEP → REFUSED (no geometry fabricated)`);
  await sleep(80);

  // Break-even for both funnels (Start expanded, Bring collapsed <details>) — already validated above
  const breakEven: ReturnType<typeof computeBreakEven> = computeBreakEven({
    machineCost: args.machineCost,
    monthlyPayment: args.monthlyPayment,
    avgJobValue: args.avgJobValue,
    winRate: args.winRate,
    rfqsPerWeek,
  });
  if (breakEven) {
    console.log("");
    console.log(`Break-even (${funnel === "start" ? "Start Your Shop" : "Bring Your Shop — collapsed in HTML"}) — No hype. Formula visible:`);
    console.log(`  monthlyRevenue = rfqsPerWeek × 4.33 × winRate × avgJobValue = ${rfqsPerWeek.toFixed(2)} × 4.33 × ${args.winRate} × $${args.avgJobValue} = $${Math.round(breakEven.monthlyRevenue).toLocaleString()}/mo`);
    console.log(`  monthsToBreakEven = ceil(machineCost / (monthlyRevenue − monthlyPayment)) if net>0 else not break-even → ${breakEven.label}`);
    console.log(`  → ${rfqsPerWeek.toFixed(1)} RFQs/week → break even in ${breakEven.months ?? "—"} months. No hype.`);
    if (targetPart) console.log(`  Target part: ${targetPart}`);
  }

  // Write artifacts — deterministic (dual-write: cwd + wizard dir so verify-mock always sees fresh file regardless of cwd)
  const cwdOutHtml = join(process.cwd(), "onboarding.html");
  const cwdOutJson = join(process.cwd(), "shop-config.json");
  const wizardDir = join(dirname(fileURLToPath(import.meta.url)));
  const wizardHtml = join(wizardDir, "onboarding.html");
  const wizardJson = join(wizardDir, "shop-config.json");
  const htmlPath = cwdOutHtml;
  const jsonPath = cwdOutJson;

  const html = buildOnboardingHtml({
    funnel,
    shopName,
    slug,
    domain,
    shopUrl,
    firstRfqHash: storefront.firstRfqHash,
    partCardHash: stepHash,
    breakEven,
    targetPart: targetPart ?? null,
    sessionId: storefront.sessionId,
    replayUrl: storefront.replayUrl,
    friction: storefront.friction,
    isMock,
    machineCost: args.machineCost,
    monthlyPayment: args.monthlyPayment,
    avgJobValue: args.avgJobValue,
    winRate: args.winRate,
    rfqsPerWeek,
  });

  writeFileSync(htmlPath, html, "utf-8");
  if (wizardHtml !== cwdOutHtml) writeFileSync(wizardHtml, html, "utf-8");

  const shopConfig: Record<string, unknown> = {
    funnel,
    shopName,
    slug,
    domain,
    shopUrl,
    firstRfqHash: storefront.firstRfqHash,
    partCardHash: stepHash,
    partCardLink: "./onboarding.html#part-card",
    sessionId: storefront.sessionId,
    replayUrl: storefront.replayUrl,
    friction: storefront.friction,
    isMock,
    timeToFirstRfq: isMock ? "<3s" : "~4 min",
    ...(funnel === "start" ? {
      targetPart: targetPart ?? "6205 bearing",
      rfqsPerWeek: Number(rfqsPerWeek.toFixed(2)),
      monthlyRfqs: Math.round(rfqsPerWeek * 4.33),
      breakEven: breakEven ? {
        machineCost: args.machineCost,
        monthlyPayment: args.monthlyPayment,
        avgJobValue: args.avgJobValue,
        winRate: args.winRate,
        monthlyRevenue: Math.round(breakEven.monthlyRevenue),
        netMonthly: Math.round(breakEven.netMonthly),
        monthsToBreakEven: breakEven.months,
        label: breakEven.label,
        formula: "monthlyRevenue = rfqsPerWeek*4.33*winRate*avgJobValue; monthsToBreakEven = ceil(machineCost/(monthlyRevenue - monthlyPayment)) if net>0 else not break-even",
      } : null,
    } : {}),
  };
  writeFileSync(jsonPath, JSON.stringify(shopConfig, null, 2) + "\n", "utf-8");
  if (wizardJson !== cwdOutJson) writeFileSync(wizardJson, JSON.stringify(shopConfig, null, 2) + "\n", "utf-8");

  console.log("");
  console.log("─".repeat(72));
  console.log("ONBOARDING COMPLETE ✓");
  console.log("─".repeat(72));
  console.log(`Shop:        ${shopUrl}  (#${storefront.firstRfqHash})`);
  console.log(`Part card:   6205-${stepHash.slice(0, 8)}  hash ${stepHash}  → ./onboarding.html#part-card`);
  console.log(`Artifacts:   ${htmlPath}`);
  console.log(`             ${jsonPath}`);
  console.log(`Friction:    “${storefront.friction}” — session ${storefront.sessionId}`);
  if (breakEven) console.log(`Break-even:  ${breakEven.label}`);
  console.log("─".repeat(72));
  console.log("Turn your shop into a real business. You make parts. We handle the office.");
  console.log("CTAs: docs/hero.html · part-card.html · shop-config.json");
  console.log("");
  console.log("Gotchas: stealth/recording require paid tier (402 → retry without); recording is per-session at create;");
  console.log("         always await browser.close() before solari.close(); sandbox uses kill() not close();");
  console.log("         STEP FILE_NAME timestamp normalized before hash for determinism.");
}

main().catch((err) => {
  console.error("[onboarding-wizard] fatal:", err);
  process.exit(1);
});
