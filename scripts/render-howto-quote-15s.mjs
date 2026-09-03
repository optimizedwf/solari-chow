#!/usr/bin/env node
// render-howto-quote-15s.mjs — 15s dumb-proof: shop quote upload → hash → DFM → price
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const W=1920,H=1080,FPS=60;
const OUT = path.join(process.cwd(), 'docs/howto-quote-15s.mp4');
const FFMPEG = path.join(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg');
const TMPDIR = path.join(os.tmpdir(), 'howto-quote-rec');
fs.mkdirSync(TMPDIR, { recursive:true });
for (const f of fs.readdirSync(TMPDIR)) try{fs.unlinkSync(path.join(TMPDIR,f));}catch{}
fs.mkdirSync(path.dirname(OUT), { recursive:true });
if (!fs.existsSync(FFMPEG)) { console.error('ffmpeg not found',FFMPEG); process.exit(1); }

const SHOP = 'http://127.0.0.1:8091/shop.html';
const tmpStep = path.join(os.tmpdir(), 'demo-bracket-6205.step');
// minimal STEP-like content with manifold marker not NON_MANIFOLD
fs.writeFileSync(tmpStep, 'ISO-10303-21;\nHEADER; FILE_DESCRIPTION(("6205 bracket demo"),"2;1"); ENDSEC; DATA; #1=MANIFOLD_SOLID_BREP("",#2); ENDSEC; END-ISO-10303-21;\n');

const browser = await chromium.launch({ headless:true, args:['--no-sandbox','--disable-gpu-sandbox','--use-angle=swiftshader','--use-gl=swiftshader'] });
const ctx = await browser.newContext({ viewport:{width:W,height:H}, deviceScaleFactor:1, recordVideo:{dir:TMPDIR, size:{width:W,height:H}} });
const page = await ctx.newPage();
page.on('pageerror', e=>console.log('[pageerror]',e.message));
console.log('goto shop', SHOP);
await page.goto(SHOP, {waitUntil:'load',timeout:60000});
await page.waitForTimeout(900);
// scroll to quote panel
await page.evaluate(()=>{ const el=document.getElementById('quotePanel'); if(el) el.scrollIntoView({behavior:'instant', block:'center'}); });
await page.waitForTimeout(700);
// highlight the upload drop zone
await page.evaluate(()=>{ const d=document.getElementById('shopDrop'); if(d){ d.style.outline='2px solid #20b8cd'; d.style.outlineOffset='3px'; }});
await page.waitForTimeout(600);
// choose file via hidden input
const fileInput = page.locator('#qFileShop');
await fileInput.setInputFiles(tmpStep);
await page.waitForTimeout(1100);
let hash='';
try{ hash = await page.locator('#qFileHashShop').textContent({timeout:3000}); }catch{}
console.log('hash', hash?.trim());
let dfm='';
try{ dfm = await page.locator('#shopDfmCard').textContent({timeout:3000}); }catch{}
console.log('dfm', dfm?.slice(0,120));
await page.waitForTimeout(600);
// tweak qty to show live price math
const qty = page.locator('#qQty');
try{
  const box = await qty.boundingBox();
  if(box){
    await page.mouse.move(box.x+box.width*0.35, box.y+box.height/2);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width*0.72, box.y+box.height/2, {steps: 14});
    await page.waitForTimeout(180);
    await page.mouse.up();
  }
}catch(e){ console.log('qty drag err', e.message.slice(0,200)); }
await page.waitForTimeout(500);
let price='';
try{ price = await page.locator('#qPrice').textContent({timeout:2000}); }catch{}
console.log('price', price?.trim());
await page.waitForTimeout(700);
// scroll to show DFM card fully
await page.evaluate(()=>{ const c=document.getElementById('shopDfmCard'); if(c) c.scrollIntoView({behavior:'instant', block:'center'}); });
await page.waitForTimeout(900);
// remove outline for clean end
await page.evaluate(()=>{ const d=document.getElementById('shopDrop'); if(d) d.style.outline=''; });
await page.waitForTimeout(600);

await ctx.close();
await browser.close();
try{ fs.unlinkSync(tmpStep); }catch{}

const recFiles = fs.readdirSync(TMPDIR).filter(f=>f.endsWith('.webm'));
console.log('recorded', recFiles);
if(recFiles.length===0){ console.error('no webm recorded'); process.exit(1); }
const src = path.join(TMPDIR, recFiles[0]);
console.log(`src ${src} ${(fs.statSync(src).size/1024/1024).toFixed(2)} MB`);

const args = [
  '-y','-i',src,
  '-vf','scale=1920:1080:flags=lanczos,fps=60,format=yuv420p',
  '-c:v','libx264','-preset','medium','-crf','12',
  '-pix_fmt','yuv420p','-r','60','-g','60','-bf','0',
  '-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',
  '-movflags','+faststart', OUT
];
console.log('ffmpeg', FFMPEG, args.join(' '));
try{
  const out = execSync(`${JSON.stringify(FFMPEG)} ${args.map(a=>JSON.stringify(a)).join(' ')} 2>&1`, {encoding:'utf8',timeout:120000});
  console.log(out.slice(-2200));
}catch(e){
  console.log((e.stdout||e.stderr||e.message||'').toString().slice(-4200));
  if(!fs.existsSync(OUT)) process.exit(1);
}
if(fs.existsSync(OUT)){
  const st=fs.statSync(OUT);
  console.log(`DONE ${OUT} ${(st.size/1024/1024).toFixed(2)} MB`);
  try{
    console.log(execSync(`${JSON.stringify(FFMPEG)} -v error -i ${JSON.stringify(OUT)} 2>&1 | head -30`,{encoding:'utf8'}).slice(0,2000));
    const dec = execSync(`${JSON.stringify(FFMPEG)} -v error -i ${JSON.stringify(OUT)} -f null - 2>&1`,{encoding:'utf8',timeout:60000}).trim();
    console.log(dec ? `[FAIL] decode ${dec.slice(0,800)}` : '[PASS] decode clean');
  }catch(e){ console.log('probe/decode err', (e.stdout||e.stderr||e.message||'').toString().slice(0,2200)); }
}
