'use strict';
const INTERNAL_RE = /^(_.*|internal[._]?.*|debug[._]?.*|dev[._]?.*|experimental.*)$/i;
const ADVANCED_RE = /^(advanced|expert|technical|dangerous)/i;

class TextDoc {
  constructor(text, opts) {
    opts = opts || {};
    this.format = opts.format || 'toml';
    this.original = text;
    this.lines = text.split(/\r?\n/);
    this.entries = [];
    this.sections = [];
    this._parse();
  }
  _parse() {
    let currentSection = []; let i = 0;
    while (i < this.lines.length) {
      const raw = this.lines[i];
      if (!raw.trim() || this._isCommentLine(raw)) { i++; continue; }
      const clean = this._stripComment(raw);
      let m = clean.trim().match(/^\[\[([^\]]+)\]\]\s*$/);
      if (m && this.format === 'toml') {
        currentSection = m[1].split('.').map(x => x.trim()).filter(Boolean);
        this.sections.push({ path: currentSection.slice(), lineIdx: i, array: true });
        i++; continue;
      }
      m = clean.trim().match(/^\[([^\]]+)\]\s*$/);
      if (m) {
        currentSection = m[1].split('.').map(x => x.trim()).filter(Boolean);
        this.sections.push({ path: currentSection.slice(), lineIdx: i, array: false });
        i++; continue;
      }
      const kv = this._parseKeyValueAt(i);
      if (kv) {
        this.entries.push({
          section: currentSection.slice(), key: kv.key, path: currentSection.concat([kv.key]),
          rawValue: kv.rawValue, valueType: detectType(kv.rawValue, this.format),
          lineIdx: i, endLineIdx: kv.endLineIdx, valueStart: kv.valueStart, valueEnd: kv.valueEnd
        });
        i = kv.endLineIdx + 1;
        continue;
      }
      i++;
    }
  }
  _parseKeyValueAt(startLine) {
    const raw = this.lines[startLine];
    const clean = this._stripComment(raw);
    let eqIdx = -1, inString = null;
    for (let i = 0; i < clean.length; i++) {
      const c = clean[i];
      if (inString) {
        if (c === '\\' && inString === '"') { i++; continue; }
        if (c === inString) inString = null;
      } else {
        if (c === '"' || c === "'") inString = c;
        else if (c === '=' || (this.format === 'properties' && c === ':')) { eqIdx = i; break; }
      }
    }
    if (eqIdx < 0) return null;
    const keyRaw = clean.slice(0, eqIdx).trim();
    if (!keyRaw) return null;
    const key = unquote(keyRaw);
    const valueStart = eqIdx + 1;
    let valueEnd = raw.length, inString2 = null;
    for (let i = valueStart; i < raw.length; i++) {
      const c = raw[i];
      if (inString2) {
        if (c === '\\' && inString2 === '"') { i++; continue; }
        if (c === inString2) inString2 = null;
      } else {
        if (c === '"' || c === "'") inString2 = c;
        else if (c === '#' || (this.format === 'properties' && c === '!')) { valueEnd = i; break; }
      }
    }
    let rawValue = raw.slice(valueStart, valueEnd).trim();
    let endLineIdx = startLine;
    if (this.format === 'toml' && (rawValue.indexOf('"""') === 0 || rawValue.indexOf("'''") === 0)) {
      const delim = rawValue.slice(0, 3);
      let acc = rawValue;
      let j = startLine;
      while (acc.indexOf(delim, 3) < 0 && j < this.lines.length - 1) { j++; acc += '\n' + this.lines[j]; }
      rawValue = acc;
      endLineIdx = j;
    }
    return { key, valueStart, valueEnd, rawValue, endLineIdx };
  }
  _isCommentLine(line) {
    const t = line.trimStart();
    if (this.format === 'properties') return t.charAt(0) === '#' || t.charAt(0) === '!';
    return t.charAt(0) === '#';
  }
  _stripComment(line) {
    let inString = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inString) {
        if (c === '\\' && inString === '"') { i++; continue; }
        if (c === inString) inString = null;
      } else {
        if (c === '"' || c === "'") inString = c;
        else if (c === '#' || (this.format === 'properties' && c === '!')) return line.slice(0, i);
      }
    }
    return line;
  }
  setValueByPath(pathArr, newValue) {
    const entry = this.entries.find(e => e.path.length === pathArr.length && e.path.every((p, i) => p === pathArr[i]));
    if (!entry) return false;
    const line = this.lines[entry.lineIdx];
    const before = line.slice(0, entry.valueStart);
    const after = line.slice(entry.valueEnd);
    const serialized = serializeValue(newValue, this.format);
    const tail = after.length > 0 ? ' ' + after.replace(/^[ \t]+/, '') : '';
    this.lines[entry.lineIdx] = before + ' ' + serialized + tail;
    entry.rawValue = serialized;
    entry.valueType = detectType(serialized, this.format);
    return true;
  }
  toString() { return this.lines.join('\n'); }
}
function unquote(s) {
  if ((s.charAt(0) === '"' && s.slice(-1) === '"') || (s.charAt(0) === "'" && s.slice(-1) === "'")) return s.slice(1, -1);
  return s;
}
function detectType(raw, format) {
  const v = raw.trim();
  if (!v) return 'string';
  if (v === 'true' || v === 'false') return 'boolean';
  if (/^[+-]?\d+$/.test(v)) return 'integer';
  if (/^[+-]?(\d+\.\d*|\.\d+)([eE][+-]?\d+)?$/.test(v)) return 'float';
  if (v.charAt(0) === '[') return 'array';
  if (v.charAt(0) === '{') return 'inline-table';
  if (v.charAt(0) === '"' || v.charAt(0) === "'") return 'string';
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return 'datetime';
  return 'string';
}
function parseValue(raw, type) {
  const v = raw.trim();
  switch (type) {
    case 'boolean': return v === 'true';
    case 'integer': return parseInt(v, 10);
    case 'float': return parseFloat(v);
    case 'array': return parseTomlArray(v);
    case 'string': {
      if (v.indexOf('"""') === 0 || v.indexOf("'''") === 0) return v.slice(3, -3);
      if ((v.charAt(0) === '"' && v.slice(-1) === '"') || (v.charAt(0) === "'" && v.slice(-1) === "'")) return v.slice(1, -1);
      return v;
    }
    default: return v;
  }
}
function parseTomlArray(raw) {
  const inner = raw.replace(/^\[|\]$/g, '').trim();
  if (!inner) return [];
  const out = [];
  let cur = '';
  let inString = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (inString) {
      cur += c;
      if (c === '\\' && inString === '"') { cur += inner[++i]; continue; }
      if (c === inString) inString = null;
    } else {
      if (c === '"' || c === "'") { inString = c; cur += c; }
      else if (c === ',') { out.push(parseValue(cur.trim(), detectType(cur.trim(), 'toml'))); cur = ''; }
      else cur += c;
    }
  }
  if (cur.trim()) out.push(parseValue(cur.trim(), detectType(cur.trim(), 'toml')));
  return out;
}
function serializeValue(v, format) {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('Non-finite');
    return String(v);
  }
  if (Array.isArray(v)) return '[' + v.map(x => serializeValue(x, format)).join(', ') + ']';
  if (v === null || v === undefined) return '""';
  const s = String(v);
  if (s.indexOf('\n') >= 0 || s.indexOf('"""') >= 0) return '"""' + s.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"') + '"""';
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
module.exports = { TextDoc, detectType, parseValue, serializeValue, INTERNAL_RE, ADVANCED_RE };