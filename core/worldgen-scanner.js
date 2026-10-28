'use strict';
const fsp = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip');
const JSON5 = require('json5'); // <-- ДОБАВЛЯЕМ JSON5
const log = require('./logger');

// Безопасный парсер (справляется с комментариями и лишними запятыми)
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    try {
      return JSON5.parse(str);
    } catch (err) {
      throw new Error(err.message);
    }
  }
}

async function scanWorldgen(modsDir, onProgress) {
  const structureSets = new Map();
  const structures = new Map();
  const biomeModifiers = [];

  const files = (await fsp.readdir(modsDir).catch(() => [])).filter(f => /\.jar$/i.test(f));
  const total = files.length;

  for (let i = 0; i < total; i++) {
    const fp = path.join(modsDir, files[i]);
    if (onProgress) onProgress(i, total, files[i]);

    try {
      const zip = new AdmZip(fp);
      for (const e of zip.getEntries()) {
        const n = e.entryName;

        // 1. structure_set
        const ssMatch = n.match(/^data\/([^/]+)\/worldgen\/structure_set\/(.+)\.json$/);
        if (ssMatch) {
          try {
            const raw = safeJsonParse(e.getData().toString('utf8'));
            const id = ssMatch[1] + ':' + ssMatch[2];
            structureSets.set(id, {
              id,
              source: files[i],
              structures: (raw.structures || []).map(s => ({
                structure: s.structure,
                weight: s.weight || 1,
                frequency: s.frequency !== undefined ? s.frequency : 1.0
              })),
              placement: raw.placement || {},
              raw: raw
            });
          } catch (err) {
            log.warn('worldgen', `Ошибка парсинга structure_set ${n}: ${err.message}`);
          }
        }

                // 2. structure
        const stMatch = n.match(/^data\/([^/]+)\/worldgen\/structure\/(.+)\.json$/);
        if (stMatch) {
          try {
            const raw = safeJsonParse(e.getData().toString('utf8'));
            const id = stMatch[1] + ':' + stMatch[2];
            
            // Безопасно приводим биомы к массиву строк
            let biomesArr = [];
            if (Array.isArray(raw.biomes)) {
               biomesArr = raw.biomes.map(x => typeof x === 'string' ? x : (x.tag || x.value || JSON.stringify(x)));
            } else if (typeof raw.biomes === 'string') {
               biomesArr = [raw.biomes];
            } else if (raw.biomes && typeof raw.biomes === 'object') {
               biomesArr = [raw.biomes.tag || raw.biomes.value || JSON.stringify(raw.biomes)];
            }

            structures.set(id, {
              id,
              source: files[i],
              biomes: biomesArr,
              spawnOverrides: raw.spawn_overrides || {},
              type: raw.type
            });
          } catch (err) {
            log.warn('worldgen', `Ошибка парсинга structure ${n}: ${err.message}`);
          }
        }

        // 3. biome_modifier
        const bmMatch = n.match(/^data\/([^/]+)\/neoforge\/biome_modifier\/(.+)\.json$/);
        if (bmMatch) {
          try {
            const raw = safeJsonParse(e.getData().toString('utf8'));
            biomeModifiers.push({
              id: bmMatch[1] + ':' + bmMatch[2],
              source: files[i],
              type: raw.type,
              biomes: raw.biomes,
              data: raw
            });
          } catch (err) {
            log.warn('worldgen', `Ошибка парсинга biome_modifier ${n}: ${err.message}`);
          }
        }
      }
    } catch (err) {
      log.debug('worldgen', `Не удалось открыть ${files[i]}: ${err.message}`);
    }
  }

  if (onProgress) onProgress(total, total, '');
  log.info('worldgen', 'scan done', { sets: structureSets.size, structures: structures.size, modifiers: biomeModifiers.length });

  return {
    structureSets: Object.fromEntries(structureSets),
    structures: Object.fromEntries(structures),
    biomeModifiers
  };
}

module.exports = { scanWorldgen };