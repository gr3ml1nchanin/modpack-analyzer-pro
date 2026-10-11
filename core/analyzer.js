'use strict';
const log = require('./logger');

function analyzeModpack(scan) {
  const issues = [];
  const mods = scan.mods || [];

  const byId = new Map();
  for (const m of mods) {
    if (!m.id) continue;
    if (!byId.has(m.id)) byId.set(m.id, []);
    byId.get(m.id).push(m);
  }
  const dupes = [];
  byId.forEach((arr, id) => { if (arr.length > 1) dupes.push([id, arr]); });
  if (dupes.length) {
    issues.push({
      severity: 'critical',
      title: 'Дубликаты модов',
      description: dupes.length + ' ID представлены несколькими файлами.',
      items: dupes.map(pair => ({
        key: pair[0], text: pair[0],
        detail: pair[1].map(a => a.file).join(', '),
        files: pair[1].map(a => a.file)
      }))
    });
  }

  const knownIds = new Set(mods.map(m => m.id).filter(Boolean));
  const knownFiles = new Set(mods.map(m => m.file.toLowerCase()));
  const missing = [];
  for (const m of mods) {
    for (const dep of (m.dependencies || [])) {
      if (!dep.id) continue;
      const idLower = String(dep.id).toLowerCase();
      if (['minecraft','forge','fabricloader','fabric','fabric-api','neoforge','java'].indexOf(idLower) >= 0) continue;
      if (knownIds.has(dep.id)) continue;
      let maybeFile = false;
      knownFiles.forEach(f => { if (f.indexOf(idLower) >= 0) maybeFile = true; });
      if (maybeFile) continue;
      missing.push({
        key: dep.id, text: dep.id,
        detail: 'требуется модом ' + (m.name || m.id || m.file) + ' · ' + (dep.version || '*'),
        requiredBy: m.file
      });
    }
  }
  if (missing.length) {
    const grouped = new Map();
    for (const x of missing) {
      if (!grouped.has(x.key)) grouped.set(x.key, []);
      grouped.get(x.key).push(x);
    }
    const items = [];
    grouped.forEach((arr, id) => {
      items.push({ key: id, text: id, detail: arr.map(a => a.detail).join(' | ') });
    });
    issues.push({
      severity: 'critical',
      title: 'Отсутствующие зависимости',
      description: grouped.size + ' отсутствующих зависимостей.',
      items
    });
  }

  const noMeta = mods.filter(m => !m.id || m.error);
  if (noMeta.length) {
    issues.push({
      severity: 'warning',
      title: 'Моды без метаданных',
      description: noMeta.length + ' JAR-файлов без читаемых метаданных.',
      items: noMeta.map(m => ({ key: m.file, text: m.file, detail: m.error || 'нет ID' }))
    });
  }

  if (mods.length) {
    const avg = mods.reduce((a, m) => a + m.size, 0) / mods.length;
    const huge = mods.filter(m => m.size > avg * 8 && m.size > 50 * 1024 * 1024);
    if (huge.length) {
      issues.push({
        severity: 'info',
        title: 'Аномально крупные моды',
        description: huge.length + ' файлов сильно превышают средний размер.',
        items: huge.map(m => ({ key: m.file, text: m.file, detail: (m.size / 1024 / 1024).toFixed(1) + ' МБ' }))
      });
    }
  }

  const versionGroups = new Map();
  for (const m of mods) {
    if (!m.id) continue;
    if (!versionGroups.has(m.id)) versionGroups.set(m.id, new Set());
    versionGroups.get(m.id).add(m.version || '?');
  }
  const multiVer = [];
  versionGroups.forEach((set, id) => { if (set.size > 1) multiVer.push([id, set]); });
  if (multiVer.length) {
    issues.push({
      severity: 'warning',
      title: 'Несколько версий одного мода',
      description: multiVer.length + ' модов имеют более одной версии.',
      items: multiVer.map(pair => ({ key: pair[0], text: pair[0], detail: Array.from(pair[1]).join(', ') }))
    });
  }

  const summary = {
    critical: issues.filter(i => i.severity === 'critical').length,
    warning:  issues.filter(i => i.severity === 'warning').length,
    info:     issues.filter(i => i.severity === 'info').length,
    total:    issues.length,
    problems: issues.reduce((a, i) => a + i.items.length, 0)
  };

  log.info('analyzer', 'modpack analyzed', summary);
  return { issues, summary };
}

module.exports = { analyzeModpack };