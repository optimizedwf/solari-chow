// chow-solari — shared Solari client wrapper for all solari-chow examples.
// Mock mode when SOLARI_API_KEY is absent so `npm start` works in CI / without billing.
// Real mode constructs `new Solari({apiKey, baseUrl})` and degrades gracefully on 402/403.

// Cookbook gotcha: `await solari.close()` can hang if the session already ended or the
// network stalls. Always call it inside a `finally` with a timeout race — see safeClose
// below. Same applies to sandbox `kill()` / desktop `destroy()` — use safeKill/safeDestroy.

import {
  MockBrowser,
  MockSandbox,
  MockDesktop,
  createMockBrowser,
  createMockSandbox,
  createMockDesktop,
} from "./mock.js";

export { MockBrowser, MockPage, MockSandbox, MockDesktop } from "./mock.js";

// ---------------------------------------------------------------------------
// Banner / key helpers
// ---------------------------------------------------------------------------

export const CHOW_BANNER = "Chow \u{1F91D} Harry Chow \u2014 Shop OS on solari";

export function getApiKey(): string | null {
  const key = process.env.SOLARI_API_KEY;
  if (!key || key.trim() === "") return null;
  return key.trim();
}

export function isMockMode(): boolean {
  return getApiKey() === null;
}

/** Backwards-compat alias — prefer isMockMode(). */
export const isMock = isMockMode;

export function mockSessionId(prefix = "sess"): string {
  return `${prefix}_mock_${Math.random().toString(36).slice(2, 10)}`;
}

export function logMockBanner(example: string): void {
  console.log(`[chow-solari] ${example}: SOLARI_API_KEY not set → running in MOCK mode (no billing, no network).`);
  console.log(`[chow-solari] Set SOLARI_API_KEY=slr_live_... to run against live Solari infra.\n`);
}

export function logCostNote(): void {
  console.log(`[chow-solari] Cost meter: mock mode = $0.00. Live browsers/desktops bill per-minute; always close/destroy in finally.`);
}

/** Exported for examples — true on 402/403 / Free-tier billing errors. */
export function isFreeTierError(err: unknown): boolean {
  return isBillingError(err);
}

// logCreditBurn removed — dead code (unused placeholder, never called). Wire to billing API when needed.

// ---------------------------------------------------------------------------
// Safe teardown helpers — always use in `finally`
// ---------------------------------------------------------------------------

