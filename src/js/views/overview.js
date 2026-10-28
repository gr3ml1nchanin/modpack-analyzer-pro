window.Views = window.Views || {};
window.Views.overview = (function () {
  function t(k, v) { return window.I18n.t(k, v); }
  function icon(name, size, color) {
    size = size || 14; color = color || 'currentColor';
    const paths = {
      mod: 'M12 2L3 7v10l9 5 9-5V7l-9-5zM3 7l9 5 9-5M12 22V12',
      cfg: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6',
      log: 'M4 6h16M4 12h16M4 18h10',
      crash: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
      pack: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
      shader: 'M12 2v20M2 12h20'
    };
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + (paths[name] || paths.mod) + '"/></svg>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function human(b) {
    if (!b) return '0 ' + t('human.b');
    if (b < 1024) return b + ' ' + t('human.b');
    if (b < 1024*1024) return (b/1024).toFixed(1) + ' ' + t('human.kb');
    if (b < 1024*1024*1024) return (b/1024/1024).toFixed(1) + ' ' + t('human.mb');
    return (b/1024/1024/1024).toFixed(2) + ' ' + t('human.gb');
  }

  function mount(container) {
    let state = window.State.data;

    function render() {
      const subText = state.scan
        ? t('overview.sub.loaded', {
            mods: state.scan.summary.mods,
            configs: state.scan.summary.configs,
            duration: state.scan.duration
          })
        : t('overview.sub.empty');

      container.innerHTML = `
        <div class="view">
          <div class="view-header">
            <div>
              <div class="view-title">${t('overview.title')}</div>
              <div class="view-sub">${subText}</div>
            </div>
            <div class="view-actions">
              <button class="btn" id="ov-rescan" ${state.scan ? '' : 'disabled'}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16"/></svg>
                ${t('overview.rescan')}
              </button>
              <button class="btn primary" id="ov-open">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>
                ${t('overview.openPack')}
              </button>
            </div>
          </div>
          <div class="view-body">
            ${!state.scan ? heroEmpty() : loadedContent()}
          </div>
        </div>`;

      const open = document.getElementById('ov-open');
      if (open) open.onclick = window.App.openModpack;
      const rescan = document.getElementById('ov-rescan');
      if (rescan && !rescan.disabled) rescan.onclick = () => window.App.rescan();
      const pick = document.getElementById('ov-pick');
      if (pick) pick.onclick = window.App.openModpack;
      const reveal = document.getElementById('ov-reveal');
      if (reveal) reveal.onclick = () => window.API.sh.open(state.scan.root);
    }

    function heroEmpty() {
      return '<div class="hero">' +
        '<div class="hero-icon"><svg width="120" height="120" viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">' +
          '<path d="M60 10L15 36v48l45 26 45-26V36L60 10z" opacity=".9"/>' +
          '<path d="M15 36l45 26 45-26M60 110V62"/>' +
          '<circle cx="60" cy="62" r="3" fill="currentColor"/>' +
        '</svg></div>' +
        '<div class="hero-title">' + t('overview.empty.title') + '</div>' +
        '<div class="hero-sub">' + t('overview.empty.sub') + '</div>' +
        '<button class="btn primary" id="ov-pick" style="margin-top:8px;padding:10px 22px">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>' +
          t('overview.pickFolder') +
        '</button>' +
      '</div>';
    }

    function loadedContent() {
      const s = state.scan.summary;
      const mods = state.scan.mods;
      return '<div class="stat-grid">' +
        statCard(t('overview.stat.mods'), s.mods, human(s.totalModSize), 'mod', 'rgba(88,166,255,.15)', '#58a6ff') +
statCard(t('overview.stat.configs'), s.configs, t('overview.stat.filesSub'), 'cfg', 'rgba(124,179,66,.15)', '#7cb342') +
statCard(t('overview.stat.logs'), s.logs, t('overview.stat.filesSub'), 'log', 'rgba(240,184,88,.15)', '#f0b858') +
statCard(t('overview.stat.crashes'), s.crashes, t('overview.stat.reportsSub'), 'crash', 'rgba(229,72,77,.15)', '#e5484d') +
statCard(t('overview.stat.resourcepacks'), s.resourcepacks, t('overview.stat.packsSub'), 'pack', 'rgba(163,113,247,.15)', '#a371f7') +
statCard(t('overview.stat.shaderpacks'), s.shaderpacks, t('overview.stat.packsSub'), 'shader', 'rgba(236,72,153,.15)', '#ec4899') +
      '</div>' +
      '<div class="card" style="margin-bottom:14px;display:flex;align-items:center;gap:12px;padding:12px 16px">' +
        '<div class="mono" style="color:var(--text-dimmer)">' + esc(state.scan.root) + '</div>' +
        '<button class="btn" style="margin-left:auto" id="ov-reveal">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>' +
          t('common.showInSystem') +
        '</button>' +
      '</div>' +
      '<div class="row-cards">' +
        '<div class="card"><div class="card-header"><div class="card-title">' + t('overview.loaders') + '</div></div>' + pieHtml(mods) + '</div>' +
        '<div class="card"><div class="card-header"><div class="card-title">' + t('overview.topMods') + '</div><div class="card-hint">' + t('overview.topN', {n: 8}) + '</div></div>' + topBarHtml(mods) + '</div>' +
        '<div class="card"><div class="card-header"><div class="card-title">' + t('overview.ram') + '</div><div class="card-hint">' + t('overview.ram.hint') + '</div></div>' + ramHtml(mods) + '</div>' +
      '</div>';
    }

    function statCard(label, value, sub, ic, bg, col) {
      return '<div class="stat">' +
        '<div class="stat-label">' + label + '</div>' +
        '<div class="stat-value">' + value + '</div>' +
        '<div class="stat-sub">' + sub + '</div>' +
        '<div class="stat-icon" style="background:' + bg + ';color:' + col + '">' + icon(ic, 14, col) + '</div>' +
      '</div>';
    }

    function pieHtml(mods) {
      const counts = { forge: 0, fabric: 0, quilt: 0, neoforge: 0, unknown: 0 };
      for (const m of mods) {
        const l = (m.loader || '').toLowerCase();
        if (l.indexOf('neoforge') >= 0) counts.neoforge++;
        else if (l.indexOf('forge') >= 0) counts.forge++;
        else if (l.indexOf('fabric') >= 0) counts.fabric++;
        else if (l.indexOf('quilt') >= 0) counts.quilt++;
        else counts.unknown++;
      }
            const colors = { 
        forge: '#0078D4',    // Синий
        fabric: '#00B7C3',   // Бирюзовый
        quilt: '#E3008C',    // Розовый
        neoforge: '#FF8C00', // Оранжевый
        unknown: '#808080'   // Серый
      };
      const labels = { forge: 'Forge', fabric: 'Fabric', quilt: 'Quilt', neoforge: 'NeoForge', unknown: 'Other' };
      const total = mods.length || 1;
      const R = 46, C = 2 * Math.PI * R;
      let offset = 0;
      let svg = '<svg class="pie-svg" width="140" height="140" viewBox="0 0 120 120">';
      const order = ['forge','fabric','neoforge','quilt','unknown'];
      for (const k of order) {
        if (!counts[k]) continue;
        const frac = counts[k] / total;
        const dash = frac * C;
        svg += '<circle cx="60" cy="60" r="' + R + '" fill="none" stroke="' + colors[k] + '" stroke-width="14" stroke-dasharray="' + dash + ' ' + (C - dash) + '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 60 60)"/>';
        offset += dash;
      }
      svg += '<text x="60" y="58" text-anchor="middle" fill="#e5e9f0" font-size="18" font-weight="700">' + mods.length + '</text>';
      svg += '<text x="60" y="72" text-anchor="middle" fill="#5a6478" font-size="8" letter-spacing="1">' + t('overview.stat.mods') + '</text>';
      svg += '</svg>';
      svg += '<div class="legend">' + order.filter(k => counts[k]).map(k =>
        '<div class="legend-row"><span class="legend-dot" style="background:' + colors[k] + '"></span><span>' + labels[k] + '</span><span style="margin-left:auto;color:var(--text)">' + counts[k] + '</span></div>'
      ).join('') + '</div>';
      return svg;
    }

    function topBarHtml(mods) {
      const top = mods.slice().sort((a, b) => b.size - a.size).slice(0, 8);
      const max = (top[0] && top[0].size) || 1;
      return top.map(m =>
        '<div class="bar-row">' +
          '<div class="bar-label" title="' + esc(m.name || m.file) + '">' + esc(m.name || m.file) + '</div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + (m.size / max * 100).toFixed(1) + '%"></div></div>' +
          '<div class="bar-val">' + human(m.size) + '</div>' +
        '</div>').join('');
    }

    function ramHtml(mods) {
      const n = mods.length;
      const min = Math.max(2, Math.round(n * 0.02 * 10) / 10);
      const rec = Math.max(3, Math.round(n * 0.028 * 10) / 10 + 0.5);
      const maxAlloc = Math.max(rec * 1.6, 8);
      const gb = t('human.gb');
      return '<div class="ram-row"><div class="ram-label">' + min.toFixed(1) + ' ' + gb + '</div><div class="ram-track"><div class="ram-fill" style="width:' + (min/maxAlloc*100).toFixed(0) + '%"></div></div></div>' +
        '<div class="ram-row"><div class="ram-label">' + rec.toFixed(1) + ' ' + gb + '</div><div class="ram-track"><div class="ram-fill" style="width:' + (rec/maxAlloc*100).toFixed(0) + '%"></div></div></div>' +
        '<div style="color:var(--text-dimmer);font-size:11px;margin-top:10px;line-height:1.6">' + t('overview.ram.desc', {n: n}) + '</div>';
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