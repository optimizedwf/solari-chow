// grab-frames.mjs — pull single frames from the cine pages for eyeball QA (fix -> grab -> Read -> fix).
import { chromium } from 'playwright';
import fs from 'node:fs';

const REPO = '/Users/adam26/.zcode/workspace/default/solari-chow';
const OUT = '/tmp/hero-check';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu'] });

// hero60 fixed scenes: t=2s(120) title, t=12s(720) fleet, t=38s(2280) insert window (hero frame there is slew), t=58s(3480) CTA
const hero = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await hero.goto(`file://${REPO}/docs/hero60-cine.html#cine`, { waitUntil: 'load', timeout: 60000 });
await hero.waitForFunction('window.__sceneReady===true && typeof window.__cineFrame==="function"', { timeout: 30000 });
for (const f of [120, 720, 1500, 2280, 3480]) {
  const b64 = await hero.evaluate(ff => window.__cineFrame(ff), f);
  fs.writeFileSync(`${OUT}/hero-f${f}.jpg`, Buffer.from(b64.slice(b64.indexOf(',') + 1), 'base64'));
  console.log('hero frame', f);
}

// slewing clean mode: sample 1320 (insert start), 1600 (mid), 1900 (end)
const slew = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await slew.goto(`file://${REPO}/docs/slewing-bearing.html#cine-clean`, { waitUntil: 'load', timeout: 60000 });
await slew.waitForFunction('window.__sceneReady===true && typeof window.__cineFrame==="function"', { timeout: 60000 });
console.log('slew meta', JSON.stringify(await slew.evaluate(() => window.__cineMeta)));
for (const f of [1320, 1600, 1900]) {
  const b64 = await slew.evaluate(ff => window.__cineFrame(ff), f);
  fs.writeFileSync(`${OUT}/slew-f${f}.jpg`, Buffer.from(b64.slice(b64.indexOf(',') + 1), 'base64'));
  console.log('slew frame', f);
}
await browser.close();
console.log('DONE', fs.readdirSync(OUT).join(' '));
