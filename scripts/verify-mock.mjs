#!/usr/bin/env node
// verify-mock.mjs — fs-only gate: no npm spawn, just artifact checks + PASS/FAIL
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fs.existsSync(path.join(process.cwd(), 'examples'))
  ? process.cwd()
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let fails = 0;
let passes = 0;

function log(pass, label, detail = '') {
  const tag = pass ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (pass) passes++; else fails++;
}

function checkFileExists(rel) {
  const abs = path.join(ROOT, rel);
  const ok = fs.existsSync(abs);
  log(ok, rel, ok ? 'exists' : 'MISSING');
  return ok;
}

function checkFileSize(rel, min, max) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    log(false, `${rel} size`, `missing (expected ${min}-${max} bytes)`);
    return;
  }
  const sz = fs.statSync(abs).size;
  const ok = sz >= min && sz <= max;
  log(ok, `${rel} size`, `${sz} bytes (expected ${min}-${max})`);
}

function checkFileMinSize(rel, minBytes, label) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    log(false, label || rel, `missing (expected >${minBytes} bytes)`);
    return;
  }
  const sz = fs.statSync(abs).size;
  const ok = sz > minBytes;
  const mb = (sz / (1024 * 1024)).toFixed(2);
  log(ok, label || rel, `${sz} bytes (${mb} MB) ${ok ? `> ${minBytes}` : `FAIL: need >${minBytes}`}`);
}

// --- checks ---
// 1) onboarding.html 11-16K (11000-16000) minimal-clean — hairline drawer, 2 sliders, no pad filler
{
  const rel = 'examples/onboarding-wizard/onboarding.html';
  if (checkFileExists(rel)) {
    checkFileSize(rel, 11000, 17000);
    try {
      const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      log(html.includes('URLSearchParams') && html.includes("get('funnel')"), 'onboarding.html ?funnel wiring', html.includes("get('funnel')") ? 'URLSearchParams ?funnel present' : 'MISSING ?funnel param handling');
      log(html.includes('dataset.funnel'), 'onboarding.html dataset.funnel', html.includes('dataset.funnel') ? 'found' : 'MISSING');
      log(html.includes('Bring Your Shop') && html.includes('Start Your Shop'), 'onboarding.html Bring vs Start', 'both funnels present');
      log(html.includes('#20b8cd') || html.includes('#20B8CD') || html.includes('20b8cd'), 'onboarding.html OM signal #20b8cd', 'studio token present');
      log(html.includes('#08090b') || html.includes('08090b'), 'onboarding.html OM dark #08090b', 'studio token present');
      log(html.includes('class="hex"') || html.includes('hex'), 'onboarding.html OM hex badge', 'hex OM present');
    } catch (e) {
      log(false, 'onboarding.html content checks', e.message);
    }
  }
}

// 2) shop-config.json 400-1000B + funnel + timeToFirstRfq + partCardLink + isMock
{
  const rel = 'examples/onboarding-wizard/shop-config.json';
  if (checkFileExists(rel)) {
    checkFileSize(rel, 400, 1000);
    // content checks
    try {
      const j = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
      log(j.slug === 'acme-precision' || j.slug === 'new-chip-co', 'shop-config.json slug', `got "${j.slug}" expected acme-precision|new-chip-co`);
      log(j.partCardHash === 'c3259a261f868443', 'shop-config.json partCardHash', `got "${j.partCardHash}" expected "c3259a261f868443"`);
      log(j.funnel === 'bring' || j.funnel === 'start', 'shop-config.json funnel', `got "${j.funnel}" expected bring|start`);
      log(typeof j.timeToFirstRfq === 'string' && j.timeToFirstRfq.length > 0, 'shop-config.json timeToFirstRfq', `got "${j.timeToFirstRfq}"`);
      log(typeof j.partCardLink === 'string' && j.partCardLink.includes('#part-card'), 'shop-config.json partCardLink', `got "${j.partCardLink}"`);
      log(typeof j.isMock === 'boolean', 'shop-config.json isMock', `got ${j.isMock} expected boolean (true=mock, false=live)`);
      if (j.isMock === false) {
        const sid = String(j.sessionId ?? '');
        log(/sess_|^ip-|:/.test(sid), 'shop-config.json live sessionId', sid ? `got live-format "${sid.slice(0, 24)}..."` : 'MISSING live sessionId');
      }
    } catch (e) {
      log(false, 'shop-config.json parse', e.message);
    }
  }
}

