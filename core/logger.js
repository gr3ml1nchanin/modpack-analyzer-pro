'use strict';
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40, FATAL: 50 };

class Logger {
  constructor(opts = {}) {
    this.dir = opts.dir || path.join(os.homedir(), '.mc-analyzer', 'logs');
    this.debugEnabled = opts.debug !== false;
    fs.mkdirSync(this.dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.mainStream  = fs.createWriteStream(path.join(this.dir, 'app-' + stamp + '.log'),   { flags: 'a' });
    this.debugStream = fs.createWriteStream(path.join(this.dir, 'debug-' + stamp + '.log'), { flags: 'a' });
    this._subs = [];
  }
  subscribe(fn) { this._subs.push(fn); return () => { this._subs = this._subs.filter(f => f !== fn); }; }
  _emit(e) { for (const fn of this._subs) { try { fn(e); } catch {} } }
  _write(level, scope, msg, meta) {
    const ts = new Date().toISOString();
    const line = '[' + ts + '] [' + level + '] [' + scope + '] ' + msg + (meta ? ' :: ' + safeJSON(meta) : '');
    if (LEVELS[level] >= LEVELS.INFO) this.mainStream.write(line + '\n');
    if (this.debugEnabled) this.debugStream.write(line + '\n');
    this._emit({ ts, level, scope, msg, meta });
    if (level === 'ERROR' || level === 'FATAL') console.error('[' + level + '][' + scope + ']', msg);
    else if (level === 'WARN') console.warn('[' + level + '][' + scope + ']', msg);
  }
  debug(s,m,x){ this._write('DEBUG',s,m,x); }
  info (s,m,x){ this._write('INFO', s,m,x); }
  warn (s,m,x){ this._write('WARN', s,m,x); }
  error(s,m,x){ this._write('ERROR',s,m,x); }
  fatal(s,m,x){ this._write('FATAL',s,m,x); }
  async timed(scope, label, fn) {
    const t = Date.now();
    this.debug(scope, '-> ' + label);
    try { const r = await fn(); this.debug(scope, '<- ' + label + ' (' + (Date.now() - t) + 'ms)'); return r; }
    catch (e) { this.error(scope, 'X ' + label + ' (' + (Date.now() - t) + 'ms): ' + e.message); throw e; }
  }
  close() { this.mainStream.end(); this.debugStream.end(); }
}
function safeJSON(o){ try { return JSON.stringify(o); } catch { return '[circular]'; } }
const instance = new Logger({ debug: process.env.MC_ANALYZER_DEBUG !== '0' });
module.exports = instance;
module.exports.Logger = Logger;