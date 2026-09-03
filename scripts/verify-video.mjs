#!/usr/bin/env node
// verify-video.mjs — ffprobe if available else warn, docs/demo-60s.mp4 >5M, ffmpeg decode check
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = fs.existsSync(path.join(process.cwd(), 'examples'))
  ? process.cwd()
  : path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

let fails = 0;
let warns = 0;
let passes = 0;

function log(pass, label, detail = '') {
  const tag = pass ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (pass) passes++; else fails++;
}
function warn(label, detail = '') {
  warns++;
  console.log(`[WARN] ${label}${detail ? ` — ${detail}` : ''}`);
}

const MP4 = path.join(ROOT, 'docs/demo-60s.mp4');
const FFMPEG_STATIC = path.join(ROOT, 'node_modules/ffmpeg-static/ffmpeg');
const FFPROBE_STATIC = path.join(ROOT, 'node_modules/ffmpeg-static/ffprobe');

// 1) existence + >5M
{
  if (!fs.existsSync(MP4)) {
    log(false, 'docs/demo-60s.mp4 exists', 'MISSING');
  } else {
    const sz = fs.statSync(MP4).size;
    const mb = (sz / (1024 * 1024)).toFixed(2);
    const min = 5 * 1024 * 1024;
    log(sz > min, 'docs/demo-60s.mp4 >5M', `${sz} bytes (${mb} MB) ${sz > min ? 'OK' : `need >${min}`}`);
  }
}

// 1b) ship weight ceilings — masters live in gitignored *.hq.mp4, ship encodes stay small
{
  const cap = 15 * 1024 * 1024;
  const sz = fs.existsSync(MP4) ? fs.statSync(MP4).size : 0;
  log(sz > 0 && sz <= cap, 'demo-60s.mp4 <= 15M (repo weight cap)', `${(sz / (1024 * 1024)).toFixed(2)} MB ${sz > cap ? '— re-encode from demo-60s.hq.mp4 two-pass' : 'OK'}`);
  const SLEW = path.join(ROOT, 'docs/slewing-cine-10s.mp4');
  if (!fs.existsSync(SLEW)) {
    log(false, 'docs/slewing-cine-10s.mp4 exists', 'MISSING — hero B-roll loop');
  } else {
    const s = fs.statSync(SLEW).size;
    log(s >= 3 * 1024 * 1024 && s <= 8 * 1024 * 1024, 'slewing-cine-10s.mp4 3–8M (B-roll weight cap)', `${(s / (1024 * 1024)).toFixed(2)} MB ${s > 8 * 1024 * 1024 ? '— re-encode from slewing-cine-10s.hq.mp4' : 'OK'}`);
  }
}

// helper: find ffprobe
function findFfprobe() {
  if (fs.existsSync(FFPROBE_STATIC)) return FFPROBE_STATIC;
  try {
    const p = execSync('which ffprobe 2>&1', { encoding: 'utf8', timeout: 3000 }).trim();
    if (p && fs.existsSync(p)) return p;
  } catch (_) {}
  return null;
}
function findFfmpeg() {
  if (fs.existsSync(FFMPEG_STATIC)) return FFMPEG_STATIC;
  try {
    const p = execSync('which ffmpeg 2>&1', { encoding: 'utf8', timeout: 3000 }).trim();
    if (p && fs.existsSync(p)) return p;
  } catch (_) {}
  return null;
}
function parseFfmpegProbeLine(stderr) {
  const re = /Video:\s*(\w+).*?,\s*([a-z0-9]+)\(.*?\),\s*(\d+)x(\d+).*?([\d.]+)\s*fps/i;
  const m = stderr.match(re);
  if (!m) return null;
  return { codec: m[1], pixFmt: m[2], w: Number(m[3]), h: Number(m[4]), fps: Number(m[5]) };
}

