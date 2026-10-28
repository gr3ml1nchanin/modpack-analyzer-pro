'use strict';
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const log = require('./logger');
const API = 'https://api.modrinth.com/v2';
const CACHE_TTL = 1000 * 60 * 60 * 24;
const UA = 'katan/1.0';

class Modrinth {
  constructor(cacheDir) { this.cacheDir = cacheDir; this.memCache = new Map(); }
  async _cacheGet(key) {
    if (this.memCache.has(key)) return this.memCache.get(key);
    const file = path.join(this.cacheDir, key + '.json');
    try {
      const st = await fsp.stat(file);
      if (Date.now() - st.mtimeMs > CACHE_TTL) return null;
      const data = JSON.parse(await fsp.readFile(file, 'utf8'));
      this.memCache.set(key, data); return data;
    } catch { return null; }
  }
  async _cacheSet(key, value) {
    this.memCache.set(key, value);
    try { await fsp.mkdir(this.cacheDir, { recursive: true });
      await fsp.writeFile(path.join(this.cacheDir, key + '.json'), JSON.stringify(value));
    } catch (e) { log.warn('modrinth', 'cache write failed', { e: e.message }); }
  }
  async _fetch(url, opts = {}) {
    const key = 'req_' + crypto.createHash('sha1').update(url + JSON.stringify(opts)).digest('hex');
    const cached = await this._cacheGet(key);
    if (cached) return cached;
    log.debug('modrinth', 'GET ' + url);
    const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
    if (!res.ok) throw new Error('Modrinth ' + res.status);
    const data = await res.json();
    await this._cacheSet(key, data);
    return data;
  }
  projectByHash(sha1) { return this._fetch(API + '/version_file/' + sha1 + '?algorithm=sha1'); }
  project(idOrSlug) { return this._fetch(API + '/project/' + idOrSlug); }
  search(query, facets) {
    const params = new URLSearchParams({ query, limit: '10' });
    if (facets) params.set('facets', JSON.stringify(facets));
    return this._fetch(API + '/search?' + params);
  }
}
module.exports = Modrinth;