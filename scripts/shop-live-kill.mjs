#!/usr/bin/env node
// shop-live-kill.mjs — destroy the persistent live shop sandbox (stop billing).
import "dotenv/config";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getApiKey, isMockMode, SOLARI_BASE_URL } from "../packages/chow-solari/src/index.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RECEIPT = join(ROOT, "live-shop.json");

async function main() {
  if (!existsSync(RECEIPT)) { console.log("[shop-live-kill] no live-shop.json — nothing to kill."); return; }
  const r = JSON.parse(readFileSync(RECEIPT, "utf-8"));
  if (isMockMode()) { console.error("[shop-live-kill] no key — cannot kill remote sandbox."); process.exit(2); }
  const { SandboxClient } = await import("@solarisdk/sandbox");
  const client = new SandboxClient({ apiKey: getApiKey(), baseUrl: SOLARI_BASE_URL });
  try {
    await client.kill(r.sandboxId);
    console.log(`[shop-live-kill] killed ${r.sandboxId} ✓`);
  } catch (e) { console.log(`[shop-live-kill] kill ${r.sandboxId}: ${String(e?.message ?? e).slice(0, 160)}`); }
  rmSync(RECEIPT);
  console.log("[shop-live-kill] receipt removed.");
  try { if (typeof client.close === "function") await Promise.race([client.close(), new Promise((res) => setTimeout(res, 5000))]); } catch {}
}
main().catch((e) => { console.error("[shop-live-kill] fatal:", e?.message ?? e); process.exit(1); });