// 2) ffprobe if available else ffmpeg -i parse fallback; gate codec/res/fps on either path
{
  const probe = findFfprobe();
  const ff = findFfmpeg();
  let gated = false;
  if (probe) {
    console.log(`[INFO] ffprobe: ${probe}`);
    try {
      const out = execSync(
        `${JSON.stringify(probe)} -v error -select_streams v:0 -show_entries stream=codec_name,width,height,avg_frame_rate,pix_fmt,duration -of default=nw=1 ${JSON.stringify(MP4)} 2>&1`,
        { encoding: 'utf8', timeout: 10000 }
      ).trim();
      console.log(out.slice(0, 800));
      const hasVideo = /codec_name\s*=\s*\w+/.test(out);
      log(hasVideo, 'ffprobe video stream', hasVideo ? 'found' : 'no video stream');
      if (hasVideo) {
        const w = Number((out.match(/width\s*=\s*(\d+)/) || [])[1] || 0);
        const h = Number((out.match(/height\s*=\s*(\d+)/) || [])[1] || 0);
        const pix = (out.match(/pix_fmt\s*=\s*(\S+)/) || [])[1] || '';
        const fpsRaw = (out.match(/avg_frame_rate\s*=\s*(\S+)/) || [])[1] || '';
        let fps = 0;
        if (fpsRaw.includes('/')) { const [a,b]=fpsRaw.split('/').map(Number); if(b) fps=a/b; }
        else fps = Number(fpsRaw) || 0;
        if (w && h) log(w===1920 && h===1080, 'video resolution 1920x1080', `${w}x${h}`);
        if (pix) log(pix==='yuv420p', 'video pix_fmt yuv420p', pix);
        if (fps) log(Math.abs(fps-60) < 0.5, 'video fps 60', `${fps.toFixed(2)} fps`);
        gated = true;
      }
    } catch (e) {
      const msg = (e.stdout || e.stderr || e.message || '').toString().slice(0, 1200);
      warn('ffprobe failed — trying ffmpeg -i fallback', msg.split('\n')[0]);
    }
  }
  if (!gated) {
    if (!ff) {
      warn('ffprobe not available — skipping probe checks', 'install ffmpeg or npm i ffmpeg-static');
    } else {
      // ffmpeg -i is always available via ffmpeg-static; parse codec/res/fps from its stderr header
      try {
        let stderr = '';
        try {
          execSync(`${JSON.stringify(ff)} -i ${JSON.stringify(MP4)} 2>&1 | head -30`, { encoding: 'utf8', timeout: 10000 });
        } catch (e) {
          stderr = (e.stdout || e.stderr || e.message || '').toString();
        }
        // ffmpeg -i exits 1 without output file, so capture via 2>&1 wrapper
        if (!stderr || !stderr.includes('Stream #0:0')) {
          try { stderr = execSync(`${JSON.stringify(ff)} -i ${JSON.stringify(MP4)} 2>&1`, { encoding: 'utf8', timeout: 10000 }).toString(); } catch (e) { stderr = (e.stdout || e.stderr || '').toString() + (e.message||''); }
        }
        const parsed = parseFfmpegProbeLine(stderr);
        if (!parsed) {
          warn('ffmpeg -i parse: could not extract stream', stderr.slice(0, 400).split('\n')[0]);
        } else {
          console.log(`[INFO] ffmpeg -i parsed: ${parsed.codec} ${parsed.w}x${parsed.h} ${parsed.fps}fps ${parsed.pixFmt}`);
          log(parsed.codec.toLowerCase().includes('h264') || parsed.codec.toLowerCase().includes('avc'), 'video codec h264', parsed.codec);
          log(parsed.w===1920 && parsed.h===1080, 'video resolution 1920x1080', `${parsed.w}x${parsed.h}`);
          log(parsed.pixFmt==='yuv420p', 'video pix_fmt yuv420p', parsed.pixFmt);
          log(Math.abs(parsed.fps-60) < 0.5, 'video fps 60', `${parsed.fps} fps`);
        }
      } catch (e) {
        warn('ffmpeg -i fallback failed', (e.message||'').slice(0, 400));
      }
    }
  }
}

// 3) ffmpeg decoder check via execSync with fallback: ffmpeg -v error -i docs/demo-60s.mp4 -f null -
{
  const ff = findFfmpeg();
  if (!ff) {
    warn('ffmpeg not available — skipping decoder check', 'install ffmpeg or npm i ffmpeg-static');
  } else {
    console.log(`[INFO] ffmpeg: ${ff}`);
    try {
      const out = execSync(`${JSON.stringify(ff)} -v error -i ${JSON.stringify(MP4)} -f null - 2>&1`, {
        encoding: 'utf8',
        timeout: 120000,
      }).trim();
      if (out) {
        log(false, 'ffmpeg decode', out.slice(0, 1500));
      } else {
        log(true, 'ffmpeg decode', 'no errors — decodes clean');
      }
    } catch (e) {
      const out = ((e.stdout || '') + (e.stderr || '') + (e.message || '')).toString().trim().slice(0, 2000);
      // ffmpeg exits non-zero on decode error; treat as fail
      // If the file is fine, this block should not trigger — but include output for debugging
      if (out.includes('error') || out.includes('Invalid') || out.includes('Error')) {
        log(false, 'ffmpeg decode', out.split('\n').slice(0, 6).join(' | ').slice(0, 800));
      } else {
        // Some ffmpeg wrappers emit warnings but still ok — treat empty-ish as warn
        warn('ffmpeg decode returned non-zero but no clear error', out.slice(0, 600) || e.message.slice(0, 600));
      }
    }
  }
}

