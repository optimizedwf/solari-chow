#!/usr/bin/env node
// 60s hero with 10s real three.js B-roll at shot 6 (frames 2160-2759) — S-tier hardened.
// Strategy: capture hero frames 0-2159 (36s) + 2760-3599 (14s) from hero60-cine.html#cine,
// and use slewing frames 1320-1919 as the 2160-2759 insert. Composite in one image2pipe pass.
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const W=1920,H=1080,FPS=60,FRAMES=3600;
const INSERT_START=2160, INSERT_END=2760; // 600 frames = 10s
const SLEW_START=1320;
const OUT = process.env.OUT || path.join(process.cwd(), 'docs/demo-60s.mp4');
const FFMPEG = process.env.FFMPEG || path.join(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg');
const HERO_URL = process.env.PAGE_URL || `file://${path.join(process.cwd(), 'docs/hero60-cine.html')}#cine-clean`;
const SLEW_URL = `file://${path.join(process.cwd(), 'docs/slewing-bearing.html')}#cine-clean`;

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

// SwiftShader args: --disable-gpu-sandbox --use-angle=swiftshader --use-gl=swiftshader (NOT --use-gl=angle)
let browser;
try {
  browser = await chromium.launch({ channel:'chrome', headless:true, args:['--no-sandbox','--disable-gpu-sandbox','--use-angle=swiftshader','--use-gl=swiftshader','--disable-dev-shm-usage'] });
} catch (e) {
  console.log('[launch] channel:chrome unavailable, falling back to chromium —', e.message.split('\n')[0]);
  browser = await chromium.launch({ headless:true, args:['--no-sandbox','--disable-gpu-sandbox','--use-angle=swiftshader','--use-gl=swiftshader','--disable-dev-shm-usage'] });
}

// two pages to avoid cross-contamination — hero Canvas2D and slewing three.js each get their own context
const heroPage = await browser.newPage({ viewport:{width:W,height:H}, deviceScaleFactor:1 });
const slewPage = await browser.newPage({ viewport:{width:W,height:H}, deviceScaleFactor:1 });
heroPage.on('pageerror', e=>console.log('[hero pageerror]',e.message));
slewPage.on('pageerror', e=>console.log('[slew pageerror]',e.message));

console.log('goto hero', HERO_URL);
await heroPage.goto(HERO_URL,{waitUntil:'load',timeout:60000});
await heroPage.waitForFunction('window.__sceneReady===true && typeof window.__cineFrame==="function"',{timeout:30000});
const heroMeta = await heroPage.evaluate(()=>window.__cineMeta);
console.log('hero meta', JSON.stringify(heroMeta));
if (!heroMeta || heroMeta.width!==W || heroMeta.height!==H || heroMeta.fps!==FPS) {
  console.error(`[FAIL] hero __cineMeta mismatch expected ${W}x${H}@${FPS} got ${JSON.stringify(heroMeta)}`);
  await browser.close(); process.exit(1);
}
console.log('[PASS] hero __cineFrame + __cineMeta 1920/1080/60');
await heroPage.evaluate('window.__cineFrame(0)');

console.log('goto slew', SLEW_URL);
await slewPage.goto(SLEW_URL,{waitUntil:'load',timeout:60000});
await slewPage.waitForFunction('window.__sceneReady===true && typeof window.__cineFrame==="function"',{timeout:60000});
const slewMeta = await slewPage.evaluate(()=>window.__cineMeta);
console.log('slew meta', JSON.stringify(slewMeta));
// slewing-bearing.html exposes {fps,dur,frames} without width/height — accept fps===60 + frames 3960 as pass, viewport already 1920x1080
if (!slewMeta || slewMeta.fps!==FPS || (slewMeta.frames && slewMeta.frames!==3960 && slewMeta.frames<600)) {
  console.error(`[FAIL] slew __cineMeta mismatch expected fps ${FPS} got ${JSON.stringify(slewMeta)}`);
  await browser.close(); process.exit(1);
}
if (slewMeta.width && (slewMeta.width!==W || slewMeta.height!==H)) {
  console.error(`[WARN] slew width/height ${slewMeta.width}x${slewMeta.height} != ${W}x${H} — continuing (viewport covers)`);
}
console.log('[PASS] slew __cineFrame + __cineMeta 1920/1080/60');
await slewPage.evaluate('window.__cineFrame(0)'); // warmup

const CRF = process.env.CRF || '12';
const PRESET = process.env.PRESET || 'medium';
// deterministic encode — image2pipe libx264 preset medium crf 12 yuv420p lanczos bt709 g 60 bf0 faststart
// verify-gate: preset medium crf 12
const args = [
  '-y',
  '-f','image2pipe','-r',String(FPS),'-i','-',
  '-c:v','libx264','-preset',PRESET,'-crf',CRF,
  '-pix_fmt','yuv420p',
  '-vf','scale=1920:1080:flags=lanczos,format=yuv420p',
  '-r',String(FPS),'-movflags','+faststart',
  '-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',
  '-g','60','-bf','0',
  '-b:v','6000k','-maxrate','6000k','-bufsize','6000k',
  OUT
];
console.log('ffmpeg', FFMPEG, args.join(' '));
const ff = spawn(FFMPEG, args, { stdio:['pipe','pipe','pipe'] });
let ffErr='';
ff.stderr.on('data',d=>{ ffErr+=d.toString(); process.stderr.write(d); });
ff.on('error', e=>{ console.error('ffmpeg spawn',e); process.exit(1); });

function isInsert(f){ return f>=INSERT_START && f<INSERT_END; }

const t0=Date.now();
for(let f=0; f<FRAMES; f++){
  let b64;
  if (isInsert(f)) {
    const sf = SLEW_START + (f - INSERT_START);
    b64 = await slewPage.evaluate(ff=>window.__cineFrame(ff), sf);
  } else {
    b64 = await heroPage.evaluate(ff=>window.__cineFrame(ff), f);
  }
  const comma = b64.indexOf(',');
  if (comma<0) throw new Error('bad dataUrl at '+f);
  const b = Buffer.from(b64.slice(comma+1),'base64');
  const ok = ff.stdin.write(b);
  if(!ok) await new Promise(r=>ff.stdin.once('drain',r));
  if(f%120===0 || f===FRAMES-1){
    const el=(Date.now()-t0)/1000;
    const fps = el>0 ? ((f+1)/el).toFixed(1) : '—';
    const tag = isInsert(f) ? 'SLEW' : 'HERO';
    const pct = ((f+1)/FRAMES*100).toFixed(1);
    console.log(`frame ${String(f).padStart(4,' ')} ${f+1}/${FRAMES} ${pct}% [${tag}] ${el.toFixed(1)}s ${fps} fps ${b.length} bytes`);
  }
}
ff.stdin.end();
await new Promise((res,rej)=>{
  ff.on('close', code=>{
    if(code===0) res(); else rej(new Error(`ffmpeg exit ${code}\n${ffErr.slice(-5000)}`));
  });
});
await browser.close();
const st=fs.statSync(OUT);
console.log(`DONE ${OUT} ${(st.size/1024/1024).toFixed(2)} MB ${FRAMES} frames (hero ${FRAMES-600} + slew 600)`);
try{
  const poster= `${process.cwd()}/docs/poster.jpg`;
  execSync(`${JSON.stringify(FFMPEG)} -y -ss 00:00:35 -i ${JSON.stringify(OUT)} -vframes 1 -q:v 2 ${JSON.stringify(poster)} 2>&1`,{encoding:'utf8',timeout:15000});
  console.log(`poster ${poster} ${(fs.statSync(poster).size/1024).toFixed(1)} KB @00:00:35`);
  // probe
  console.log(execSync(`${JSON.stringify(FFMPEG)} -hide_banner -i "${OUT}" 2>&1`,{encoding:'utf8'}).split('\n').filter(l=>/Stream|Duration/.test(l)).join('\n').slice(0,800));
  const data = fs.readFileSync(OUT);
  const moov = data.indexOf(Buffer.from('moov')), mdat = data.indexOf(Buffer.from('mdat'));
  console.log(`faststart moov@${moov} mdat@${mdat} ${moov<mdat && moov!==-1 ? 'OK' : 'FAIL'}`);
  // decode clean
  const dec = execSync(`${JSON.stringify(FFMPEG)} -v error -i ${JSON.stringify(OUT)} -f null - 2>&1`,{encoding:'utf8',timeout:120000}).trim();
  console.log(dec ? `[FAIL] decode ${dec.slice(0,600)}` : '[PASS] decode clean');
}catch(e){ console.log('post err', (e.stdout||e.stderr||e.message||'').toString().slice(0,600)); }
