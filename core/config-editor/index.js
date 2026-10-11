'use strict';
const fsp = require('fs').promises;
const path = require('path');
const tomlDoc = require('./toml-doc');
const TextDoc = tomlDoc.TextDoc;
const INTERNAL_RE = tomlDoc.INTERNAL_RE;
const ADVANCED_RE = tomlDoc.ADVANCED_RE;
const schemaMod = require('./schema');
const inferSchema = schemaMod.inferSchema;
const humanize = schemaMod.humanize;
const log = require('../logger');

function detectFormat(filePath, content) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.toml') return 'toml';
  if (ext === '.json') return 'json';
  if (ext === '.json5') return 'json5';
  if (ext === '.yaml' || ext === '.yml') return 'yaml';
  if (['.properties','.cfg','.conf','.ini'].indexOf(ext) >= 0) return 'properties';
  const head = content.slice(0, 2000).trim();
  if (head.charAt(0) === '{' || head.charAt(0) === '[') return 'json';
  if (/^\s*[\w.-]+\s*[:=]/m.test(head)) return 'properties';
  if (/^\[[\w.]+\]/m.test(head)) return 'toml';
  return 'text';
}

async function load(filePath) {
  return log.timed('config-editor', 'load ' + path.basename(filePath), async () => {
    const content = await fsp.readFile(filePath, 'utf8');
    const format = detectFormat(filePath, content);
    const st = await fsp.stat(filePath);
    let schema = null;
    let parseError = null;
    try {
      if (format === 'toml' || format === 'properties') {
        const doc = new TextDoc(content, { format });
        schema = inferSchema(doc);
      } else if (format === 'json') {
        schema = jsonSchema(JSON.parse(content));
      } else if (format === 'json5') {
        let obj;
        try { obj = require('json5').parse(content); }
        catch { obj = JSON.parse(stripJsonComments(content)); }
        schema = jsonSchema(obj);
      } else if (format === 'yaml') {
        try {
          const YAML = require('yaml');
          schema = jsonSchema(YAML.parse(content));
        } catch (e) { parseError = 'yaml: ' + e.message; }
      } else {
        schema = { format, sections: [] };
      }
    } catch (e) { parseError = e.message; }
    return { path: filePath, format, size: st.size, modified: st.mtimeMs, raw: content, schema, parseError, ok: !parseError };
  });
}
async function saveRaw(filePath, text) {
  await fsp.writeFile(filePath, text, 'utf8');
  log.info('config-editor', 'saved ' + path.basename(filePath));
  return { ok: true };
}
async function updateValues(filePath, changes) {
  const original = await fsp.readFile(filePath, 'utf8');
  const format = detectFormat(filePath, original);
  if (format === 'toml' || format === 'properties') {
    const doc = new TextDoc(original, { format });
    let applied = 0;
    const failures = [];
    for (const ch of changes) {
      const ok = doc.setValueByPath(ch.path, ch.value);
      if (ok) applied++; else failures.push(ch.path.join('.'));
    }
    if (applied > 0) await fsp.writeFile(filePath, doc.toString(), 'utf8');
    return { ok: true, applied, failures };
  }
  if (format === 'json' || format === 'json5') {
    let JSON5 = null;
    try { JSON5 = require('json5'); } catch {}
    const obj = JSON5 ? JSON5.parse(original) : JSON.parse(stripJsonComments(original));
    for (const ch of changes) setByPath(obj, ch.path, ch.value);
    const out = JSON5 ? JSON5.stringify(obj, null, 2) : JSON.stringify(obj, null, 2);
    await fsp.writeFile(filePath, out, 'utf8');
    return { ok: true, applied: changes.length, failures: [] };
  }
  return { ok: false, error: 'Формат ' + format + ' не поддерживает точечное редактирование' };
}
function jsonSchema(obj, prefix) {
  prefix = prefix || [];
  const sections = [];
  const rootEntries = [];
  for (const k of Object.keys(obj || {})) {
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      sections.push({ path: prefix.concat([k]), title: humanize(k), hint: null, entries: flatEntries(v, prefix.concat([k])) });
    } else {
      rootEntries.push(makeEntry(k, v, prefix.concat([k])));
    }
  }
  if (rootEntries.length) sections.unshift({ path: [], title: 'General', hint: null, entries: rootEntries });
  return { format: 'json', sections };
}
function flatEntries(obj, prefix) {
  const out = [];
  for (const k of Object.keys(obj || {})) {
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const k2 of Object.keys(v)) out.push(makeEntry(k + '.' + k2, v[k2], prefix.concat([k, k2])));
    } else {
      out.push(makeEntry(k, v, prefix.concat([k])));
    }
  }
  return out;
}
function makeEntry(key, value, p) {
  let type;
  if (typeof value === 'boolean') type = 'boolean';
  else if (typeof value === 'number') type = Number.isInteger(value) ? 'integer' : 'float';
  else if (Array.isArray(value)) {
    if (value.length > 0 && value.every(x => x && typeof x === 'object' && !Array.isArray(x))) {
      type = 'array-objects';
    } else if (value.some(x => x && typeof x === 'object')) {
      type = 'array-mixed';
    } else {
      type = 'array';
    }
  }
  else if (value && typeof value === 'object') {
    type = 'object';
  }
  else type = 'string';

  return { path: p, key, label: humanize(key), type, value, rawValue: JSON.stringify(value),
    range: null, choices: null, default: null, hint: null,
    internal: INTERNAL_RE.test(key), advanced: ADVANCED_RE.test(key), lineIdx: null };
}
function setByPath(obj, pathArr, value) {
  let cur = obj;
  for (let i = 0; i < pathArr.length - 1; i++) {
    const k = pathArr[i];
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k];
  }
  cur[pathArr[pathArr.length - 1]] = value;
}
function stripJsonComments(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') { out += text[++i] || ''; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++; continue;
    }
    out += c;
  }
  return out;
}
module.exports = { load, saveRaw, updateValues, detectFormat, inferSchema, humanize };