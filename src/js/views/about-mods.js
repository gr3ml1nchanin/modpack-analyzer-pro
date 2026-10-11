window.Views = window.Views || {};
window.Views.aboutMods = (function () {
  function t(k, v) { return window.I18n.t(k, v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function human(b) {
    if (!b) return '—';
    if (b < 1024) return b + ' ' + t('human.b');
    if (b < 1024*1024) return (b/1024).toFixed(1) + ' ' + t('human.kb');
    return (b/1024/1024).toFixed(1) + ' ' + t('human.mb');
  }

  function mount(container) {
    let state = window.State.data;
    let query = '';

    function render() {
      const info = state.modInfo ? state.modInfo.list : [];
      const filtered = info.filter(m => {
        if (!query) return true;
        const q = query.toLowerCase();
        return (m.name || '').toLowerCase().indexOf(q) >= 0 || (m.id || '').toLowerCase().indexOf(q) >= 0;
      });

      container.innerHTML = `
        <div class="view">
          <div class="view-header">
            <div>
              <div class="view-title">${t('aboutMods.title')}</div>
              <div class="view-sub">${t('aboutMods.sub', {n: info.length})}</div>
            </div>
            <div class="view-actions">
              <input class="input" id="am-q" placeholder="${t('aboutMods.search')}" value="${esc(query)}"/>
            </div>
          </div>
          <div class="view-body">
            ${!info.length
              ? '<div class="empty-state">' + t('aboutMods.empty') + '</div>'
              : '<div class="mod-grid">' + filtered.slice(0, 200).map(modCard).join('') + '</div>'}
          </div>
        </div>`;

      const q = document.getElementById('am-q');
      if (q) q.oninput = e => {
        query = e.target.value;
        render();
        const nq = document.getElementById('am-q');
        if (nq) nq.focus();
      };
    }

    function modCard(m) {
      const initial = (m.name || m.id || '?').charAt(0).toUpperCase();
      const stats = [];
      if (m.items.length)        stats.push([t('aboutMods.stat.items'),      m.items.length,          '#60a5fa']);
      if (m.blocks.length)       stats.push([t('aboutMods.stat.blocks'),     m.blocks.length,         '#22c55e']);
      if (m.entities.length)     stats.push([t('aboutMods.stat.entities'),   m.entities.length,       '#ef4444']);
      if (m.biomes.length)       stats.push([t('aboutMods.stat.biomes'),     m.biomes.length,         '#a855f7']);
      if (m.structures.length)   stats.push([t('aboutMods.stat.structures'), m.structures.length,     '#f59e0b']);
      if (m.counts.textures)     stats.push([t('aboutMods.stat.textures'),   m.counts.textures,       '#ec4899']);
      if (m.langKeys)            stats.push([t('aboutMods.stat.lang'),       m.langKeys,              '#06b6d4']);
      if (m.counts.recipes)      stats.push([t('aboutMods.stat.recipes'),    m.counts.recipes,        '#fb923c']);

      const mod = state.scan ? state.scan.mods.find(x => x.file === m.file) : null;
      return '<div class="mod-card">' +
        '<div class="mod-head">' +
          '<div class="mod-avatar">' + esc(initial) + '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div class="mod-name">' + esc(m.name || m.id || m.file) + '</div>' +
            '<div class="mod-id">' + esc(m.id || '?') + ' · ' + esc(m.ver || '?') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="mod-desc">' + esc((m.description || t('aboutMods.noDescription')).slice(0, 140)) + '</div>' +
        (stats.length ? '<div class="mod-stats">' + stats.slice(0, 8).map(s =>
          '<div class="mod-stat">' +
            '<span class="dot" style="background:' + s[2] + '"></span>' +
            '<span class="lbl">' + s[0] + '</span>' +
            '<span class="val">' + s[1] + '</span>' +
          '</div>'
        ).join('') + '</div>' : '') +
        '<div class="mod-foot">' +
          '<span>' + esc(m.file) + '</span>' +
          '<span>' + human(mod ? mod.size : 0) + '</span>' +
        '</div>' +
      '</div>';
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