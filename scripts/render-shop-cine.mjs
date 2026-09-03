#!/usr/bin/env node
// render-shop-cine.mjs — deterministic shop 10s 600f @60fps image2pipe (S-tier hardened)
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const W=1920,H=1080,FPS=60;
const OUT = process.env.OUT || path.join(process.cwd(), 'docs/shop-cine-10s.mp4');
const HQ  = process.env.HQ  || path.join(process.cwd(), 'docs/shop-cine-10s.hq.mp4');
const FFMPEG = process.env.FFMPEG || path.join(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg');
const URL = process.env.PAGE_URL || 'http://127.0.0.1:8091/shop.html?funnel=bring';
const FALLBACK_URL = `file://${path.join(process.cwd(), 'shop.html')}`;

// --- disk preflight >=5GB ---
try {
  const st = fs.statfsSync(process.cwd());
  const free = Number(st.bavail) * Number(st.bsize);
  console.log(`[disk] free ${(free/1024/1024/1024).toFixed(2)} GB`);
  if (free < 5*1024*1024*1024) { console.error(`[FAIL] disk free <5GB — abort`); process.exit(1); }
} catch (e) {
  try {
    const out = execSync('df -k . 2>&1', { encoding:'utf8', timeout:5000 });
    console.log('[disk] df fallback\n' + out.split('\n').slice(0,4).join('\n'));
    const availKb = parseInt(out.split('\n')[1]?.trim().split(/\s+/)[3] || '0', 10);
    if (availKb && availKb*1024 < 5*1024*1024*1024) { console.error('[FAIL] disk free <5GB (df) — abort'); process.exit(1); }
  } catch {}
}

if (!fs.existsSync(FFMPEG)) { console.error('ffmpeg not found',FFMPEG); process.exit(1); }

async function renderOnce(pageUrl) {
  // SwiftShader deterministic — --disable-gpu-sandbox --use-angle=swiftshader --use-gl=swiftshader
  let browser;
  try {
    browser = await chromium.launch({ channel:'chrome', headless: true, args: ['--no-sandbox','--disable-gpu-sandbox','--use-angle=swiftshader','--use-gl=swiftshader','--disable-dev-shm-usage','--disable-setuid-sandbox'] });
  } catch (e) {
    console.log('[launch] channel:chrome unavailable, falling back to chromium —', e.message.split('\n')[0]);
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-gpu-sandbox','--use-angle=swiftshader','--use-gl=swiftshader','--disable-dev-shm-usage','--disable-setuid-sandbox'] });
  }
  const page = await browser.newPage({ viewport:{width:W,height:H}, deviceScaleFactor:1 });
  page.on('pageerror', e=>console.log('[pageerror]',e.message));
  console.log('goto', pageUrl);
  await page.goto(pageUrl, { waitUntil:'load', timeout:60000 });
  await page.waitForFunction('window.__sceneReady===true && typeof window.__cineFrame==="function" && !!window.__cineMeta', {timeout:30000});
  const meta = await page.evaluate(()=>window.__cineMeta);
  console.log('meta', JSON.stringify(meta));
  if (!meta || meta.width!==W || meta.height!==H || meta.fps!==FPS) {
    console.warn(`[WARN] __cineMeta mismatch expected ${W}x${H}@${FPS} got ${JSON.stringify(meta)} — continuing if close`);
    if (!meta || meta.width!==1920 || meta.height!==1080) { console.error('[FAIL] __cineMeta 1920/1080 contract'); await browser.close(); throw new Error('meta mismatch'); }
  } else {
    console.log('[PASS] __cineFrame + __cineMeta 1920/1080/60 contract');
  }
  if (meta.fps!==FPS) console.log(`[WARN] meta.fps ${meta.fps} expected ${FPS}`);
  const FRAMES = meta.frames ?? 600;
  // deterministic __cineFrame contract audit
  const hasCineFrame = await page.evaluate(()=>typeof window.__cineFrame==='function');
  if (!hasCineFrame) { console.error('[FAIL] window.__cineFrame missing'); await browser.close(); throw new Error('missing __cineFrame'); }
  await page.evaluate('window.__cineFrame(0)');
  const hashes=[];
  for (let p of [0, Math.floor(FRAMES/2), FRAMES-1]) {
    const d = await page.evaluate(f=>window.__cineFrame(f), p);
    const comma = d.indexOf(',');
    if (comma<0) throw new Error('bad dataUrl at '+p);
    const buf = Buffer.from(d.slice(comma+1),'base64');
    hashes.push({f:p, sha: crypto.createHash('sha256').update(buf).digest('hex').slice(0,16), len: buf.length});
  }
  console.log('sample hashes', JSON.stringify(hashes));
  const moving = new Set(hashes.map(h=>h.sha)).size > 1;
  console.log(moving ? '[PASS] __cineFrame animates (hashes differ)' : '[FAIL] __cineFrame NOT animating (hashes equal)');

  const outPath = OUT;
  // deterministic encode 60fps fixed — image2pipe → libx264 preset medium crf 12 yuv420p lanczos bt709 g 60
  const args = [
    '-y',
    '-f','image2pipe','-r','60','-i','-',
    '-c:v','libx264','-preset','medium','-crf','12',
    '-pix_fmt','yuv420p',
    '-vf','scale=1920:1080:flags=lanczos,format=yuv420p',
    '-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',
    '-g','60','-bf','0',
    '-r','60',
    '-movflags','+faststart',
    '-b:v','6000k','-maxrate','6000k','-bufsize','6000k',
    outPath
  ];
  console.log('ffmpeg', FFMPEG, args.join(' '));
  const ff = spawn(FFMPEG, args, { stdio:['pipe','pipe','pipe'] });
  let ffErr='';
  ff.stderr.on('data',d=>{ ffErr+=d.toString(); const s=d.toString(); if(s.includes('frame=')) process.stdout.write(s.slice(-120)); });
  ff.on('error', e=>{ console.error('ffmpeg spawn error',e); process.exit(1); });
  const t0=Date.now();
  for(let i=0;i<FRAMES;i++){
    const b64 = await page.evaluate(f=>window.__cineFrame(f), i);
    const comma = b64.indexOf(',');
    if (comma<0) throw new Error('bad dataUrl at '+i);
    const b = Buffer.from(b64.slice(comma+1),'base64');
    const ok = ff.stdin.write(b);
    if(!ok) await new Promise(r=>ff.stdin.once('drain',r));
    if(i%60===0 || i===FRAMES-1){
      const el=(Date.now()-t0)/1000;
      const fps = el>0 ? ((i+1)/el).toFixed(1) : '—';
      const eta= i>0 ? (el/(i+1))*(FRAMES-i-1) : 0;
      console.log(`  frame ${i+1}/${FRAMES} ${el.toFixed(1)}s ${fps} fps eta ${eta.toFixed(0)}s ${b.length} bytes`);
    }
  }
  ff.stdin.end();
  await new Promise((res,rej)=>{
    ff.on('close', code=>{
      if(code===0) res(); else rej(new Error(`ffmpeg exit ${code}\n${ffErr.slice(-4000)}`));
    });
  });
  await browser.close();
  return {FRAMES, meta, hashes, outPath, moving};
}

let result;
try {
  result = await renderOnce(URL);
} catch(e) {
  console.log(`primary URL failed: ${e.message} — trying fallback ${FALLBACK_URL}`);
  result = await renderOnce(FALLBACK_URL);
}
const st=fs.statSync(result.outPath);
console.log(`DONE ${result.outPath} ${(st.size/1024/1024).toFixed(2)} MB ${result.FRAMES} frames`);
try {
  // keep hq copy if OUT is not hq
  if (result.outPath !== HQ) {
    fs.copyFileSync(result.outPath, HQ);
    console.log(`HQ copy ${HQ} ${(fs.statSync(HQ).size/1024/1024).toFixed(2)} MB`);
  }
} catch(e){ console.log('hq copy err', e.message); }
try{
  console.log(execSync(`${JSON.stringify(FFMPEG)} -v error -i ${JSON.stringify(result.outPath)} 2>&1 | head -30`,{encoding:'utf8'}).slice(0,2000));
}catch(e){ console.log('probe via ffmpeg -i', (e.stdout||e.stderr||e.message||'').toString().slice(0,2000)); }
try{
  const dec = execSync(`${JSON.stringify(FFMPEG)} -v error -i ${JSON.stringify(result.outPath)} -f null - 2>&1`,{encoding:'utf8',timeout:120000}).trim();
  console.log(dec ? `[FAIL] decode ${dec.slice(0,800)}` : '[PASS] decode clean');
}catch(e){
  const out=((e.stdout||'')+(e.stderr||'')+(e.message||'')).toString().trim().slice(0,2000);
  console.log(out.includes('error')||out.includes('Invalid') ? `[FAIL] decode ${out.slice(0,800)}` : `[WARN] decode exit ${out.slice(0,800)}`);
}
// poster at 00:00:05 for 10s clip (00:00:35 for longer clips — not dark frame)
try{
  const poster = path.join(process.cwd(), 'docs/shop-cine-10s.poster.jpg');
  const ss = result.FRAMES >= 2100 ? '00:00:35' : '00:00:05';
  execSync(`${JSON.stringify(FFMPEG)} -y -ss ${ss} -i ${JSON.stringify(result.outPath)} -vframes 1 -q:v 2 ${JSON.stringify(poster)} 2>&1`,{encoding:'utf8',timeout:15000});
  console.log(`poster ${poster} ${(fs.statSync(poster).size/1024).toFixed(1)} KB @${ss}`);
}catch(e){ console.log('poster err', e.message.slice(0,600)); }
// final size cap check 12M
const cap = 12*1024*1024;
console.log(st.size <= cap ? `[PASS] size <=12M ${(st.size/1024/1024).toFixed(2)} MB` : `[FAIL] size >12M ${(st.size/1024/1024).toFixed(2)} MB cap 12M`);
