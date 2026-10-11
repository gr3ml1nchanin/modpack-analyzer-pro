window.JsonForm = (function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function humanize(k) {
    return String(k).replace(/[._\-]+/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ').trim()
      .replace(/^./, c => c.toUpperCase()) || k;
  }
  function sameKeys(arr) {
    if (!arr.length) return true;
    const sig = Object.keys(arr[0]).slice().sort().join('\u0001');
    for (let i = 1; i < arr.length; i++) {
      if (!arr[i] || typeof arr[i] !== 'object') return false;
      if (Object.keys(arr[i]).slice().sort().join('\u0001') !== sig) return false;
    }
    return true;
  }
  function numberToHex(n) {
    const v = Math.max(0, Math.min(0xFFFFFF, (n|0)));
    return '#' + v.toString(16).padStart(6, '0');
  }
  function normalizeHex(s) {
    if (/^#[0-9a-f]{6}$/i.test(s)) return s;
    if (/^#[0-9a-f]{8}$/i.test(s)) return s.slice(0, 7);
    if (/^[0-9a-f]{6}$/i.test(s)) return '#' + s;
    return '#000000';
  }

  function renderValue(path, rootPath, key, value, depth) {
    depth = depth || 0;
    const hint = window.JsonHints.infer(key, value);
    const rootAttr = ' data-jf-root="' + esc(rootPath.join('\u0001')) + '"';
    const pathAttr = ' data-jf-path="' + esc(JSON.stringify(path)) + '"';
    const attrs = rootAttr + pathAttr;

    if (value === null || value === undefined) {
      return '<input type="text" class="cfg-text mono" ' + attrs + ' value="" placeholder="null" style="min-width:180px"/>';
    }
    if (typeof value === 'boolean') {
      return '<label class="cfg-switch">' +
        '<input type="checkbox" ' + attrs + ' ' + (value ? 'checked' : '') + '/>' +
        '<span class="cfg-switch-slider"></span>' +
      '</label>';
    }
    if (typeof value === 'number') {
      const step = hint.step || (Number.isInteger(value) ? 1 : 0.01);
      if (hint.kind === 'slider') {
        return '<input type="range" class="cfg-slider" ' + attrs +
            ' min="' + hint.min + '" max="' + hint.max + '" step="' + step + '" value="' + value + '"/>' +
          '<input type="number" class="cfg-number" ' + attrs + ' data-jf-pair="1"' +
            ' min="' + hint.min + '" max="' + hint.max + '" step="' + step + '" value="' + value + '"/>';
      }
      if (hint.kind === 'color') {
        const hex = numberToHex(value);
        return '<input type="color" ' + attrs + ' data-jf-color="1" value="' + hex + '" style="width:60px;height:28px;padding:0;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);cursor:pointer"/>' +
          '<input type="text" class="cfg-text mono" ' + attrs + ' data-jf-pair="1" value="' + esc(String(value)) + '" style="width:120px"/>';
      }
      const ph = hint.hint ? ' placeholder="' + esc(hint.hint) + '"' : '';
      return '<input type="number" class="cfg-number" ' + attrs + ' step="' + step + '" value="' + value + '" style="width:140px"' + ph + '/>';
    }
    if (typeof value === 'string') {
      if (hint.kind === 'color') {
        return '<input type="color" ' + attrs + ' data-jf-color="1" value="' + esc(normalizeHex(value)) + '" style="width:60px;height:28px;padding:0;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);cursor:pointer"/>' +
          '<input type="text" class="cfg-text mono" ' + attrs + ' data-jf-pair="1" value="' + esc(value) + '" style="width:130px"/>';
      }
      if (hint.kind === 'textarea') {
        const rows = Math.min(8, Math.max(2, Math.ceil(value.length / 80)));
        return '<textarea class="cfg-text" ' + attrs + ' rows="' + rows + '" style="resize:vertical;min-width:280px">' + esc(value) + '</textarea>';
      }
      const cls = hint.kind === 'registry' ? 'cfg-text mono' : 'cfg-text';
      const ph = hint.hint ? ' placeholder="' + esc(hint.hint) + '"' : (hint.kind === 'registry' ? ' placeholder="namespace:path"' : '');
      return '<input type="' + (hint.kind === 'password' ? 'password' : 'text') + '" class="' + cls + '" ' + attrs + ' value="' + esc(value) + '"' + ph + '/>';
    }

    if (Array.isArray(value)) {
      if (!value.length) {
        return '<div class="jf-empty">Пусто' +
          '<button type="button" class="jf-add" ' + attrs + ' data-jf-action="add-item" style="margin-top:0;padding:3px 8px">+ Добавить</button>' +
        '</div>';
      }
      const allObjects = value.every(x => x && typeof x === 'object' && !Array.isArray(x));
      const allPrimitives = value.every(x => x === null || typeof x !== 'object');

      if (allObjects && sameKeys(value)) return renderObjectTable(path, rootPath, value);
      if (allObjects)                     return renderObjectTableUnion(path, rootPath, value);
      if (allPrimitives)                  return renderPrimitiveList(path, rootPath, value);
      return renderMixed(path, rootPath, value);
    }

    if (typeof value === 'object') return renderObject(path, rootPath, value, depth);

    return '<input type="text" class="cfg-text" ' + attrs + ' value="' + esc(String(value)) + '"/>';
  }

  /* ================== Примитивы ================== */
  function renderPrimitiveList(path, rootPath, arr) {
    const attrs = ' data-jf-root="' + esc(rootPath.join('\u0001')) + '" data-jf-path="' + esc(JSON.stringify(path)) + '"';
    let html = '<div class="jf-list">';
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      const idx = ' data-jf-list-idx="' + i + '"';
      let input;
      if (typeof v === 'number') input = '<input type="number" class="cfg-number" style="text-align:left" ' + attrs + idx + ' value="' + v + '"/>';
      else if (typeof v === 'boolean') input = '<input type="checkbox" ' + attrs + idx + ' ' + (v?'checked':'') + '/>';
      else if (v === null) input = '<input type="text" class="cfg-text mono" ' + attrs + idx + ' value="" placeholder="null"/>';
      else input = '<input type="text" class="cfg-text mono" ' + attrs + idx + ' value="' + esc(String(v)) + '"/>';
      html += '<div class="jf-list-row">' + input +
        '<button type="button" class="jf-remove" ' + attrs + idx + ' data-jf-action="remove-item" title="Удалить">×</button>' +
      '</div>';
    }
    html += '<button type="button" class="jf-add" ' + attrs + ' data-jf-action="add-item">+ Добавить</button>';
    html += '</div>';
    return html;
  }

  /* ================== Table (одинаковые ключи) ================== */
  function renderObjectTable(path, rootPath, arr) {
    const keys = Object.keys(arr[0] || {});
    if (!keys.length) return renderJsonFallback(path, rootPath, arr);
    return renderTableHTML(path, rootPath, arr, keys, false);
  }

  /* ================== Table (union ключей) ================== */
  function renderObjectTableUnion(path, rootPath, arr) {
    const set = new Set();
    for (const item of arr) if (item && typeof item === 'object') for (const k of Object.keys(item)) set.add(k);
    const keys = Array.from(set);
    return renderTableHTML(path, rootPath, arr, keys, true);
  }

  function renderTableHTML(path, rootPath, arr, keys, allowMissing) {
    const attrs = ' data-jf-root="' + esc(rootPath.join('\u0001')) + '" data-jf-path="' + esc(JSON.stringify(path)) + '" data-jf-objkeys="' + esc(JSON.stringify(keys)) + '"';
    let html = '<div class="jf-table-wrap"><table class="jf-table">';
    html += '<thead><tr>' + keys.map(k => '<th>' + esc(humanize(k)) + '</th>').join('') +
      '<th style="width:34px"></th></tr></thead><tbody>';

    for (let i = 0; i < arr.length; i++) {
      const rowObj = arr[i] || {};
      html += '<tr>';
      for (const k of keys) {
        const cell = rowObj[k];
        const cellAttrs = attrs + ' data-jf-row="' + i + '" data-jf-key="' + esc(k) + '"';
        let inner;
        if (cell === undefined) inner = '<span style="color:var(--text-dimmer);text-align:center;display:block">—</span>';
        else if (typeof cell === 'boolean') inner = '<input type="checkbox" ' + cellAttrs + ' ' + (cell ? 'checked' : '') + '/>';
        else if (typeof cell === 'number') {
          const h = window.JsonHints.infer(k, cell);
          const step = h.step || (Number.isInteger(cell) ? 1 : 0.01);
          inner = '<input type="number" class="cfg-number" ' + cellAttrs + ' step="' + step + '" value="' + cell + '"/>';
        } else if (typeof cell === 'string') inner = '<input type="text" class="cfg-text mono" style="min-width:0;font-size:11px" ' + cellAttrs + ' value="' + esc(cell) + '"/>';
        else inner = '<input type="text" class="cfg-text mono" style="min-width:0;font-size:11px" ' + cellAttrs + ' value="' + esc(JSON.stringify(cell)) + '" disabled/>';
        html += '<td>' + inner + '</td>';
      }
      html += '<td><button type="button" class="jf-remove" ' + attrs + ' data-jf-action="remove-row" data-jf-row="' + i + '" title="Удалить">×</button></td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
    html += '<button type="button" class="jf-add" ' + attrs + ' data-jf-action="add-row">+ Добавить строку</button>';
    html += '</div>';
    return html;
  }

    /* ================== Mixed: рекурсивный список ================== */
  function renderMixed(path, rootPath, arr) {
    const attrs = ' data-jf-root="' + esc(rootPath.join('\u0001')) + '" data-jf-path="' + esc(JSON.stringify(path)) + '"';
    let html = '<div class="jf-list" style="gap:10px">';

    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      const subPath = path.concat([i]);
      const isPrimitive = v === null || typeof v !== 'object';
      const typeLabel = v === null
        ? 'null'
        : Array.isArray(v) ? 'array[' + v.length + ']' : typeof v;

      html += '<div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:6px;padding:10px 12px;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:' + (isPrimitive ? '6' : '10') + 'px">' +
          '<span style="font-family:var(--mono);font-size:10px;color:var(--text-dimmer)">#' + i + '</span>' +
          '<span style="font-family:var(--mono);font-size:10px;color:var(--text-dimmer)">· ' + typeLabel + '</span>' +
          '<span style="flex:1"></span>' +
          '<button type="button" class="jf-remove" ' + attrs + ' data-jf-list-idx="' + i + '" data-jf-action="remove-item" title="Удалить">×</button>' +
        '</div>';

      // Рекурсия: рендерим значение по его собственному пути
      html += renderValue(subPath, rootPath, '', v, 0);

      html += '</div>';
    }

    html += '<button type="button" class="jf-add" ' + attrs + ' data-jf-action="add-item">+ Добавить элемент</button>';
    html += '</div>';
    return html;
  }

  /* ================== Fallback (совсем непонятное) ================== */
  function renderJsonFallback(path, rootPath, value) {
    const attrs = ' data-jf-root="' + esc(rootPath.join('\u0001')) + '" data-jf-path="' + esc(JSON.stringify(path)) + '" data-jf-rawjson="1"';
    let s;
    try { s = JSON.stringify(value, null, 2); } catch { s = String(value); }
    const rows = Math.min(14, Math.max(3, s.split('\n').length));
    return '<textarea class="cfg-text mono" ' + attrs + ' rows="' + rows +
      '" spellcheck="false" style="resize:vertical;min-width:340px;font-size:11px;line-height:1.5">' + esc(s) + '</textarea>';
  }

  /* ================== Object ================== */
  function renderObject(path, rootPath, obj, depth) {
    let html = '<div class="jf-object">';
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      const subPath = path.concat([k]);
      const isComplex = v && typeof v === 'object';
      html += '<div class="jf-field' + (isComplex ? ' jf-field-complex' : '') + '">' +
        '<div class="jf-label">' +
          '<div class="jf-label-name">' + esc(humanize(k)) + '</div>' +
          '<div class="jf-label-key">' + esc(k) + '</div>' +
        '</div>' +
        '<div class="jf-control">' + renderValue(subPath, rootPath, k, v, depth + 1) + '</div>' +
      '</div>';
    }
    html += '</div>';
    return html;
  }

  return { renderValue };
})();