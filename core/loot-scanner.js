'use strict';
const fsp    = require('fs').promises;
const path   = require('path');
const AdmZip = require('adm-zip');
const log    = require('./logger');

async function scanLoot(modsDir, onProgress) {
  const out = [];
  const files = (await fsp.readdir(modsDir).catch(() => [])).filter(f => /\.jar$/i.test(f));
  const total = files.length;

  for (let i = 0; i < files.length; i++) {
    const fp = path.join(modsDir, files[i]);
    if (onProgress) onProgress(i, total, files[i]);
    try {
      const zip = new AdmZip(fp);
      for (const e of zip.getEntries()) {
        const n = e.entryName;
        const m = n.match(/^data\/([^/]+)\/loot_tables\/(.+)\.json$/) ||
                  n.match(/^data\/([^/]+)\/loot\/(.+)\.json$/);
        if (!m) continue;
        try {
          const raw = JSON.parse(e.getData().toString('utf8'));
          const rec = parseLootTable(raw, m[1], m[2], files[i]);
          if (rec) out.push(rec);
        } catch {}
      }
    } catch (err) {
      log.debug('loot', 'failed ' + files[i] + ': ' + err.message);
    }
  }
  if (onProgress) onProgress(total, total, '');
  log.info('loot', 'scan done', { count: out.length, from: total });
  return out;
}

function parseLootTable(raw, ns, name, source) {
  if (!raw || !raw.pools) return null;
  const category = categorizePath(name);
  const pools = raw.pools.map(parsePool).filter(Boolean);
  return {
    id: ns + ':' + name,
    ns, name, source,
    category,
    type: raw.type || 'generic',
    pools
  };
}

function categorizePath(name) {
  if (name.indexOf('blocks/') === 0) return 'block';
  if (name.indexOf('entities/') === 0) return 'entity';
  if (name.indexOf('chests/') === 0) return 'chest';
  if (name.indexOf('gameplay/') === 0) return 'gameplay';
  return 'other';
}

function parsePool(p) {
  if (!p) return null;
  const pool = {
    rolls: normalizeRolls(p.rolls),
    bonusRolls: p.bonus_rolls ? normalizeRolls(p.bonus_rolls) : null,
    conditions: parseConditions(p.conditions),
    entries: []
  };
  for (const e of (p.entries || [])) {
    const parsed = parseEntry(e);
    if (parsed) pool.entries.push(parsed);
  }
  return pool;
}

/* ================== ENTRY ================== */

