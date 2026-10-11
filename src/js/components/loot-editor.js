window.LootEditor = (function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function shortName(id) {
    if (!id) return '?';
    if (id.charAt(0) === '#') { const p = id.slice(1).split(':'); return '#' + (p.length > 1 ? p[1] : id.slice(1)); }
    const p = id.split(':');
    return p.length > 1 ? p[1] : id;
  }

  let modalEl = null;
  let st = null;

  function open(opts) {
    // opts: { table, items: [], onSave(override) }
    st = {
      table: opts.table,
      suggestions: opts.suggestions || { items: [] },
      onSave: opts.onSave,
      // what we work on:
      removeEntries: [],
      addEntries: [],
      modified: false
    };

    // начальные данные — берём из уже существующих overrides (если передали)
    if (opts.existingOverride) {
      st.removeEntries = (opts.existingOverride.removeEntries || []).slice();
      st.addEntries = (opts.existingOverride.addEntries || []).slice();
    }

    render();
  }

  function close() {
    if (modalEl && modalEl.parentElement) modalEl.parentElement.removeChild(modalEl);
    modalEl = null; st = null;
  }

  function render() {
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.className = 're-overlay';
      document.body.appendChild(modalEl);
      modalEl.addEventListener('mousedown', e => { if (e.target === modalEl) close(); });
    }
    const table = st.table;

    modalEl.innerHTML = `
      <div class="re-modal" style="max-width:820px">
        <div class="re-header">
          <div>
            <div class="re-title">Редактор лута</div>
            <div class="re-id">${esc(table.id)}</div>
          </div>
          <div style="flex:1"></div>
          <button class="re-close" title="Закрыть">×</button>
        </div>

        <div class="re-body">
          <div class="re-section">
            <div class="re-label">Удалить записи (будут вырезаны из пула)</div>
            ${st.removeEntries.length
              ? '<div class="loot-edit-list">' + st.removeEntries.map((id, i) =>
                  '<div class="loot-edit-row">' +
                    '<div class="loot-edit-name">' + esc(shortName(id)) + '</div>' +
                    '<div class="loot-edit-id">' + esc(id) + '</div>' +
                    '<button class="loot-edit-remove" data-remove-idx="' + i + '" title="Убрать">×</button>' +
                  '</div>'
                ).join('') + '</div>'
              : '<div class="loot-edit-empty">Пока ничего не удалено</div>'}
            <button class="btn" id="lo-add-remove">+ Удалить предмет</button>
          </div>

          <div class="re-section">
            <div class="re-label">Добавить в пул</div>
            ${st.addEntries.length
              ? '<div class="loot-edit-list">' + st.addEntries.map((a, i) => renderAddRow(a, i)).join('') + '</div>'
              : '<div class="loot-edit-empty">Пока ничего не добавлено</div>'}
            <button class="btn" id="lo-add-add">+ Добавить предмет</button>
          </div>
        </div>

        <div class="re-footer">
          <button class="btn" id="lo-clear" style="border-color:rgba(239,68,68,.35);color:#f87171">Сбросить все правки</button>
          <div style="flex:1"></div>
          <button class="btn" id="lo-cancel">Отмена</button>
          <button class="btn primary" id="lo-save">Сохранить</button>
        </div>
      </div>`;

    bind();
  }

  function renderAddRow(a, i) {
    const count = (a.min || 1) === (a.max || 1) ? (a.min || 1) : ((a.min || 1) + '–' + (a.max || 1));
    return '<div class="loot-edit-row wide">' +
      '<div class="loot-edit-main">' +
        '<div class="loot-edit-name">' + esc(shortName(a.item)) + '</div>' +
        '<div class="loot-edit-id">' + esc(a.item) + '</div>' +
      '</div>' +
      '<div class="loot-edit-fields">' +
        '<label>кол-во <input type="number" data-idx="' + i + '" data-fld="min" value="' + (a.min || 1) + '" min="1" max="64"/></label>' +
        '<label>шанс % <input type="number" data-idx="' + i + '" data-fld="chancePct" value="' + ((a.chance !== undefined ? a.chance : 1) * 100).toFixed(0) + '" min="1" max="100"/></label>' +
      '</div>' +
      '<button class="loot-edit-remove" data-add-idx="' + i + '" title="Убрать">×</button>' +
    '</div>';
  }

  function bind() {
    modalEl.querySelector('.re-close').onclick = close;
    modalEl.querySelector('#lo-cancel').onclick = close;

    modalEl.querySelector('#lo-clear').onclick = () => {
      if (!confirm('Сбросить все правки этой таблицы?')) return;
      st.removeEntries = []; st.addEntries = [];
      render();
    };

    modalEl.querySelector('#lo-add-remove').onclick = () => pickItem('remove');
    modalEl.querySelector('#lo-add-add').onclick = () => pickItem('add');

    modalEl.querySelectorAll('[data-remove-idx]').forEach(b => {
      b.onclick = () => { st.removeEntries.splice(+b.dataset.removeIdx, 1); render(); };
    });
    modalEl.querySelectorAll('[data-add-idx]').forEach(b => {
      b.onclick = () => { st.addEntries.splice(+b.dataset.addIdx, 1); render(); };
    });

    // изменения count / chance
    modalEl.querySelectorAll('[data-fld]').forEach(inp => {
      inp.oninput = () => {
        const idx = +inp.dataset.idx;
        const fld = inp.dataset.fld;
        const a = st.addEntries[idx];
        if (!a) return;
        const v = Math.max(1, parseInt(inp.value, 10) || 1);
        if (fld === 'min') { a.min = v; a.max = v; }
        else if (fld === 'chancePct') { a.chance = Math.min(1, v / 100); }
      };
    });

    modalEl.querySelector('#lo-save').onclick = async () => {
      const override = {
        tableId: st.table.id,
        category: st.table.category,
        removeEntries: st.removeEntries.slice(),
        addEntries: st.addEntries.map(a => ({
          item: a.item,
          min: a.min || 1, max: a.max || 1,
          chance: a.chance !== undefined ? a.chance : 1
        }))
      };
      try {
        const res = await st.onSave(override);
        if (res && res.ok) close();
      } catch (e) {}
    };
  }

  /* ================== PickItem ================== */

  function pickItem(mode) {
    const items = (st.suggestions.items || []).slice().sort();
    const picker = document.createElement('div');
    picker.className = 're-picker';
    picker.style.cssText = 'position:fixed;right:24px;top:80px;bottom:80px;transform:none;width:340px;z-index:9600';
    picker.innerHTML = `
      <div class="re-picker-head">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--text-dimmer)">
            ${mode === 'remove' ? 'Удалить из лута' : 'Добавить в лут'}
          </span>
          <button class="re-picker-close" style="margin-left:auto">×</button>
        </div>
        <input type="text" class="input" id="lo-pick-search" placeholder="Поиск предмета..." style="width:100%" autofocus/>
      </div>
      <div class="re-picker-list" id="lo-pick-list">
        ${items.slice(0, 200).map(id => pickerItemRow(id)).join('')}
      </div>
      <div class="re-picker-foot">
        <button class="btn" id="lo-pick-apply">Использовать введённое</button>
      </div>`;
    document.body.appendChild(picker);

    const search = picker.querySelector('#lo-pick-search');
    const list = picker.querySelector('#lo-pick-list');

    function refresh() {
      const q = search.value.toLowerCase().trim();
      const l = q ? items.filter(x => x.toLowerCase().indexOf(q) >= 0).slice(0, 300) : items.slice(0, 200);
      list.innerHTML = l.length
        ? l.map(id => pickerItemRow(id)).join('')
        : '<div style="padding:20px;color:var(--text-dimmer);font-size:11px;text-align:center">Ничего не найдено — введите ID вручную</div>';
      list.querySelectorAll('.re-picker-item').forEach(el => el.onclick = () => pick(el.dataset.id));
    }

    function pick(id) {
      if (mode === 'remove') {
        if (!st.removeEntries.includes(id)) st.removeEntries.push(id);
      } else {
        st.addEntries.push({ item: id, min: 1, max: 1, chance: 1 });
      }
      picker.remove();
      render();
    }

    search.oninput = refresh;
    search.addEventListener('keydown', e => { if (e.key === 'Enter') picker.querySelector('#lo-pick-apply').click(); });
    picker.querySelector('#lo-pick-apply').onclick = () => {
      const v = search.value.trim();
      if (v) pick(v);
    };
    picker.querySelector('.re-picker-close').onclick = () => picker.remove();
    refresh();
    setTimeout(() => search.focus(), 30);
  }

  function pickerItemRow(id) {
    return '<div class="re-picker-item" data-id="' + esc(id) + '">' +
      '<span class="re-picker-badge">ITEM</span>' +
      '<span class="re-picker-name">' + esc(shortName(id)) + '</span>' +
      '<span class="re-picker-id">' + esc(id) + '</span>' +
    '</div>';
  }

  return { open, close };
})();