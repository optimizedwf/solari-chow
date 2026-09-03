#!/usr/bin/env node
// 10s B-roll from slewing-bearing.html#cine — 22s-32s dolly+macro segment (frames 1320-1919, 600 @60fps)
// GPU-accelerated: --use-gl=angle --use-angle=gl gives ~11 fps vs 0.3 fps software.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const W=1920,H=1080,FPS=60;
const START=1320, COUNT=600;
const OUT = process.env.OUT || path.join(process.cwd(), 'docs/slewing-cine-10s.mp4');
const FFMPEG = process.env.FFMPEG || path.join(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg');
const PAGE = process.env.PAGE_URL || `file://${path.join(process.cwd(), 'docs/slewing-bearing.html')}#cine-clean`;

if (!fs.existsSync(FFMPEG)) { console.error('ffmpeg not found',FFMPEG); process.exit(1); }

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist','--enable-gpu'] });
const page = await browser.newPage({ viewport:{width:W,height:H}, deviceScaleFactor:1 });
page.on('pageerror', e=>console.log('[pageerror]',e.message));
console.log('goto',PAGE);
await page.goto(PAGE,{waitUntil:'load',timeout:60000});
await page.waitForFunction('window.__sceneReady===true && typeof window.__cineFrame==="function"',{timeout:60000});
const meta = await page.evaluate(()=>window.__cineMeta);
console.log('meta',JSON.stringify(meta));
await page.evaluate('window.__cineFrame(0)'); // shader warmup
console.log(`capturing ${COUNT} frames ${START}..${START+COUNT-1} @${FPS}fps → ${OUT}`);

const args = [
  '-y',
  '-f','image2pipe','-r',String(FPS),'-i','-',
  '-c:v','libx264','-preset','medium','-crf','12',
  '-pix_fmt','yuv420p',
  '-vf','scale=1920:1080:flags=lanczos,format=yuv420p',
  '-r',String(FPS),
  '-movflags','+faststart',
  '-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',
  '-g','60','-bf','0',
  OUT
];
console.log('ffmpeg', FFMPEG, args.join(' '));
const ff = spawn(FFMPEG, args, { stdio:['pipe','pipe','pipe'] });
let ffErr='';
ff.stderr.on('data',d=>{ ffErr+=d.toString(); });
ff.on('error', e=>{ console.error('ffmpeg spawn error',e); process.exit(1); });

const t0=Date.now();
for(let idx=0; idx<COUNT; idx++){
  const f = START + idx;
  const b64 = await page.evaluate(ff=>window.__cineFrame(ff), f);
  const b = Buffer.from(b64.slice(b64.indexOf(',')+1),'base64');
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
import { execSync } from 'node:child_process';
try{
  console.log(execSync(`${JSON.stringify(FFMPEG)} -v error -show_entries stream=codec_name,width,height,pix_fmt,avg_frame_rate,duration -of default=nw=1 "${OUT}" 2>&1`,{encoding:'utf8'}).slice(0,800));
}catch(e){ console.log('verify err', e.message.slice(0,800)); }
