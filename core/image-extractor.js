'use strict';
const fsp = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip');

/**
 * Пытается найти иконку мода в JAR и сохранить её в кэш.
 * Возвращает путь к сохранённой иконке или null.
 */
async function extractModIcon(jarPath, modId, cacheDir) {
  try {
    const zip = new AdmZip(jarPath);
    const names = new Set(zip.getEntries().map(e => e.entryName.toLowerCase()));

    const candidates = [
      'icon.png', 'logo.png', 'icon.jpg', 'logo.jpg',
      'assets/' + modId.toLowerCase() + '/icon.png',
      'assets/' + modId.toLowerCase() + '/textures/icon.png'
    ];

    let iconEntry = null;
    for (const c of candidates) {
      if (names.has(c)) {
        iconEntry = zip.getEntry(zip.getEntries().find(e => e.entryName.toLowerCase() === c).entryName);
        break;
      }
    }

    if (!iconEntry) return null;

    // Создаем папку кэша, если её нет
    await fsp.mkdir(cacheDir, { recursive: true });
    
    // Формируем путь (сохраняем как .png для универсальности)
    const safeId = modId.replace(/[^a-z0-9_\-]/gi, '_');
    const savePath = path.join(cacheDir, safeId + '.png');

    // Записываем файл (байты)
    const buffer = iconEntry.getData();
    await fsp.writeFile(savePath, buffer);

    return savePath;
  } catch (err) {
    return null;
  }
}

module.exports = { extractModIcon };