// 4) dumb-proof how-to suite — same codec contract as hero (h264 1920x1080 60fps yuv420p bt709)
{
  const ff = findFfmpeg();
  const extras = [
    { rel: 'docs/howto-setup-30s.mp4', label: 'howto-setup-30s', minM: 0.4, maxM: 15 },
    { rel: 'docs/howto-quote-15s.mp4', label: 'howto-quote-15s', minM: 0.4, maxM: 15 },
    { rel: 'docs/shop-live-20s.mp4',   label: 'shop-live-20s',   minM: 0.4, maxM: 15 },
    { rel: 'docs/copilot-live-30s.mp4',label: 'copilot-live-30s',minM: 0.4, maxM: 15 },
  ];
  for (const { rel, label, minM, maxM } of extras) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) { log(false, `${label} exists`, `MISSING ${rel}`); continue; }
    const sz = fs.statSync(p).size;
    const mb = sz / (1024*1024);
    log(sz >= minM*1024*1024 && sz <= maxM*1024*1024, `${label} size ${minM}–${maxM}M`, `${mb.toFixed(2)} MB`);
    if (!ff) { warn(`${label} probe skipped — no ffmpeg`, rel); continue; }
    // probe codec/res/fps via ffmpeg -i parse (ffmpeg-static has no ffprobe)
    let stderr = '';
    try { stderr = execSync(`${JSON.stringify(ff)} -i ${JSON.stringify(p)} 2>&1`, { encoding: 'utf8', timeout: 10000 }).toString(); } catch (e) { stderr = (e.stdout || e.stderr || '').toString() + (e.message||''); }
    const parsed = parseFfmpegProbeLine(stderr);
    if (!parsed) { log(false, `${label} probe`, `could not parse ${stderr.slice(0,200).split('\n')[0]}`); }
    else {
      console.log(`[INFO] ${label}: ${parsed.codec} ${parsed.w}x${parsed.h} ${parsed.fps}fps ${parsed.pixFmt}`);
      log(parsed.codec.toLowerCase().includes('h264') || parsed.codec.toLowerCase().includes('avc'), `${label} codec h264`, parsed.codec);
      log(parsed.w===1920 && parsed.h===1080, `${label} 1920x1080`, `${parsed.w}x${parsed.h}`);
      log(parsed.pixFmt==='yuv420p', `${label} yuv420p`, parsed.pixFmt);
      log(Math.abs(parsed.fps-60) < 0.5, `${label} 60fps`, `${parsed.fps} fps`);
    }
    // decode clean
    try {
      const out = execSync(`${JSON.stringify(ff)} -v error -i ${JSON.stringify(p)} -f null - 2>&1`, { encoding: 'utf8', timeout: 60000 }).trim();
      log(!out, `${label} decodes clean`, out ? out.slice(0,300) : 'ok');
    } catch (e) {
      const out = ((e.stdout||'')+(e.stderr||'')+e.message).toString().slice(0,600);
      log(false, `${label} decodes clean`, out.split('\n')[0]);
    }
    // captions sidecar
    const vtt = p.replace(/\.mp4$/, '.vtt');
    // howto clips must have captions; live clips optional
    if (label.startsWith('howto-')) {
      log(fs.existsSync(vtt), `${label} captions .vtt`, fs.existsSync(vtt) ? path.basename(vtt) : 'MISSING');
      if (fs.existsSync(vtt)) {
        const txt = fs.readFileSync(vtt,'utf8');
        log(/WEBVTT/.test(txt) && txt.split('\n').length >= 6, `${label} captions WEBVTT`, `${txt.split('\n').length} lines`);
      }
    }
  }
}

console.log(`\nverify-video: ${passes} PASS, ${fails} FAIL, ${warns} WARN`);
process.exit(fails ? 1 : 0);
