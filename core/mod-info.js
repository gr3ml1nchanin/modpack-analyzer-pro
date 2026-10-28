'use strict';
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const TOML = require('smol-toml');
const JSON5 = require('json5');

module.exports = async function scanModInfo(root, mods, progress) {
  const out = { list: [] };
  const dir = path.join(root, 'mods');
  if (!fs.existsSync(dir)) return out;
  
  const total = mods.length;
  for (let i = 0; i < total; i++) {
    const m = mods[i];
    if (i % 5 === 0 && progress) progress('modinfo', i, total, m.file);
    if (m.error) continue;

    try {
      const zip = new AdmZip(path.join(dir, m.file));
      const info = {
        id: m.id, name: m.name, ver: m.version, file: m.file,
        authors: '', license: '', description: '', mc: '', loader: '', packFormat: null,
        counts: { textures: 0, models: 0, sounds: 0, recipes: 0, loot: 0, tags: 0, advancements: 0, mixins: 0 },
        blocks: [], items: [], entities: [], biomes: [], structures: [], effects: [], enchantments: [], dimensions: [],
        langKeys: 0
      };

      const entries = zip.getEntries();

      // =================================================================
      // 1. Считаем ассеты и структуру
      // =================================================================
      for (const e of entries) {
        const n = e.entryName;
        if (e.isDirectory) continue;
        if (/^assets\/[^/]+\/textures\//.test(n)) info.counts.textures++;
        else if (/^assets\/[^/]+\/models\//.test(n)) info.counts.models++;
        else if (/^assets\/[^/]+\/sounds\//.test(n)) info.counts.sounds++;
        else if (/^data\/[^/]+\/recipes\//.test(n)) info.counts.recipes++;
        else if (/^data\/[^/]+\/loot_tables\//.test(n) || /^data\/[^/]+\/loot\//.test(n)) info.counts.loot++;
        else if (/^data\/[^/]+\/tags\//.test(n)) info.counts.tags++;
        else if (/^data\/[^/]+\/advancements\//.test(n)) info.counts.advancements++;
        else if (/\.mixins?\.json$/.test(n)) info.counts.mixins++;
        else if (/^data\/[^/]+\/worldgen\/structure/.test(n)) {
          const nm = n.split('/').pop().replace(/\.json$/, '');
          if (!info.structures.includes(nm)) info.structures.push(nm);
        } else if (/^data\/[^/]+\/worldgen\/biome/.test(n)) {
          const nm = n.split('/').pop().replace(/\.json$/, '');
          if (!info.biomes.includes(nm)) info.biomes.push(nm);
        } else if (/^data\/[^/]+\/dimension\//.test(n)) {
          const nm = n.split('/').pop().replace(/\.json$/, '');
          if (!info.dimensions.includes(nm)) info.dimensions.push(nm);
        }
      }

      // =================================================================
      // 2. Парсим Forge (mods.toml)
      // =================================================================
      const mt = zip.getEntry('META-INF/mods.toml');
      if (mt) {
        try {
          const t = TOML.parse(mt.getData().toString('utf8'));
          // В Forge описание лежит в массиве [[mods]], а не в корне
          const modObj = (t.mods && t.mods[0]) ? t.mods[0] : {};
          
          info.authors = modObj.authors || '';
          info.license = t.license || modObj.license || '';
          
          let desc = modObj.description || '';
          if (typeof desc === 'string') {
            info.description = desc.replace(/\s+/g, ' ').trim().slice(0, 400);
          }
          
          info.mc = (t.dependencies && t.dependencies.minecraft && t.dependencies.minecraft.versionRange) || '';
          info.loader = 'forge';
        } catch (e) {
          console.error('[mod-info] Forge TOML parse error in', m.file, e.message);
        }
      }

      // =================================================================
      // 3. Парсим Fabric (fabric.mod.json)
      // =================================================================
      const fj = zip.getEntry('fabric.mod.json');
      if (fj) {
        try {
          const j = JSON.parse(fj.getData().toString('utf8'));
          info.authors = Array.isArray(j.authors) ? j.authors.map(a => typeof a === 'string' ? a : a.name).join(', ') : (j.authors || '');
          info.license = j.license || '';
          
          // В Fabric описание может быть строкой или объектом перевода { en_us: "..." }
          let desc = j.description || '';
          if (typeof desc === 'string') {
            info.description = desc.replace(/\s+/g, ' ').trim().slice(0, 400);
          } else if (typeof desc === 'object' && desc !== null) {
            info.description = (desc.en_us || Object.values(desc)[0] || '').replace(/\s+/g, ' ').trim().slice(0, 400);
          }
          
          info.mc = (j.depends && j.depends.minecraft) || '';
          info.loader = 'fabric';
        } catch (e) {
          console.error('[mod-info] Fabric JSON parse error in', m.file, e.message);
        }
      }

            // =================================================================
      // 4. Парсим языковой файл (en_us.json) для фолбэка описания и списков
      // =================================================================
      const langEntry = entries.find(e => /assets\/[^/]+\/lang\/en_us\.json$/.test(e.entryName));
      if (langEntry) {
        let lang = null;
        const rawLang = langEntry.getData().toString('utf8');
        
        try {
          // Пытаемся распарсить обычным способом
          lang = JSON.parse(rawLang);
        } catch (e1) {
          try {
            // Если файл кривой (лишние запятые, комментарии), пробуем JSON5
            lang = JSON5.parse(rawLang);
          } catch (e2) {
            // Если вообще всё плохо, пытаемся выдрать описание регуляркой
            try {
              const reg = new RegExp('"modmenu\\.descriptionTranslation\\.' + info.id + '"\\s*:\\s*"([^"]+)"');
              const match = rawLang.match(reg);
              if (match && match[1] && (!info.description || info.description.length < 5)) {
                info.description = match[1].replace(/\\n/g, ' ').trim().slice(0, 400);
              }
            } catch (e3) {}
            
            // Логируем ошибку только в дебаг, чтобы не спамить в консоль
            console.warn(`[mod-info] Мод ${m.file} имеет битый lang-файл.`);
          }
        }

        if (lang) {
          try {
            info.langKeys = Object.keys(lang).length;
            
            // Если описание пустое — ищем его в переводе
            if (!info.description || info.description.length < 5) {
              let langDesc = lang['modmenu.descriptionTranslation.' + info.id] || lang['pack.' + info.id + '.description'];
              if (typeof langDesc === 'object' && langDesc !== null) langDesc = Object.values(langDesc)[0] || '';
              if (langDesc) info.description = langDesc.replace(/\s+/g, ' ').trim().slice(0, 400);
            }

            // Собираем списки предметов/блоков для карточек
            for (const k of Object.keys(lang)) {
              if (k.startsWith('block.')) info.blocks.push(k.replace(/^block\.[^.]*\./, ''));
              else if (k.startsWith('item.')) info.items.push(k.replace(/^item\.[^.]*\./, ''));
              else if (k.startsWith('entity.')) info.entities.push(k.replace(/^entity\.[^.]*\./, ''));
              else if (k.startsWith('biome.')) info.biomes.push(k.replace(/^biome\.[^.]*\./, ''));
              else if (k.startsWith('structure.')) info.structures.push(k.replace(/^structure\.[^.]*\./, ''));
              else if (k.startsWith('effect.')) info.effects.push(k.replace(/^effect\.[^.]*\./, ''));
              else if (k.startsWith('enchantment.')) info.enchantments.push(k.replace(/^enchantment\.[^.]*\./, ''));
              else if (k.startsWith('dimension.')) info.dimensions.push(k.replace(/^dimension\.[^.]*\./, ''));
            }
          } catch (err) {
            console.warn(`[mod-info] Ошибка обработки lang для ${m.file}:`, err.message);
          }
        }
      }

      // =================================================================
      // 5. Страховка, если описания всё равно нет
      // =================================================================
      if (!info.description) {
        info.description = 'Описание отсутствует.';
      }

      out.list.push(info);
    } catch (e) {
      console.error('[mod-info] Critical error reading', m.file, e.message);
    }
  }
  
  if (progress) progress('modinfo', total, total, '');
  return out;
};