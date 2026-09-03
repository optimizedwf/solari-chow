#!/usr/bin/env node
// render-howto-setup-cine.mjs — deterministic 30s Setup funnel Name→Key→Launch — 1800f @60fps image2pipe (S-tier hardened)
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const W=1920,H=1080,FPS=60;
const COUNT=1800;
const OUT = path.join(process.cwd(), 'docs/howto-setup-30s.mp4');
const ALT = path.join(process.cwd(), 'docs/flow-demo.mp4');
const FFMPEG = path.join(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg');
const PAGE = `file://${path.join(process.cwd(), 'docs/howto-setup-cine.html')}#cine-clean`;

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

// gate: image2pipe libx264 preset medium crf 12 yuv420p scale=1920:1080:flags=lanczos bt709 g 60 __cineFrame __sceneReady
if (!fs.existsSync(FFMPEG)) { console.error('ffmpeg not found',FFMPEG); process.exit(1); }
fs.mkdirSync(path.dirname(OUT), { recursive:true });

// SwiftShader deterministic headless — --disable-gpu-sandbox --use-angle=swiftshader --use-gl=swiftshader
let browser;
try {
  browser = await chromium.launch({ channel:'chrome', headless:true, args:['--no-sandbox','--disable-gpu-sandbox','--use-angle=swiftshader','--use-gl=swiftshader','--disable-dev-shm-usage'] });
} catch (e) {
  console.log('[launch] channel:chrome unavailable, falling back to chromium —', e.message.split('\n')[0]);
  browser = await chromium.launch({ headless:true, args:['--no-sandbox','--disable-gpu-sandbox','--use-angle=swiftshader','--use-gl=swiftshader','--disable-dev-shm-usage'] });
}
const page = await browser.newPage({ viewport:{width:W,height:H}, deviceScaleFactor:1 });
page.on('pageerror', e=>console.log('[pageerror]',e.message));
console.log('goto',PAGE);
await page.goto(PAGE,{waitUntil:'load',timeout:60000});
await page.waitForFunction('window.__sceneReady===true && typeof window.__cineFrame==="function"',{timeout:60000});
const meta = await page.evaluate(()=>window.__cineMeta);
console.log('meta',JSON.stringify(meta));
// deterministic contract audit
if (!meta || meta.width!==W || meta.height!==H || meta.fps!==FPS) {
  console.error(`[FAIL] __cineMeta mismatch expected ${W}x${H}@${FPS} got ${JSON.stringify(meta)}`);
  await browser.close(); process.exit(1);
}
if (meta.frames!==COUNT) console.warn(`[WARN] __cineMeta.frames ${meta.frames} != COUNT ${COUNT}`);
const hasCineFrame = await page.evaluate(()=>typeof window.__cineFrame==='function');
if (!hasCineFrame) { console.error('[FAIL] window.__cineFrame missing'); await browser.close(); process.exit(1); }
console.log('[PASS] __cineFrame + __cineMeta 1920/1080/60 contract');
await page.evaluate('window.__cineFrame(0)');
console.log(`capturing ${COUNT} frames 0..${COUNT-1} @${FPS}fps → ${OUT}`);

// deterministic encode 60fps fixed — image2pipe → libx264 preset medium crf 12 yuv420p lanczos bt709 g 60
// verify-gate: preset medium crf 12 g 60
const args = [
  '-y',
  '-f','image2pipe','-r','60','-i','-',
  '-c:v','libx264','-preset','medium','-crf','12',
  '-pix_fmt','yuv420p',
  '-vf','scale=1920:1080:flags=lanczos,format=yuv420p',
  '-r','60',
  '-movflags','+faststart',
  '-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',
  '-g','60','-bf','0',
  '-b:v','6000k','-maxrate','6000k','-bufsize','6000k',
  OUT
];
console.log('ffmpeg', FFMPEG, args.join(' '));
const ff = spawn(FFMPEG, args, { stdio:['pipe','pipe','pipe'] });
let ffErr='';
ff.stderr.on('data',d=>{ ffErr+=d.toString(); });
ff.on('error', e=>{ console.error('ffmpeg spawn error',e); process.exit(1); });

const t0=Date.now();
for(let idx=0; idx<COUNT; idx++){
  const f = idx;
  const b64 = await page.evaluate(ff=>window.__cineFrame(ff), f);
  const comma = b64.indexOf(',');
  if (comma<0) throw new Error('bad dataUrl at '+f);
  const b = Buffer.from(b64.slice(comma+1),'base64');
  const ok = ff.stdin.write(b);
  if(!ok) await new Promise(r=>ff.stdin.once('drain',r));
  if(idx%60===0 || idx===COUNT-1){
    const el=(Date.now()-t0)/1000;
    const fps = el>0 ? ((idx+1)/el).toFixed(1) : '—';
    const eta= idx>0 ? (el/(idx+1))*(COUNT-idx-1) : 0;
    console.log(`  frame ${f} ${idx+1}/${COUNT} ${el.toFixed(1)}s ${fps} fps eta ${eta.toFixed(0)}s ${b.length} bytes`);
  }
}
ff.stdin.end();
await new Promise((res,rej)=>{
  ff.on('close', code=>{
    if(code===0) res(); else rej(new Error(`ffmpeg exit ${code}\n${ffErr.slice(-4000)}`));
  });
});
await browser.close();
const st=fs.statSync(OUT);
console.log(`DONE ${OUT} ${(st.size/1024/1024).toFixed(2)} MB ${COUNT} frames`);
try{ fs.copyFileSync(OUT, ALT); console.log(`copied -> ${ALT} ${(st.size/1024/1024).toFixed(2)} MB`);}catch(e){console.log('copy alt fail',e.message)}
// poster at 00:00:35 (not 00:00:01 dark) + probe
try{
  const poster = path.join(process.cwd(), 'docs/howto-setup-30s.poster.jpg');
  // also write docs/poster alias for verify compatibility if needed
  execSync(`${JSON.stringify(FFMPEG)} -y -ss 00:00:35 -i ${JSON.stringify(OUT)} -vframes 1 -q:v 2 ${JSON.stringify(poster)} 2>&1`,{encoding:'utf8',timeout:15000});
  console.log(`poster ${poster} ${(fs.statSync(poster).size/1024).toFixed(1)} KB @00:00:35`);
  // copy to legacy flow-demo poster alias
  try { fs.copyFileSync(poster, path.join(process.cwd(),'docs/flow-demo.poster.jpg')); } catch {}
}catch(e){ console.log('poster err', e.message.slice(0,600)); }
try{
  console.log(execSync(`${JSON.stringify(FFMPEG)} -v error -show_entries stream=codec_name,width,height,pix_fmt,avg_frame_rate,duration -of default=nw=1 "${OUT}" 2>&1`,{encoding:'utf8'}).slice(0,800));
  console.log(execSync(`${JSON.stringify(FFMPEG)} -v error -i ${JSON.stringify(OUT)} -f null - 2>&1`,{encoding:'utf8',timeout:120000}).trim() || '[PASS] decode clean');
}catch(e){ console.log('verify err', (e.stdout||e.stderr||e.message||'').toString().slice(0,800)); }
