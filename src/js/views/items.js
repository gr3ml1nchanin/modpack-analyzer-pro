window.Views = window.Views || {};
window.Views.items = (function () {
  function t(k, v) { return window.I18n.t(k, v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function mount(container) {
    let state = window.State.data;
    let items = null;
    let query = '';

    function render() {
      const subText = items
        ? t('items.sub.loaded', {n: items.length})
        : t('items.sub.empty');

      container.innerHTML = `
        <div class="view">
          <div class="view-header">
            <div>
              <div class="view-title">${t('items.title')}</div>
              <div class="view-sub">${subText}</div>
            </div>
            <div class="view-actions">
              <input class="input" id="it-q" placeholder="${t('items.search')}" value="${esc(query)}" ${items ? '' : 'disabled'}/>
              <button class="btn primary" id="it-open">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6"/></svg>
                ${t('items.open')}
              </button>
            </div>
          </div>
          <div class="view-body">
            ${!items
              ? '<div class="empty-state">' + t('items.empty') + '</div>'
              : '<div class="table-wrap"><table class="table">' +
                  '<thead><tr>' +
                    '<th>' + t('items.col.id') + '</th>' +
                    '<th>' + t('items.col.ns') + '</th>' +
                    '<th>' + t('items.col.path') + '</th>' +
                  '</tr></thead>' +
                  '<tbody>' + filtered().slice(0, 500).map(it => '<tr>' +
                    '<td class="mono">' + esc(it.raw) + '</td>' +
                    '<td><span class="tag">' + esc(it.ns) + '</span></td>' +
                    '<td class="mono">' + esc(it.path) + '</td>' +
                  '</tr>').join('') + '</tbody>' +
                '</table></div>'}
          </div>
        </div>`;

      const open = document.getElementById('it-open');
      if (open) open.onclick = pickFile;
      const q = document.getElementById('it-q');
      if (q && items) q.oninput = e => {
        query = e.target.value;
        render();
        const nq = document.getElementById('it-q');
        if (nq) nq.focus();
      };
    }

    function filtered() {
      if (!items) return [];
      if (!query) return items;
      const q = query.toLowerCase();
      return items.filter(it => it.raw.toLowerCase().indexOf(q) >= 0);
    }

    async function pickFile() {
      const p = await window.API.dlg.file({
        title: t('items.filePickerTitle'),
        filters: [{ name: t('items.filePickerFilter'), extensions: ['txt'] }]
      });
      if (!p) return;
      const r = await window.API.file.read(p);
      if (r.error) return window.Toast.error(t('items.toast.readFailed'), r.error);
      const lines = (r.content || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      items = lines.map(l => {
        const parts = l.split(':');
        return { raw: l, ns: parts[0] || '', path: parts[1] || '' };
      });
      window.Toast.success(t('items.toast.loaded'), t('items.toast.loadedDesc', {n: items.length}));
      render();
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