export async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    const result = await Promise.race([p, timeout]);
    return result as T;
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    const isTimeout = msg.includes('timed out after');
    console.warn(`[chow-solari] withTimeout ${label} ${isTimeout ? 'timeout' : 'failed'}: ${msg} — teardown may be incomplete, check dashboard`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Safe wrapper for `solari.close()` / `browser.close()` hangs — call in `finally`. */
export async function safeClose(
  target: { close?: () => Promise<unknown> },
  ms = 5000,
): Promise<void> {
  if (!target || typeof target.close !== "function") return;
  await withTimeout(target.close.call(target), ms, "close()");
}

export async function safeKill(
  target: { kill?: () => Promise<unknown> },
  ms = 5000,
): Promise<void> {
  if (!target || typeof target.kill !== "function") return;
  await withTimeout(target.kill.call(target), ms, "kill()");
}

export async function safeDestroy(
  target: { destroy?: () => Promise<unknown> },
  ms = 5000,
): Promise<void> {
  // Some desktop SDKs expose destroy(), others close() — try destroy first.
  const fn = (target as { destroy?: () => Promise<unknown> }).destroy ?? (target as { close?: () => Promise<unknown> }).close;
  if (typeof fn !== "function") return;
  await withTimeout(fn.call(target), ms, "destroy()/close()");
}

// ---------------------------------------------------------------------------
// Internal: Solari client construction + 402/403 degrade
// ---------------------------------------------------------------------------

export const SOLARI_BASE_URL = "https://api.getsolari.com";

export function isBillingError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err);
  const status = (err as { status?: number; statusCode?: number; code?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode
    ?? (err as { code?: number })?.code;
  if (status === 402 || status === 403) return true;
  return /\b402\b|\b403\b|payment required|forbidden|free tier|quota exceeded|insufficient credit/i.test(msg);
}

// Dynamic imports so mock mode never requires the real SDKs to be installed.
async function importSolariBrowser(): Promise<unknown> {
  // @ts-ignore — optional peer
  const mod = await import("@solarisdk/browser");
  return (mod as { Solari?: unknown; default?: unknown }).Solari
    ?? (mod as { default?: unknown }).default
    ?? mod;
}

async function importSolariSandbox(): Promise<unknown> {
  // @ts-ignore — optional peer
  const mod = await import("@solarisdk/sandbox");
  return (mod as { Solari?: unknown; default?: unknown }).Solari
    ?? (mod as { default?: unknown }).default
    ?? mod;
}

async function importSolariDesktop(): Promise<unknown> {
  // @ts-ignore — optional peer
  const mod = await import("@solarisdk/desktop");
  return (mod as { Solari?: unknown; default?: unknown }).Solari
    ?? (mod as { default?: unknown }).default
    ?? mod;
}

// ---------------------------------------------------------------------------
// launchBrowser
// ---------------------------------------------------------------------------

export type LaunchBrowserOpts = {
  stealth?: boolean;
  proxy?: boolean | string;
  recording?: boolean;
  timeoutMs?: number;
  [key: string]: unknown;
};

/**
 * Launch a Solari browser session.
 *
 * - Mock mode (no SOLARI_API_KEY): returns MockBrowser { id:"mock-session", close, newPage }.
 * - Real mode: `new Solari({apiKey, baseUrl})` then browser launch. On 402/403 the call
 *   retries once without stealth/proxy (Free-tier degrade). If that still fails, falls
 *   back to mock with a warning so the example keeps running.
 *
 * GOTCHA — `await solari.close()` can hang. Always do:
 * ```ts
 * const browser = await launchBrowser();
 * try { ... } finally { await safeClose(browser); }
 * ```
 */
export async function launchBrowser(
  opts: LaunchBrowserOpts = {},
): Promise<MockBrowser | unknown> {
  if (isMockMode()) {
    console.log("[chow-solari] SOLARI_API_KEY not set — launchBrowser() using mock.");
    return createMockBrowser();
  }

  const apiKey = getApiKey()!;

  // Attempt 1: full opts (stealth/proxy may require Starter).
  try {
    const SolariCtor = (await importSolariBrowser()) as new (o: unknown) => {
      launchBrowser?: (o: unknown) => Promise<unknown>;
      browser?: { launch?: (o: unknown) => Promise<unknown> };
      close?: () => Promise<void>;
    };
    const solari = new SolariCtor({ apiKey, baseUrl: SOLARI_BASE_URL });
    const launch = (solari as { launchBrowser?: (o: unknown) => Promise<unknown> }).launchBrowser
      ?? (solari as { browser?: { launch?: (o: unknown) => Promise<unknown> } }).browser?.launch
      ?? (solari as unknown as (o: unknown) => Promise<unknown>);
    if (typeof launch === "function") {
      const bound = (solari as { launchBrowser?: unknown }).launchBrowser ? launch.bind(solari) : launch;
      return await (bound as (o: unknown) => Promise<unknown>)({ ...opts });
    }
    // If SDK shape is `new Solari.Browser(...)`, just return the client and let caller drive it.
    return solari;
  } catch (err) {
    if (!isBillingError(err)) throw err;
    console.warn(`[chow-solari] launchBrowser 402/403 — retrying without stealth/proxy: ${String((err as Error).message)}`);
  }

  // Attempt 2: minimal launch (no stealth/proxy — Free tier compatible).
  try {
    const SolariCtor = (await importSolariBrowser()) as new (o: unknown) => unknown;
    const solari = new SolariCtor({ apiKey, baseUrl: SOLARI_BASE_URL });
    const launch = (solari as { launchBrowser?: (o: unknown) => Promise<unknown> }).launchBrowser
      ?? (solari as { browser?: { launch?: (o: unknown) => Promise<unknown> } }).browser?.launch;
    if (typeof launch === "function") {
      const minimal = { timeoutMs: (opts as { timeoutMs?: number }).timeoutMs };
      return await (launch as (o: unknown) => Promise<unknown>).call(solari, minimal);
    }
    return solari;
  } catch (err) {
    console.warn(`[chow-solari] launchBrowser degraded launch also failed — falling back to mock: ${String((err as Error).message)}`);
    return createMockBrowser();
  }
}

// ---------------------------------------------------------------------------
// createSandbox
// ---------------------------------------------------------------------------

export type CreateSandboxOpts = {
  template?: string;
  timeoutMs?: number;
  /**
   * Solari sandbox timeoutMs is a rolling window — it resets on activity.
   * Long idle gaps between commands can still expire the sandbox; re-create
   * or heartbeat if you have gaps > timeoutMs.
   */
  [key: string]: unknown;
};

/**
 * Create a Solari sandbox (microVM).
 * Mock/real + 402/403 degrade mirrors launchBrowser.
 * Teardown: `try { ... } finally { await safeKill(sandbox); }`
 */
export async function createSandbox(
  opts: CreateSandboxOpts = {},
): Promise<MockSandbox | unknown> {
  if (isMockMode()) {
    console.log("[chow-solari] SOLARI_API_KEY not set — createSandbox() using mock.");
    return createMockSandbox();
  }

  const apiKey = getApiKey()!;

  try {
    const SolariCtor = (await importSolariSandbox()) as new (o: unknown) => {
      createSandbox?: (o: unknown) => Promise<unknown>;
      sandbox?: { create?: (o: unknown) => Promise<unknown> };
    };
    const solari = new SolariCtor({ apiKey, baseUrl: SOLARI_BASE_URL });
    const create = (solari as { createSandbox?: (o: unknown) => Promise<unknown> }).createSandbox
      ?? (solari as { sandbox?: { create?: (o: unknown) => Promise<unknown> } }).sandbox?.create;
    if (typeof create === "function") {
      return await (create as (o: unknown) => Promise<unknown>).call(solari, { template: "base", ...opts });
    }
    return solari;
  } catch (err) {
    if (!isBillingError(err)) throw err;
    console.warn(`[chow-solari] createSandbox 402/403 — retrying minimal: ${String((err as Error).message)}`);
  }

  try {
    const SolariCtor = (await importSolariSandbox()) as new (o: unknown) => unknown;
    const solari = new SolariCtor({ apiKey, baseUrl: SOLARI_BASE_URL });
    const create = (solari as { createSandbox?: (o: unknown) => Promise<unknown> }).createSandbox
      ?? (solari as { sandbox?: { create?: (o: unknown) => Promise<unknown> } }).sandbox?.create;
    if (typeof create === "function") {
      return await (create as (o: unknown) => Promise<unknown>).call(solari, { template: "base" });
    }
    return solari;
  } catch (err) {
    console.warn(`[chow-solari] createSandbox degraded create also failed — falling back to mock: ${String((err as Error).message)}`);
    return createMockSandbox();
  }
}

// ---------------------------------------------------------------------------
// createDesktop
// ---------------------------------------------------------------------------

export type CreateDesktopOpts = {
  width?: number;
  height?: number;
  timeoutMs?: number;
  [key: string]: unknown;
};

/**
 * Create a Solari desktop (VNC).
 * Mock/real + 402/403 degrade mirrors launchBrowser.
 * Teardown: `try { ... } finally { await safeDestroy(desktop); }`
 * (some SDKs use destroy(), others close() — safeDestroy handles both).
 */
export async function createDesktop(
  opts: CreateDesktopOpts = {},
): Promise<MockDesktop | unknown> {
  if (isMockMode()) {
    console.log("[chow-solari] SOLARI_API_KEY not set — createDesktop() using mock.");
    return createMockDesktop();
  }

  const apiKey = getApiKey()!;

  try {
    const SolariCtor = (await importSolariDesktop()) as new (o: unknown) => {
      createDesktop?: (o: unknown) => Promise<unknown>;
      desktop?: { create?: (o: unknown) => Promise<unknown> };
    };
    const solari = new SolariCtor({ apiKey, baseUrl: SOLARI_BASE_URL });
    const create = (solari as { createDesktop?: (o: unknown) => Promise<unknown> }).createDesktop
      ?? (solari as { desktop?: { create?: (o: unknown) => Promise<unknown> } }).desktop?.create;
    if (typeof create === "function") {
      return await (create as (o: unknown) => Promise<unknown>).call(solari, { width: 1280, height: 720, ...opts });
    }
    return solari;
  } catch (err) {
    if (!isBillingError(err)) throw err;
    console.warn(`[chow-solari] createDesktop 402/403 — retrying minimal: ${String((err as Error).message)}`);
  }

  try {
    const SolariCtor = (await importSolariDesktop()) as new (o: unknown) => unknown;
    const solari = new SolariCtor({ apiKey, baseUrl: SOLARI_BASE_URL });
    const create = (solari as { createDesktop?: (o: unknown) => Promise<unknown> }).createDesktop
      ?? (solari as { desktop?: { create?: (o: unknown) => Promise<unknown> } }).desktop?.create;
    if (typeof create === "function") {
      return await (create as (o: unknown) => Promise<unknown>).call(solari, { width: 1280, height: 720 });
    }
    return solari;
  } catch (err) {
    console.warn(`[chow-solari] createDesktop degraded create also failed — falling back to mock: ${String((err as Error).message)}`);
    return createMockDesktop();
  }
}
