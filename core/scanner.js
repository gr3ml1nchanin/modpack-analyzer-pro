'use strict';
const { extractModIcon } = require('./image-extractor');
const fsp = require('fs').promises;
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const log = require('./logger');

const safeStat = async p => { try { return await fsp.stat(p); } catch { return null; } };
const listDir  = async p => { try { return await fsp.readdir(p, { withFileTypes: true }); } catch { return []; } };

function parseTomlLite(text) {
  const out = { mods: [], dependencies: {} };
  let lastTable = null;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].replace(/(^|\s)#.*$/, '');
    if (!s.trim()) continue;
    let m = s.match(/^\s*\[\[([^\]]+)\]\]\s*$/);
    if (m) {
      const parts = m[1].split('.').map(x => x.trim());
      if (parts[0] === 'mods') { lastTable = {}; out.mods.push(lastTable); }
      else if (parts[0] === 'dependencies') { const owner = parts[1] || '_'; if (!out.dependencies[owner]) out.dependencies[owner] = []; lastTable = {}; out.dependencies[owner].push(lastTable); }
      else lastTable = {};
      continue;
    }
    m = s.match(/^\s*\[([^\]]+)\]\s*$/);
    if (m) { const parts = m[1].split('.').map(x => x.trim()); let cur = out; for (const p of parts) { if (!cur[p]) cur[p] = {}; cur = cur[p]; } lastTable = cur; continue; }
    m = s.match(/^\s*([\w.\-]+)\s*=\s*(.+?)\s*$/);
    if (m && lastTable) {
      const key = m[1]; let val = m[2];
      if (val.startsWith('"""') || val.startsWith("'''")) {
        const d = val.slice(0,3); let r = val.slice(3);
        while (r.indexOf(d) < 0 && i + 1 < lines.length) { i++; r += '\n' + lines[i]; }
        val = r.slice(0, r.indexOf(d));
      }
      else if (val.startsWith('"') || val.startsWith("'")) val = val.slice(1, -1);
      else if (val === 'true') val = true; else if (val === 'false') val = false;
      else if (/^-?\d+$/.test(val)) val = parseInt(val, 10);
      else if (/^-?\d*\.\d+$/.test(val)) val = parseFloat(val);
      lastTable[key] = val;
    }
  }
  return out;
}