function parseEntry(e) {
  if (!e) return null;
  const rawType = e.type || '';
  const t = rawType.replace(/^[a-z_]+:/, '');

  const resolvedId = resolveEntryId(e);
  const resolvedCount = resolveEntryCount(e);
  const funcs = extractFunctions(e.functions);

  // Сохраняем rawEntry ВСЕГДА, чтобы UI мог показать JSON при проблемах
  const common = {
    weight: e.weight || 1,
    quality: e.quality || 0,
    functions: funcs,
    conditions: parseConditions(e.conditions),
    rawType: rawType || null,
    rawEntry: e
  };

  // Тег
  if (t === 'tag') {
    return Object.assign({ kind: 'tag',
      id: '#' + (e.name || e.tag || resolvedId || '').replace(/^#/, ''),
      count: resolvedCount
    }, common);
  }

  // Вложенная таблица
  if (t === 'loot_table' || t === 'table') {
    return Object.assign({ kind: 'loot_table',
      id: e.value || e.name || resolvedId || null
    }, common);
  }

  // Композит
  if (t === 'alternatives' || t === 'group' || t === 'sequence') {
    return Object.assign({ kind: 'composite',
      variant: t,
      children: (e.children || []).map(parseEntry).filter(Boolean)
    }, common);
  }

  // Пусто
  if (t === 'empty' || t === 'nothing') {
    return Object.assign({ kind: 'empty' }, common);
  }

  // Item / stack / stack_entry / кастомные обёртки — всё сюда,
  // если удалось вытащить ID
  if (resolvedId) {
    return Object.assign({ kind: 'item',
      id: resolvedId,
      count: resolvedCount,
      _isCustom: !!(t && t !== 'item')
    }, common);
  }

  // Совсем непонятное — оставляем с rawEntry
  return Object.assign({ kind: 'unknown', type: rawType || '?' }, common);
}

/* ================== ID RESOLVER ================== */

function resolveEntryId(e) {
  // 1) Прямые поля
  for (const k of ['name', 'item', 'value', 'id']) {
    const v = e[k];
    if (typeof v === 'string' && v) return v;
    if (v && typeof v === 'object') {
      const got = extractStackId(v);
      if (got) return got;
    }
  }

  // 2) e.stack — строка или объект
  if (e.stack !== undefined && e.stack !== null) {
    if (typeof e.stack === 'string') return e.stack;
    if (typeof e.stack === 'object') {
      const got = extractStackId(e.stack);
      if (got) return got;
    }
  }

  // 3) Функции: set_stack / set_item / set_name
  if (Array.isArray(e.functions)) {
    for (const f of e.functions) {
      const fn = (f.function || '').replace(/^[a-z_]+:/, '');
      if (fn === 'set_stack' || fn === 'set_item' || fn === 'set_name' || fn === 'set_stack_custom') {
        for (const c of [f.item, f.stack, f.name]) {
          if (typeof c === 'string' && c) return c;
          if (c && typeof c === 'object') {
            const got = extractStackId(c);
            if (got) return got;
          }
        }
      }
    }
  }

  // 4) Любое string-поле, содержащее "namespace:path"
  const deep = findFirstRegistryId(e, 0);
  return deep;
}

function extractStackId(obj) {
  if (!obj || typeof obj !== 'object') return null;
  // Порядок: item → id → name
  for (const k of ['item', 'id', 'name']) {
    if (typeof obj[k] === 'string' && obj[k]) return obj[k];
  }
  // Placebo-style: { type: 'minecraft:item_stack', id: '...' } — уже покрыт 'id'
  // Apotheosis-style: { stack: { ... } }
  if (obj.stack) {
    const got = extractStackId(obj.stack);
    if (got) return got;
  }
  // Вложенный массив одиночный — [ { item: '...' } ]
  if (Array.isArray(obj) && obj.length === 1) {
    return extractStackId(obj[0]);
  }
  return null;
}

/**
 * Глубокий поиск первой "похожей на item id" строки.
 * Отсекает служебные типа "minecraft:item", "placebo:stack_entry" и т.д.
 */
function findFirstRegistryId(obj, depth) {
  if (depth > 4 || !obj || typeof obj !== 'object') return null;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = findFirstRegistryId(item, depth + 1);
      if (r) return r;
    }
    return null;
  }

  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'string' && isItemId(v)) return v;
    if (v && typeof v === 'object') {
      const r = findFirstRegistryId(v, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

function isItemId(s) {
  if (!s || typeof s !== 'string') return false;
  if (!/^[a-z0-9_\-]+:[a-z0-9_\-\/\.]+$/i.test(s)) return false;
  // Отсекаем служебные namespace для типов
  if (/^(minecraft|forge|placebo|apotheosis|kubejs|architectury):(item_stack|stack_entry|item|block|entry|function|type|tag|loot_table|recipe|entity_type|block_entity_type)$/.test(s)) return false;
  return true;
}

/* ================== COUNT ================== */

function resolveEntryCount(e) {
  // stack: { count: N } или { Count: N }
  const stacks = [e.stack, e.item, e.value];
  for (const s of stacks) {
    if (s && typeof s === 'object') {
      const c = s.count !== undefined ? s.count : s.Count;
      if (typeof c === 'number') return { min: c, max: c };
      if (c && typeof c === 'object') return { min: c.min || 1, max: c.max || c.min || 1 };
    }
  }

  // Прямо на entry
  if (typeof e.count === 'number') return { min: e.count, max: e.count };
  if (e.min !== undefined || e.max !== undefined) {
    return { min: e.min || 1, max: e.max || e.min || 1 };
  }

  // functions
  if (Array.isArray(e.functions)) {
    for (const f of e.functions) {
      const fn = (f.function || '').replace(/^[a-z_]+:/, '');
      if (fn === 'set_count' || fn === 'set_stack_count') {
        const c = f.count;
        if (typeof c === 'number') return { min: c, max: c };
        if (c && typeof c === 'object') return { min: c.min || 1, max: c.max || c.min || 1 };
      }
    }
  }

  return { min: 1, max: 1 };
}

/* ================== FUNCTIONS / CONDITIONS ================== */

function extractFunctions(functions) {
  if (!Array.isArray(functions)) return [];
  return functions.map(f => (f.function || '').replace(/^[a-z_]+:/, '')).filter(Boolean);
}

function parseConditions(conds) {
  if (!Array.isArray(conds)) return [];
  return conds.map(c => {
    const cn = (c.condition || '').replace(/^[a-z_]+:/, '');
    const out = { name: cn };
    if (cn === 'random_chance' && c.chance !== undefined) out.chance = c.chance;
    if (cn === 'random_chance_with_looting' && c.chance !== undefined) out.chance = c.chance;
    if (cn === 'killed_by_player') out.player = true;
    if (cn === 'entity_properties' && c.entity) out.entity = c.entity;
    if (cn === 'location_check' && c.predicate && c.predicate.biome) out.biome = c.predicate.biome;
    return out;
  });
}

function normalizeRolls(r) {
  if (typeof r === 'number') return { min: r, max: r };
  if (r && typeof r === 'object') return { min: r.min || 1, max: r.max || r.min || 1 };
  return { min: 1, max: 1 };
}

/**
 * Возвращает список всех .jar'ов в versions/ с их версиями и размерами.
 * Используется UI для выбора конкретной версии.
 */
async function listVanillaJars(root) {
  const versionsDir = path.join(root, 'versions');
  const out = [];
  try {
    const dirs = await fsp.readdir(versionsDir, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const folder = path.join(versionsDir, d.name);
      let files = [];
      try { files = await fsp.readdir(folder); } catch { continue; }
      for (const f of files) {
        if (!/\.jar$/i.test(f)) continue;
        const full = path.join(folder, f);
        try {
          const st = await fsp.stat(full);
          if (st.size < 1024 * 1024) continue; // пропускаем < 1 МБ
          out.push({
            version: d.name + '/' + f,
            label: (d.name === f.replace(/\.jar$/, '') ? d.name : d.name + ' · ' + f),
            path: full,
            folder: d.name,
            file: f,
            size: st.size,
            sizeHuman: (st.size / 1024 / 1024).toFixed(0) + ' МБ',
            mtime: st.mtimeMs,
            // эвристика: настоящий клиент обычно > 15 МБ; < 15 МБ — почти точно без data
            likelyHasData: st.size > 15 * 1024 * 1024
          });
        } catch {}
      }
    }
  } catch (err) {
    log.warn('loot', 'listVanillaJars failed: ' + err.message);
  }
  out.sort((a, b) => {
    // сначала likelyHasData, потом по размеру
    if (a.likelyHasData !== b.likelyHasData) return a.likelyHasData ? -1 : 1;
    return b.size - a.size;
  });
  return out;
}

async function findVanillaJar(root, preferredPath) {
  const all = await listVanillaJars(root);
  if (!all.length) {
    log.warn('loot', 'no .jar files found in versions/');
    return null;
  }

  if (preferredPath) {
    const hit = all.find(x => x.path === preferredPath);
    if (hit) {
      log.info('loot', 'using UI-selected jar: ' + hit.version + ' (' + hit.sizeHuman + ')');
      return hit;
    }
    try {
      const st = await fsp.stat(preferredPath);
      const mb = (st.size / 1024 / 1024).toFixed(0) + ' МБ';
      log.info('loot', 'using manual jar: ' + preferredPath + ' (' + mb + ')');
      return {
        path: preferredPath,
        version: path.basename(preferredPath),
        size: st.size,
        sizeHuman: mb,
        likelyHasData: st.size > 15 * 1024 * 1024
      };
    } catch (err) {
      log.warn('loot', 'manual path not accessible: ' + err.message);
    }
  }

  const good = all.filter(x => x.likelyHasData);
  if (good.length) {
    let targetVersion = null;
    try {
      const manifestPath = path.join(root, 'manifest.json');
      const manifestText = await fsp.readFile(manifestPath, 'utf8');
      const mf = JSON.parse(manifestText);
      if (mf && mf.minecraft && mf.minecraft.version) {
        targetVersion = mf.minecraft.version;
      }
    } catch (e) {
      log.debug('loot', 'manifest.json read failed: ' + e.message);
    }

    if (targetVersion) {
      const exact = good.find(c => c.folder === targetVersion);
      if (exact) { log.info('loot', 'auto: exact ' + exact.version); return exact; }
      const prefixed = good.find(c => c.folder.indexOf(targetVersion) === 0);
      if (prefixed) { log.info('loot', 'auto: prefix ' + prefixed.version); return prefixed; }
    }

    log.info('loot', 'auto: largest good ' + good[0].version);
    return good[0];
  }

  log.warn('loot', 'NO JAR > 15 МБ — ванильные data могут отсутствовать');
  return all[0];
}


async function scanVanillaLoot(root, onProgress, preferredPath) {
  log.info('loot', 'scanVanillaLoot called, root=' + root + (preferredPath ? ', preferred=' + preferredPath : ''));
  const jar = await findVanillaJar(root, preferredPath);
  if (!jar) {
    log.warn('loot', 'VANILLA JAR NOT FOUND — versions/ пуста или нет .jar');
    return { list: [], version: null };
  }
  log.info('loot', 'scanning vanilla jar: ' + jar.version + ' (' + (jar.size / 1024 / 1024).toFixed(0) + ' МБ)');

  const out = [];
  try {
    const zip = new AdmZip(jar.path);
    const entries = zip.getEntries();
    const total = entries.length;
    let processed = 0;
    for (const e of entries) {
      processed++;
      if (onProgress && processed % 500 === 0) onProgress(processed, total, jar.version + '.jar');
      const n = e.entryName;
      const m = n.match(/^data\/minecraft\/loot_tables\/(.+)\.json$/) ||
                n.match(/^data\/minecraft\/loot\/(.+)\.json$/);
      if (!m) continue;
      try {
        const raw = JSON.parse(e.getData().toString('utf8'));
        const rec = parseLootTable(raw, 'minecraft', m[1], jar.version + '.jar');
        if (rec) {
          rec.vanilla = true;
          out.push(rec);
        }
      } catch {}
    }
    if (onProgress) onProgress(total, total, jar.version + '.jar');
    log.info('loot', 'vanilla scan done', { version: jar.version, count: out.length });
  } catch (err) {
    log.warn('loot', 'vanilla jar scan failed: ' + err.message);
  }
  return { list: out, version: jar.version };
}

async function scanVanillaLoot(root, onProgress) {
  const jar = await findVanillaJar(root);
  if (!jar) {
    log.info('loot', 'vanilla jar not found — skipping');
    return { list: [], version: null };
  }
  log.info('loot', 'scanning vanilla jar: ' + jar.version + ' (' + (jar.size / 1024 / 1024).toFixed(0) + ' МБ)');

  const out = [];
  try {
    const zip = new AdmZip(jar.path);
    const entries = zip.getEntries();
    const total = entries.length;
    let processed = 0;
    for (const e of entries) {
      processed++;
      if (onProgress && processed % 500 === 0) onProgress(processed, total, jar.version + '.jar');
      const n = e.entryName;
      const m = n.match(/^data\/minecraft\/loot_tables\/(.+)\.json$/) ||
                n.match(/^data\/minecraft\/loot\/(.+)\.json$/);
      if (!m) continue;
      try {
        const raw = JSON.parse(e.getData().toString('utf8'));
        const rec = parseLootTable(raw, 'minecraft', m[1], jar.version + '.jar');
        if (rec) {
          rec.vanilla = true;
          out.push(rec);
        }
      } catch {}
    }
    if (onProgress) onProgress(total, total, jar.version + '.jar');
    log.info('loot', 'vanilla scan done', { version: jar.version, count: out.length });
  } catch (err) {
    log.warn('loot', 'vanilla jar scan failed: ' + err.message);
  }
  return { list: out, version: jar.version };
}

module.exports = { scanLoot, findVanillaJar, scanVanillaLoot, listVanillaJars };