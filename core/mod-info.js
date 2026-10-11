'use strict';
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const TOML = require('smol-toml');

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
          if (info.structures.indexOf(nm) < 0) info.structures.push(nm);
        } else if (/^data\/[^/]+\/worldgen\/biome/.test(n)) {
          const nm = n.split('/').pop().replace(/\.json$/, '');
          if (info.biomes.indexOf(nm) < 0) info.biomes.push(nm);
        } else if (/^data\/[^/]+\/dimension\//.test(n)) {
          const nm = n.split('/').pop().replace(/\.json$/, '');
          if (info.dimensions.indexOf(nm) < 0) info.dimensions.push(nm);
        }
      }
      const langEntry = entries.find(e => /assets\/[^/]+\/lang\/en_us\.json$/.test(e.entryName));
      if (langEntry) {
        try {
          const lang = JSON.parse(langEntry.getData().toString('utf8'));
          info.langKeys = Object.keys(lang).length;
          for (const k of Object.keys(lang)) {
            if (k.indexOf('block.') === 0) info.blocks.push(k.replace(/^block\.[^.]*\./, ''));
            else if (k.indexOf('item.') === 0) info.items.push(k.replace(/^item\.[^.]*\./, ''));
            else if (k.indexOf('entity.') === 0) info.entities.push(k.replace(/^entity\.[^.]*\./, ''));
            else if (k.indexOf('biome.') === 0) info.biomes.push(k.replace(/^biome\.[^.]*\./, ''));
            else if (k.indexOf('structure.') === 0) info.structures.push(k.replace(/^structure\.[^.]*\./, ''));
            else if (k.indexOf('effect.') === 0) info.effects.push(k.replace(/^effect\.[^.]*\./, ''));
            else if (k.indexOf('enchantment.') === 0) info.enchantments.push(k.replace(/^enchantment\.[^.]*\./, ''));
            else if (k.indexOf('dimension.') === 0) info.dimensions.push(k.replace(/^dimension\.[^.]*\./, ''));
          }
        } catch {}
      }
      const pm = zip.getEntry('pack.mcmeta');
      if (pm) { try { const p = JSON.parse(pm.getData().toString('utf8')); info.packFormat = p.pack && p.pack.pack_format; } catch {} }
      const mt = zip.getEntry('META-INF/mods.toml');
      if (mt) {
        try { const t = TOML.parse(mt.getData().toString('utf8'));
          info.authors = t.authors || ''; info.license = t.license || '';
          info.description = (t.description || '').replace(/\s+/g, ' ').trim().slice(0, 400);
          info.mc = (t.dependencies && t.dependencies.minecraft && t.dependencies.minecraft.versionRange) || '';
          info.loader = 'forge';
        } catch {}
      }
      const fj = zip.getEntry('fabric.mod.json');
      if (fj) {
        try { const j = JSON.parse(fj.getData().toString('utf8'));
          info.authors = Array.isArray(j.authors) ? j.authors.map(a => typeof a === 'string' ? a : a.name).join(', ') : (j.authors || '');
          info.license = j.license || '';
          info.description = (j.description || '').replace(/\s+/g, ' ').trim().slice(0, 400);
          info.mc = (j.depends && j.depends.minecraft) || '';
          info.loader = 'fabric';
        } catch {}
      }
      out.list.push(info);
    } catch {}
  }
  if (progress) progress('modinfo', total, total, '');
  return out;
};