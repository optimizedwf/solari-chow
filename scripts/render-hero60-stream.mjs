#!/usr/bin/env node
// Stream JPEGs from Playwright directly into ffmpeg stdin (no /tmp JPEG explosion)
// Uses upstream playwright (NOT patchright-core which blocks inline JS)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const W=1920,H=1080,FPS=60,FRAMES=3600;
const PAGE = process.env.PAGE_URL || `http://127.0.0.1:9876/docs/hero60-cine.html#cine`;
// Default to the UNCAPPED master (mirrors render-hero60-cine.mjs:13). docs/demo-60s.mp4 is the
// TRACKED ship artifact, capped at 15 MiB by scripts/verify-video.mjs — and the default CRF12
// encode lands ~14.9 MiB, i.e. within ~1% of that cap. A raw encode must never target it.
const OUT = process.env.OUT || `${process.cwd()}/docs/demo-60s.hq.mp4`;
const FFMPEG = process.env.FFMPEG || `${process.cwd()}/node_modules/ffmpeg-static/ffmpeg`;

if (!fs.existsSync(FFMPEG)) { console.error('ffmpeg not found',FFMPEG); process.exit(1); }
if (FRAMES%FPS!==0) console.warn('FRAMES not multiple of FPS');

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{width:W,height:H}, deviceScaleFactor:1 });
page.on('pageerror', e=>console.log('[pageerror]',e.message));
console.log('goto',PAGE);
await page.goto(PAGE,{waitUntil:'load',timeout:60000});
await page.waitForFunction('window.__sceneReady===true && typeof window.__cineFrame==="function"',{timeout:30000});
const meta = await page.evaluate(()=>window.__cineMeta);
console.log('meta',JSON.stringify(meta));
await page.evaluate('for(let i=0;i<4;i++) window.__cineFrame(i)');

// Bitrate/bpp: 1920*1080*60*~6000kbps => bpp ~0.048-0.06 (6000kbit/s / (1920*1080*60) ≈ 0.048).
// CRF12 preset medium + filler CBR is a QUALITY setting, not a size target: BV/MAXRATE are a VBV
// *ceiling*, so the default encode measures ~2079 kb/s ≈ 14.9 MiB at 60s (CRF governs, not 6000k).
// That is inside the 15 MiB ship cap but only barely — derive the ship file from the hq master
// with the two-pass ABR recipe in docs/publish.md §6 rather than encoding straight to it.
// Env overrides still work: CRF=12 PRESET=medium BV=6000k MAXRATE=6000k NALHRD=cbr
const CRF_ENV = process.env.CRF;
const CRF = CRF_ENV === undefined ? '12' : CRF_ENV;
const USE_CRF = CRF !== '' && CRF.toLowerCase() !== 'none' && CRF.toLowerCase() !== 'off';
const PRESET = process.env.PRESET || 'medium';
const MAXRATE = process.env.MAXRATE || '6000k';
const BUFSIZE = process.env.BUFSIZE || '6000k';
const BV = process.env.BV || '6000k';
const NALHRD = process.env.NALHRD || 'cbr';

const args = [
  '-y',
  '-f','image2pipe','-r',String(FPS),'-i','-',
  '-c:v','libx264','-preset',PRESET,...(USE_CRF ? ['-crf', CRF] : []),
  '-pix_fmt','yuv420p',
  '-vf','scale=1920:1080:flags=lanczos,format=yuv420p',
  '-r',String(FPS),'-movflags','+faststart',
  '-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',
  ...(BV ? ['-b:v', BV] : []),
  ...(MAXRATE ? ['-maxrate', MAXRATE, '-bufsize', BUFSIZE || MAXRATE] : []),
  ...(NALHRD ? ['-nal-hrd', NALHRD] : []),
  ...(process.env.X264PARAMS ? ['-x264-params', process.env.X264PARAMS] : []),
  OUT
];
console.log('ffmpeg', FFMPEG, args.join(' '));
const ff = spawn(FFMPEG, args, { stdio:['pipe','pipe','pipe'] });
let ffErr='';
ff.stderr.on('data',d=>{ ffErr+=d.toString(); process.stderr.write(d); });
ff.on('error', e=>{ console.error('ffmpeg spawn error',e); process.exit(1); });

