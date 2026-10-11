'use strict';
const tomlDoc = require('./toml-doc');
const parseValue = tomlDoc.parseValue;
const INTERNAL_RE = tomlDoc.INTERNAL_RE;
const ADVANCED_RE = tomlDoc.ADVANCED_RE;

function inferSchema(doc) {
  const sectionsMap = new Map();
  for (const entry of doc.entries) {
    const sectionPath = entry.section;
    const sectionKey = sectionPath.join('.') || '__root__';
    if (!sectionsMap.has(sectionKey)) {
      sectionsMap.set(sectionKey, {
        path: sectionPath.slice(),
        title: humanize(sectionPath[sectionPath.length - 1] || 'General'),
        hint: null, entries: []
      });
    }
    const comments = extractCommentsAbove(doc, entry);
    const hints = parseHintComments(comments);
    const value = parseValue(entry.rawValue, entry.valueType);
    const sk = sectionPath.join('.');
    sectionsMap.get(sectionKey).entries.push({
      path: entry.path, key: entry.key, label: humanize(entry.key),
      type: entry.valueType, value, rawValue: entry.rawValue,
      range: hints.range, choices: hints.choices, default: hints.default, hint: hints.text,
      internal: INTERNAL_RE.test(entry.key) || INTERNAL_RE.test(sk),
      advanced: ADVANCED_RE.test(entry.key) || ADVANCED_RE.test(sk),
      lineIdx: entry.lineIdx
    });
  }
  const sections = [];
  sectionsMap.forEach(s => sections.push(s));
  return { format: doc.format, sections };
}
function extractCommentsAbove(doc, entry) {
  const out = [];
  let i = entry.lineIdx - 1;
  while (i >= 0) {
    const line = doc.lines[i];
    if (!line.trim()) break;
    if (doc._isCommentLine(line)) { out.unshift(line.trim().replace(/^[#!]\s?/, '')); i--; }
    else break;
  }
  return out;
}
function parseHintComments(comments) {
  const result = { range: null, choices: null, default: null, text: null };
  const free = [];
  for (const c of comments) {
    let m;
    m = c.match(/^Range:\s*(.+)$/i);
    if (m) { result.range = parseRange(m[1]); continue; }
    m = c.match(/^Allowed values?:\s*(.+)$/i);
    if (m) { result.choices = m[1].split(',').map(s => s.trim()).filter(Boolean); continue; }
    m = c.match(/^Default(?: value)?:\s*(.+)$/i);
    if (m) { const raw = m[1].trim(); result.default = parseValue(raw, detectType(raw)); continue; }
    free.push(c);
  }
  result.text = free.length ? free.join(' ') : null;
  return result;
}
function parseRange(s) {
  s = s.trim();
  let m = s.match(/^([+-]?\d*\.?\d+)\s*[~\-]\s*([+-]?\d*\.?\d+)$/);
  if (m) return { min: parseFloat(m[1]), max: parseFloat(m[2]) };
  m = s.match(/^>=\s*([+-]?\d*\.?\d+)$/); if (m) return { min: parseFloat(m[1]) };
  m = s.match(/^>\s*([+-]?\d*\.?\d+)$/); if (m) return { min: parseFloat(m[1]), exclusiveMin: true };
  m = s.match(/^<=\s*([+-]?\d*\.?\d+)$/); if (m) return { max: parseFloat(m[1]) };
  m = s.match(/^<\s*([+-]?\d*\.?\d+)$/); if (m) return { max: parseFloat(m[1]), exclusiveMax: true };
  return null;
}
function detectType(v) {
  if (/^(true|false)$/i.test(v)) return 'boolean';
  if (/^[+-]?\d+$/.test(v)) return 'integer';
  if (/^[+-]?\d*\.\d+$/.test(v)) return 'float';
  return 'string';
}
function humanize(key) {
  return String(key).replace(/[._\-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ').trim()
    .replace(/^./, c => c.toUpperCase()) || key;
}
module.exports = { inferSchema, humanize, parseHintComments, parseRange };