function readModMeta(jarPath) {
  const meta = { id: null, name: null, version: null, loader: 'Unknown',
    authors: [], description: '', dependencies: [], license: null, homepage: null,
    entrypoints: 0, mixins: 0, error: null };
  let zip;
  try { zip = new AdmZip(jarPath); } catch { meta.error = 'JAR open error'; return meta; }
  const names = new Set(zip.getEntries().map(e => e.entryName));

  if (names.has('fabric.mod.json')) {
    try {
      const d = JSON.parse(zip.readAsText('fabric.mod.json'));
      meta.loader = 'Fabric'; meta.id = d.id || null; meta.name = d.name || d.id || null;
      meta.version = d.version || null;       // Извлекаем описание (может быть строкой или объектом)
      if (typeof d.description === 'string') {
        meta.description = d.description;
      } else if (d.description && typeof d.description === 'object') {
        meta.description = d.description.en_us || Object.values(d.description)[0] || '';
      }

      // Если описания нет, ищем его в файле локализации
      if (!meta.description && meta.id) {
        const langEntry = zip.getEntry('assets/' + meta.id + '/lang/en_us.json');
        if (langEntry) {
          try {
            const lang = JSON.parse(langEntry.getData().toString('utf8'));
            meta.description = lang['modmenu.descriptionTranslation.' + meta.id] || lang['itemGroup.' + meta.id] || '';
          } catch {}
        }
      }
      meta.license = d.license || null;
      meta.homepage = d.contact && d.contact.homepage ? d.contact.homepage : null;
      if (Array.isArray(d.authors)) meta.authors = d.authors.map(a => typeof a === 'string' ? a : a.name).filter(Boolean);
      else if (typeof d.authors === 'string') meta.authors = [d.authors];
      if (d.depends) meta.dependencies = Object.entries(d.depends).map(kv => ({ id: kv[0], version: String(kv[1]) }));
      if (d.entrypoints) meta.entrypoints = Object.keys(d.entrypoints).length;
      if (d.mixins) meta.mixins = Array.isArray(d.mixins) ? d.mixins.length : 1;
    } catch { meta.error = 'fabric.mod.json parse error'; }
    return meta;
  }
  if (names.has('quilt.mod.json')) {
    try {
      const raw = JSON.parse(zip.readAsText('quilt.mod.json'));
      const q = raw.quilt_loader || {};
      meta.loader = 'Quilt'; meta.id = q.id || null;
      meta.name = q.metadata && q.metadata.name ? q.metadata.name : q.id;
      meta.version = q.version || null;
      meta.description = (q.metadata && q.metadata.description) || '';
      meta.license = (q.metadata && q.metadata.license) || null;
      if (q.metadata && q.metadata.contributors) meta.authors = Object.keys(q.metadata.contributors);
      if (Array.isArray(q.depends)) meta.dependencies = q.depends.map(d => ({ id: d.id, version: String(d.versions || '') }));
    } catch { meta.error = 'quilt.mod.json parse error'; }
    return meta;
  }
  if (names.has('META-INF/mods.toml')) {
    try {
      const parsed = parseTomlLite(zip.readAsText('META-INF/mods.toml'));
      const mod = parsed.mods[0] || {};
      meta.loader = 'Forge'; meta.id = mod.modId || null; meta.name = mod.displayName || mod.modId || null;
      meta.version = mod.version || null;       meta.description = (mod.description || '').toString();
      if (!meta.description && meta.id) {
        const langEntry = zip.getEntry('assets/' + meta.id + '/lang/en_us.json');
        if (langEntry) {
          try {
            const lang = JSON.parse(langEntry.getData().toString('utf8'));
            meta.description = lang['modmenu.descriptionTranslation.' + meta.id] || lang['itemGroup.' + meta.id] || '';
          } catch {}
        }
      }
      meta.license = parsed.license || mod.license || null;
      if (mod.authors) meta.authors = String(mod.authors).split(',').map(s => s.trim());
      if (parsed.dependencies[meta.id]) meta.dependencies = parsed.dependencies[meta.id]
        .filter(d => d.mandatory).map(d => ({ id: d.modId, version: d.versionRange || '' }));
    } catch { meta.error = 'mods.toml parse error'; }
    return meta;
  }
  if (names.has('mcmod.info')) {
    try {
      let data = JSON.parse(zip.readAsText('mcmod.info'));
      if (data.modList) data = data.modList;
      const m = Array.isArray(data) ? data[0] : data;
      meta.loader = 'Forge (legacy)'; meta.id = m.modid; meta.name = m.name; meta.version = m.version;
      meta.description = m.description || '';
      meta.authors = m.authorList || (m.author ? [m.author] : []);
    } catch { meta.error = 'mcmod.info parse error'; }
    return meta;
  }
  if (names.has('META-INF/MANIFEST.MF')) {
    try {
      const txt = zip.readAsText('META-INF/MANIFEST.MF');
      for (const line of txt.split(/\r?\n/)) {
        const idx = line.indexOf(':'); if (idx < 0) continue;
        const k = line.slice(0, idx).trim(); const v = line.slice(idx + 1).trim();
        if (k === 'Implementation-Title') meta.name = v;
        if (k === 'Implementation-Version') meta.version = v;
      }
    } catch {}
  }
  if (!meta.name) meta.name = path.basename(jarPath, '.jar');
  return meta;
}

function detectLoader(root, mods) {
  const flags = { forge: 0, neo: 0, fabric: 0, quilt: 0 };
  for (const m of mods) {
    const s = (m.file + ' ' + (m.id || '') + ' ' + (m.loader || '')).toLowerCase();
    if (/neoforge/.test(s)) flags.neo++; else if (/forge/.test(s)) flags.forge++;
    if (/quilt/.test(s)) flags.quilt++; if (/fabric/.test(s)) flags.fabric++;
  }
  if (flags.neo) return 'NeoForge';
  if (flags.quilt && !flags.fabric) return 'Quilt';
  if (flags.fabric && flags.forge) return 'Fabric + Forge';
  if (flags.fabric) return 'Fabric';
  if (flags.forge) return 'Forge';
  try { for (const f of fs.readdirSync(root)) {
    const lf = f.toLowerCase(); if (lf.slice(-4) !== '.jar') continue;
    if (lf.indexOf('neoforge') >= 0) return 'NeoForge';
    if (lf.indexOf('forge') >= 0) return 'Forge';
    if (lf.indexOf('fabric') >= 0) return 'Fabric';
    if (lf.indexOf('quilt') >= 0) return 'Quilt';
  }} catch {}
  return 'Unknown';
}

async function walkConfigs(root, base) {
  if (!base) base = root;
  const out = [];
  const entries = await listDir(root);
  for (const e of entries) {
    const fp = path.join(root, e.name);
    if (e.isDirectory()) {
      const sub = await walkConfigs(fp, base);
      for (const x of sub) out.push(x);
    } else {
      const ext = path.extname(e.name).toLowerCase();
      const OK = ['.toml','.json','.json5','.yaml','.yml','.properties','.cfg','.conf','.txt','.ini'];
      if (OK.indexOf(ext) >= 0) {
        const st = await safeStat(fp);
        out.push({ name: e.name, path: fp, rel: path.relative(base, fp), ext,
          size: st ? st.size : 0, modified: st ? st.mtimeMs : 0 });
      }
    }
  }
  return out;
}

