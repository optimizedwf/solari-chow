#!/usr/bin/env node
// Stream JPEGs from Playwright directly into ffmpeg stdin (no /tmp JPEG explosion)
// Uses upstream playwright (NOT patchright-core which blocks inline JS)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const W=1920,H=1080,FPS=60,FRAMES=3600;
const PAGE = process.env.PAGE_URL || `http://127.0.0.1:9876/docs/hero60-cine.html#cine`;
const OUT = process.env.OUT || `${process.cwd()}/docs/demo-60s.mp4`;
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
// Raising quality to CRF12 preset medium (was CRF16 slow) + filler CBR yields ~55MB target at 60s.
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