const t0=Date.now();
for(let f=0; f<FRAMES; f++){
  const b64 = await page.evaluate(ff=>window.__cineFrame(ff), f);
  const b = Buffer.from(b64.slice(b64.indexOf(',')+1),'base64');
  const ok = ff.stdin.write(b);
  if(!ok) await new Promise(r=>ff.stdin.once('drain',r));
  if(f%120===0 || f===FRAMES-1){
    const el=(Date.now()-t0)/1000;
    const eta=f>0 ? (el/f)*(FRAMES-f) : 0;
    console.log(`frame ${f} ${f+1}/${FRAMES} ${el.toFixed(1)}s eta ${eta.toFixed(0)}s ${b.length} bytes`);
  }
}
ff.stdin.end();
await new Promise((res,rej)=>{
  ff.on('close', code=>{
    if(code===0) res(); else rej(new Error(`ffmpeg exit ${code}\n${ffErr.slice(-2000)}`));
  });
});
await browser.close();
const st=fs.statSync(OUT);
console.log(`DONE ${OUT} ${(st.size/1024/1024).toFixed(2)} MB ${FRAMES} frames`);
// Ship-path guard — docs/demo-60s.mp4 is the TRACKED artifact and must stay inside the
// repo weight cap (>5 MiB, <=15 MiB — mirrors scripts/verify-video.mjs:43-45). The hq
// master written by default has no such cap. Mirrors render-hero60-cine.mjs:133-144.
const SHIP = path.join(process.cwd(), 'docs/demo-60s.mp4');
if (path.resolve(OUT) === path.resolve(SHIP)) {
  const MIN = 5 * 1024 * 1024, MAX = 15 * 1024 * 1024;
  if (st.size <= MIN || st.size > MAX) {
    console.error(`[FAIL] ship artifact ${SHIP} is ${st.size} bytes (${(st.size/1024/1024).toFixed(2)} MB) — must be >${MIN} and <=${MAX} bytes`);
    process.exit(1);
  }
  console.log(`[PASS] ship artifact ${st.size} bytes (${(st.size/1024/1024).toFixed(2)} MB) within (${MIN}, ${MAX}]`);
}
// poster extraction — faststart MP4 is seekable immediately after encode (JPEG 0.97 input already handled)
try{
  const poster= `${process.cwd()}/docs/poster.jpg`;
  const { execSync: ex } = await import('node:child_process');
  ex(`${JSON.stringify(FFMPEG)} -y -ss 00:00:01 -i ${JSON.stringify(OUT)} -vframes 1 -q:v 2 ${JSON.stringify(poster)} 2>&1`,{encoding:'utf8',timeout:15000});
  console.log(`poster ${poster} ${(fs.statSync(poster).size/1024).toFixed(1)} KB`);
}catch(e){ console.log('poster extraction skipped:', e.message.slice(0,400)); }
// verify
const { execSync } = await import('node:child_process');
try{
  console.log(execSync(`${FFMPEG} -v error -select_streams v:0 -show_entries stream=codec_name,width,height,avg_frame_rate,pix_fmt,duration -of default=nw=1 "${OUT}" 2>&1`,{encoding:'utf8'}).slice(0,600));
  console.log(execSync(`${JSON.stringify(FFMPEG)} -v error -i "${OUT}" -lavfi signalstats -f null - 2>&1 | tail -n 20`,{encoding:'utf8',timeout:120000}).slice(0,800));
}catch(e){ console.log('ffprobe err', e.message.slice(0,800)); }
