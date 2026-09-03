#!/usr/bin/env node
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const W=1920,H=1080,FPS=60;
const OUT = path.join(process.cwd(), 'docs/shop-flow-demo.mp4');
const FFMPEG = path.join(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg');
const TMPDIR = '/tmp/shop-flow-rec';
fs.mkdirSync(TMPDIR, { recursive:true });
for (const f of fs.readdirSync(TMPDIR)) try{fs.unlinkSync(path.join(TMPDIR,f));}catch{}

const HERO = 'http://127.0.0.1:8091/docs/hero.html';
const ONBOARD = 'http://127.0.0.1:8091/onboarding.html?funnel=bring';
const SHOP = 'http://127.0.0.1:8091/shop.html?funnel=bring';

if (!fs.existsSync(FFMPEG)) { console.error('ffmpeg not found',FFMPEG); process.exit(1); }

const browser = await chromium.launch({ headless:true, args:['--no-sandbox'] });
const ctx = await browser.newContext({
  viewport:{width:W,height:H},
  deviceScaleFactor:1,
  recordVideo:{dir:TMPDIR, size:{width:W,height:H}}
});
const page = await ctx.newPage();
page.on('pageerror', e=>console.log('[pageerror]',e.message));
console.log('goto hero', HERO);
await page.goto(HERO, {waitUntil:'load',timeout:60000});
await page.waitForTimeout(900);
for(let i=0;i<3;i++){ await page.mouse.wheel(0, 420); await page.waitForTimeout(300); }
await page.waitForTimeout(400);
console.log('goto onboarding', ONBOARD);
await page.goto(ONBOARD, {waitUntil:'load',timeout:60000});
await page.waitForTimeout(600);
const inp = page.locator('#shopInput');
await inp.waitFor({timeout:10000});
await inp.click();
await page.waitForTimeout(200);
await inp.press('Meta+A');
await page.waitForTimeout(100);
await inp.press('Backspace');
await page.waitForTimeout(150);
await page.keyboard.type('My Buddy Shop', {delay: 90});
await page.waitForTimeout(600);
const preview = await page.locator('#domainPreview').textContent().catch(()=>'(no preview)');
console.log('domainPreview', preview.trim());
const slugOk = preview.includes('my-buddy-shop');
console.log(slugOk ? '[PASS] slug live my-buddy-shop' : `[WARN] slug not my-buddy-shop preview=${preview}`);
await page.waitForTimeout(400);
await page.evaluate(()=>window.scrollTo({top: 600, behavior:'instant'}));
await page.waitForTimeout(400);
for(let i=0;i<2;i++){ await page.mouse.wheel(0, 380); await page.waitForTimeout(350); }
await page.waitForTimeout(300);
let inboxText='';
try{
  inboxText = await page.locator('text=#').first().textContent({timeout:3000});
  console.log('inbox sample', inboxText.slice(0,80));
}catch(e){ console.log('inbox locate err', e.message.slice(0,200)); }
await page.waitForTimeout(300);
const be = page.locator('#breakEven');
try{ await be.waitFor({timeout:3000}); }catch{}
await page.evaluate(()=>{ const b=document.getElementById('breakEven'); if(b){ if(b.tagName.toLowerCase()==='details') b.open=true; b.scrollIntoView({behavior:'instant', block:'center'}); }});
await page.waitForTimeout(500);
const slider = page.locator('[data-be-input="rfqsPerWeek"]');
try{
  await slider.waitFor({timeout:3000});
  const box = await slider.boundingBox();
  if(box){
    await page.mouse.move(box.x+box.width*0.2, box.y+box.height/2);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width*0.85, box.y+box.height/2, {steps: 18});
    await page.waitForTimeout(200);
    await page.mouse.up();
    console.log('[PASS] break-even drag rfqsPerWeek');
  }
}catch(e){ console.log('slider drag err', e.message.slice(0,300)); }
await page.waitForTimeout(400);
const slider2 = page.locator('[data-be-input="winRate"]');
try{
  const box2 = await slider2.boundingBox();
  if(box2){
    await page.mouse.move(box2.x+box2.width*0.35, box2.y+box2.height/2);
    await page.mouse.down();
    await page.mouse.move(box2.x+box2.width*0.75, box2.y+box2.height/2, {steps: 12});
    await page.waitForTimeout(150);
    await page.mouse.up();
    console.log('[PASS] break-even drag winRate');
  }
}catch(e){ console.log('slider2 err', e.message.slice(0,200)); }
await page.waitForTimeout(700);
console.log('goto shop', SHOP);
await page.goto(SHOP, {waitUntil:'load',timeout:60000});
await page.waitForTimeout(900);
for(let i=0;i<2;i++){ await page.mouse.wheel(0, 360); await page.waitForTimeout(350); }
await page.waitForTimeout(500);

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
  '-c:v','libx264','-preset','medium','-crf','18',
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
  console.log(out.slice(-2000));
}catch(e){
  console.log((e.stdout||e.stderr||e.message||'').toString().slice(-4000));
  if(!fs.existsSync(OUT)) process.exit(1);
}
const st=fs.statSync(OUT);
console.log(`DONE ${OUT} ${(st.size/1024/1024).toFixed(2)} MB`);
try{
  console.log(execSync(`${JSON.stringify(FFMPEG)} -v error -i ${JSON.stringify(OUT)} 2>&1 | head -30`,{encoding:'utf8'}).slice(0,2000));
  const dec = execSync(`${JSON.stringify(FFMPEG)} -v error -i ${JSON.stringify(OUT)} -f null - 2>&1`,{encoding:'utf8',timeout:60000}).trim();
  console.log(dec ? `[FAIL] decode ${dec.slice(0,800)}` : '[PASS] decode clean');
}catch(e){ console.log('probe/decode err', (e.stdout||e.stderr||e.message||'').toString().slice(0,2000)); }
