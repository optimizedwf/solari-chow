#!/usr/bin/env node
// render-shop-operate-60s.mjs — Step 4: run-a-business video, not setup.
// REAL DOM + LIVE session path: shop.html is fully client-side (zero
// network calls — no page.route mocks anywhere). One fresh browser context
// (storageState saved), two recordVideo segments: operate loop on
// shop.html?shop=operate-film, then 10s slew B-roll insert from
// slewing-cine-10s.mp4 via ffmpeg concat. Samantha VO + .vtt sidecar.
// Encode: medium crf12 yuv420p bt709 g60 bf0 faststart. Ship <=15M.
import { chromium } from 'playwright';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const W = 1920, H = 1080, FPS = 60;
const OUT = path.join(process.cwd(), 'docs/shop-operate-60s.mp4');
const VTT = OUT.replace(/\.mp4$/, '.vtt');
const POSTER = path.join(process.cwd(), 'docs/shop-operate-60s.poster.jpg');
const CONTACT = path.join(process.cwd(), 'docs/shop-operate-60s.contact-sheet.jpg');
const FFMPEG = path.join(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg');
const TMPDIR = path.join(os.tmpdir(), 'shop-operate-rec');
const STATE = path.join(TMPDIR, 'operate-state.json');
const SEGA = path.join(TMPDIR, 'segA.webm');   // operate loop
const SEGB = path.join(TMPDIR, 'segB.mp4');   // slew b-roll (normalized master)
const SEGC = path.join(TMPDIR, 'segC.webm');   // break-even + honesty + CTA
const VOA = path.join(TMPDIR, 'vo-a.aiff');    // VO for operate acts
const VOC = path.join(TMPDIR, 'vo-c.aiff');    // VO for close acts
const SLEW = path.join(process.cwd(), 'docs/slewing-cine-10s.mp4');
const SHOP = 'http://127.0.0.1:8091/shop.html?funnel=bring&shop=operate-film';

fs.mkdirSync(TMPDIR, { recursive: true });
for (const f of fs.readdirSync(TMPDIR)) try { fs.unlinkSync(path.join(TMPDIR, f)); } catch {}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
if (!fs.existsSync(FFMPEG)) { console.error('ffmpeg not found', FFMPEG); process.exit(1); }
if (!fs.existsSync(SLEW)) { console.error('slew b-roll missing', SLEW); process.exit(1); }

// ---- VO script (Samantha). Timings are targets; VTT cues are authored
// against the choreography below (~7s per line).
const VO_A = [
  'My shop, live — three quote requests came in overnight.',
  'Twelve wheel bearings for Northfield Aero, quoted in the browser: quantity, steel, finish.',
  'The price recomputes as I drag. Quote sent.',
  'The honesty gate refuses a non-manifold file — nothing fabricated, and that yellow card is the point.',
  'A good file passes DFM; the STEP downloads with its hash.',
  'Electrical: volts and amps in, breaker and wire size out.',
].join(' ');
const VO_C = [
  'Two orders won. Revenue moves, win rate moves, break-even moves with it.',
  'Inbox to quote to order, every feature, one key — open a shop from chat, and run it from here.',
].join(' ');

function say(text, out) {
  const r = spawnSync('say', ['-v', 'Samantha', '-o', out, text], { encoding: 'utf8', timeout: 120000 });
  if (r.error || !fs.existsSync(out)) { console.log('say failed', r.error?.message || r.stderr?.slice(0, 300)); return false; }
  console.log(`VO ${path.basename(out)} ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  return true;
}
function aiffDur(p) {
  let o = '';
  try {
    o = execSync(`${JSON.stringify(FFMPEG)} -i ${JSON.stringify(p)} 2>&1`, { encoding: 'utf8', timeout: 10000 }).toString();
  } catch (e) {
    // ffmpeg -i with no output file always exits non-zero; header is in the error output
    o = ((e.stdout || '') + (e.stderr || '')).toString();
  }
  const m = o.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!m) return 0;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
}

console.log('VO take A…');
const voAok = say(VO_A, VOA);
console.log('VO take C…');
const voCok = say(VO_C, VOC);
const durA = voAok ? aiffDur(VOA) : 0;
const durC = voCok ? aiffDur(VOC) : 0;
console.log(`VO durations A=${durA.toFixed(1)}s C=${durC.toFixed(1)}s`);

// ---- Browser: segment A — operate loop (real DOM, no route mocks) ----
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--use-gl=swiftshader'],
});

async function newRecCtx(outName) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: TMPDIR, size: { width: W, height: H } },
    ...(fs.existsSync(STATE) ? { storageState: STATE } : {}),
  });
  // Fresh film shop on the very first segment so seeds are deterministic.
  if (!fs.existsSync(STATE)) {
    await ctx.addInitScript(() => {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('shop:operate-film')) localStorage.removeItem(k);
      }
    });
  }
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page._outName = outName;
  return { ctx, page };
}
async function closeRecCtx(ctx, outName) {
  const st = fs.existsSync(STATE) ? undefined : STATE;
  if (st) await ctx.storageState({ path: st });
  await ctx.close();
  // Playwright names the file per page; find newest .webm and rename.
  const cands = fs.readdirSync(TMPDIR).filter(f => f.endsWith('.webm'))
    .map(f => ({ f, t: fs.statSync(path.join(TMPDIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!cands.length) { console.error('no webm recorded for', outName); process.exit(1); }
  fs.renameSync(path.join(TMPDIR, cands[0].f), outName);
  console.log(`segment ${path.basename(outName)} ${(fs.statSync(outName).size / 1024 / 1024).toFixed(2)} MB`);
}

async function wheel(page, n, dy, pause) {
  for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy); await page.waitForTimeout(pause); }
}
async function dragSlider(page, sel, fromFrac, toFrac, steps) {
  const el = page.locator(sel);
  const box = await el.boundingBox();
  if (!box) { console.log('slider no box', sel); return; }
  await page.mouse.move(box.x + box.width * fromFrac, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * toFrac, box.y + box.height / 2, { steps });
  await page.waitForTimeout(200);
  await page.mouse.up();
}

// --- Segment A: acts 0-5 (~38s) ---
{
  const { ctx, page } = await newRecCtx(SEGA);
  await page.goto(SHOP, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1200);
  // ACT 0 — open live shop, topbar + KPIs.
  console.log('A0 live badge:', (await page.locator('#liveBadge').textContent().catch(() => '?')).trim());
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(2400);
  // ACT 1 — inbox: outline first RFQ, click Quote.
  try { await page.evaluate(() => { const el = document.querySelector('#inboxBody tr'); if (el) { el.style.outline = '2px solid #20b8cd'; el.style.outlineOffset = '2px'; } }); } catch {}
  await page.evaluate(() => { const el = document.getElementById('inboxCard'); if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' }); });
  await page.waitForTimeout(2200);
  await page.locator('[data-act="quote"]').first().click();
  await page.waitForTimeout(1800);
  console.log('A1 qFor:', (await page.locator('#qFor').textContent()).trim());
  await page.evaluate(() => { const el = document.querySelector('#inboxBody tr'); if (el) el.style.outline = ''; });
  // ACT 2 — quote: drag qty with a mid-pause so price steps are visible, tweak tolerance, send.
  await page.evaluate(() => { const el = document.getElementById('quotePanel'); if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' }); });
  await page.waitForTimeout(900);
  const p0 = (await page.locator('#qPrice').textContent()).trim();
  await dragSlider(page, '#qQty', 0.2, 0.62, 14);
  await page.waitForTimeout(1400);
  await dragSlider(page, '#qQty', 0.62, 0.8, 8);
  await page.waitForTimeout(1200);
  // real typing: finish select via keyboard
  await page.locator('#qFinish').click();
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  const p1 = (await page.locator('#qPrice').textContent()).trim();
  console.log(`A2 price ${p0} -> ${p1} lead ${(await page.locator('#qLead').textContent()).trim()}`);
  await page.locator('#sendQuoteBtn').click();
  await page.waitForTimeout(1600);
  console.log('A2 status:', (await page.locator('#inboxBody tr').first().locator('.badgeStatus').textContent()).trim());
  // ACT 3 — DFM refuse: uncheck manifold (real click), check, read REFUSED.
  await page.locator('#dfmMani').uncheck();
  await page.waitForTimeout(300);
  await page.locator('#dfmBtn').click();
  await page.waitForTimeout(2000);
  console.log('A3 dfm:', (await page.locator('#dfmOut').textContent()).trim().slice(0, 70));
  await page.waitForTimeout(1800);
  // ACT 4 — DFM pass: recheck, STEP link appears.
  await page.locator('#dfmMani').check();
  await page.waitForTimeout(300);
  await page.locator('#dfmBtn').click();
  await page.waitForTimeout(2000);
  console.log('A4 step:', await page.locator('#stepDl').isVisible(), (await page.locator('#stepDl').textContent()).trim());
  await page.waitForTimeout(1500);
  // ACT 5 — electrical: type 230 with a backspace, then Notes.
  await page.evaluate(() => { const el = document.getElementById('elV'); if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' }); });
  await page.waitForTimeout(700);
  const elV = page.locator('#elV');
  await elV.click();
  await page.waitForTimeout(200);
  await page.keyboard.press('Meta+A');
  await page.waitForTimeout(120);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);
  await page.keyboard.type('230', { delay: 140 });
  await page.waitForTimeout(500);
  // deliberate typo + fix on amps for human feel
  const elA = page.locator('#elA');
  await elA.click();
  await page.waitForTimeout(200);
  await page.keyboard.press('Meta+A');
  await page.waitForTimeout(120);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(150);
  await page.keyboard.type('8', { delay: 160 });
  await page.waitForTimeout(250);
  await page.keyboard.press('Backspace'); // oops — wrong value
  await page.waitForTimeout(220);
  await page.keyboard.type('9', { delay: 160 });
  await page.waitForTimeout(500);
  await page.locator('#elBtn').click();
  await page.waitForTimeout(1600);
  console.log('A5 elec:', (await page.locator('#elOut').textContent()).trim());
  await closeRecCtx(ctx, SEGA);
}

// --- Segment B: 10s slew B-roll, normalized from the shipped master so the
// whole film shares one codec contract (1920x1080 60fps yuv420p bt709 g60).
{
  execSync(`${JSON.stringify(FFMPEG)} -y -i ${JSON.stringify(SLEW)} ` +
    `-vf scale=1920:1080:flags=lanczos,fps=60,format=yuv420p -c:v libx264 -preset medium -crf 12 ` +
    `-pix_fmt yuv420p -r 60 -g 60 -bf 0 -colorspace bt709 -color_primaries bt709 -color_trc bt709 ` +
    `-an ${JSON.stringify(SEGB)} 2>&1`, { encoding: 'utf8', timeout: 180000 });
  console.log(`segment segB.webm-normalized ${(fs.statSync(SEGB).size / 1024 / 1024).toFixed(2)} MB`);
}

// --- Segment C: acts 6-8 (~14s) — same live session continues via storageState ---
{
  const { ctx, page } = await newRecCtx(SEGC);
  await page.goto(SHOP, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1000);
  // ACT 6 — accept 2 RFQs: orders + revenue move.
  await page.evaluate(() => { const el = document.getElementById('inboxCard'); if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' }); });
  await page.waitForTimeout(900);
  await page.locator('[data-act="accept"]').nth(1).click();
  await page.waitForTimeout(1300);
  await page.locator('[data-act="accept"]').nth(2).click();
  await page.waitForTimeout(1600);
  console.log('A6 orders:', (await page.locator('#ordersCount').textContent()).trim(),
    '| rev:', (await page.locator('#kpiRev').textContent()).trim(),
    '| win:', (await page.locator('#kpiWin').textContent()).trim());
  await page.evaluate(() => { const el = document.getElementById('ordersCard'); if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' }); });
  await page.waitForTimeout(2200);
  // ACT 7 — break-even: drag winRate so months move; honesty card visible.
  await page.evaluate(() => { const el = document.getElementById('breakEven'); if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' }); });
  await page.waitForTimeout(900);
  await dragSlider(page, '[data-be-input="winRate"]', 0.35, 0.75, 12);
  await page.waitForTimeout(1800);
  console.log('A7 beFooter:', (await page.locator('.beFooter').textContent()).trim().slice(0, 80));
  await wheel(page, 2, 340, 320);
  await page.waitForTimeout(1400);
  // ACT 8 — CTA: back to top, hero + open-shop link.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(2000);
  await closeRecCtx(ctx, SEGC);
}
await browser.close();

// ---- Encode: webm segs -> h264 intermediates -> concat (+VO) -> ship ----
function encSeg(src, dst) {
  execSync(`${JSON.stringify(FFMPEG)} -y -i ${JSON.stringify(src)} ` +
    `-vf scale=1920:1080:flags=lanczos,fps=60,format=yuv420p -c:v libx264 -preset medium -crf 12 ` +
    `-pix_fmt yuv420p -r 60 -g 60 -bf 0 -colorspace bt709 -color_primaries bt709 -color_trc bt709 ` +
    `-an ${JSON.stringify(dst)} 2>&1`, { encoding: 'utf8', timeout: 180000 });
  console.log(`enc ${path.basename(dst)} ${(fs.statSync(dst).size / 1024 / 1024).toFixed(2)} MB`);
}
const IA = path.join(TMPDIR, 'segA.mp4');
const IB = SEGB; // already h264 yuv420p 60fps from the normalize step above
const IC = path.join(TMPDIR, 'segC.mp4');
encSeg(SEGA, IA);
console.log(`segB ready ${(fs.statSync(IB).size / 1024 / 1024).toFixed(2)} MB`);
encSeg(SEGC, IC);

const list = path.join(TMPDIR, 'concat.txt');
fs.writeFileSync(list, `file '${IA}'\nfile '${IB}'\nfile '${IC}'\n`);
const JOIN = path.join(TMPDIR, 'joined.mp4');
execSync(`${JSON.stringify(FFMPEG)} -y -f concat -safe 0 -i ${JSON.stringify(list)} ` +
  `-c copy ${JSON.stringify(JOIN)} 2>&1`, { encoding: 'utf8', timeout: 120000 });
console.log(`joined ${(fs.statSync(JOIN).size / 1024 / 1024).toFixed(2)} MB`);

// VO mix: VO-A under operate, slew music-free gap, VO-C under close.
// Measure joined duration, then delay VOC to start after A+B.
function probeDur(p) {
  let o = '';
  try {
    o = execSync(`${JSON.stringify(FFMPEG)} -i ${JSON.stringify(p)} 2>&1`, { encoding: 'utf8', timeout: 15000 }).toString();
  } catch (e) {
    // ffmpeg -i with no output file always exits non-zero; the header is in the error output
    o = ((e.stdout || '') + (e.stderr || '')).toString();
  }
  const m = o.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 0;
}
const dA = probeDur(IA), dB = probeDur(IB), dC = probeDur(IC);
console.log(`seg durations A=${dA.toFixed(1)} B=${dB.toFixed(1)} C=${dC.toFixed(1)} total=${(dA + dB + dC).toFixed(1)}`);

let audioArgs = [];
if (voAok && voCok) {
  if (durA > dA + 1) {
    console.log(`[TIME] VO-A ${durA.toFixed(1)}s overflows picture A ${dA.toFixed(1)}s — retiming at 1.12x`);
    const sped = path.join(TMPDIR, 'vo-a-sped.aiff');
    execSync(`${JSON.stringify(FFMPEG)} -y -i ${JSON.stringify(VOA)} -filter:a atempo=1.12 ${JSON.stringify(sped)} 2>&1`, { encoding: 'utf8', timeout: 60000 });
    fs.renameSync(sped, VOA);
  }
  // VO-A is padded then trimmed to exactly A+B so the trim is a no-op when
  // the take fits, and a hard clamp when it overflows; -t pins A/V sync.
  const total = dA + dB + dC;
  const delayMs = Math.round((dA + dB) * 1000);
  audioArgs = ['-i', VOA, '-i', VOC, '-filter_complex',
    `[1:a]adelay=0|0,apad[pad];[pad]atrim=0:${(dA + dB).toFixed(2)}[a1];[2:a]adelay=${delayMs}|${delayMs},apad[a2];[a1][a2]amix=inputs=2:normalize=0[aout]`,
    '-map', '0:v', '-map', '[aout]', '-c:a', 'aac', '-b:a', '128k', '-t', total.toFixed(2)];
} else {
  console.log('VO missing — shipping silent');
}
// NOTE: intermediates stay crf12 (concat-safe masters); the ship encode is
// crf18 so a ~54s 1080p60 screen film stays under the 15M repo weight cap.
execSync(`${JSON.stringify(FFMPEG)} -y -i ${JSON.stringify(JOIN)} ${audioArgs.map(a => JSON.stringify(a)).join(' ')} ` +
  `-c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -r 60 -g 60 -bf 0 ` +
  `-colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart ` +
  `${JSON.stringify(OUT)} 2>&1`, { encoding: 'utf8', timeout: 300000 });
const st = fs.statSync(OUT);
console.log(`DONE ${OUT} ${(st.size / 1024 / 1024).toFixed(2)} MB`);

// ---- VTT sidecar (retimed to measured segments: dA | B=10s B-roll | dC) ----
function ts(s) {
  s = Math.max(0, s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec.toFixed(3).padStart(6, '0')}`;
}
const sentences = t => t.match(/[^.]+(?:\.|$)/g).map(s => s.trim()).filter(Boolean);
const partsA = sentences(VO_A), partsC = sentences(VO_C);
const cues = [
  ...partsA.map((line, i) => [
    ts((dA * i) / partsA.length), ts((dA * (i + 1)) / partsA.length), line,
  ]),
  [ts(dA), ts(dA + dB), 'Ten seconds of the part itself — this is what the shop makes.'],
  ...partsC.map((line, i) => [
    ts(dA + dB + (dC * i) / partsC.length), ts(dA + dB + (dC * (i + 1)) / partsC.length), line,
  ]),
];
fs.writeFileSync(VTT, 'WEBVTT\n\n' + cues.map(c => `${c[0]} --> ${c[1]}\n${c[2]}\n`).join('\n'));
console.log(`VTT ${VTT} ${cues.length} cues`);

// ---- Poster @ min(A*0.62, A-3) — inside operate UI (DFM PASS region), + contact sheet (6 thumbs) ----
const posterT = Math.min(dA * 0.62, dA - 3);
execSync(`${JSON.stringify(FFMPEG)} -y -ss ${posterT.toFixed(1)} -i ${JSON.stringify(OUT)} -vframes 1 -q:v 2 ${JSON.stringify(POSTER)} 2>&1`, { encoding: 'utf8', timeout: 15000 });
console.log(`poster ${POSTER} ${(fs.statSync(POSTER).size / 1024).toFixed(1)} KB @${posterT.toFixed(1)}s`);
{
  const total = probeDur(OUT);
  const n = 6, thumbs = [];
  for (let i = 0; i < n; i++) {
    const t = (total * (i + 0.5)) / n;
    const tp = path.join(TMPDIR, `thumb${i}.jpg`);
    execSync(`${JSON.stringify(FFMPEG)} -y -ss ${t.toFixed(1)} -i ${JSON.stringify(OUT)} -vframes 1 -q:v 3 -vf scale=480:270 ${JSON.stringify(tp)} 2>&1`, { encoding: 'utf8', timeout: 15000 });
    thumbs.push(tp);
  }
  execSync(`${JSON.stringify(FFMPEG)} -y ${thumbs.map(t => `-i ${JSON.stringify(t)}`).join(' ')} ` +
    `-filter_complex "[0:v][1:v][2:v]hstack=inputs=3[top];[3:v][4:v][5:v]hstack=inputs=3[bot];[top][bot]vstack=inputs=2" ` +
    `-q:v 2 ${JSON.stringify(CONTACT)} 2>&1`, { encoding: 'utf8', timeout: 60000 });
  console.log(`contact ${CONTACT} ${(fs.statSync(CONTACT).size / 1024).toFixed(1)} KB`);
}

// ---- Self-check: probe + decode ----
console.log(execSync(`${JSON.stringify(FFMPEG)} -i ${JSON.stringify(OUT)} 2>&1 | head -30`, { encoding: 'utf8' }).slice(0, 2000));
const dec = execSync(`${JSON.stringify(FFMPEG)} -v error -i ${JSON.stringify(OUT)} -f null - 2>&1`, { encoding: 'utf8', timeout: 120000 }).trim();
console.log(dec ? `[FAIL] decode ${dec.slice(0, 800)}` : '[PASS] decode clean');
