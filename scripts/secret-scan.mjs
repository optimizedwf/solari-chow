#!/usr/bin/env node
// secret-scan.mjs — via child_process execSync: git log scan, grep for real keys, .env gitignored
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = fs.existsSync(path.join(process.cwd(), 'examples'))
  ? process.cwd()
  : path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

let fails = 0;
let passes = 0;

function log(pass, label, detail = '') {
  const tag = pass ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (pass) passes++; else fails++;
}

function sh(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd: ROOT, timeout: 15000, ...opts }).trim();
  } catch (e) {
    // execSync throws on non-zero; return stdout if present
    const out = (e.stdout || '') + (e.stderr || '');
    if (e.status !== undefined) return out.trim();
    throw e;
  }
}

// 1) git log --all -S "slr_live" --oneline — only placeholders allowed
{
  let out = '';
  let ran = false;
  try {
    out = execSync('git log --all -S "slr_live" --oneline', { encoding: 'utf8', cwd: ROOT, timeout: 15000 }).trim();
    ran = true;
  } catch (e) {
    const msg = (e.message || '').toLowerCase();
    if (msg.includes('not a git repository') || msg.includes('does not have any commits')) {
      console.log('[WARN] not a git repo or no commits — skipping git log check');
      ran = false;
    } else {
      // still capture output
      out = ((e.stdout || '') + (e.stderr || '')).trim();
      ran = true;
    }
  }
  if (ran) {
    if (!out) {
      log(true, 'git log slr_live', 'no commits mention slr_live — clean');
    } else {
      // Fetch full diff for those commits and ensure only placeholders appear
      // For each line, check the patch would contain a real key. Cheap: grep the commit contents via git log -p
      let patch = '';
      try {
        patch = execSync('git log --all -S "slr_live" -p --all', { encoding: 'utf8', cwd: ROOT, timeout: 15000 });
      } catch (_) {
        patch = out;
      }
      // Real key = slr_live_ + 20+ alnum chars
      const realKeyRe = /slr_live_[A-Za-z0-9]{20,}/;
      // Placeholder forms allowed: slr_live_...  slr_live_…  or bare slr_live_ at end-of-token
      // If patch has a real key, fail. Otherwise pass with note.
      const hasReal = realKeyRe.test(patch);
      if (hasReal) {
        log(false, 'git log slr_live', 'real slr_live_ key found in history — must be placeholders only');
        console.log(patch.slice(0, 2000));
      } else {
        // verify placeholders do exist when log is non-empty
        const hasPlaceholder = patch.includes('slr_live_');
        log(true, 'git log slr_live', hasPlaceholder ? 'only placeholders (slr_live_... / slr_live_…)' : 'mentions slr_live but no real key');
        console.log(`  commits matching -S slr_live:\n  ${out.split('\n').join('\n  ')}`);
      }
    }
  }
}

// 2) grep for slr_live_[A-Za-z0-9]{20,} empty (working tree, tracked+untracked excluding node_modules/.git)
{
  let out = '';
  try {
    // Use git grep if repo, else plain grep -r
    try {
      out = execSync('git grep -n -E "slr_live_[A-Za-z0-9]{20,}" -- . 2>&1 || true', { encoding: 'utf8', cwd: ROOT, timeout: 15000 }).trim();
      // git grep returns non-zero when no match; execSync would throw, but we appended || true so ok
      // Filter empty/noise
      if (out === '' || out.startsWith('fatal: not a git')) throw new Error('fallback');
    } catch (_) {
      // fallback to grep
      out = sh('grep -R -n -E "slr_live_[A-Za-z0-9]{20,}" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.venv --exclude="*.log" . 2>&1 || true');
    }
  } catch (e) {
    out = (e.stdout || e.message || '').trim();
  }
  // git grep fallback may return empty; also filter binary/file noise
  const meaningful = out.split('\n').map(s => s.trim()).filter(s => s && !s.includes('Binary file') && !s.startsWith('warning:'));
  if (meaningful.length === 0 || (meaningful.length === 1 && meaningful[0] === '')) {
    log(true, 'grep slr_live_[A-Za-z0-9]{20,}', 'no real keys in working tree');
  } else {
    log(false, 'grep slr_live_[A-Za-z0-9]{20,}', `found ${meaningful.length} hit(s) — must be empty`);
    for (const line of meaningful.slice(0, 20)) console.log('  ' + line);
  }
}

