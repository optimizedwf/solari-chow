#!/usr/bin/env node
// shop-live-serve.mjs — persistent LIVE shop on Solari sandbox (stays up, no teardown).
// Creates ONE sandbox (template base, timeoutMs 8h idle window), writes the real
// shop.html to /tmp/site/index.html, starts python http.server 3000, fetches
// previewUrl(3000), verifies HTTP 200 outside, writes live-shop.json receipt
// (sandboxId + redacted previewUrl only — never the bearer token), exits leaving
// the sandbox RUNNING. Re-run to check/replace; kill via shop-live-kill.mjs.
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getApiKey, isMockMode, SOLARI_BASE_URL } from "../packages/chow-solari/src/index.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOP_HTML = join(ROOT, "shop.html");
const RECEIPT = join(ROOT, "live-shop.json");

function redact(u) {
  return String(u).replace(/(pt_token=)[A-Za-z0-9_.~\-]{8,}/, "$1...");
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  if (isMockMode()) {
    console.error("[shop-live] SOLARI_API_KEY missing — refusing (persistent live only).");
    process.exit(2);
  }
  const html = readFileSync(SHOP_HTML, "utf-8");
  if (!html.includes("inboxBody") || !html.includes("sendQuoteBtn")) {
    console.error("[shop-live] shop.html missing operate IDs — refusing to serve stale page.");
    process.exit(2);
  }
  const { SandboxClient } = await import("@solarisdk/sandbox");
  const client = new SandboxClient({ apiKey: getApiKey(), baseUrl: SOLARI_BASE_URL });
  const sb = await client.create({ template: "base", timeoutMs: 8 * 3600 * 1000, metadata: { shop: "acme-precision", kind: "shop-live" } });
  const sandboxId = sb.sandboxId ?? sb.id;
  console.log(`[shop-live] sandbox ${sandboxId} — connecting…`);
  if (typeof sb.connect === "function") await sb.connect();
  await sb.commands.run("mkdir", { args: ["-p", "/tmp/site"] });
  await sb.files.write("/tmp/site/index.html", html);
  console.log(`[shop-live] wrote /tmp/site/index.html (${html.length} bytes operate page)`);
  const r = await sb.commands.run("sh", { args: ["-c", "cd /tmp/site && (pkill -f 'http.server 3000' 2>/dev/null || true); nohup python3 -m http.server 3000 >/dev/null 2>&1 & sleep 1; ss -tlnp 2>/dev/null | grep 3000 || ps aux 2>/dev/null | grep 'http.server 3000' | grep -v grep || true"] });
  console.log("[shop-live] server:", String(typeof r === "string" ? r : r.stdout ?? r).slice(0, 200).replace(/\n/g, " "));
  const pv = await sb.previewUrl(3000);
  console.log(`[shop-live] previewUrl: ${redact(pv.url).slice(0, 110)}${pv.token ? " (token present)" : ""}`);
  let verified = false;
  for (let i = 0; i < 12; i++) {
    await sleep(1000);
    try {
      const res = await fetch(pv.url, pv.token ? { headers: { Authorization: `Bearer ${pv.token}` } } : undefined);
      const text = await res.text();
      if (res.ok && text.includes("Acme Prec")) { console.log(`[shop-live] fetch verify OK try ${i + 1}: HTTP ${res.status}`); verified = true; break; }
      if (i === 11) console.log(`[shop-live] last try: HTTP ${res.status} ${text.slice(0, 120).replace(/\n/g, " ")}`);
    } catch (e) { if (i === 11) console.log("[shop-live] fetch failed:", String(e).slice(0, 200)); }
  }
  const receipt = {
    shop: "acme-precision", sandboxId, previewUrl: redact(pv.url),
    previewVerified: verified, servedFile: "shop.html", servedBytes: html.length,
    timeoutMs: 8 * 3600 * 1000, startedAt: new Date().toISOString(),
    note: "Sandbox left RUNNING — kill with: npx tsx scripts/shop-live-kill.mjs",
  };
  writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2) + "\n", "utf-8");
  console.log(`[shop-live] receipt → ${RECEIPT}`);
  console.log("─".repeat(60));
  console.log(`LIVE SHOP UP ✓  ${redact(pv.url).slice(0, 90)}  ${verified ? "(verified HTTP 200)" : "(UNVERIFIED)"}`);
  console.log(`sandbox ${sandboxId} (8h idle window, left running)`);
  console.log("─".repeat(60));
  if (typeof client.close === "function") { try { await Promise.race([client.close(), sleep(5000)]); } catch {} }
}

main().catch((e) => { console.error("[shop-live] fatal:", e?.message ?? e); process.exit(1); });
