'use strict';
const fsp = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip');
const log = require('./logger');

let cachedIndex = null;
let indexedRoot = null;

async function findVanillaJar(root) {
  const versionsDir = path.join(root, 'versions');
  try {
    const dirs = await fsp.readdir(versionsDir, { withFileTypes: true });
    const candidates = [];
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const jarPath = path.join(versionsDir, d.name, d.name + '.jar');
      try {
        const st = await fsp.stat(jarPath);
        candidates.push({ path: jarPath, size: st.size, version: d.name });
      } catch {}
    }
    const cleanVersion = candidates.filter(c => /^1\.\d+(\.\d+)?$/.test(c.version));
    if (cleanVersion.length) {
      cleanVersion.sort((a, b) => b.size - a.size);
      return cleanVersion[0];
    }
    candidates.sort((a, b) => b.size - a.size);
    return candidates[0];
  } catch { return null; }
}

// СУПЕР-ПОИСК ТЕКСТУР
function findTextureEntry(entries, ns, itemPath) {
  const lowerItem = itemPath.toLowerCase();
  
  // 1. Прямой поиск по стандартным папкам
  const paths = [
    `assets/${ns}/textures/item/${lowerItem}.png`,
    `assets/${ns}/textures/block/${lowerItem}.png`,
    `assets/${ns}/textures/items/${lowerItem}.png`,
    `assets/${ns}/textures/blocks/${lowerItem}.png`,
    `assets/${ns}/textures/armor/${lowerItem}.png`,
    `assets/${ns}/textures/models/armor/${lowerItem}.png`,
    `assets/${ns}/textures/entity/${lowerItem}.png`,
    `assets/${ns}/textures/${lowerItem}.png`
  ];
  
  for (const p of paths) {
    const found = entries.find(e => e.entryName.toLowerCase() === p);
    if (found) return found;
  }

  // 2. Поиск по суффиксу (например, _top.png, _side.png)
  let found = entries.find(e => 
    e.entryName.startsWith(`assets/${ns}/textures/`) && 
    e.entryName.toLowerCase().endsWith(`/${lowerItem}.png`)
  );
  if (found) return found;
  
  // 3. Поиск по префиксу (например, _layer_1.png для брони)
  found = entries.find(e => 
    e.entryName.startsWith(`assets/${ns}/textures/`) && 
    e.entryName.toLowerCase().includes(`/${lowerItem}_`)
  );
  if (found) return found;

  // 4. Поиск по первому слову (bison_fur_block -> bison)
  const firstWord = lowerItem.split('_')[0];
  if (firstWord.length > 3) {
     found = entries.find(e => 
       e.entryName.startsWith(`assets/${ns}/textures/`) && 
       e.entryName.toLowerCase().includes(`/${firstWord}`)
     );
     if (found) return found;
  }

  return null;
}

async function buildIndex(root, modsDir) {
  if (indexedRoot === root && cachedIndex) return cachedIndex;
  const map = new Map();
  const files = await fsp.readdir(modsDir).catch(() => []);
  
  for (const f of files) {
    if (!f.endsWith('.jar')) continue;
    const fp = path.join(modsDir, f);
    try {
      const zip = new AdmZip(fp);
      for (const e of zip.getEntries()) {
        const m = e.entryName.match(/^assets\/([^/]+)\//);
        if (m && !map.has(m[1])) map.set(m[1], fp);
      }
    } catch {}
  }

  cachedIndex = map;
  indexedRoot = root;
  return map;
}

async function extractBatch(root, modsDir, cacheDir, itemIds) {
  const result = {};
  if (!itemIds || itemIds.length === 0) return result;

  const byNs = {};
  for (const id of itemIds) {
    const [ns, itemPath] = id.split(':');
    if (!ns || !itemPath) continue;
    if (!byNs[ns]) byNs[ns] = [];
    byNs[ns].push(itemPath);
  }

  if (byNs['minecraft']) {
    const vanillaJar = await findVanillaJar(root);
    if (vanillaJar) {
      try {
        const zip = new AdmZip(vanillaJar.path);
        const entries = zip.getEntries();
        for (const itemPath of byNs['minecraft']) {
          const safeItem = itemPath.replace(/[^a-z0-9_\-]/gi, '_');
          const cachePath = path.join(cacheDir, 'minecraft', safeItem + '.png');
          try { await fsp.access(cachePath); result['minecraft:' + itemPath] = cachePath; continue; } catch {}

          const entry = findTextureEntry(entries, 'minecraft', itemPath);
          if (entry) {
            await fsp.mkdir(path.dirname(cachePath), { recursive: true });
            await fsp.writeFile(cachePath, entry.getData());
            result['minecraft:' + itemPath] = cachePath;
          }
        }
      } catch (err) {}
    }
    delete byNs['minecraft'];
  }

  const index = await buildIndex(root, modsDir);
  const tasksByJar = new Map();
  
  for (const ns of Object.keys(byNs)) {
    const jarPath = index.get(ns);
    if (!jarPath) {
      log.warn('texture-debug', `JAR not found for namespace: ${ns}`);
      continue;
    }
    if (!tasksByJar.has(jarPath)) tasksByJar.set(jarPath, []);
    for (const itemPath of byNs[ns]) {
      tasksByJar.get(jarPath).push({ ns, itemPath });
    }
  }

  for (const [jarPath, tasks] of tasksByJar.entries()) {
    try {
      const zip = new AdmZip(jarPath);
      const entries = zip.getEntries();
      for (const task of tasks) {
        const safeItem = task.itemPath.replace(/[^a-z0-9_\-]/gi, '_');
        const cachePath = path.join(cacheDir, task.ns, safeItem + '.png');
        try { await fsp.access(cachePath); result[task.ns + ':' + task.itemPath] = cachePath; continue; } catch {}

        const entry = findTextureEntry(entries, task.ns, task.itemPath);
        if (entry) {
          await fsp.mkdir(path.dirname(cachePath), { recursive: true });
          await fsp.writeFile(cachePath, entry.getData());
          result[task.ns + ':' + task.itemPath] = cachePath;
        } else {
          log.warn('texture-debug', `Texture not found for ${task.ns}:${task.itemPath}`);
        }
      }
    } catch (err) { log.warn('texture-debug', 'jar read failed: ' + err.message); }
  }

  return result;
}

module.exports = { extractBatch };