async function scanModpack(root) {
  return log.timed('scan', 'modpack ' + path.basename(root), async () => {
    const t0 = Date.now();
    const result = { root, name: path.basename(root), scannedAt: Date.now(),
      loader: 'Unknown', version: null, folders: {}, summary: {},
      mods: [], configs: [], logs: [], crashes: [],
      resourcepacks: [], shaderpacks: [], saves: [], duration: 0 };

    const entries = await listDir(root);
    const dirNames = new Set(entries.filter(e => e.isDirectory()).map(e => e.name));
    for (const k of ['mods','config','logs','crash-reports','resourcepacks','shaderpacks','saves','scripts','kubejs']) {
      if (dirNames.has(k)) result.folders[k] = true;
    }
    const mfPath = path.join(root, 'manifest.json');
    if (await safeStat(mfPath)) {
      try { const m = JSON.parse(await fsp.readFile(mfPath, 'utf8'));
        result.version = (m.minecraft && m.minecraft.version) || m.version || null;
        if (m.name) result.name = m.name;
      } catch {}
    }
        if (result.folders.mods) {
      const modsDir = path.join(root, 'mods');
      const files = (await listDir(modsDir)).filter(e => e.isFile() && /\.jar$/i.test(e.name));
      const cacheDir = path.join(__dirname, '..', 'data', 'cache', 'icons');
      
      for (const f of files) {
        const fp = path.join(modsDir, f.name);
        const st = await safeStat(fp);
        const meta = readModMeta(fp);
        
        let iconPath = null;
        if (meta.id) {
          // Пытаемся достать иконку (работает асинхронно, не блокирует)
          extractModIcon(fp, meta.id, cacheDir).then(savedPath => {
            if (savedPath) {
              // Обновляем мод в State (опционально, но можно просто передать путь)
            }
          });
          // Для простоты сохраняем предполагаемый путь, если файл есть
          const expected = path.join(cacheDir, meta.id.replace(/[^a-z0-9_\-]/gi, '_') + '.png');
          if (fs.existsSync(expected)) iconPath = expected;
        }

        result.mods.push({ 
          file: f.name, 
          path: fp, 
          size: st ? st.size : 0, 
          iconPath: iconPath, // <--- Добавили поле
          ...meta 
        });
      }
    }
    if (result.folders.config) result.configs = await walkConfigs(path.join(root, 'config'));
    if (result.folders.logs) {
      const logsDir = path.join(root, 'logs');
      const files = (await listDir(logsDir)).filter(e => e.isFile() && /\.log(\.gz)?$/i.test(e.name));
      for (const f of files) {
        const fp = path.join(logsDir, f.name);
        const st = await safeStat(fp);
        result.logs.push({ file: f.name, path: fp, size: st ? st.size : 0, mtime: st ? st.mtimeMs : 0 });
      }
      result.logs.sort((a, b) => b.mtime - a.mtime);
    }
    if (result.folders['crash-reports']) {
      const dir = path.join(root, 'crash-reports');
      const files = (await listDir(dir)).filter(e => e.isFile() && /\.txt$/i.test(e.name));
      for (const f of files) {
        const fp = path.join(dir, f.name);
        const st = await safeStat(fp);
        result.crashes.push({ file: f.name, path: fp, size: st ? st.size : 0, mtime: st ? st.mtimeMs : 0 });
      }
      result.crashes.sort((a, b) => b.mtime - a.mtime);
    }
    for (const key of ['resourcepacks', 'shaderpacks', 'saves']) {
      if (!result.folders[key]) continue;
      const dir = path.join(root, key);
      const items = await listDir(dir);
      result[key] = items.filter(e => e.isDirectory() || (e.isFile() && /\.zip$/i.test(e.name)))
        .map(e => ({ name: e.name, isDir: e.isDirectory() }));
    }
    result.loader = detectLoader(root, result.mods);
    result.summary = {
      mods: result.mods.length, configs: result.configs.length,
      logs: result.logs.length, crashes: result.crashes.length,
      resourcepacks: result.resourcepacks.length, shaderpacks: result.shaderpacks.length,
      saves: result.saves.length, totalModSize: result.mods.reduce((a, m) => a + m.size, 0)
    };
    result.duration = Date.now() - t0;
    log.info('scan', 'done', { root, loader: result.loader, mods: result.summary.mods, duration: result.duration });
    return result;
  });
}

module.exports = { scanModpack, readModMeta, detectLoader, walkConfigs, parseTomlLite };