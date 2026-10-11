window.Views = window.Views || {};
window.Views.mods = (function () {
  function t(k, v) { return window.I18n.t(k, v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function human(b) {
    if (!b) return '—';
    if (b < 1024) return b + ' ' + t('human.b');
    if (b < 1024*1024) return (b/1024).toFixed(1) + ' ' + t('human.kb');
    return (b/1024/1024).toFixed(1) + ' ' + t('human.mb');
  }

  function typeLabels() {
    return {
      client:  { label: t('mods.type.client'),  cls: 'client'  },
      server:  { label: t('mods.type.server'),  cls: 'server'  },
      library: { label: t('mods.type.library'), cls: 'library' },
      meta:    { label: t('mods.type.meta'),    cls: 'meta'    },
      both:    { label: t('mods.type.both'),    cls: 'both'    },
      unknown: { label: t('mods.type.unknown'), cls: 'unknown' }
    };
  }

  function mount(container) {
    let state = window.State.data;
    let query = '', sortKey = 'name', typeFilter = 'all';

    function render() {
      const mods = state.scan ? state.scan.mods : [];
      const classifyReady = state.classify != null;

      const filtered = mods
        .filter(m => {
          if (typeFilter !== 'all') {
            const tp = m._type || 'unknown';
            if (typeFilter === 'both' && !(tp === 'both' || tp === 'unknown')) return false;
            if (typeFilter !== 'both' && tp !== typeFilter) return false;
          }
          if (!query) return true;
          const q = query.toLowerCase();
          return (m.name || '').toLowerCase().indexOf(q) >= 0 ||
                 (m.id || '').toLowerCase().indexOf(q) >= 0 ||
                 (m.authors || []).join(', ').toLowerCase().indexOf(q) >= 0 ||
                 (m.file || '').toLowerCase().indexOf(q) >= 0;
        })
        .sort((a, b) => {
          if (sortKey === 'size') return (a.size || 0) - (b.size || 0);
          let va = a[sortKey], vb = b[sortKey];
          if (sortKey === 'author') { va = (a.authors || [])[0] || ''; vb = (b.authors || [])[0] || ''; }
          if (sortKey === 'type') { va = a._type || 'zzz'; vb = b._type || 'zzz'; }
          va = String(va || '').toLowerCase(); vb = String(vb || '').toLowerCase();
          return va.localeCompare(vb);
        });

      container.innerHTML = `
        <div class="view">
          <div class="view-header">
            <div>
              <div class="view-title">${t('mods.title')}</div>
              <div class="view-sub">${t('mods.sub', {shown: filtered.length, total: mods.length})}${classifyReady ? '' : t('mods.classifying')}</div>
            </div>
            <div class="view-actions">
              <input class="input" id="mods-q" placeholder="${t('mods.search')}" value="${esc(query)}"/>
              <select class="input" id="mods-type" style="width:auto">
                <option value="all"     ${typeFilter==='all'?'selected':''}>${t('mods.filter.all')}</option>
                <option value="both"    ${typeFilter==='both'?'selected':''}>${t('mods.filter.both')}</option>
                <option value="client"  ${typeFilter==='client'?'selected':''}>${t('mods.filter.client')}</option>
                <option value="server"  ${typeFilter==='server'?'selected':''}>${t('mods.filter.server')}</option>
                <option value="library" ${typeFilter==='library'?'selected':''}>${t('mods.filter.library')}</option>
                <option value="meta"    ${typeFilter==='meta'?'selected':''}>${t('mods.filter.meta')}</option>
              </select>
              <select class="input" id="mods-sort" style="width:auto">
                <option value="name"   ${sortKey==='name'?'selected':''}>${t('mods.sort.name')}</option>
                <option value="id"     ${sortKey==='id'?'selected':''}>${t('mods.sort.id')}</option>
                <option value="type"   ${sortKey==='type'?'selected':''}>${t('mods.sort.type')}</option>
                <option value="size"   ${sortKey==='size'?'selected':''}>${t('mods.sort.size')}</option>
                <option value="loader" ${sortKey==='loader'?'selected':''}>${t('mods.sort.loader')}</option>
                <option value="author" ${sortKey==='author'?'selected':''}>${t('mods.sort.author')}</option>
              </select>
            </div>
          </div>
          <div class="view-body">
            ${!mods.length
              ? '<div class="empty-state">' + t('mods.empty') + '</div>'
              : '<div class="table-wrap"><table class="table">' +
                  '<thead><tr>' +
                    '<th style="min-width:260px">' + t('mods.col.mod') + '</th>' +
                    '<th>' + t('mods.col.id') + '</th>' +
                    '<th>' + t('mods.col.version') + '</th>' +
                    '<th>' + t('mods.col.type') + '</th>' +
                    '<th>' + t('mods.col.loader') + '</th>' +
                    '<th>' + t('mods.col.author') + '</th>' +
                    '<th>' + t('mods.col.size') + '</th>' +
                    '<th>' + t('mods.col.deps') + '</th>' +
                  '</tr></thead>' +
                  '<tbody>' + filtered.slice(0, 400).map(row).join('') + '</tbody>' +
                '</table></div>'}
          </div>
        </div>`;

      const q = document.getElementById('mods-q');
      if (q) q.oninput = e => { query = e.target.value; render(); const nq = document.getElementById('mods-q'); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } };
      const st = document.getElementById('mods-type');
      if (st) st.onchange = e => { typeFilter = e.target.value; render(); };
      const sort = document.getElementById('mods-sort');
      if (sort) sort.onchange = e => { sortKey = e.target.value; render(); };
    }

    function typeBadge(m) {
      if (!state.classify) return '<span style="color:var(--text-dimmer);font-size:11px">…</span>';
      const tp = m._type || 'unknown';
      const labels = typeLabels();
      const info = labels[tp] || labels.unknown;
      const fromModrinth = m._project ? '<span title="' + t('mods.fromModrinth') + '" style="color:var(--diamond);margin-left:5px;font-size:10px">◈</span>' : '';
      return '<span class="pill ' + info.cls + '">' + info.label + '</span>' + fromModrinth;
    }

    function row(m) {
      const loader = (m.loader || 'unknown').toLowerCase();
      const cls = loader.indexOf('neo') >= 0 ? 'neoforge' : loader.indexOf('forge') >= 0 ? 'forge' : loader.indexOf('fabric') >= 0 ? 'fabric' : loader.indexOf('quilt') >= 0 ? 'quilt' : 'unknown';
      const deps = (m.dependencies || []).slice(0, 4).map(d => '<span class="tag">' + esc(d.id) + '</span>').join('') +
        ((m.dependencies || []).length > 4 ? '<span class="tag">+' + (m.dependencies.length - 4) + '</span>' : '');
      const desc = (m.description || '').replace(/\s+/g, ' ').trim();
      const descShort = desc.length > 120 ? desc.slice(0, 118) + '…' : desc;

      return '<tr title="' + esc(m.file) + '">' +
        '<td>' +
          '<div style="font-weight:700;margin-bottom:4px">' + esc(m.name || m.file) + '</div>' +
          (descShort
            ? '<div style="color:var(--text-dim);font-size:11px;line-height:1.5;max-width:380px">' + esc(descShort) + '</div>'
            : '<div style="color:var(--text-dimmer);font-size:11px;font-style:italic">' + t('common.noDescription') + '</div>') +
        '</td>' +
        '<td class="mono">' + esc(m.id || '—') + '</td>' +
        '<td class="mono">' + esc(m.version || '—') + '</td>' +
        '<td>' + typeBadge(m) + '</td>' +
        '<td><span class="pill ' + cls + '">' + esc(m.loader || '?') + '</span></td>' +
        '<td>' + esc((m.authors || []).join(', ') || '—') + '</td>' +
        '<td class="mono">' + human(m.size) + '</td>' +
        '<td>' + (deps || '<span style="color:var(--text-dimmer)">—</span>') + '</td>' +
      '</tr>';
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