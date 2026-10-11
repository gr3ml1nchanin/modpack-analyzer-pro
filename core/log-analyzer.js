'use strict';
const fsp = require('fs').promises;
const path = require('path');
const log = require('./logger');

const RULES = [
  { id:'duplicate_mod_id', re:/Duplicate mod|DuplicateModId|already registered|modid.*already/i, category:'id', severity:'critical',
    why:['Два мода регистрируют один ID','Старая и новая версия одного мода, или форк'],
    fix:'Найти дублирующийся mod id в mods.toml/fabric.mod.json. Оставить одну версию.' },
  { id:'missing_dependency', re:/Missing (or unsupported) (mandatory )?dependenc|requires .* which is missing/i, category:'dependency', severity:'critical',
    why:['Мод требует библиотеку, которой нет','Библиотека есть, но версия не подходит'],
    fix:'Установить недостающий мод/библиотеку. Проверить диапазон версий.' },
  { id:'mixin_apply_fail', re:/Mixin apply failed|MixinApplyError|MixinTransformerError/i, category:'mixin', severity:'critical',
    why:['Два мода патчат один метод','Целевой метод изменён другим модом','Версия MC не соответствует'],
    fix:'Проверить совместимость миксинов. Обновить моды.' },
  { id:'tag_missing', re:/Unknown item tag|Tag .* not found|Missing tag/i, category:'tag', severity:'warn',
    why:['Тег удалён или переименован','Потребитель ссылается на тег отсутствующего поставщика'],
    fix:'Найти источник тега в data tags.' },
  { id:'registry_collision', re:/Registry (entry|name).*(already|duplicate)|Trying to register duplicate/i, category:'id', severity:'critical',
    why:['Два мода используют одинаковый namespace:path','Датапак конфликтует с модом'],
    fix:'Найти пересечение по namespace.' },
  { id:'recipe_conflict', re:/Recipe .* already exists|Duplicate recipe|conflicting recipe/i, category:'recipe', severity:'warn',
    why:['Два мода добавляют один рецепт','Датапак дублирует рецепт'],
    fix:'Отключить через KubeJS или датапак.' },
  { id:'config_parse_error', re:/Failed to (parse|load|read) config|ConfigParseException|Invalid config/i, category:'config', severity:'warn',
    why:['Конфиг повреждён','Структура конфига изменилась после обновления'],
    fix:'Удалить конфиг, мод пересоздаст дефолт.' },
  { id:'oom', re:/OutOfMemoryError|Java heap space/i, category:'runtime', severity:'critical',
    why:['Мало RAM','Утечка памяти','Большие структуры'],
    fix:'Увеличить -Xmx.' },
  { id:'class_not_found', re:/ClassNotFoundException|NoClassDefFoundError/i, category:'dependency', severity:'critical',
    why:['Класс удалён из мода, но вызывается','Версия библиотеки не совпадает'],
    fix:'Найти вызывающий класс, обновить мод.' }
];

function parseLine(line, n) {
  let level = 'INFO';
  if (/\[(FATAL)\]/i.test(line) || /\/FATAL/.test(line)) level = 'FATAL';
  else if (/\[(ERROR)\]/i.test(line) || /\/ERROR/.test(line)) level = 'ERROR';
  else if (/\[(WARN|WARNING)\]/i.test(line) || /\/WARN/.test(line)) level = 'WARN';
  const c = line.match(/Caused by:\s*([^\n]+)/);
  const a = line.match(/at ([\w.$]+\([^)]+\))/);
  return { n, level, text: line, cause: c ? c[1].trim() : null, location: a ? a[1] : null };
}

function applyFiveWhys(line) {
  const chain = [];
  const rule = RULES.find(r => r.re.test(line.text));
  if (rule) {
    for (let d = 0; d < rule.why.length && d < 5; d++) {
      chain.push({ depth: d, ruleId: rule.id, category: rule.category, severity: rule.severity,
        cause: rule.why[d], details: rule.why, fix: rule.fix });
    }
  } else if (line.location) {
    chain.push({ depth: 0, ruleId: 'generic', category: 'unknown',
      severity: line.level === 'ERROR' || line.level === 'FATAL' ? 'critical' : 'warn',
      cause: line.text, details: [line.location], fix: 'Ручной анализ стектрейса.' });
  }
  return chain;
}

function sevWeight(s) { return s === 'critical' ? 2 : s === 'warn' ? 1 : 0; }

function buildTree(analyzedLines) {
  const byCat = new Map();
  for (const l of analyzedLines) {
    const rule = RULES.find(r => r.re.test(l.text));
    const cat = rule ? rule.category : 'unknown';
    const sev = rule ? rule.severity : (l.level === 'WARN' ? 'warn' : 'critical');
    if (!byCat.has(cat)) byCat.set(cat, { category: cat, severity: sev, items: [] });
    byCat.get(cat).items.push(Object.assign({}, l, { rule: rule || null, severity: sev }));
    if (sev === 'critical') byCat.get(cat).severity = 'critical';
  }
  const out = [];
  byCat.forEach(g => {
    out.push({ category: g.category, severity: g.severity, count: g.items.length,
      nodes: g.items.sort((a, b) => sevWeight(b.severity) - sevWeight(a.severity)) });
  });
  return out;
}

async function analyzeLog(logPath) {
  const content = await fsp.readFile(logPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const interesting = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/\[(WARN|WARNING|ERROR|FATAL)\]|\/(WARN|ERROR|FATAL)/.test(lines[i])) continue;
    interesting.push(parseLine(lines[i], i + 1));
  }
  const analyzed = interesting.map(l => Object.assign({}, l, { chain: applyFiveWhys(l) }));
  const tree = buildTree(analyzed);
  const summary = {
    total: interesting.length,
    critical: analyzed.filter(a => a.chain.some(c => c.severity === 'critical')).length,
    warn: analyzed.filter(a => a.level === 'WARN').length,
    categories: tree.map(g => ({ category: g.category, count: g.count, severity: g.severity })),
    topFix: null
  };
  const firstCrit = tree.find(g => g.severity === 'critical');
  if (firstCrit && firstCrit.nodes[0] && firstCrit.nodes[0].chain[0]) summary.topFix = firstCrit.nodes[0].chain[0].fix;
  return { tree, summary, source: path.basename(logPath) };
}
module.exports = { analyzeLog, RULES };