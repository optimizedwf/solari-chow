#!/usr/bin/env node
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const W=1920,H=1080,FPS=60;
const OUT = path.join(process.cwd(), 'docs/howto-setup-30s.mp4');
const ALT = path.join(process.cwd(), 'docs/flow-demo.mp4');
const FFMPEG = path.join(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg');
const TMPDIR = '/tmp/howto-setup-rec';
fs.mkdirSync(TMPDIR, { recursive:true });
for (const f of fs.readdirSync(TMPDIR)) try{fs.unlinkSync(path.join(TMPDIR,f));}catch{}
fs.mkdirSync(path.dirname(OUT), { recursive:true });
if (!fs.existsSync(FFMPEG)) { console.error('ffmpeg not found',FFMPEG); process.exit(1); }

const HERO = 'http://127.0.0.1:8091/docs/hero.html';
const SETUP = 'http://127.0.0.1:8091/docs/setup.html?funnel=bring';
const SHOP = 'http://127.0.0.1:8091/shop.html';

const browser = await chromium.launch({ headless:true, args:['--no-sandbox','--disable-gpu-sandbox','--use-angle=swiftshader','--use-gl=swiftshader'] });
const ctx = await browser.newContext({
  viewport:{width:W,height:H},
  deviceScaleFactor:1,
  recordVideo:{dir:TMPDIR, size:{width:W,height:H}}
});
const page = await ctx.newPage();
page.on('pageerror', e=>console.log('[pageerror]',e.message));
// mock Solari validate so video shows "Ready — key valid" without real key
await page.route('https://api.getsolari.com/templates', async route=>{
  await route.fulfill({ status:200, contentType:'application/json', body:'{}' });
});
await page.route('https://api.getsolari.com/sandboxes', async route=>{
  await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ sandboxId:'storefront_howto30' }) });
});
await page.route('https://api.getsolari.com/sandboxes/*/ports/3000', async route=>{
  const url = route.request().url();
  if(url.includes('/ports/3000')){
    await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ url:'https://acme-precision-3000.sandbox.getsolari.app?token=demo' }) });
  } else await route.continue();
});

console.log('goto hero', HERO);
await page.goto(HERO, {waitUntil:'load',timeout:60000});
await page.waitForTimeout(1000);
for(let i=0;i<2;i++){ await page.mouse.wheel(0, 380); await page.waitForTimeout(320); }
await page.waitForTimeout(600);
// click Start here CTA to setup
const cta = page.locator('a.cta[href*="setup.html"]').first();
try{ await cta.waitFor({timeout:3000}); await cta.click(); await page.waitForTimeout(800); }catch(e){ console.log('cta click fallback goto setup'); }
if(!page.url().includes('setup.html')){
  console.log('direct goto setup', SETUP);
  await page.goto(SETUP, {waitUntil:'load',timeout:60000});
}
await page.waitForTimeout(800);
console.log('on setup', page.url());
// step 1: type shop name
const inp = page.locator('#shopName');
await inp.waitFor({timeout:10000});
await inp.click();
await page.waitForTimeout(180);
await inp.press('Meta+A');
await page.waitForTimeout(80);
await inp.press('Backspace');
await page.waitForTimeout(140);
await page.keyboard.type('My Buddy Shop', {delay: 88});
await page.waitForTimeout(700);
let preview='';
try{ preview = await page.locator('#domainPreview').textContent({timeout:3000}); }catch{}
console.log('domainPreview', preview?.trim());
await page.waitForTimeout(500);
await page.evaluate(()=>window.scrollTo({top: 560, behavior:'instant'}));
await page.waitForTimeout(450);
// step 2: paste key
const keyIn = page.locator('#apiKey');
await keyIn.waitFor({timeout:5000});
await keyIn.click();
await page.waitForTimeout(180);
await page.keyboard.type('slr_live_placeholder_demo_key_for_video_only', {delay: 22});
await page.waitForTimeout(500);
console.log('typed placeholder key');
await page.locator('#validateBtn').click();
await page.waitForTimeout(900);
let status='';
try{ status = await page.locator('#keyStatus').textContent({timeout:3000}); }catch{}
console.log('keyStatus', status?.trim());
await page.waitForTimeout(800);
// step 3: launch
await page.evaluate(()=>{ const b=document.getElementById('s3'); if(b) b.scrollIntoView({behavior:'instant', block:'center'}); });
await page.waitForTimeout(500);
await page.locator('#launchBtn').click();
await page.waitForTimeout(1100);
let launchDetail='';
try{ launchDetail = await page.locator('#launchDetail').textContent({timeout:3000}); }catch{}
console.log('launchDetail visible', !!launchDetail);
await page.waitForTimeout(800);
for(let i=0;i<2;i++){ await page.mouse.wheel(0, 340); await page.waitForTimeout(320); }
await page.waitForTimeout(700);
console.log('goto shop', SHOP);
await page.goto(SHOP, {waitUntil:'load',timeout:60000});
await page.waitForTimeout(900);
await page.evaluate(()=>window.scrollTo({top:0, behavior:'instant'}));
await page.waitForTimeout(400);
for(let i=0;i<2;i++){ await page.mouse.wheel(0, 360); await page.waitForTimeout(340); }
await page.waitForTimeout(800);
// highlight inbox first RFQ
try{ await page.evaluate(()=>{ const el=document.querySelector('#inboxBody tr'); if(el){ el.style.outline='2px solid #20b8cd'; el.style.outlineOffset='2px'; } }); }catch{}
await page.waitForTimeout(800);

await ctx.close();
await browser.close();

const recFiles = fs.readdirSync(TMPDIR).filter(f=>f.endsWith('.webm'));
console.log('recorded', recFiles);
if(recFiles.length===0){ console.error('no webm recorded'); process.exit(1); }
const src = path.join(TMPDIR, recFiles[0]);
console.log(`src ${src} ${(fs.statSync(src).size/1024/1024).toFixed(2)} MB`);

const args = [
  '-y',
  '-i', src,
  '-vf', 'scale=1920:1080:flags=lanczos,fps=60,format=yuv420p',
  '-c:v','libx264','-preset','medium','-crf','12',
  '-pix_fmt','yuv420p',
  '-r','60',
  '-g','60','-bf','0',
  '-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',
  '-movflags','+faststart',
  OUT
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
  // also refresh flow-demo.mp4 to compliant copy so hero's tiny loop is 1080p60
  try{ fs.copyFileSync(OUT, ALT); console.log(`copied -> ${ALT} ${(st.size/1024/1024).toFixed(2)} MB`);}catch(e){console.log('copy alt fail',e.message)}
  try{
    console.log(execSync(`${JSON.stringify(FFMPEG)} -v error -i ${JSON.stringify(OUT)} 2>&1 | head -30`,{encoding:'utf8'}).slice(0,2000));
    const dec = execSync(`${JSON.stringify(FFMPEG)} -v error -i ${JSON.stringify(OUT)} -f null - 2>&1`,{encoding:'utf8',timeout:60000}).trim();
    console.log(dec ? `[FAIL] decode ${dec.slice(0,800)}` : '[PASS] decode clean');
  }catch(e){ console.log('probe/decode err', (e.stdout||e.stderr||e.message||'').toString().slice(0,2200)); }
}
