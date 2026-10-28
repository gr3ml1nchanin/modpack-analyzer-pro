window.Views = window.Views || {};
window.Views.loot = (function () {
  function t(k, v) { return window.I18n.t(k, v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function shortName(id) {
    if (!id) return '?';
    if (id.charAt(0) === '#') { const p = id.slice(1).split(':'); return '#' + (p.length > 1 ? p[1] : id.slice(1)); }
    const p = id.split(':');
    return p.length > 1 ? p[1] : id;
  }

  function categoryLabels() {
    return {
      block:    t('loot.cat.block'),
      entity:   t('loot.cat.entity'),
      chest:    t('loot.cat.chest'),
      gameplay: t('loot.cat.gameplay'),
      other:    t('loot.cat.other')
    };
  }

  function mount(container) {
    let state = window.State.data;
    let query = '';
    let categoryFilter = 'all';
    let nsFilter = 'all';
    let selected = null;
    let scanning = false;
    let lootCache = null;
        let savedListScroll = 0;

    window.__lootDebug = () => {
      if (!lootCache) return { cacheLen: 0, scan: state.scan ? state.scan.root : null };
      return { cacheLen: lootCache.length, scan: state.scan ? state.scan.root : null };
    };

    function render() {
      try { renderInternal(); }
      catch (e) { console.error('[loot render ERROR]', e); }
    }

    function renderInternal() {
      const hasScan = state.scan && state.scan.mods && state.scan.mods.length;
      const oldList = document.getElementById('loot-list');
      if (oldList) savedListScroll = oldList.scrollTop;
      const CATEGORY_LABELS = categoryLabels();

      let listHtml = '', statsHtml = '';
      if (!lootCache) {
        statsHtml = scanning ? t('loot.sub.scanning') : t('loot.sub.empty');
      } else {
        const filtered = filterList(lootCache);
        statsHtml = t('loot.sub.loaded', {shown: filtered.length, total: lootCache.length});
        if (filtered.length === 0) {
          listHtml = '<div style="padding:32px 16px;color:var(--text-dimmer);font-size:12px;text-align:center;line-height:1.6">' +
            t('common.nothingFoundFilters') + '<br/>' +
            '<span style="font-size:11px">' + t('common.tryResetFilters') + '</span><br/>' +
            '<button class="btn" id="loot-reset-filters" style="margin-top:14px">' + t('common.resetFilters') + '</button>' +
          '</div>';
        } else {
          listHtml = filtered.slice(0, 300).map(itemHtml).join('');
          if (filtered.length > 300) {
            listHtml += '<div style="padding:12px;color:var(--text-dimmer);font-size:11px;text-align:center">' + t('common.firstN', {n: 300}) + '</div>';
          }
        }
      }

      const hasActiveFilters = (query || categoryFilter !== 'all' || nsFilter !== 'all');

      const filtersHtml = lootCache
        ? `<input class="input" id="loot-q" placeholder="${t('loot.search')}" value="${esc(query)}"/>
           <select class="input" id="loot-cat" style="width:auto">
             <option value="all">${t('loot.cat.all')}</option>
             ${Object.keys(CATEGORY_LABELS).map(c =>
               '<option value="' + c + '"' + (categoryFilter === c ? ' selected' : '') + '>' + CATEGORY_LABELS[c] + '</option>'
             ).join('')}
           </select>
           <select class="input" id="loot-ns" style="width:auto">
             <option value="all">${t('loot.ns.all')}</option>
             ${buildNsOptions()}
           </select>
           <button class="btn" id="loot-clear-filters" title="${t('common.resetFilters')}" ${hasActiveFilters ? '' : 'style="display:none"'}>×</button>`
        : '';

      const editBtnHtml = selected ? `<button class="btn" id="loot-edit">${t('loot.editBtn')}</button>` : '';
      const scanBtnHtml = `
        <button class="btn ${scanning ? '' : 'primary'}" id="loot-scan" ${scanning || !hasScan ? 'disabled' : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16"/></svg>
          ${scanning ? t('loot.scanning') : (lootCache ? t('loot.rescan') : t('loot.scan'))}
        </button>`;

      let bodyHtml = '';
      if (!hasScan) {
        bodyHtml = `<div class="empty-state" style="margin:auto">${t('loot.empty')}</div>`;
      } else if (!lootCache) {
        bodyHtml = `<div class="empty-state" style="margin:auto">${t('loot.needScan')}<br/><span style="color:var(--text-dimmer);font-size:11px;margin-top:8px">${t('loot.needScanHint')}</span></div>`;
      } else {
        bodyHtml = `<div class="split two" style="width:100%">
                      <div class="split-panel split-left">
                        <div class="panel-head">${t('loot.panel.tables')}</div>
                        <div class="panel-list" id="loot-list">${listHtml}</div>
                      </div>
                      <div class="split-panel split-right" id="loot-panel">
                        ${selected ? renderDetails(selected) : '<div class="empty-state">' + t('loot.selectTable') + '</div>'}
                      </div>
                    </div>`;
      }

      container.innerHTML = `
        <div class="view">
          <div class="view-header">
            <div>
              <div class="view-title">${t('loot.title')}</div>
              <div class="view-sub">${statsHtml}</div>
            </div>
            <div class="view-actions">
              ${filtersHtml}
              ${editBtnHtml}
              ${scanBtnHtml}
            </div>
          </div>
          <div class="view-body" style="padding:0 32px 0; display:flex; min-height:0">
            ${bodyHtml}
          </div>
        </div>`;

      bindEvents();
    }

    function bindEvents() {
      const scanBtn = document.getElementById('loot-scan');
      if (scanBtn && !scanBtn.disabled) scanBtn.onclick = runScan;

      const q = document.getElementById('loot-q');
      if (q) q.oninput = e => {
        query = e.target.value;
        const pos = q.selectionStart;
        render();
        const nq = document.getElementById('loot-q');
        if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); }
      };

      const c = document.getElementById('loot-cat');
      if (c) {
        c.value = categoryFilter;
        c.onchange = e => { categoryFilter = e.target.value; render(); };
      }

      const ns = document.getElementById('loot-ns');
      if (ns) {
        ns.value = nsFilter;
        if (ns.selectedIndex === -1) { ns.value = 'all'; nsFilter = 'all'; }
        ns.onchange = e => { nsFilter = e.target.value; render(); };
      }

            document.querySelectorAll('#loot-list .list-item').forEach(el => {
        el.onclick = async () => {
          const r = lootCache.find(x => x.id === el.dataset.id);
          if (r) { 
            selected = r; 
            const ids = [];
            for (const p of r.pools) {
              for (const e of p.entries) {
                if (e.kind === 'item' && e.id) ids.push(e.id);
              }
            }
            await window.TextureHelper.load(state.scan.root, ids);
            render(); 
          }
        };
      });

      const clearFilters = document.getElementById('loot-clear-filters');
      if (clearFilters) clearFilters.onclick = () => {
        query = ''; categoryFilter = 'all'; nsFilter = 'all';
        render();
      };
      const resetFilters = document.getElementById('loot-reset-filters');
      if (resetFilters) resetFilters.onclick = () => {
        query = ''; categoryFilter = 'all'; nsFilter = 'all';
        render();
      };

      bindUnknownClicks();

      const editBtn = document.getElementById('loot-edit');
      if (editBtn && selected) editBtn.onclick = () => openLootEditor(selected);

            const newList = document.getElementById('loot-list');
      if (newList) newList.scrollTop = savedListScroll;
    }

    function bindUnknownClicks() {
      const panel = document.getElementById('loot-panel');
      if (!panel) return;
      panel.querySelectorAll('.loot-entry.unknown').forEach(el => {
        el.style.cursor = 'pointer';
        el.onclick = () => {
          const raw = el.dataset.raw;
          if (!raw) return window.Toast.warn(t('loot.raw.noData'));
          try { showRawJson(JSON.parse(raw)); }
          catch (e) { window.Toast.error(t('loot.raw.parseFail'), e.message); }
        };
      });
    }

    function showRawJson(obj) {
      const overlay = document.createElement('div');
      overlay.className = 're-overlay';
      overlay.style.zIndex = '9500';
      const text = JSON.stringify(obj, null, 2);
      overlay.innerHTML = `
        <div class="re-modal" style="max-width:760px">
          <div class="re-header">
            <div><div class="re-title">${t('loot.rawJson.title')}</div><div class="re-id">${t('loot.rawJson.sub')}</div></div>
            <div style="flex:1"></div>
            <button class="re-close" title="${t('common.close')}">×</button>
          </div>
          <div class="re-body" style="padding:0"><pre class="raw-json-pre">${esc(text)}</pre></div>
          <div class="re-footer">
            <div style="flex:1"></div>
            <button class="btn" id="raw-copy">${t('loot.rawJson.copy')}</button>
            <button class="btn primary" id="raw-close">${t('loot.rawJson.close')}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelector('.re-close').onclick = close;
      overlay.querySelector('#raw-close').onclick = close;
      overlay.querySelector('#raw-copy').onclick = async () => {
        try {
          await navigator.clipboard.writeText(text);
          window.Toast.success(t('loot.raw.copied'), t('loot.raw.copyDesc', {n: text.length}));
        } catch { window.Toast.error(t('loot.raw.copyFail')); }
      };
      overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
    }

    function buildNsOptions() {
      if (!lootCache) return '';
      const set = new Set();
      for (const r of lootCache) set.add(r.ns);
      return Array.from(set).sort().filter(n => n !== 'all').map(n =>
        '<option value="' + esc(n) + '"' + (nsFilter === n ? ' selected' : '') + '>' + esc(n) + '</option>'
      ).join('');
    }

    function filterList(list) {
      const q = query.toLowerCase();
      return list.filter(r => {
        if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
        if (nsFilter !== 'all' && r.ns !== nsFilter) return false;
        if (!q) return true;
        return r.id.toLowerCase().indexOf(q) >= 0;
      });
    }

    function itemHtml(r) {
      const CATEGORY_LABELS = categoryLabels();
      const active = selected && selected.id === r.id;
      const catBadge = CATEGORY_LABELS[r.category] || r.category;
      const badgeColor = r.category === 'block' ? 'rgba(74,222,128,.15)' : r.category === 'entity' ? 'rgba(239,68,68,.15)' : r.category === 'chest' ? 'rgba(251,191,36,.15)' : r.category === 'gameplay' ? 'rgba(168,85,247,.15)' : 'rgba(139,148,167,.15)';
      const textColor = r.category === 'block' ? '#86efac' : r.category === 'entity' ? '#fca5a5' : r.category === 'chest' ? '#fde68a' : r.category === 'gameplay' ? '#d8b4fe' : 'var(--text-dim)';
      const vTag = r.vanilla ? '<span class="loot-vanilla-badge" title="' + t('loot.vaniilaBadge') + '">MC</span>' : '';
      
      return '<div class="list-item' + (active ? ' active' : '') + '" data-id="' + esc(r.id) + '">' +
        '<span class="badge" style="background:' + badgeColor + ';color:' + textColor + ';font-size:9px">' + catBadge + '</span>' + vTag +
        '<span class="li-title" title="' + esc(r.id) + '" style="font-family:var(--mono);font-size:11px">' + esc(shortName(r.id)) + '</span>' +
        '<span class="li-sub" style="max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.ns) + '</span>' +
      '</div>';
    }

    function renderDetails(r) {
      const CATEGORY_LABELS = categoryLabels();
      const vanillaBadge = r.vanilla ? '<span style="color:var(--gold);font-size:10px;font-family:var(--mono);padding:2px 6px;border-radius:4px;background:rgba(251,191,36,.15);margin-right:6px">MC</span>' : '';
      return '<div class="panel-head">' + vanillaBadge +
        '<span style="text-transform:none;letter-spacing:0;font-size:11px;font-family:var(--mono);color:var(--text-dim);flex:1">' + esc(r.id) + '</span>' +
        '<span style="text-transform:none;letter-spacing:0;font-size:11px;color:var(--text-dimmer)">' + (CATEGORY_LABELS[r.category] || r.category) + '</span>' +
      '</div>' +
      '<div style="padding:20px;overflow:auto;flex:1;min-height:0">' + renderPools(r) +
        '<div style="margin-top:20px"><div style="font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:var(--text-dimmer);font-weight:700;margin-bottom:8px">' + t('common.source') + '</div>' +
        '<div class="mono" style="color:var(--text-dim);font-size:11px">' + esc(r.source) + '</div></div></div>';
    }

    function renderPools(r) {
      if (!r.pools.length) return '<div style="color:var(--text-dimmer);font-size:12px">' + t('common.noData') + '</div>';
      return r.pools.map((pool, i) => {
        const rollsText = pool.rolls.min === pool.rolls.max ? t(pool.rolls.min === 1 ? 'loot.rollsOne' : 'loot.rollsMany', {n: pool.rolls.min}) : t('loot.rollsRange', {min: pool.rolls.min, max: pool.rolls.max});
        const bonus = pool.bonusRolls ? t('loot.bonusLooting', {min: pool.bonusRolls.min, max: pool.bonusRolls.max}) : '';
                const totalWeight = pool.entries.reduce((a, e) => a + (e.weight || 0), 0) || 1;
        
        // Высчитываем множитель шанса из условий пула (например, random_chance)
        let chanceMultiplier = 1;
        if (pool.conditions && pool.conditions.length) {
          for (const c of pool.conditions) {
            if (c.chance !== undefined) chanceMultiplier *= c.chance;
          }
        }
        return '<div class="loot-pool"><div class="loot-pool-head"><span class="loot-pool-title">' + t('loot.pool', {n: i + 1}) + '</span><span class="loot-pool-meta">' + rollsText + bonus + '</span><span class="loot-pool-total">' + pool.entries.length + ' ' + t('common.entries') + '</span></div>' +
          (pool.conditions.length ? '<div class="loot-pool-conditions">' + t('loot.conditions') + ' ' + pool.conditions.map(c => '<span class="loot-cond">' + esc(c.name) + (c.chance !== undefined ? ' ' + (c.chance * 100).toFixed(0) + '%' : '') + '</span>').join(' ') + '</div>' : '') +
          '<div class="loot-entries">' +         pool.entries.map(e => renderEntry(e, totalWeight, chanceMultiplier)).join('') + '</div></div>';
      }).join('');
    }

    function renderEntry(e, totalWeight, chanceMultiplier = 1) {
      const chancePct = totalWeight ? ((e.weight || 0) / totalWeight * 100 * chanceMultiplier) : 0;
      const chanceColor = chancePct >= 50 ? 'var(--emerald)' : chancePct >= 15 ? 'var(--gold)' : 'var(--text-dim)';

      if (e.kind === 'item') {
        const countText = e.count.min === e.count.max ? '×' + e.count.min : '×' + e.count.min + '–' + e.count.max;
        const funcs = e.functions && e.functions.length ? '<div class="loot-entry-funcs">' + e.functions.map(f => '<span class="loot-fn">' + esc(f) + '</span>').join('') + '</div>' : '';
        const customTag = e._isCustom ? '<span class="loot-custom-tag" title="' + esc(t('loot.entry.customTag', {type: e.rawType || ''})) + '">' + t('loot.custom') + '</span>' : '';
                const icon = window.TextureHelper.html(e.id, 20);
        return '<div class="loot-entry">' +
          '<div class="loot-entry-main" style="display:flex; align-items:center;">' +
            icon +
            '<div>' +
              '<div class="loot-entry-name">' + esc(shortName(e.id)) + customTag + '</div>' +
              '<div class="loot-entry-id">' + esc(e.id || '?') + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="loot-entry-count">' + esc(countText) + '</div>' +
          '<div class="loot-entry-chance" style="color:' + chanceColor + '">' + chancePct.toFixed(1) + '%</div>' +
          funcs +
        '</div>';
      }
      if (e.kind === 'tag') {
        return '<div class="loot-entry tag"><div class="loot-entry-main"><div class="loot-entry-name" style="color:#d8b4fe">' + esc(shortName(e.id)) + '</div><div class="loot-entry-id">' + t('loot.entry.tagPrefix') + esc(e.id) + '</div></div><div class="loot-entry-count">×' + e.count.min + (e.count.max !== e.count.min ? '–' + e.count.max : '') + '</div><div class="loot-entry-chance" style="color:' + chanceColor + '">' + chancePct.toFixed(1) + '%</div></div>';
      }
      if (e.kind === 'loot_table') {
        return '<div class="loot-entry"><div class="loot-entry-main"><div class="loot-entry-name" style="color:#a5f3fc">' + t('loot.entry.table') + '</div><div class="loot-entry-id">' + esc(e.id) + '</div></div><div class="loot-entry-chance" style="color:' + chanceColor + '">' + chancePct.toFixed(1) + '%</div></div>';
      }
      if (e.kind === 'composite') {
        return '<div class="loot-entry composite"><div class="loot-entry-main"><div class="loot-entry-name">' + esc(e.variant) + '</div><div class="loot-entry-id">' + e.children.length + ' ' + t('common.entries') + '</div></div><div class="loot-entry-chance" style="color:' + chanceColor + '">' + chancePct.toFixed(1) + '%</div></div>';
      }
      if (e.kind === 'empty') {
        return '<div class="loot-entry empty"><div class="loot-entry-main"><div class="loot-entry-name" style="color:var(--text-dimmer)">' + t('loot.entry.empty') + '</div></div><div class="loot-entry-chance" style="color:var(--text-dimmer)">' + chancePct.toFixed(1) + '%</div></div>';
      }
      
      const funcs = e.functions && e.functions.length ? '<div class="loot-entry-funcs">' + e.functions.map(f => '<span class="loot-fn">' + esc(f) + '</span>').join('') + '</div>' : '';
      let rawAttr = '';
      if (e.rawEntry) {
        try {
          const json = JSON.stringify(e.rawEntry).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          rawAttr = ' data-raw="' + json + '"';
        } catch {}
      }
      return '<div class="loot-entry unknown"' + rawAttr + '><div class="loot-entry-main"><div class="loot-entry-name" style="color:var(--text-dimmer)">' + esc(e.type || t('loot.entry.service')) + '</div><div class="loot-entry-id">' + (e.rawEntry ? t('loot.entry.unparsed') : t('loot.entry.noData')) + '</div></div><div class="loot-entry-chance" style="color:' + chanceColor + '">' + chancePct.toFixed(1) + '%</div>' + funcs + '</div>';
    }

    function collectSuggestions() {
      const items = new Set();
      if (lootCache) {
        for (const tcache of lootCache) {
          for (const p of (tcache.pools || [])) {
            for (const e of (p.entries || [])) {
              if (e.kind === 'item' && e.id) items.add(e.id);
              if (e.kind === 'tag'  && e.id) items.add(e.id);
            }
          }
        }
      }
      if (state.modInfo && state.modInfo.list) {
        for (const m of state.modInfo.list) {
          for (const b of (m.blocks || [])) items.add(m.id + ':' + b);
          for (const i of (m.items || [])) items.add(m.id + ':' + i);
        }
      }
      return { items: Array.from(items).filter(Boolean) };
    }

    async function openLootEditor(table) {
      try {
        const hasLootJS = await window.API.loot.checkLootJS(state.scan.root);
        if (!hasLootJS) window.Toast.warn(t('le.warn.noLootJS'), t('le.warn.noLootJSDesc'));
      } catch {}

      let existingOverride = null;
      try {
        const all = await window.API.loot.listOverrides(state.scan.root);
        existingOverride = all.tables && all.tables[table.id] ? all.tables[table.id] : null;
      } catch {}

      window.LootEditor.open({
        table,
        existingOverride,
        suggestions: collectSuggestions(),
        onSave: async (override) => {
          try {
            const res = await window.API.loot.save(state.scan.root, override);
            if (res.ok) window.Toast.success(t('le.toast.saved'), t('le.toast.savedDesc'));
            else window.Toast.error(t('status.error'), res.error || t('cfg.toast.saveFailed'));
            return res;
          } catch (e) {
            window.Toast.error(t('status.error'), e.message);
            return { ok: false, error: e.message };
          }
        }
      });
    }

    async function runScan() {
      if (!state.scan) return;
      scanning = true;
      render();
      try {
        // Больше не передаем vanillaJarPath, сканируем только то, что есть в моде
        const res = await window.API.loot.scan(state.scan.root);
        const list = Array.isArray(res) ? res : (res && res.list) || [];
        lootCache = list;
        const vCount = list.filter(x => x.vanilla).length;
        const mCount = list.length - vCount;
        if (vCount === 0) {
          window.Toast.warn(t('loot.toast.noVanilla'), t('loot.toast.noVanillaDesc'));
        } else {
          const msg = mCount + ' ' + t('common.tables') + ' + ' + vCount;
          window.Toast.success(t('loot.toast.loaded'), msg);
        }
      } catch (e) {
        window.Toast.error(t('loot.toast.scanFailed'), e.message);
      } finally {
        scanning = false;
        window.Sidebar.setLoader(null);
        render();
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