window.Views = window.Views || {};
window.Views.recipes = (function () {
  function t(k, v) { return window.I18n.t(k, v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function typeLabels() {
    return {
      'crafting_shaped':    t('recipes.type.crafting_shaped'),
      'crafting_shapeless': t('recipes.type.crafting_shapeless'),
      'smelting':           t('recipes.type.smelting'),
      'blasting':           t('recipes.type.blasting'),
      'smoking':            t('recipes.type.smoking'),
      'campfire_cooking':   t('recipes.type.campfire_cooking'),
      'stonecutting':       t('recipes.type.stonecutting'),
      'smithing_transform': t('recipes.type.smithing_transform'),
      'smithing_trim':      t('recipes.type.smithing_trim')
    };
  }

  function mount(container) {
    let state = window.State.data;
    let query = '';
    let typeFilter = 'all';
    let nsFilter = 'all';
    let selected = null;
    let scanning = false;
    let recipesCache = null;

    function render() {
      const hasScan = state.scan && state.scan.mods && state.scan.mods.length;

      const oldList = document.getElementById('rec-list');
      const savedScroll = oldList ? oldList.scrollTop : 0;

      let listHtml = '', statsHtml = '';
      if (!recipesCache) {
        statsHtml = scanning ? t('recipes.sub.scanning') : t('recipes.sub.empty');
      } else {
        const filtered = filterList(recipesCache);
        statsHtml = t('recipes.sub.loaded', {shown: filtered.length, total: recipesCache.length});
        listHtml = filtered.slice(0, 300).map(itemHtml).join('');
        if (filtered.length > 300) {
          listHtml += '<div style="padding:12px;color:var(--text-dimmer);font-size:11px;text-align:center">' +
            t('common.firstN', {n: 300}) + '</div>';
        }
      }

      const TYPE_LABELS = typeLabels();

      container.innerHTML = `
        <div class="view">
          <div class="view-header">
            <div>
              <div class="view-title">${t('recipes.title')}</div>
              <div class="view-sub">${statsHtml}</div>
            </div>
            <div class="view-actions">
              ${recipesCache ? `
                <input class="input" id="rec-q" placeholder="${t('recipes.search')}" value="${esc(query)}"/>
                <select class="input" id="rec-type" style="width:auto">
                  <option value="all">${t('recipes.filter.allTypes')}</option>
                  ${Object.keys(TYPE_LABELS).map(tp =>
                    '<option value="' + tp + '"' + (typeFilter === tp ? ' selected' : '') + '>' + TYPE_LABELS[tp] + '</option>'
                  ).join('')}
                </select>
                <select class="input" id="rec-ns" style="width:auto">
                  <option value="all">${t('recipes.filter.allNs')}</option>
                  ${buildNsOptions()}
                </select>
              ` : ''}
              <button class="btn" id="rec-new" ${recipesCache ? '' : 'disabled'}>${t('recipes.new')}</button>
              <button class="btn ${scanning ? '' : 'primary'}" id="rec-scan" ${scanning || !hasScan ? 'disabled' : ''}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16"/></svg>
                ${scanning ? t('recipes.scanning') : (recipesCache ? t('recipes.rescan') : t('recipes.scan'))}
              </button>
            </div>
          </div>
          <div class="view-body" style="padding:0 32px 0; display:flex; min-height:0">
            ${!hasScan
              ? '<div class="empty-state" style="margin:auto">' + t('recipes.empty') + '</div>'
              : !recipesCache
                ? '<div class="empty-state" style="margin:auto">' + t('recipes.needScan') +
                  '<br/><span style="color:var(--text-dimmer);font-size:11px;margin-top:8px">' + t('recipes.needScanHint') + '</span></div>'
                : `<div class="split two" style="width:100%">
                    <div class="split-panel split-left">
                      <div class="panel-head">${t('recipes.panel.tables')}</div>
                      <div class="panel-list" id="rec-list">${listHtml}</div>
                    </div>
                    <div class="split-panel split-right" id="rec-panel">
                      ${selected ? renderDetails(selected) : '<div class="empty-state">' + t('recipes.selectRecipe') + '</div>'}
                    </div>
                  </div>`
            }
          </div>
        </div>`;

      const scanBtn = document.getElementById('rec-scan');
      if (scanBtn && !scanBtn.disabled) scanBtn.onclick = runScan;

      const q = document.getElementById('rec-q');
      if (q) q.oninput = e => {
        query = e.target.value;
        const pos = q.selectionStart;
        render();
        const nq = document.getElementById('rec-q');
        if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); }
      };
      const tSel = document.getElementById('rec-type');
      if (tSel) {
        tSel.value = typeFilter;
        tSel.onchange = e => { typeFilter = e.target.value; render(); };
      }
      const ns = document.getElementById('rec-ns');
      if (ns) {
        ns.value = nsFilter;
        if (ns.selectedIndex === -1) { ns.value = 'all'; nsFilter = 'all'; }
        ns.onchange = e => { nsFilter = e.target.value; render(); };
      }

      document.querySelectorAll('#rec-list .list-item').forEach(el => {
        el.onclick = () => {
          const r = recipesCache.find(x => x.id === el.dataset.id);
          if (r) { selected = r; render(); }
        };
      });

      const newList = document.getElementById('rec-list');
      if (newList && savedScroll) newList.scrollTop = savedScroll;

      const newBtn = document.getElementById('rec-new');
      if (newBtn) newBtn.onclick = openNewRecipe;
      const editBtn = document.getElementById('rec-edit');
      if (editBtn && selected) editBtn.onclick = () => openEditRecipe(selected);
    }

    function buildNsOptions() {
      if (!recipesCache) return '';
      const set = new Set();
      for (const r of recipesCache) set.add(r.ns);
      return Array.from(set).sort().filter(n => n !== 'all').map(n =>
        '<option value="' + esc(n) + '"' + (nsFilter === n ? ' selected' : '') + '>' + esc(n) + '</option>'
      ).join('');
    }

    function filterList(list) {
      const q = query.toLowerCase();
      return list.filter(r => {
        if (typeFilter !== 'all' && r.type !== typeFilter) return false;
        if (nsFilter !== 'all' && r.ns !== nsFilter) return false;
        if (!q) return true;
        if (r.id.toLowerCase().indexOf(q) >= 0) return true;
        if (r.result && r.result.item && r.result.item.toLowerCase().indexOf(q) >= 0) return true;
        for (const ing of (r.ingredients || [])) {
          const id = ingId(ing.ing);
          if (id && id.toLowerCase().indexOf(q) >= 0) return true;
        }
        return false;
      });
    }

    function ingId(ing) {
      if (!ing) return '';
      if (ing.type === 'item' || ing.type === 'tag') return (ing.type === 'tag' ? '#' : '') + ing.id;
      if (ing.type === 'any' && ing.options && ing.options.length) return ingId(ing.options[0]);
      return '';
    }

    function itemHtml(r) {
      const active = selected && selected.id === r.id;
      const resultIcon = r.result && r.result.item ? shortName(r.result.item) : '?';
      return '<div class="list-item' + (active ? ' active' : '') + '" data-id="' + esc(r.id) + '">' +
        '<span class="badge" style="background:rgba(74,222,128,.15);color:#86efac;font-family:var(--mono);font-size:9px">' +
          (r.type === 'crafting_shaped' ? 'SHAPED' :
           r.type === 'crafting_shapeless' ? 'SHAPELESS' :
           r.type === 'smelting' ? 'SMELT' :
           r.type.slice(0, 8).toUpperCase()) +
        '</span>' +
        '<span class="li-title" title="' + esc(r.id) + '" style="font-family:var(--mono);font-size:11px">' +
          esc(resultIcon) + '</span>' +
        '<span class="li-sub" style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.ns) + '</span>' +
      '</div>';
    }

    function shortName(id) {
      if (!id) return '?';
      const parts = id.split(':');
      return parts.length > 1 ? parts[1] : id;
    }

    function renderDetails(r) {
      const TYPE_LABELS = typeLabels();
      return '<div class="panel-head">' +
        '<span style="text-transform:none;letter-spacing:0;font-size:11px;font-family:var(--mono);color:var(--text-dim);flex:1">' + esc(r.id) + '</span>' +
        '<span style="text-transform:none;letter-spacing:0;font-size:11px;color:var(--text-dimmer)">' + (TYPE_LABELS[r.type] || r.type) + '</span>' +
        '<button class="btn" id="rec-edit" style="padding:5px 12px;font-size:11px;margin-left:8px">' + t('recipes.editBtn') + '</button>' +
      '</div>' +
      '<div style="padding:20px;overflow:auto;flex:1;min-height:0">' +
        renderRecipeVisual(r) +
        '<div style="margin-top:20px">' +
          '<div style="font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:var(--text-dimmer);font-weight:700;margin-bottom:8px">' + t('common.source') + '</div>' +
          '<div class="mono" style="color:var(--text-dim);font-size:11px">' + esc(r.source) + '</div>' +
        '</div>' +
      '</div>';
    }

    function renderRecipeVisual(r) {
      if (r.type === 'crafting_shaped' || r.type === 'crafting_shapeless') {
        return renderGrid(r);
      }
      if (['smelting','blasting','smoking','campfire_cooking','stonecutting'].indexOf(r.type) >= 0) {
        return renderSmelt(r);
      }
      if (r.type === 'smithing_transform' || r.type === 'smithing_trim') {
        return renderSmithing(r);
      }
      return '<div style="color:var(--text-dimmer);font-size:12px">' + t('recipes.noVisual') + '</div>';
    }

    function renderGrid(r) {
      const slots = {};
      for (const item of r.ingredients) {
        if (typeof item.row === 'number') {
          slots[item.row + ':' + item.col] = item.ing;
        } else if (typeof item.idx === 'number') {
          const positions = ['0:0','0:1','0:2','1:0','1:1','1:2','2:0','2:1','2:2'];
          const p = positions[item.idx] || '0:0';
          slots[p] = item.ing;
        }
      }

      const cell = (row, col) => {
        const k = row + ':' + col;
        const ing = slots[k];
        if (!ing) return '<div class="recipe-slot"></div>';
        return '<div class="recipe-slot filled" title="' + esc(ingId(ing)) + '">' + renderIngredient(ing) + '</div>';
      };

      let grid = '<div class="recipe-grid">';
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          grid += cell(row, col);
        }
      }
      grid += '</div>';

      return '<div class="recipe-layout">' +
        grid +
        '<div class="recipe-arrow">→</div>' +
        '<div class="recipe-result">' +
          '<div class="recipe-slot filled big" title="' + esc(r.result.item) + '">' +
            renderIngredient({ type: 'item', id: r.result.item }) +
          '</div>' +
          (r.result.count > 1 ? '<div class="recipe-count">×' + r.result.count + '</div>' : '') +
          '<div class="recipe-label">' + esc(shortName(r.result.item)) + '</div>' +
        '</div>' +
      '</div>';
    }

    function renderSmelt(r) {
      const ing = r.ingredients[0] ? r.ingredients[0].ing : null;
      return '<div class="recipe-layout">' +
        '<div class="recipe-slot filled" title="' + (ing ? esc(ingId(ing)) : '') + '">' + (ing ? renderIngredient(ing) : '') + '</div>' +
        '<div class="recipe-arrow">→</div>' +
        '<div class="recipe-result">' +
          '<div class="recipe-slot filled big" title="' + esc(r.result.item) + '">' +
            renderIngredient({ type: 'item', id: r.result.item }) +
          '</div>' +
          (r.result.count > 1 ? '<div class="recipe-count">×' + r.result.count + '</div>' : '') +
          '<div class="recipe-label">' + esc(shortName(r.result.item)) + '</div>' +
        '</div>' +
        (r.cookingtime ? '<div style="margin-left:20px;color:var(--text-dim);font-size:11px">' + (r.cookingtime / 20).toFixed(1) + ' ' + t('recipes.secondsShort') + '</div>' : '') +
      '</div>';
    }

    function renderSmithing(r) {
      const tp = r.ingredients.find(x => x.idx === 'template');
      const b = r.ingredients.find(x => x.idx === 'base');
      const a = r.ingredients.find(x => x.idx === 'addition');
      return '<div class="recipe-layout">' +
        (tp ? '<div class="recipe-slot filled">' + renderIngredient(tp.ing) + '</div>' : '<div class="recipe-slot"></div>') +
        (b ? '<div class="recipe-slot filled">' + renderIngredient(b.ing) + '</div>' : '<div class="recipe-slot"></div>') +
        (a ? '<div class="recipe-slot filled">' + renderIngredient(a.ing) + '</div>' : '<div class="recipe-slot"></div>') +
        '<div class="recipe-arrow">→</div>' +
        '<div class="recipe-result">' +
          '<div class="recipe-slot filled big">' + renderIngredient({ type: 'item', id: r.result.item }) + '</div>' +
          '<div class="recipe-label">' + esc(shortName(r.result.item)) + '</div>' +
        '</div>' +
      '</div>';
    }

    function renderIngredient(ing) {
      if (!ing) return '';
      if (ing.type === 'item') {
        return '<div class="recipe-ing" title="' + esc(ing.id) + '">' +
          '<div class="recipe-ing-name">' + esc(shortName(ing.id)) + '</div>' +
          '<div class="recipe-ing-id">' + esc(ing.id) + '</div>' +
        '</div>';
      }
      if (ing.type === 'tag') {
        return '<div class="recipe-ing tag" title="#' + esc(ing.id) + '">' +
          '<div class="recipe-ing-name">#' + esc(shortName(ing.id)) + '</div>' +
          '<div class="recipe-ing-id">' + t('recipes.ing.tagLabel') + '</div>' +
        '</div>';
      }
      if (ing.type === 'any') {
        return '<div class="recipe-ing any" title="' + t('recipes.ing.variants', {n: ing.options.length}) + '">' +
          '<div class="recipe-ing-name">' + t('recipes.ing.anyLabel') + '</div>' +
          '<div class="recipe-ing-id">' + t('recipes.ing.options', {n: ing.options.length}) + '</div>' +
        '</div>';
      }
      return '';
    }

    /* ================== Редактор рецептов ================== */
    function collectSuggestions() {
      const items = new Set();
      const tags = new Set();

      if (recipesCache) {
        for (const r of recipesCache) {
          if (r.result && r.result.item) items.add(r.result.item);
          for (const ing of (r.ingredients || [])) {
            const id = ingId(ing.ing);
            if (!id) continue;
            if (id.charAt(0) === '#') tags.add(id.slice(1));
            else items.add(id);
          }
        }
      }

      if (state.modInfo && state.modInfo.list) {
        for (const m of state.modInfo.list) {
          for (const b of (m.blocks || [])) items.add(m.id + ':' + b);
          for (const i of (m.items || [])) items.add(m.id + ':' + i);
        }
      }

      const common = [
        'minecraft:planks', 'minecraft:logs', 'minecraft:logs_that_burn',
        'minecraft:stone_bricks', 'minecraft:wool', 'minecraft:coals',
        'minecraft:arrows', 'minecraft:beacon_payment_items',
        'minecraft:small_flowers', 'minecraft:tall_flowers', 'minecraft:flowers',
        'minecraft:fishes', 'minecraft:leaves', 'minecraft:sand',
        'minecraft:dirt', 'minecraft:base_stone_overworld',
        'forge:ingots/iron', 'forge:ingots/gold', 'forge:ingots/copper',
        'forge:nuggets/iron', 'forge:nuggets/gold',
        'forge:ores', 'forge:ores/iron', 'forge:ores/gold', 'forge:ores/copper',
        'forge:storage_blocks/iron', 'forge:storage_blocks/gold',
        'forge:rods/wooden', 'forge:rods/iron', 'forge:rods/gold',
        'forge:dusts/redstone', 'forge:glass', 'forge:glass_panes',
        'forge:stone', 'forge:cobblestone', 'forge:gravel',
        'forge:sand', 'forge:sandstone',
        'forge:raw_materials/iron', 'forge:raw_materials/copper', 'forge:raw_materials/gold',
        'c:planks', 'c:logs', 'c:ingots', 'c:ores', 'c:glass'
      ];
      for (const tg of common) tags.add(tg);

      return {
        items: Array.from(items).filter(Boolean).sort(),
        tags:  Array.from(tags).filter(Boolean).sort()
      };
    }

    function openNewRecipe() {
      window.RecipeEditor.open({
        suggestions: collectSuggestions(),
        onSave: async (recipe) => {
          try {
            const res = await window.API.recipes.save(state.scan.root, recipe);
            if (res.ok) {
              window.Toast.success(t('recipes.toast.saved'), t('recipes.toast.added', {id: res.id}));
              recipesCache.push({
                id: res.id, ns: 'analyzer', name: res.id,
                source: 'analyzer_recipes.js',
                type: recipe.type.replace(/^[a-z_]+:/, ''),
                result: recipe.result,
                ingredients: recipeToIngredientsForPreview(recipe),
                shape: recipe.shape || null
              });
              selected = null;
              render();
            } else {
              window.Toast.error(t('status.error'), res.error || t('recipes.toast.saveFailed'));
            }
            return res;
          } catch (e) {
            window.Toast.error(t('status.error'), e.message);
            return { ok: false, error: e.message };
          }
        }
      });
    }

    function openEditRecipe(r) {
      window.RecipeEditor.open({
        recipe: r,
        suggestions: collectSuggestions(),
        onSave: async (recipe) => {
          try {
            const res = await window.API.recipes.save(state.scan.root, recipe);
            if (res.ok) {
              window.Toast.success(t('recipes.toast.saved'), t('recipes.toast.updated', {id: res.id}));
              const idx = recipesCache.findIndex(x => x.id === r.id);
              if (idx >= 0) recipesCache.splice(idx, 1);
              recipesCache.push({
                id: res.id, ns: 'analyzer', name: res.id,
                source: 'analyzer_recipes.js',
                type: recipe.type.replace(/^[a-z_]+:/, ''),
                result: recipe.result,
                ingredients: recipeToIngredientsForPreview(recipe),
                shape: recipe.shape || null
              });
              selected = null;
              render();
            } else {
              window.Toast.error(t('status.error'), res.error || t('recipes.toast.saveFailed'));
            }
            return res;
          } catch (e) {
            window.Toast.error(t('status.error'), e.message);
            return { ok: false, error: e.message };
          }
        },
        onDelete: async (id) => {
          try {
            const res = await window.API.recipes.delete(state.scan.root, id);
            if (res.ok) {
              window.Toast.success(t('common.delete'), t('recipes.toast.deleted', {id: id}));
              recipesCache = recipesCache.filter(x => x.id !== id);
              selected = null;
              render();
            } else {
              window.Toast.error(t('status.error'), res.error || t('recipes.toast.deleteFailed'));
            }
          } catch (e) {
            window.Toast.error(t('status.error'), e.message);
          }
        }
      });
    }

    function recipeToIngredientsForPreview(recipe) {
      const out = [];
      if (recipe.type === 'crafting_shaped' && recipe.shape && recipe.key) {
        for (let r = 0; r < recipe.shape.length; r++) {
          for (let c = 0; c < recipe.shape[r].length; c++) {
            const ch = recipe.shape[r][c];
            if (ch === ' ' || !recipe.key[ch]) continue;
            out.push({ row: r, col: c, ing: { type: 'item', id: recipe.key[ch] } });
          }
        }
      } else if (recipe.ingredients) {
        recipe.ingredients.forEach((id, i) => {
          out.push({ idx: i, ing: { type: id.charAt(0) === '#' ? 'tag' : 'item', id: id.charAt(0) === '#' ? id.slice(1) : id } });
        });
      }
      return out;
    }

    async function runScan() {
      if (!state.scan) return;
      scanning = true;
      render();
      try {
        const list = await window.API.recipes.scan(state.scan.root);
        recipesCache = list;
        window.Toast.success(t('recipes.toast.scanned'), t('recipes.toast.scannedDesc', {n: list.length}));
      } catch (e) {
        window.Toast.error(t('dlg.scanFailed'), e.message);
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