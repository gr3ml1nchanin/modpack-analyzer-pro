window.Views = window.Views || {};
window.Views.configs = (function () {
  function t(k, v) { return window.I18n.t(k, v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function human(b) {
    if (!b) return '0 ' + t('human.b');
    if (b < 1024) return b + ' ' + t('human.b');
    if (b < 1024*1024) return (b/1024).toFixed(1) + ' ' + t('human.kb');
    return (b/1024/1024).toFixed(1) + ' ' + t('human.mb');
  }
  function deepClone(x) { return JSON.parse(JSON.stringify(x)); }
  function deepEqual(a, b) { try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; } }
  function setAtPath(obj, path, value) {
    if (path.length === 0) return value;
    let cur = obj;
    for (let i = 0; i < path.length - 1; i++) {
      const k = path[i];
      if (cur[k] === undefined || cur[k] === null) cur[k] = typeof path[i+1] === 'number' ? [] : {};
      cur = cur[k];
    }
    cur[path[path.length - 1]] = value;
    return obj;
  }
  function getAtPath(obj, path) {
    let cur = obj;
    for (const k of path) cur = cur[k];
    return cur;
  }

  function mount(container) {
    let state = window.State.data;

    let filter = '';
    let cfgData = null;
    let activeTab = 'gui';
    let changes = new Map();
    let rawEditValue = null;
    let showInternal = false;
    let searchQuery = '';

    function render() {
      const oldList = document.getElementById('cfg-list');
      const savedListScroll = oldList ? oldList.scrollTop : 0;
      const oldForm = document.querySelector('.cfg-form');
      const savedFormScroll = oldForm ? oldForm.scrollTop : 0;
      const oldRaw = document.getElementById('cfg-edit');
      const savedRawScroll = oldRaw ? oldRaw.scrollTop : 0;

      const cfgList = state.scan ? state.scan.configs : [];
      const filtered = cfgList.filter(c => !filter || c.rel.toLowerCase().indexOf(filter.toLowerCase()) >= 0);

      const subText = t('cfg.sub', {shown: filtered.length, total: cfgList.length}) +
        (cfgData ? t('cfg.sub.open', {file: cfgData.path.split(/[\\/]/).pop()}) : '');

      container.innerHTML = `
        <div class="view">
          <div class="view-header">
            <div>
              <div class="view-title">${t('cfg.title')}</div>
              <div class="view-sub">${subText}</div>
            </div>
            <div class="view-actions">
              <input class="input" id="cfg-q" placeholder="${t('cfg.filter')}" value="${esc(filter)}"/>
            </div>
          </div>
          <div class="view-body" style="padding:0 32px 0; display:flex; min-height:0">
            <div class="split two" style="width:100%">
              <div class="split-panel split-left">
                <div class="panel-head">${t('cfg.panel.files')}</div>
                <div class="panel-list" id="cfg-list">${filtered.slice(0, 400).map(cfgItem).join('')}</div>
              </div>
              <div class="split-panel split-right" id="cfg-panel">
                ${cfgData ? renderOpen() : '<div class="empty-state">' + t('cfg.empty') + '</div>'}
              </div>
            </div>
          </div>
        </div>`;

      const q = document.getElementById('cfg-q');
      if (q) q.oninput = e => {
        filter = e.target.value; render();
        const nq = document.getElementById('cfg-q'); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); }
      };

      document.querySelectorAll('#cfg-list .list-item').forEach(el => {
        el.onclick = () => loadCfg(el.dataset.path);
      });

      if (cfgData) bindOpenEvents();

      const newList = document.getElementById('cfg-list');
      if (newList && savedListScroll) newList.scrollTop = savedListScroll;
      const newForm = document.querySelector('.cfg-form');
      if (newForm && savedFormScroll) newForm.scrollTop = savedFormScroll;
      const newRaw = document.getElementById('cfg-edit');
      if (newRaw && savedRawScroll) newRaw.scrollTop = savedRawScroll;
    }

    function cfgItem(c) {
      const ext = c.ext.replace('.', '').toUpperCase();
      const cls = ext === 'TOML' ? 'toml' : 'json';
      const active = cfgData && cfgData.path === c.path;
      return '<div class="list-item' + (active ? ' active' : '') + '" data-path="' + esc(c.path) + '">' +
        '<span class="badge ' + cls + '">' + ext + '</span>' +
        '<span class="li-title" title="' + esc(c.rel) + '">' + esc(c.rel) + '</span>' +
        '<span class="li-sub">' + (c.size / 1024).toFixed(1) + ' ' + t('human.kb') + '</span>' +
      '</div>';
    }

    async function loadCfg(p) {
      try {
        const data = await window.API.cfg.load(p);
        cfgData = data;
        changes.clear();
        rawEditValue = null;
        activeTab = 'gui';
        searchQuery = '';
        showInternal = false;
        render();
      } catch (e) {
        window.Toast.error(t('cfg.openFailed'), e.message);
      }
    }

    function renderOpen() {
      const hasSchema = cfgData.schema && cfgData.schema.sections && cfgData.schema.sections.length;
      return `
        <div class="panel-head" style="gap:12px; padding:10px 14px">
          <span style="color:var(--accent);font-size:16px">●</span>
          <span style="text-transform:none;letter-spacing:0;font-size:11px;font-family:var(--mono);color:var(--text-dim);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(cfgData.path)}">${esc(cfgData.path)}</span>
          <span style="text-transform:none;letter-spacing:0;font-size:11px;color:var(--text-dimmer)">${human(cfgData.size)}</span>
          ${changes.size ? '<span class="cfg-dirty-dot" title="' + t('cfg.dirtyTitle') + '"></span>' : ''}
          <button class="btn" id="cfg-reveal" style="padding:5px 10px;font-size:11px">${t('cfg.reveal')}</button>
        </div>

        <div class="cfg-toolbar">
          <div class="cfg-tabs">
            <button class="cfg-tab ${activeTab==='gui'?'active':''}" data-tab="gui" ${!hasSchema?'disabled title="' + t('cfg.notConfigured') + '"':''}>${t('cfg.tab.gui')}</button>
            <button class="cfg-tab ${activeTab==='raw'?'active':''}" data-tab="raw">${t('cfg.tab.raw')}</button>
          </div>
          ${activeTab === 'gui' && hasSchema ? `
            <input class="input" id="cfg-search" placeholder="${t('cfg.search')}" value="${esc(searchQuery)}" style="margin-left:8px"/>
            <label style="display:flex;align-items:center;gap:6px;color:var(--text-dim);font-size:11px;cursor:pointer;user-select:none;margin-left:8px">
              <input type="checkbox" id="cfg-show-internal" ${showInternal?'checked':''}/>
              ${t('cfg.showInternal')}
            </label>
          ` : ''}
          <div style="flex:1"></div>
          <div class="cfg-actions" style="display:flex;gap:8px;align-items:center">
            ${changes.size ? '<button class="btn" id="cfg-discard" style="padding:6px 12px;font-size:11px">' + t('cfg.btn.discard', {n: changes.size}) + '</button>' : ''}
            <button class="btn primary" id="cfg-save" style="padding:6px 14px;font-size:11px">${changes.size ? t('cfg.btn.saveChanges') : t('cfg.btn.save')}</button>
          </div>
        </div>

        <div style="flex:1; min-height:0; display:flex; flex-direction:column">
          ${activeTab === 'gui' && hasSchema ? renderGui() : renderRaw()}
        </div>`;
    }

    function renderGui() {
      const sections = cfgData.schema.sections;
      const q = searchQuery.toLowerCase();

      const visibleSections = sections.map(sec => {
        const entries = sec.entries.filter(en => {
          if (!showInternal && (en.internal || en.advanced)) return false;
          if (q) {
            const hay = (en.key + ' ' + en.label + ' ' + (en.hint || '')).toLowerCase();
            if (hay.indexOf(q) < 0) return false;
          }
          return true;
        });
        return Object.assign({}, sec, { entries });
      }).filter(sec => sec.entries.length > 0);

      if (!visibleSections.length) {
        return '<div class="empty-state" style="padding:40px 0">' + t('cfg.notFound') + '</div>';
      }

      return '<div class="cfg-form">' + visibleSections.map(renderSection).join('') + '</div>';
    }

    function renderSection(sec) {
      return '<div class="cfg-section">' +
        '<div class="cfg-section-head">' +
          '<span class="cfg-section-title">' + esc(sec.title) + '</span>' +
          (sec.path.length ? '<span class="cfg-section-path">[' + esc(sec.path.join('.')) + ']</span>' : '') +
          '<span class="cfg-section-count">' + sec.entries.length + '</span>' +
        '</div>' +
        sec.entries.map(renderField).join('') +
      '</div>';
    }

    function renderField(en) {
      const pathKey = en.path.join('|');
      const isModified = changes.has(pathKey);
      const currentValue = isModified ? changes.get(pathKey) : en.value;
      const hasDefault = en.default !== undefined && en.default !== null;

      const labelHtml =
        '<div class="cfg-field-label">' +
          '<div class="cfg-field-name">' +
            esc(en.label || en.key) +
            (en.internal ? '<span class="cfg-flag internal">' + t('cfg.flag.internal') + '</span>' : '') +
            (en.advanced ? '<span class="cfg-flag advanced">' + t('cfg.flag.advanced') + '</span>' : '') +
            (isModified ? '<span class="cfg-flag" style="background:rgba(74,222,128,.15);color:var(--emerald)">' + t('cfg.flag.modified') + '</span>' : '') +
          '</div>' +
          '<div class="cfg-field-key">' + esc(en.key) +
            (en.type !== 'string' ? ' · ' + en.type : '') +
            (en.range ? ' · ' + formatRange(en.range) : '') +
          '</div>' +
          (en.hint
            ? '<div class="cfg-field-hint">' + esc(en.hint) + '</div>'
            : '<div class="cfg-field-hint-empty">' + t('cfg.noHint') + '</div>') +
        '</div>';

      const v = currentValue;
      const isArrayOfObjects = Array.isArray(v) && v.length > 0 &&
        v.every(x => x && typeof x === 'object' && !Array.isArray(x));
      const isPlainObject = v && typeof v === 'object' && !Array.isArray(v);
      const isComplexArray = Array.isArray(v) && v.some(x => x && typeof x === 'object');
      const isComplexField =
        en.type === 'array-objects' || en.type === 'array-mixed' ||
        en.type === 'object' || en.type === 'inline-table' ||
        isArrayOfObjects || isPlainObject || isComplexArray;

      let controlHtml = '';
      if (en.type === 'boolean') {
        controlHtml = renderBoolean(en, currentValue, pathKey);
      } else if (en.type === 'integer' || en.type === 'float') {
        controlHtml = renderNumber(en, currentValue, pathKey);
      } else if (en.type === 'string' && en.choices && en.choices.length) {
        controlHtml = renderChoices(en, currentValue, pathKey);
      } else if (isComplexField) {
        controlHtml = '<div style="min-width:0">' +
          window.JsonForm.renderValue(en.path, en.path, en.key, currentValue, 0) +
        '</div>';
      } else if (Array.isArray(v)) {
        controlHtml = '<div style="min-width:0">' +
          window.JsonForm.renderValue(en.path, en.path, en.key, currentValue, 0) +
        '</div>';
      } else {
        controlHtml = renderText(en, currentValue, pathKey);
      }

      return '<div class="cfg-field' + (isModified ? ' modified' : '') + (isComplexField ? ' cfg-field-wide' : '') + '">' +
        labelHtml +
        '<div class="cfg-field-control">' +
          (hasDefault ? '<button class="cfg-default-btn" data-default="' + pathKey + '" title="' + esc(t('cfg.btn.defaultTitle', {v: String(en.default)})) + '">' + t('cfg.btn.default') + '</button>' : '') +
          controlHtml +
        '</div>' +
      '</div>';
    }

    function formatRange(r) {
      if (r.min !== undefined && r.max !== undefined) return r.min + '…' + r.max;
      if (r.min !== undefined) return '≥ ' + r.min;
      if (r.max !== undefined) return '≤ ' + r.max;
      return '';
    }
    function renderBoolean(en, val, key) {
      return '<label class="cfg-switch">' +
        '<input type="checkbox" data-path="' + esc(key) + '" ' + (val ? 'checked' : '') + '/>' +
        '<span class="cfg-switch-slider"></span>' +
      '</label>';
    }
    function renderNumber(en, val, key) {
      const isInt = en.type === 'integer';
      const step = isInt ? 1 : 0.01;
      const hasRange = en.range && en.range.min !== undefined && en.range.max !== undefined;
      if (hasRange) {
        const safeVal = Number(val);
        return '<input type="range" class="cfg-slider" data-path="' + esc(key) + '" min="' + en.range.min + '" max="' + en.range.max + '" step="' + step + '" value="' + safeVal + '"/>' +
          '<input type="number" class="cfg-number" data-path="' + esc(key) + '" data-pair="1" min="' + en.range.min + '" max="' + en.range.max + '" step="' + step + '" value="' + safeVal + '"/>';
      }
      return '<input type="number" class="cfg-number" data-path="' + esc(key) + '" step="' + step + '" value="' + Number(val) + '" style="width:130px"/>';
    }
    function renderChoices(en, val, key) {
      return '<select class="cfg-select" data-path="' + esc(key) + '">' +
        en.choices.map(c => '<option value="' + esc(c) + '"' + (String(c) === String(val) ? ' selected' : '') + '>' + esc(c) + '</option>').join('') +
      '</select>';
    }
    function renderText(en, val, key) {
      const s = String(val == null ? '' : val);
      if (s.length > 60) return '<textarea class="cfg-text" data-path="' + esc(key) + '" rows="2" style="resize:vertical">' + esc(s) + '</textarea>';
      return '<input type="text" class="cfg-text" data-path="' + esc(key) + '" value="' + esc(s) + '"/>';
    }

    function renderRaw() {
      const raw = rawEditValue != null ? rawEditValue : cfgData.raw;
      const lines = raw.split(/\r?\n/);
      return '<div class="code-wrap" style="background:var(--bg-card); flex:1; min-height:0">' +
        '<div class="code-gutter">' + lines.map((_, i) => i + 1).join('<br>') + '</div>' +
        '<textarea id="cfg-edit" spellcheck="false" style="flex:1;background:transparent;border:0;outline:0;resize:none;color:var(--text);font-family:var(--mono);font-size:12px;line-height:1.6;padding:14px 18px;white-space:pre;overflow:auto">' + esc(raw) + '</textarea>' +
      '</div>';
    }

    function bindOpenEvents() {
      const reveal = document.getElementById('cfg-reveal');
      if (reveal) reveal.onclick = () => window.API.sh.reveal(cfgData.path);

      document.querySelectorAll('.cfg-tab').forEach(tab => {
        tab.onclick = () => { activeTab = tab.dataset.tab; render(); };
      });

      const search = document.getElementById('cfg-search');
      if (search) search.oninput = e => {
        searchQuery = e.target.value;
        const pos = search.selectionStart;
        render();
        const ns = document.getElementById('cfg-search');
        if (ns) { ns.focus(); ns.setSelectionRange(pos, pos); }
      };

      const chk = document.getElementById('cfg-show-internal');
      if (chk) chk.onchange = e => { showInternal = e.target.checked; render(); };

      const save = document.getElementById('cfg-save');
      if (save) save.onclick = saveChanges;

      const disc = document.getElementById('cfg-discard');
      if (disc) disc.onclick = () => {
        changes.clear(); rawEditValue = null; render();
        window.Toast.info(t('cfg.discardToast'));
      };

      const panel = document.getElementById('cfg-panel');
      if (!panel) return;

      panel.querySelectorAll('[data-path]').forEach(el => {
        const handler = () => handleSimpleChange(el);
        if (el.tagName === 'SELECT') el.onchange = handler;
        else if (el.type === 'checkbox') el.onchange = handler;
        else if (el.type === 'range' || el.type === 'number') {
          el.oninput = handler;
          if (el.type === 'range') el.addEventListener('input', () => {
            const num = el.parentElement.querySelector('input[type="number"][data-path="' + CSS.escape(el.dataset.path) + '"]');
            if (num) num.value = el.value;
          });
          if (el.type === 'number') el.addEventListener('input', () => {
            const rng = el.parentElement.querySelector('input[type="range"][data-path="' + CSS.escape(el.dataset.path) + '"]');
            if (rng) rng.value = el.value;
          });
        }
        else el.oninput = handler;
      });

      panel.querySelectorAll('.cfg-default-btn').forEach(b => {
        b.onclick = () => {
          const key = b.dataset.default;
          const en = findEntry(key.split('|'));
          if (!en) return;
          changes.set(key, en.default);
          render();
        };
      });

      bindJsonForm(panel);

      const ta = document.getElementById('cfg-edit');
      if (ta) ta.oninput = e => { rawEditValue = e.target.value; };
    }

    function bindJsonForm(panel) {
      panel.querySelectorAll('[data-jf-root]').forEach(el => {
        const rootKey = el.dataset.jfRoot;
        const jsonPath = el.dataset.jfPath ? JSON.parse(el.dataset.jfPath) : [];
        const handler = () => handleJsonChange(el, rootKey, jsonPath);

        if (el.dataset.jfRawjson === '1') { el.oninput = handler; return; }
        if (el.tagName === 'SELECT') el.onchange = handler;
        else if (el.type === 'checkbox') el.onchange = handler;
        else if (el.type === 'range') {
          el.oninput = handler;
          el.addEventListener('input', () => {
            const num = el.parentElement.querySelector('input[type="number"][data-jf-pair="1"]');
            if (num) num.value = el.value;
          });
        }
        else if (el.type === 'number') {
          el.oninput = handler;
          el.addEventListener('input', () => {
            const rng = el.parentElement.querySelector('input[type="range"]');
            if (rng) rng.value = el.value;
          });
        }
        else if (el.type === 'color') {
          el.oninput = handler;
          el.addEventListener('input', () => {
            const pair = el.parentElement.querySelector('input[type="text"][data-jf-pair="1"]');
            if (pair) pair.value = el.value;
          });
        }
        else el.oninput = handler;
      });

      panel.querySelectorAll('[data-jf-action]').forEach(b => {
        b.onclick = () => {
          const action = b.dataset.jfAction;
          const rootKey = b.dataset.jfRoot;
          const jsonPath = b.dataset.jfPath ? JSON.parse(b.dataset.jfPath) : [];
          const en = findEntry(rootKey.split('|'));
          if (!en) return;

          let base = changes.has(rootKey) ? deepClone(changes.get(rootKey)) : deepClone(en.value);
          const target = getAtPath(base, jsonPath);

          if (action === 'add-item') {
            if (Array.isArray(target)) {
              let sample = target[target.length - 1];
              let newItem;
              if (typeof sample === 'number') newItem = 0;
              else if (typeof sample === 'boolean') newItem = false;
              else if (sample && typeof sample === 'object') {
                newItem = {};
                for (const k of Object.keys(sample)) {
                  const v = sample[k];
                  newItem[k] = typeof v === 'number' ? 0 : typeof v === 'boolean' ? false : (typeof v === 'string' ? '' : null);
                }
              }
              else newItem = '';
              target.push(newItem);
            }
          } else if (action === 'remove-item') {
            const idx = parseInt(b.dataset.jfListIdx, 10);
            if (Array.isArray(target)) target.splice(idx, 1);
          } else if (action === 'add-row') {
            if (Array.isArray(target)) {
              const keys = JSON.parse(b.dataset.jfObjkeys || '[]');
              const row = {};
              for (const k of keys) {
                const sample = target[0] ? target[0][k] : '';
                row[k] = typeof sample === 'number' ? 0 : typeof sample === 'boolean' ? false : '';
              }
              target.push(row);
            }
          } else if (action === 'remove-row') {
            const idx = parseInt(b.dataset.jfRow, 10);
            if (Array.isArray(target)) target.splice(idx, 1);
          }

          setAtPath(base, jsonPath, target);
          const same = deepEqual(en.value, base);
          if (same) changes.delete(rootKey); else changes.set(rootKey, base);
          render();
        };
      });
    }

    function handleJsonChange(el, rootKey, jsonPath) {
      const en = findEntry(rootKey.split('|'));
      if (!en) return;

      let base = changes.has(rootKey) ? deepClone(changes.get(rootKey)) : deepClone(en.value);

      if (el.dataset.jfRawjson === '1') {
        try {
          const parsed = JSON.parse(el.value);
          setAtPath(base, jsonPath, parsed);
        } catch { el.style.borderColor = 'var(--redstone)'; return; }
        el.style.borderColor = '';
      } else {
        let v;
        if (el.type === 'checkbox') v = el.checked;
        else if (el.type === 'number' || el.type === 'range') {
          const cur = getAtPath(base, jsonPath);
          v = Number.isInteger(cur) ? parseInt(el.value, 10) : parseFloat(el.value);
          if (isNaN(v)) return;
        }
        else v = el.value;

        if (el.dataset.jfRow !== undefined && el.dataset.jfKey !== undefined) {
          const target = getAtPath(base, jsonPath);
          const row = parseInt(el.dataset.jfRow, 10);
          if (Array.isArray(target) && target[row] && typeof target[row] === 'object') {
            target[row][el.dataset.jfKey] = v;
          }
        }
        else if (el.dataset.jfListIdx !== undefined) {
          const target = getAtPath(base, jsonPath);
          const idx = parseInt(el.dataset.jfListIdx, 10);
          if (Array.isArray(target)) target[idx] = v;
        }
        else {
          setAtPath(base, jsonPath, v);
        }
      }

      const same = deepEqual(en.value, base);
      if (same) changes.delete(rootKey); else changes.set(rootKey, base);

      const field = el.closest('.cfg-field');
      if (field) field.classList.toggle('modified', !same);
      updateDirtyIndicator();
    }

    function findEntry(pathArr) {
      for (const sec of cfgData.schema.sections) {
        for (const en of sec.entries) {
          if (en.path.length === pathArr.length && en.path.every((p, i) => p === pathArr[i])) return en;
        }
      }
      return null;
    }

    function handleSimpleChange(el) {
      const pathKey = el.dataset.path;
      const pathArr = pathKey.split('|');
      const en = findEntry(pathArr);
      if (!en) return;

      let value;
      if (el.type === 'checkbox') value = el.checked;
      else if (el.type === 'range' || el.type === 'number') {
        value = en.type === 'integer' ? parseInt(el.value, 10) : parseFloat(el.value);
        if (isNaN(value)) return;
      } else if (el.tagName === 'SELECT') value = el.value;
      else if (en.type === 'array') value = el.value.split(',').map(s => s.trim()).filter(Boolean);
      else value = el.value;

      const same = deepEqual(en.value, value);
      if (same) changes.delete(pathKey); else changes.set(pathKey, value);

      updateDirtyIndicator();
      const field = el.closest('.cfg-field');
      if (field) field.classList.toggle('modified', !same);
    }

    function updateDirtyIndicator() {
      const panel = document.getElementById('cfg-panel');
      if (!panel) return;
      const head = panel.querySelector('.panel-head');
      if (head) {
        const dirty = head.querySelector('.cfg-dirty-dot');
        if (changes.size && !dirty) {
          const dot = document.createElement('span');
          dot.className = 'cfg-dirty-dot';
          dot.title = t('cfg.dirtyTitle');
          const rev = document.getElementById('cfg-reveal');
          if (rev && rev.parentElement === head) head.insertBefore(dot, rev);
          else head.appendChild(dot);
        } else if (!changes.size && dirty) dirty.remove();
      }

      const toolbar = panel.querySelector('.cfg-toolbar');
      if (!toolbar) return;

      let actionsBox = toolbar.querySelector('.cfg-actions');
      if (!actionsBox) {
        actionsBox = document.createElement('div');
        actionsBox.className = 'cfg-actions';
        actionsBox.style.cssText = 'display:flex;gap:8px;align-items:center';
        toolbar.appendChild(actionsBox);
      }
      while (actionsBox.firstChild) actionsBox.removeChild(actionsBox.firstChild);

      if (changes.size) {
        const d = document.createElement('button');
        d.className = 'btn'; d.id = 'cfg-discard';
        d.style.cssText = 'padding:6px 12px;font-size:11px';
        d.textContent = t('cfg.btn.discard', {n: changes.size});
        d.onclick = () => { changes.clear(); rawEditValue = null; render(); window.Toast.info(t('cfg.discardToast')); };
        actionsBox.appendChild(d);
      }

      const s = document.createElement('button');
      s.className = 'btn primary'; s.id = 'cfg-save';
      s.style.cssText = 'padding:6px 14px;font-size:11px';
      s.textContent = changes.size ? t('cfg.btn.saveChanges') : t('cfg.btn.save');
      s.onclick = saveChanges;
      actionsBox.appendChild(s);
    }

    async function saveChanges() {
      if (activeTab === 'gui' && changes.size === 0) return;

      const saveBtn = document.getElementById('cfg-save');
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = t('cfg.saving'); }

      const list = [];
      changes.forEach((value, key) => {
        list.push({ path: key.split('|'), value });
      });

      try {
        if (activeTab === 'raw') {
          const text = document.getElementById('cfg-edit').value;
          const r = await window.API.cfg.saveRaw(cfgData.path, text);
          if (!r.ok) throw new Error(r.error || 'saveRaw failed');
          window.Toast.success(t('cfg.rawSaved'), cfgData.path);
        } else if (list.length) {
          const r = await window.API.cfg.update(cfgData.path, list);
          if (!r.ok) throw new Error(r.error || 'update failed');
          if (r.failures && r.failures.length) {
            window.Toast.warn(t('cfg.warn.partial'), t('cfg.warn.partialDesc', {fields: r.failures.join(', ')}));
          } else {
            window.Toast.success(t('cfg.toast.saved'), t('cfg.savedCount', {n: r.applied}));
          }
        }

        const fresh = await window.API.cfg.load(cfgData.path);
        cfgData = fresh;
        changes.clear();
        rawEditValue = null;
        render();
      } catch (e) {
        window.Toast.error(t('cfg.toast.saveFailed'), e.message);
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = t('cfg.btn.saveChanges'); }
      }
    }

    render();
    const unsub = window.State.sub(() => {
      if (!container.isConnected) return;
      state = window.State.data;
      render();
    });
    const connWatcher = setInterval(() => {
      if (!container.isConnected) { unsub(); clearInterval(connWatcher); }
    }, 1000);
  }
  return { mount };
})();