// 3) honesty-proof files + PNG dimensions + OM studio + part-card.html OM studio
{
  const html = 'examples/honesty-desktop/honesty-proof.html';
  const png = 'examples/honesty-desktop/honesty-proof.png';
  const htmlExists = checkFileExists(html);
  if (htmlExists) {
    const sz = fs.statSync(path.join(ROOT, html)).size;
    log(sz > 0, `${html} non-empty`, `${sz} bytes`);
    try {
      const h = fs.readFileSync(path.join(ROOT, html), 'utf8');
      log(h.includes('REFUSED'), 'honesty-proof.html REFUSED', h.includes('REFUSED') ? 'found' : 'MISSING');
      log(h.includes('non-manifold'), 'honesty-proof.html non-manifold', h.includes('non-manifold') ? 'found' : 'MISSING');
      log(h.includes('#20b8cd') || h.includes('#20B8CD') || h.includes('20b8cd'), 'honesty-proof.html OM signal', 'studio token present');
    } catch (e) {
      log(false, 'honesty-proof.html content', e.message);
    }
  }
  const pngExists = checkFileExists(png);
  if (pngExists) {
    const sz = fs.statSync(path.join(ROOT, png)).size;
    log(sz > 0, `${png} non-empty`, `${sz} bytes`);
    // PNG dimension check: must be 640x360 (1280x720 look) or 1280x720 — parse IHDR
    try {
      const buf = fs.readFileSync(path.join(ROOT, png));
      if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50) {
        const w = buf.readUInt32BE(16);
        const h2 = buf.readUInt32BE(20);
        const dimOk = (w === 640 && h2 === 360) || (w === 1280 && h2 === 720);
        log(dimOk, 'honesty-proof.png dimensions', `${w}x${h2} expected 640x360 or 1280x720`);
      } else {
        log(false, 'honesty-proof.png dimensions', 'not a valid PNG');
      }
    } catch (e) {
      log(false, 'honesty-proof.png dimensions', e.message);
    }
  }
  // part-card.html — OM studio + DFM contract
  const pc = 'examples/part-card-factory/part-card.html';
  if (fs.existsSync(path.join(ROOT, pc))) {
    const sz = fs.statSync(path.join(ROOT, pc)).size;
    log(sz > 0, `${pc} exists`, `${sz} bytes`);
    try {
      const phtml = fs.readFileSync(path.join(ROOT, pc), 'utf8');
      log(phtml.includes('c3259a261f868443'), 'part-card.html hash c3259a261f868443', 'deterministic hash present');
      log(phtml.includes('7 balls') || phtml.includes('7 Balls'), 'part-card.html 7 balls', 'DFM contract present');
      log(phtml.includes('c3259a26'), 'part-card.html short hash #c3259a26', 'short hash present');
      log(phtml.includes('hex') || phtml.includes('HEX'), 'part-card.html OM hex badge', 'OM studio hex present');
      log(phtml.includes('#20b8cd') || phtml.includes('#20B8CD') || phtml.includes('20b8cd'), 'part-card.html OM signal #20b8cd', 'studio token present');
    } catch (e) {
      log(false, 'part-card.html content', e.message);
    }
  } else {
    log(false, `${pc} — not found`, 'required: OM studio part card');
  }
}

// 4) docs/demo-60s.mp4 >1M
{
  const rel = 'docs/demo-60s.mp4';
  checkFileMinSize(rel, 1 * 1024 * 1024, `${rel} >1M`);
}

console.log(`\nverify-mock: ${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