// 3) .env gitignored
{
  let out = '';
  let pass = false;
  let detail = '';
  try {
    out = execSync('git check-ignore -v .env 2>&1', { encoding: 'utf8', cwd: ROOT, timeout: 5000 }).trim();
    // if exit 0, it is ignored → pass
    pass = out.length > 0;
    detail = out || 'ignored';
  } catch (e) {
    // exit 1 means not ignored
    const combined = ((e.stdout || '') + (e.stderr || '') + (e.message || '')).trim();
    // git check-ignore exits 1 when not ignored, 128 when not a repo
    if (combined.includes('not a git repository')) {
      // fallback: check .gitignore file directly
      try {
        const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
        const ignored = gi.split('\n').some(l => l.trim() === '.env' || l.trim() === '/.env');
        pass = ignored;
        detail = ignored ? '.gitignore contains .env (no git repo, file check)' : '.gitignore missing .env';
      } catch (_) {
        pass = false;
        detail = 'no git repo and no .gitignore';
      }
    } else {
      pass = false;
      detail = 'NOT ignored — .env would be committed';
    }
  }
  log(pass, '.env gitignored', detail.slice(0, 300));
}

// 4) solari-preview-host — leaked Solari preview host ids and sandbox handles (working tree)
{
  // (a) preview host: 20-hex sandbox id + "-" + port + ".preview.getsolari.com"
  // (b) sandbox handle: "<base64-ish blob>.<43-char url-safe hmac>"
  const PREVIEW_HOST = '[0-9a-f]{20}-[0-9]+[.]preview[.]getsolari[.]com';
  const SANDBOX_HANDLE = '[A-Za-z0-9+/=_-]{20,}[.][A-Za-z0-9_-]{43}';
  const re = `${PREVIEW_HOST}|${SANDBOX_HANDLE}`;
  let out = '';
  try {
    out = execSync(`git grep -n -E '${re}' -- . 2>&1 || true`, { encoding: 'utf8', cwd: ROOT, timeout: 15000 }).trim();
    if (out === '' || out.startsWith('fatal: not a git')) throw new Error('fallback');
  } catch (_) {
    out = sh(`grep -R -n -E '${re}' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.venv --exclude="*.log" . 2>&1 || true`);
  }
  const meaningful = out.split('\n').map(s => s.trim()).filter(s => s && !s.includes('Binary file') && !s.startsWith('warning:'));
  if (meaningful.length === 0) {
    log(true, 'solari-preview-host', 'no real preview hosts or sandbox handles in working tree');
  } else {
    log(false, 'solari-preview-host', `found ${meaningful.length} hit(s) — use xxx-3000.preview.getsolari.com placeholder`);
    for (const line of meaningful.slice(0, 20)) console.log('  ' + line);
  }
}

// 5) private-network-address — RFC1918 / CGNAT / Tailscale (dotted-decimal only)
{
  const IP = [
    '10[.][0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3}',                               // RFC1918 10/8
    '172[.](1[6-9]|2[0-9]|3[01])[.][0-9]{1,3}[.][0-9]{1,3}',                  // RFC1918 172.16/12
    '192[.]168[.][0-9]{1,3}[.][0-9]{1,3}',                                    // RFC1918 192.168/16
    '100[.](6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])[.][0-9]{1,3}[.][0-9]{1,3}', // CGNAT 100.64/10
    '100[.][0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3}',                             // Tailscale 100.x
  ].join('|');
  // Documented placeholders used in this repo (`shop-os.example.invalid`, `xxx-3000`)
  // are non-numeric and can never match the dotted-decimal patterns; strip them
  // defensively before re-testing a line so they are explicitly allowed.
  const ALLOWED = /shop-os\.example\.invalid|xxx-3000/g;
  const hitRe = new RegExp(`(^|[^0-9.])(${IP})`);
  let out = '';
  try {
    out = execSync(`git grep -n -E '${IP}' -- . 2>&1 || true`, { encoding: 'utf8', cwd: ROOT, timeout: 15000 }).trim();
    if (out === '' || out.startsWith('fatal: not a git')) throw new Error('fallback');
  } catch (_) {
    out = sh(`grep -R -n -E '${IP}' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.venv --exclude="*.log" . 2>&1 || true`);
  }
  const hits = out.split('\n').map(s => s.trim())
    .filter(s => s && !s.includes('Binary file') && !s.startsWith('warning:'))
    .filter(line => hitRe.test(line.replace(ALLOWED, '')));
  if (hits.length === 0) {
    log(true, 'private-network-address', 'no RFC1918/CGNAT/Tailscale addresses in working tree');
  } else {
    log(false, 'private-network-address', `found ${hits.length} hit(s) — use documentation placeholders`);
    for (const line of hits.slice(0, 20)) console.log('  ' + line);
  }
}

console.log(`\nsecret-scan: ${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
