'use strict';
const fs = require('fs');
const path = require('path');
const log = require('./logger');

let watcher = null;
let currentPath = null;
let currentSize = 0;

function startTracking(logPath, onUpdate) {
  stopTracking(); // Если уже следили за чем-то, останавливаем

  if (!fs.existsSync(logPath)) {
    log.warn('live-tracker', 'Файл лога еще не создан: ' + logPath);
    return { ok: false, error: 'Log file not found' };
  }

  currentPath = logPath;
  currentSize = fs.statSync(logPath).size;
  log.info('live-tracker', `Started tracking ${path.basename(logPath)} from byte ${currentSize}`);

  // Следим за файлом каждую секунду (fs.watch на Windows работает нестабильно с логами)
  watcher = fs.watchFile(logPath, { interval: 1000 }, (curr, prev) => {
    // Если файл пересоздали (размер стал меньше) — сбрасываем позицию
    if (curr.size < currentSize) {
      currentSize = 0;
    }

    if (curr.size > currentSize) {
      const stream = fs.createReadStream(logPath, {
        start: currentSize,
        end: curr.size - 1,
        encoding: 'utf8'
      });

      let newData = '';
      stream.on('data', chunk => { newData += chunk; });
      stream.on('end', () => {
        currentSize = curr.size;
        const lines = newData.split(/\r?\n/).filter(Boolean);
        
        for (const line of lines) {
          if (/\[(ERROR|FATAL)\]/i.test(line)) {
            onUpdate({ level: 'ERROR', text: line });
          } else if (/\[(WARN|WARNING)\]/i.test(line)) {
            onUpdate({ level: 'WARN', text: line });
          }
        }
      });
    }
  });

  return { ok: true };
}

function stopTracking() {
  if (currentPath && watcher) {
    fs.unwatchFile(currentPath);
    log.info('live-tracker', 'Stopped tracking');
  }
  watcher = null;
  currentPath = null;
  currentSize = 0;
}

module.exports = { startTracking, stopTracking };