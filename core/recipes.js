'use strict';
const fsp    = require('fs').promises;
const path   = require('path');
const AdmZip = require('adm-zip');
const log    = require('./logger');

async function scanRecipes(modsDir, onProgress) {
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
        const m = n.match(/^data\/([^/]+)\/recipes?\/(.+)\.json$/);
        if (!m) continue;
        try {
          const raw = JSON.parse(e.getData().toString('utf8'));
          const r = parseRecipe(raw, m[1], m[2], files[i]);
          if (r) out.push(r);
        } catch {}
      }
    } catch (err) {
      log.debug('recipes', 'failed ' + files[i] + ': ' + err.message);
    }
  }
  if (onProgress) onProgress(total, total, '');
  log.info('recipes', 'scan done', { count: out.length, from: total });
  return out;
}

function parseRecipe(raw, ns, name, source) {
  const type = raw.type || 'crafting_shaped';
  const shortType = type.replace(/^[a-z_]+:/, '');
  const result = parseItemStack(raw.result);
  if (!result) return null;

  const recipe = {
    id: ns + ':' + name,
    ns, name, source,
    type: shortType,
    group: raw.group || null,
    result,
    ingredients: []
  };

  if (shortType === 'crafting_shaped' && Array.isArray(raw.pattern) && raw.key) {
    recipe.shape = raw.pattern.slice();
    for (let row = 0; row < raw.pattern.length; row++) {
      for (let col = 0; col < raw.pattern[row].length; col++) {
        const ch = raw.pattern[row][col];
        if (ch === ' ') continue;
        const ing = raw.key[ch];
        if (!ing) continue;
        recipe.ingredients.push({ row, col, ing: parseIngredient(ing) });
      }
    }
  }
  else if (shortType === 'crafting_shapeless' && Array.isArray(raw.ingredients)) {
    raw.ingredients.forEach((ing, i) => {
      recipe.ingredients.push({ idx: i, ing: parseIngredient(ing) });
    });
  }
  else if (['smelting','blasting','smoking','campfire_cooking'].indexOf(shortType) >= 0) {
    if (raw.ingredient) recipe.ingredients.push({ idx: 0, ing: parseIngredient(raw.ingredient) });
    if (raw.experience !== undefined) recipe.experience = raw.experience;
    if (raw.cookingtime !== undefined) recipe.cookingtime = raw.cookingtime;
  }
  else if (shortType === 'stonecutting') {
    if (raw.ingredient) recipe.ingredients.push({ idx: 0, ing: parseIngredient(raw.ingredient) });
  }
  else if (shortType === 'smithing_transform' || shortType === 'smithing_trim') {
    if (raw.template) recipe.ingredients.push({ idx: 'template', ing: parseIngredient(raw.template) });
    if (raw.base)     recipe.ingredients.push({ idx: 'base',     ing: parseIngredient(raw.base) });
    if (raw.addition) recipe.ingredients.push({ idx: 'addition', ing: parseIngredient(raw.addition) });
  }
  else {
    recipe.raw = raw;
  }

  return recipe;
}

function parseItemStack(r) {
  if (!r) return null;
  if (typeof r === 'string') return { item: r, count: 1 };
  if (typeof r === 'object') return { item: r.item || r.id || null, count: r.count || 1 };
  return null;
}

function parseIngredient(ing) {
  if (!ing) return null;
  if (typeof ing === 'string') {
    if (ing.charAt(0) === '#') return { type: 'tag',  id: ing.slice(1) };
    return { type: 'item', id: ing };
  }
  if (Array.isArray(ing)) {
    const opts = [];
    for (const x of ing) { const p = parseIngredient(x); if (p) opts.push(p); }
    return { type: 'any', options: opts };
  }
  if (typeof ing === 'object') {
    if (ing.item) return { type: 'item', id: ing.item };
    if (ing.tag)  return { type: 'tag',  id: ing.tag };
  }
  return null;
}

module.exports = { scanRecipes, parseRecipe, parseIngredient, parseItemStack };