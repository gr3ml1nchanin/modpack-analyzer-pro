window.RecipeEditor = (function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function shortName(id) {
    if (!id) return '?';
    if (id.charAt(0) === '#') { const p = id.slice(1).split(':'); return '#' + (p.length > 1 ? p[1] : id.slice(1)); }
    const p = id.split(':');
    return p.length > 1 ? p[1] : id;
  }

  let modalEl = null;
  let currentState = null;

  async function open(opts) {
    // opts: { recipe?, suggestions: { items, tags }, onSave(recipe), onDelete(id) }
    const isNew = !opts.recipe;
    const base = opts.recipe || {
      id: null, type: 'crafting_shaped',
      shape: ['   ', '   ', '   '],
      key: {},
      ingredients: [],
      result: { item: '', count: 1 }
    };

    currentState = {
      recipe: deepClone(base),
      isNew,
      suggestions: opts.suggestions || { items: [], tags: [] },
      onSave: opts.onSave,
      onDelete: opts.onDelete,
      grid: shapeToGrid(base),
      pickerTarget: null,   // { kind: 'slot', row, col } | { kind: 'result' } | null
      pickerFilter: 'all',  // 'all' | 'items' | 'tags'
      pickerQuery: ''
    };

    // === ПОДГРУЗКА ТЕКСТУР ПЕРЕД ОТКРЫТИЕМ ===
    if (window.TextureHelper && window.State.data.scan) {
      const ids = new Set();
      if (base.result && base.result.item) ids.add(base.result.item);
      
      // Собираем ID из разных форматов ингредиентов
      if (base.ingredients) {
        for (const ing of base.ingredients) {
          if (typeof ing === 'string') ids.add(ing);
          else if (ing.id) ids.add(ing.id);
          else if (ing.ing && ing.ing.id) ids.add(ing.ing.id);
        }
      }
      if (base.key) {
        for (const val of Object.values(base.key)) {
          if (typeof val === 'string') ids.add(val);
          else if (val && val.id) ids.add(val.id);
        }
      }
      
      await window.TextureHelper.load(window.State.data.scan.root, Array.from(ids));
    }
    // ==========================================

    renderModal();
  }

  function close() {
    if (modalEl && modalEl.parentElement) modalEl.parentElement.removeChild(modalEl);
    modalEl = null;
    currentState = null;
  }

  function deepClone(x) { return JSON.parse(JSON.stringify(x)); }

  function ingredientToId(x) {
    if (!x) return '';
    if (typeof x === 'string') return x;
    if (Array.isArray(x)) {
      for (const o of x) { const r = ingredientToId(o); if (r) return r; }
      return '';
    }
    if (typeof x === 'object') {
      if (x.type === 'tag')  return '#' + (x.id || x.tag || '');
      if (x.type === 'item') return x.id || x.item || '';
      if (x.ing) return ingredientToId(x.ing);
      if (x.tag)  return '#' + x.tag;
      if (x.item) return x.item;
      if (x.id)   return x.id;
    }
    return '';
  }

  function shapeToGrid(recipe) {
    const grid = [[null, null, null], [null, null, null], [null, null, null]];
    if (!recipe) return grid;
    const type = recipe.type || 'crafting_shaped';

    if (type === 'crafting_shaped') {
      if (Array.isArray(recipe.ingredients) && recipe.ingredients.length) {
        for (const item of recipe.ingredients) {
          if (typeof item.row !== 'number' || typeof item.col !== 'number') continue;
          if (item.row < 0 || item.row > 2 || item.col < 0 || item.col > 2) continue;
          const id = ingredientToId(item.ing);
          if (id) grid[item.row][item.col] = { id };
        }
      }
      else if (recipe.shape && recipe.key) {
        for (let r = 0; r < Math.min(3, recipe.shape.length); r++) {
          const row = recipe.shape[r] || '';
          for (let c = 0; c < Math.min(3, row.length); c++) {
            const ch = row[c];
            if (!ch || ch === ' ') continue;
            const id = ingredientToId(recipe.key[ch]);
            if (id) grid[r][c] = { id };
          }
        }
      }
    }
    else if (type === 'crafting_shapeless') {
      const pos = [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]];
      const ings = recipe.ingredients || [];
      ings.forEach((entry, i) => {
        if (i >= pos.length) return;
        const id = ingredientToId(entry);
        if (!id) return;
        const p = pos[i];
        grid[p[0]][p[1]] = { id };
      });
    }
    else if (['smelting','blasting','smoking','campfire_cooking','stonecutting'].indexOf(type) >= 0) {
      const ings = recipe.ingredients || [];
      const id = ingredientToId(ings[0]);
      if (id) grid[0][0] = { id };
    }

    return grid;
  }

  function gridToRecipe() {
    const st = currentState;
    const r = deepClone(st.recipe);
    r.result = r.result || { item: '', count: 1 };
    r.type = r.type || 'crafting_shaped';

    r.shape = null; r.key = null; r.ingredients = null;

    if (r.type === 'crafting_shaped') {
      const shape = [];
      const key = {};
      const letters = 'ABCDEFGHI';
      let letterIdx = 0;
      const grid = st.grid;
      
      for (let row = 0; row < 3; row++) {
        let line = '';
        for (let col = 0; col < 3; col++) {
          const cell = grid[row][col];
          if (!cell || !cell.id) { line += ' '; continue; }
          let ch = null;
          for (const k of Object.keys(key)) {
            if (key[k] === cell.id) { ch = k; break; }
          }
          if (!ch) {
            ch = letters[letterIdx++] || 'Z';
            key[ch] = cell.id;
          }
          line += ch;
        }
        shape.push(line);
      }
      r.shape = shape;
      r.key = key;
    } else if (r.type === 'crafting_shapeless') {
      const ings = [];
      const grid = st.grid;
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        if (grid[row][col] && grid[row][col].id) ings.push(grid[row][col].id);
      }
      r.ingredients = ings;
    } else if (['smelting','blasting','smoking','campfire_cooking','stonecutting'].indexOf(r.type) >= 0) {
      const first = st.grid[0][0];
      r.ingredients = first && first.id ? [first.id] : [];
    }

    return r;
  }

  /* ================== Рендер ================== */

  function renderModal() {
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.className = 're-overlay';
      document.body.appendChild(modalEl);
      modalEl.addEventListener('mousedown', e => {
        if (e.target === modalEl) close();
      });
    }
    const st = currentState;
    const r = st.recipe;

    modalEl.innerHTML = `
      <div class="re-modal">
        <div class="re-header">
          <div>
            <div class="re-title">${st.isNew ? 'Новый рецепт' : 'Редактирование рецепта'}</div>
            <div class="re-id">${st.isNew ? '' : esc(r.id || '')}</div>
          </div>
          <div style="flex:1"></div>
          <button class="re-close" title="Закрыть">×</button>
        </div>

        <div class="re-body">
          <div class="re-section">
            <div class="re-label">Тип рецепта</div>
            <select class="input" id="re-type" style="width:240px">
              <option value="crafting_shaped"    ${r.type==='crafting_shaped'?'selected':''}>Верстак (форма)</option>
              <option value="crafting_shapeless" ${r.type==='crafting_shapeless'?'selected':''}>Верстак (без формы)</option>
              <option value="smelting"           ${r.type==='smelting'?'selected':''}>Печь</option>
              <option value="blasting"           ${r.type==='blasting'?'selected':''}>Доменная печь</option>
              <option value="smoking"            ${r.type==='smoking'?'selected':''}>Коптильня</option>
              <option value="campfire_cooking"   ${r.type==='campfire_cooking'?'selected':''}>Костёр</option>
              <option value="stonecutting"       ${r.type==='stonecutting'?'selected':''}>Камнерез</option>
            </select>
          </div>

          <div class="re-section">
            <div class="re-label">${gridLabelFor(r.type)}</div>
            ${renderGrid()}
            <div class="re-hint">Кликните по слоту — затем выберите предмет или тег</div>
          </div>

          <div class="re-section">
            <div class="re-label">Результат</div>
            <div class="re-result-row">
              <input class="cfg-text mono" id="re-result-item" value="${esc(r.result.item || '')}" placeholder="minecraft:stone"/>
              <button class="btn" id="re-result-pick" title="Выбрать из списка">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h12"/></svg>
                Выбрать
              </button>
              <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
                <span style="color:var(--text-dim);font-size:11px">×</span>
                <input type="number" class="cfg-number" id="re-result-count" value="${r.result.count || 1}" min="1" max="64" style="width:64px"/>
              </div>
            </div>
            ${r.result.item ? renderResultPreview(r.result) : ''}
          </div>
        </div>

        <div class="re-footer">
          ${!st.isNew ? '<button class="btn" id="re-delete" style="border-color:rgba(239,68,68,.35);color:#f87171;margin-right:auto">Удалить рецепт</button>' : ''}
          <div style="flex:1"></div>
          <button class="btn" id="re-cancel">Отмена</button>
          <button class="btn primary" id="re-save">Сохранить</button>
        </div>
      </div>`;

    bindModalEvents();
  }

  function gridLabelFor(type) {
    if (type === 'crafting_shaped')    return 'Сетка 3×3';
    if (type === 'crafting_shapeless') return 'Ингредиенты (порядок не важен)';
    if (['smelting','blasting','smoking','campfire_cooking','stonecutting'].indexOf(type) >= 0) return 'Входной предмет';
    return 'Входные предметы';
  }

  function renderGrid() {
    const st = currentState;
    const type = st.recipe.type;
    const cells = [];

    if (type === 'crafting_shaped' || type === 'crafting_shapeless') {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          cells.push(renderSlot(r, c));
        }
      }
      return '<div class="re-grid">' + cells.join('') + '</div>';
    }
    return '<div class="re-grid-single">' + renderSlot(0, 0) + '</div>';
  }

  function renderSlot(r, c) {
    const st = currentState;
    const cell = st.grid[r] && st.grid[r][c];
    const isSelected = st.pickerTarget && st.pickerTarget.kind === 'slot' &&
      st.pickerTarget.row === r && st.pickerTarget.col === c;
    const hasId = cell && cell.id && typeof cell.id === 'string';
    const isTag = hasId && cell.id.charAt(0) === '#';
    
    // Иконка
    let iconHtml = '';
    if (hasId && !isTag && window.TextureHelper) {
      iconHtml = window.TextureHelper.html(cell.id, 24);
    }
    
    return '<div class="re-slot' + (hasId ? ' filled' : '') + (isTag ? ' tag' : '') + (isSelected ? ' selected' : '') +
      '" data-row="' + r + '" data-col="' + c + '">' +
      (hasId
        ? iconHtml +
          '<div class="re-slot-name" style="font-size:9px;">' + esc(shortName(String(cell.id))) + '</div>' +
          '<button class="re-slot-clear" data-clear="' + r + '_' + c + '" title="Очистить">×</button>'
        : '<div class="re-slot-empty">+</div>') +
    '</div>';
  }

  function renderResultPreview(result) {
    const icon = (window.TextureHelper && result.item) ? window.TextureHelper.html(result.item, 32) : '';
    return '<div class="re-preview">' +
      icon +
      '<div class="re-preview-name">' + esc(shortName(result.item)) + '</div>' +
      '<div class="re-preview-id">' + esc(result.item) + (result.count > 1 ? ' ×' + result.count : '') + '</div>' +
    '</div>';
  }

  /* ================== Events ================== */

  function bindModalEvents() {
    modalEl.querySelector('.re-close').onclick = close;
    modalEl.querySelector('#re-cancel').onclick = close;

    const del = modalEl.querySelector('#re-delete');
    if (del) del.onclick = async () => {
      if (!confirm('Удалить этот рецепт? Изменение применится при следующем запуске Minecraft.')) return;
      const st = currentState;
      if (st.onDelete) await st.onDelete(st.recipe.id);
      close();
    };

    modalEl.querySelector('#re-type').onchange = e => {
      currentState.recipe.type = e.target.value;
      if (['smelting','blasting','smoking','campfire_cooking','stonecutting'].indexOf(e.target.value) >= 0) {
        const first = currentState.grid[0][0] || findFirstIngredient();
        currentState.grid = [[first, null, null], [null, null, null], [null, null, null]];
      }
      renderModal();
    };

    modalEl.querySelectorAll('.re-slot').forEach(el => {
      el.onclick = e => {
        if (e.target.dataset.clear) return;
        const row = parseInt(el.dataset.row, 10);
        const col = parseInt(el.dataset.col, 10);
        currentState.pickerTarget = { kind: 'slot', row, col };
        currentState.pickerQuery = '';
        currentState.pickerFilter = 'all';
        renderModal();
        const inp = modalEl.querySelector('#re-picker-search');
        if (inp) inp.focus();
      };
    });

    modalEl.querySelectorAll('.re-slot-clear').forEach(b => {
      b.onclick = e => {
        e.stopPropagation();
        const [r, c] = b.dataset.clear.split('_').map(Number);
        currentState.grid[r][c] = null;
        if (currentState.pickerTarget && currentState.pickerTarget.kind === 'slot' &&
            currentState.pickerTarget.row === r && currentState.pickerTarget.col === c) {
          currentState.pickerTarget = null;
        }
        renderModal();
      };
    });

    const ri = modalEl.querySelector('#re-result-item');
    if (ri) ri.oninput = e => { currentState.recipe.result.item = e.target.value.trim(); };

    const rp = modalEl.querySelector('#re-result-pick');
    if (rp) rp.onclick = () => {
      currentState.pickerTarget = { kind: 'result' };
      currentState.pickerQuery = '';
      currentState.pickerFilter = 'all';
      renderModal();
      const inp = modalEl.querySelector('#re-picker-search');
      if (inp) inp.focus();
    };

    const rc = modalEl.querySelector('#re-result-count');
    if (rc) rc.oninput = e => { currentState.recipe.result.count = Math.max(1, parseInt(e.target.value, 10) || 1); };

    renderPicker();

    modalEl.querySelector('#re-save').onclick = async () => {
      const r = gridToRecipe();
      if (!r.result.item) return window.Toast.warn('Укажите результат');
      if (r.type === 'crafting_shaped' && (!r.shape || r.shape.join('').trim() === '')) return window.Toast.warn('Заполните хотя бы одну ячейку');
      if ((r.type === 'crafting_shapeless' || r.type === 'smelting' || r.type === 'stonecutting' || r.type === 'blasting' || r.type === 'smoking' || r.type === 'campfire_cooking')
          && (!r.ingredients || !r.ingredients.length)) return window.Toast.warn('Заполните ингредиенты');

      const st = currentState;
      if (!st.isNew && st.recipe.id) r.originalId = st.recipe.id;

      try {
        const res = await st.onSave(r);
        if (res && res.ok) close();
      } catch (e) {}
    };
  }

  function findFirstIngredient() {
    const g = currentState.grid;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (g[r][c] && g[r][c].id) return g[r][c];
    return null;
  }

  /* ================== Picker ================== */

  function renderPicker() {
    const st = currentState;
    if (!st.pickerTarget) return;

    const old = modalEl.querySelector('.re-picker');
    if (old) old.remove();

    const allItems = st.suggestions.items || [];
    const allTags  = st.suggestions.tags  || [];

    let list = [];
    if (st.pickerFilter === 'items') list = allItems.map(x => ({ kind: 'item', id: x }));
    else if (st.pickerFilter === 'tags') list = allTags.map(x => ({ kind: 'tag', id: x }));
    else list = allItems.map(x => ({ kind: 'item', id: x })).concat(allTags.map(x => ({ kind: 'tag', id: x })));

    const q = (st.pickerQuery || '').toLowerCase().trim();
    if (q) list = list.filter(x => x.id.toLowerCase().indexOf(q) >= 0);

    const shown = list.slice(0, 300);

    const headLabel = st.pickerTarget.kind === 'result'
      ? 'Выбор результата'
      : (st.pickerTarget.kind === 'slot'
          ? 'Слот #' + (st.pickerTarget.row * 3 + st.pickerTarget.col + 1)
          : '');

    const picker = document.createElement('div');
    picker.className = 're-picker';
    picker.innerHTML = `
      <div class="re-picker-head">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--text-dimmer)">${esc(headLabel)}</span>
          <button class="re-picker-close" title="Закрыть" style="margin-left:auto">×</button>
        </div>
        <input type="text" class="input" id="re-picker-search" placeholder="Поиск (например: planks, iron_ingot, #logs)" style="width:100%"/>
        <div class="re-picker-chips">
          <div class="re-picker-chip ${st.pickerFilter==='all'?'active':''}" data-filter="all">Всё <span class="cnt">${allItems.length + allTags.length}</span></div>
          <div class="re-picker-chip ${st.pickerFilter==='items'?'active':''}" data-filter="items">Предметы <span class="cnt">${allItems.length}</span></div>
          <div class="re-picker-chip ${st.pickerFilter==='tags'?'active':''}" data-filter="tags">Теги <span class="cnt">${allTags.length}</span></div>
        </div>
      </div>
      <div class="re-picker-list" id="re-picker-list">
        ${shown.length
          ? shown.map(it => itemRow(it.id, it.kind)).join('')
          : '<div style="padding:20px;color:var(--text-dimmer);font-size:11px;text-align:center">Ничего не найдено — введите ID вручную</div>'}
      </div>
      <div class="re-picker-foot">
        <button class="btn" id="re-picker-apply">Использовать введённое</button>
        <button class="btn" id="re-picker-clear">Убрать</button>
      </div>`;
    modalEl.querySelector('.re-modal').appendChild(picker);

    const search = picker.querySelector('#re-picker-search');
    const listEl = picker.querySelector('#re-picker-list');
    const apply  = picker.querySelector('#re-picker-apply');
    const clr    = picker.querySelector('#re-picker-clear');
    const closeP = picker.querySelector('.re-picker-close');

    search.value = st.pickerQuery || '';

    search.oninput = e => {
      st.pickerQuery = e.target.value;
      const qq = st.pickerQuery.toLowerCase().trim();
      let l = [];
      if (st.pickerFilter === 'items') l = allItems.map(x => ({ kind: 'item', id: x }));
      else if (st.pickerFilter === 'tags') l = allTags.map(x => ({ kind: 'tag', id: x }));
      else l = allItems.map(x => ({ kind: 'item', id: x })).concat(allTags.map(x => ({ kind: 'tag', id: x })));
      if (qq) l = l.filter(x => x.id.toLowerCase().indexOf(qq) >= 0);
      listEl.innerHTML = l.length
        ? l.slice(0, 300).map(it => itemRow(it.id, it.kind)).join('')
        : '<div style="padding:20px;color:var(--text-dimmer);font-size:11px;text-align:center">Ничего не найдено — введите ID вручную</div>';
      bindRowClicks();
    };

    search.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        apply.click();
      } else if (e.key === 'Escape') {
        closeP.click();
      }
    });

    picker.querySelectorAll('.re-picker-chip').forEach(chip => {
      chip.onclick = () => {
        st.pickerFilter = chip.dataset.filter;
        renderPicker();
        const inp = modalEl.querySelector('#re-picker-search');
        if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
      };
    });

    apply.onclick = () => {
      const v = search.value.trim();
      if (!v) return;
      pickItem(v);
    };

    clr.onclick = () => {
      if (st.pickerTarget.kind === 'result') {
        st.recipe.result.item = '';
      } else if (st.pickerTarget.kind === 'slot') {
        const { row, col } = st.pickerTarget;
        st.grid[row][col] = null;
      }
      st.pickerTarget = null;
      renderModal();
    };

    closeP.onclick = () => {
      st.pickerTarget = null;
      renderModal();
    };

    function bindRowClicks() {
      listEl.querySelectorAll('.re-picker-item').forEach(el => {
        el.onclick = () => pickItem(el.dataset.id);
      });
    }
    bindRowClicks();

    setTimeout(() => {
      if (search) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
    }, 20);
  }

  function itemRow(id, kind) {
    const isTag = kind === 'tag' || (id && id.charAt(0) === '#');
    const pureId = isTag && id.charAt(0) === '#' ? id.slice(1) : id;
    
    // Иконка для пикера
    const icon = (!isTag && window.TextureHelper) ? window.TextureHelper.html(pureId, 20) : '';

    return '<div class="re-picker-item' + (isTag ? ' tag' : '') + '" data-id="' + esc(isTag ? '#' + pureId : pureId) + '">' +
      '<div style="grid-row: 1 / 3; align-self: center; display: flex; align-items: center; gap: 6px;">' +
        icon +
        '<span class="re-picker-badge">' + (isTag ? 'TAG' : 'ITEM') + '</span>' +
      '</div>' +
      '<span class="re-picker-name">' + (isTag ? '#' : '') + esc(shortName(pureId)) + '</span>' +
      '<span class="re-picker-id">' + esc(pureId) + '</span>' +
    '</div>';
  }

  function pickItem(id) {
    const st = currentState;
    if (!st.pickerTarget) return;

    if (st.pickerTarget.kind === 'result') {
      const clean = id.charAt(0) === '#' ? id.slice(1) : id;
      st.recipe.result.item = clean;
      st.pickerTarget = null;
      renderModal();
      return;
    }

    if (st.pickerTarget.kind === 'slot') {
      const { row, col } = st.pickerTarget;
      st.grid[row][col] = { id };
      const type = st.recipe.type;
      if (type === 'crafting_shaped' || type === 'crafting_shapeless') {
        let next = null;
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
          if (!st.grid[r][c]) { next = { row: r, col: c }; break; }
        }
        st.pickerTarget = next ? { kind: 'slot', row: next.row, col: next.col } : null;
      } else {
        st.pickerTarget = null;
      }
      st.pickerQuery = '';
      renderModal();
    }
  }

  return { open, close };
})();