import { SandboxClient } from "@solarisdk/sandbox";
const key = process.env.SOLARI_API_KEY;
if (!key) { console.error("no key"); process.exit(2); }
console.log("key:", key.slice(0,13)+"…"+key.slice(-4), "len", key.length);
const client = new SandboxClient({ apiKey: key, baseUrl: "https://api.getsolari.com" });
console.log("creating sandbox base 5m…");
const t0=Date.now();
const sb = await client.create({ template:"base", timeoutMs: 5*60_000 });
console.log("sandbox:", sb.id, sb.sandboxId, `(${Date.now()-t0}ms) controlUrl`, sb.controlUrl?.slice(0,48)+"…");
try {
  // connect control channel so fs/commands work
  if (typeof sb.connect === "function") {
    await sb.connect();
    console.log("connected", sb.connected);
  }
  console.log("writing /tmp/site/index.html…");
  // ensure dir
  try { await sb.commands.run("mkdir", { args:["-p","/tmp/site"] }); } catch {}
  await sb.files.write("/tmp/site/index.html", "<h1>Served from inside a Solari sandbox</h1>\n<p>preview proof "+new Date().toISOString()+"</p>\n");
  console.log("files.write ok");
  console.log("starting http.server :3000…");
  const r = await sb.commands.run("sh", { args:["-c","cd /tmp/site && nohup python3 -m http.server 3000 >/dev/null 2>&1 & echo $!; sleep 1; ss -tlnp | grep 3000 || netstat -tlnp 2>/dev/null | grep 3000 || ps aux | grep http.server | grep -v grep || true"] });
  console.log("server start exit", r.exitCode, "stdout:", r.stdout?.slice(0,500), "stderr:", r.stderr?.slice(0,300));
  console.log("requesting previewUrl(3000)…");
  const pv = await sb.previewUrl(3000);
  console.log("previewUrl:", JSON.stringify(pv));
  const url = pv.url;
  if (!url) throw new Error("no url from previewUrl");
  console.log("fetching from outside VM…");
  for (let i=0;i<12;i++){
    await new Promise(r=>setTimeout(r,1000));
    try{
      const res = await fetch(url, pv.token ? { headers:{ Authorization:`Bearer ${pv.token}`}} : undefined);
      const text = await res.text();
      console.log(`  try ${i+1}: HTTP ${res.status} body ${(text||"").slice(0,200).replace(/\n/g," ")}`);
      if (res.ok && text.includes("Served from inside")) { console.log("PROOF OK — public fetch succeeded"); break; }
      if (i===11) console.log("fetch never returned expected body");
    } catch(e){ console.log(`  try ${i+1}: fetch error`, String(e).slice(0,300)); }
  }
} finally {
  console.log("killing sandbox…");
  try { await sb.kill(); console.log("kill ok"); } catch(e){ console.log("kill err", String(e).slice(0,400)); }
  // also via client kill idempotent
  try { await client.kill(sb.id); } catch {}
}
console.log("done");
