'use strict';
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const log = require('./logger');
const JUNK_DIRS = ['cache', '.cache', 'temp', '.tmp'];
const JUNK_EXT  = ['.bak', '.old', '.tmp', '.log.1', '.log.2'];

async function fileHash(p) { return crypto.createHash('sha1').update(await fsp.readFile(p)).digest('hex'); }

async function isEffectivelyEmpty(p) {
  try {
    const content = await fsp.readFile(p, 'utf8');
    const lines = content.split('\n');
    const kept = [];
    for (const l of lines) {
      const t = l.trim();
      if (!t) continue;
      if (t.charAt(0) === '#') continue;
      if (t.indexOf('//') === 0) continue;
      kept.push(t);
    }
    const stripped = kept.join('').replace(/[\s\[\]{}()",=:]/g, '');
    return stripped.length < 8;
  } catch { return false; }
}

async function detectJunk(root, folders) {
  const report = { emptyConfigs: [], junkDirs: [], junkFiles: [], duplicateJars: [], staleLogs: [], totalWastedBytes: 0 };
  if (folders.config) {
    const configDir = path.join(root, 'config');
    await walk(configDir, async (fp, rel) => {
      try {
        const st = await fsp.stat(fp);
        if (st.size === 0) { report.emptyConfigs.push({ path: fp, rel, size: 0, reason: 'нулевой размер' }); return; }
        if (await isEffectivelyEmpty(fp)) report.emptyConfigs.push({ path: fp, rel, size: st.size, reason: 'только комментарии' });
      } catch {}
    });
  }
  for (const jd of JUNK_DIRS) {
    const full = path.join(root, jd);
    try { const st = await fsp.stat(full);
      if (st.isDirectory()) { const size = await dirSize(full); report.junkDirs.push({ path: full, rel: jd, size }); report.totalWastedBytes += size; }
    } catch {}
  }
  for (const r of [root, path.join(root,'mods'), path.join(root,'config')]) {
    await walk(r, async (fp, rel) => {
      if (JUNK_EXT.some(e => fp.endsWith(e))) {
        const st = await fsp.stat(fp);
        report.junkFiles.push({ path: fp, rel, size: st.size }); report.totalWastedBytes += st.size;
      }
    }, 1);
  }
  const modsDir = path.join(root, 'mods');
  try {
    const files = (await fsp.readdir(modsDir)).filter(f => /\.jar$/i.test(f));
    const bySize = new Map();
    for (const f of files) { const fp = path.join(modsDir, f); const st = await fsp.stat(fp);
      const k = String(st.size); if (!bySize.has(k)) bySize.set(k, []); bySize.get(k).push({ file: f, path: fp }); }
    for (const entry of bySize) {
      const group = entry[1];
      if (group.length < 2) continue;
      const bySha = new Map();
      for (const g of group) { const h = await fileHash(g.path); if (!bySha.has(h)) bySha.set(h, []); bySha.get(h).push(g); }
      for (const e2 of bySha) {
        const dupes = e2[1];
        if (dupes.length > 1) {
          const st = await fsp.stat(dupes[0].path);
          report.duplicateJars.push({ files: dupes.map(d => d.file), size: st.size });
          report.totalWastedBytes += st.size * (dupes.length - 1);
        }
      }
    }
  } catch (e) { log.debug('junk', 'mods scan failed'); }
  const logsDir = path.join(root, 'logs');
  try {
    const files = await fsp.readdir(logsDir);
    for (const f of files) {
      if (/^(\d{4}-\d{2}-\d{2})/.test(f) || /\.log\.\d+$/.test(f) || /\.log\.gz$/.test(f)) {
        const st = await fsp.stat(path.join(logsDir, f));
        const age = Math.floor((Date.now() - st.mtimeMs) / 86400000);
        if (age > 14) { report.staleLogs.push({ file: f, size: st.size, ageDays: age }); report.totalWastedBytes += st.size; }
      }
    }
  } catch {}
  log.info('junk', 'done', { empty: report.emptyConfigs.length, dupes: report.duplicateJars.length });
  return report;
}

async function walk(dir, cb, depth, cur) {
  depth = depth === undefined ? Infinity : depth;
  cur = cur || 0;
  if (cur > depth) return;
  let entries = []; try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) await walk(fp, cb, depth, cur + 1);
    else await cb(fp, path.relative(dir, fp));
  }
}
async function dirSize(dir) {
  let total = 0;
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) total += await dirSize(fp);
    else { const st = await fsp.stat(fp).catch(() => null); if (st) total += st.size; }
  }
  return total;
}
module.exports = { detectJunk };