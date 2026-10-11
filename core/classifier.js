'use strict';
const crypto = require('crypto');
const fsp = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip');
const log = require('./logger');

const CLIENT_HINTS = ['cloth-config','modmenu','sodium','iris','optifine','shaders','minimap','journeymap','xaero','jei','rei','emi','wthit','jade','appleskin','betterf3','fancymenu','controlling'];
const LIB_HINTS = ['cloth-config','architectury','fabric-api','forge-config-api','kotlin','geckolib','player-animator','libgui','trinkets','cardinal-components','fabric-language-kotlin','balm','midnightlib','yacl','puzzles-lib','supermartijn642corelib','citadel','alexsdelight'];

function sha1File(buf) { return crypto.createHash('sha1').update(buf).digest('hex'); }

async function classifyMod(jarPath, modrinth) {
  const result = { type: 'both', reasons: [], environment: null, categories: [], project: null, sha1: null };
  let zip;
  try { zip = new AdmZip(jarPath); } catch { result.reasons.push('JAR открыть не удалось'); return result; }
  const buf = await fsp.readFile(jarPath);
  result.sha1 = sha1File(buf);
  const names = new Set(zip.getEntries().map(e => e.entryName));

  if (names.has('fabric.mod.json')) {
    try {
      const d = JSON.parse(zip.readAsText('fabric.mod.json'));
      result.environment = d.environment || '*';
      if (d.environment === 'client') { result.type = 'client'; result.reasons.push('fabric: client'); }
      else if (d.environment === 'server') { result.type = 'server'; result.reasons.push('fabric: server'); }
      const ep = d.entrypoints || {};
      if (ep.client && !ep.main && !ep.server) { result.type = 'client'; result.reasons.push('только client'); }
      if (ep.server && !ep.main && !ep.client) { result.type = 'server'; result.reasons.push('только server'); }
    } catch {}
  }
  if (modrinth) {
    try {
      const v = await modrinth.projectByHash(result.sha1);
      if (v && v.project_id) {
        const p = await modrinth.project(v.project_id);
        result.project = { id: p.id, slug: p.slug, title: p.title, downloads: p.downloads,
          categories: p.categories, loaders: p.loaders, client_side: p.client_side, server_side: p.server_side };
        result.categories = p.categories || [];
        if (p.client_side === 'required' && p.server_side === 'unsupported') result.type = 'client';
        else if (p.server_side === 'required' && p.client_side === 'unsupported') result.type = 'server';
        if (result.categories.includes('library')) result.type = 'library';
      }
    } catch (e) { log.debug('classifier', 'Modrinth miss: ' + path.basename(jarPath)); }
  }
  const base = jarPath.toLowerCase();
  if (LIB_HINTS.some(h => base.includes(h))) { result.type = 'library'; result.reasons.push('имя похоже на библиотеку'); }
  else if (CLIENT_HINTS.some(h => base.includes(h)) && result.type === 'both') { result.type = 'client'; result.reasons.push('имя похоже на клиентский'); }
  return result;
}
module.exports = { classifyMod, sha1File };