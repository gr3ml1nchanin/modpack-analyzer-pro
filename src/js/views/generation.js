window.Views = window.Views || {};
window.Views.generation = (function () {
  function t(k, v) { return window.I18n.t(k, v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0,2), 16), g = parseInt(h.slice(2,4), 16), b = parseInt(h.slice(4,6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function mount(container) {
    let state = window.State.data;
    let mode = 'graph'; 
    let worldgenData = null;
    let scanning = false;

    // Состояние графа
    let canvas, ctx;
    let nodes = [];
    let view = { x: 0, y: 0, scale: 1 };
    let hoveredNode = null;
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };

    // Состояние редактора
    let activeSetId = null;
    let editCache = {}; // { setId: [structs] }
    let hasEdits = false;

    function render() {
      const hasScan = state.scan && state.scan.mods && state.scan.mods.length;

      const tabsHtml = `
        <div class="graph-modes" style="margin-bottom: 16px;">
          <button class="graph-mode-btn ${mode === 'graph' ? 'active' : ''}" data-mode="graph">Графическая</button>
          <button class="graph-mode-btn ${mode === 'info' ? 'active' : ''}" data-mode="info">Инфо</button>
          <button class="graph-mode-btn ${mode === 'editor' ? 'active' : ''}" data-mode="editor">Редактор</button>
        </div>
      `;

      let bodyHtml = '';
      if (!hasScan) {
        bodyHtml = `<div class="empty-state" style="margin:auto">Загрузите сборку, чтобы увидеть генерацию.</div>`;
      } else if (!worldgenData) {
        bodyHtml = `
          <div class="empty-state" style="margin:auto">
            ${scanning ? 'Сканирование...' : 'Данные о генерации не загружены.'}
            ${!scanning ? `<button class="btn primary" id="wg-scan" style="margin-top:16px;">Сканировать генерацию</button>` : ''}
          </div>
        `;
      } else {
        if (mode === 'graph') bodyHtml = renderGraphLayout();
        else if (mode === 'info') bodyHtml = renderInfoLayout();
        else if (mode === 'editor') bodyHtml = renderEditorLayout();
      }

      container.innerHTML = `
        <div class="view">
          <div class="view-header">
            <div>
              <div class="view-title">Генерация</div>
              <div class="view-sub">Биомы, структуры и условия их появления</div>
            </div>
            <div class="view-actions">
              ${worldgenData ? `<button class="btn" id="wg-rescan">Пересканировать</button>` : ''}
            </div>
          </div>
          <div class="view-body" style="display:flex; flex-direction:column;">
            ${tabsHtml}
            <div style="flex:1; min-height:0; display:flex; flex-direction:column;">
              ${bodyHtml}
            </div>
          </div>
        </div>
      `;

      // Привязка кнопок вкладок
      document.querySelectorAll('.graph-mode-btn').forEach(btn => {
        btn.onclick = () => { 
          mode = btn.dataset.mode; 
          render(); 
        };
      });

      const scanBtn = document.getElementById('wg-scan');
      if (scanBtn) scanBtn.onclick = runScan;

      const rescanBtn = document.getElementById('wg-rescan');
      if (rescanBtn) rescanBtn.onclick = runScan;

      // Инициализация нужного режима
      if (worldgenData) {
        if (mode === 'graph') {
          setTimeout(initGraph, 50);
        } else if (mode === 'editor') {
          setTimeout(initEditor, 50);
        }
      }
    }

    // ================================================================
    // РЕЖИМ 1: ГРАФИЧЕСКИЙ (Нейросетевой стиль)
    // ================================================================
    function renderGraphLayout() {
      return `
        <div style="flex:1; position:relative; background:radial-gradient(ellipse at center, #0e1420 0%, #0a0e16 100%); border:1px solid var(--border-subtle); border-radius:var(--radius-md); overflow:hidden; cursor:grab;">
          <canvas id="wg-canvas" style="width:100%; height:100%; display:block;"></canvas>
          <div style="position:absolute; bottom:16px; left:16px; background:rgba(10,14,22,0.85); backdrop-filter:blur(4px); padding:12px; border-radius:6px; font-size:11px; color:var(--text-secondary); pointer-events:none; border:1px solid var(--border-bright);">
            <div style="font-weight:600; margin-bottom:6px; color:var(--text-primary);">Легенда</div>
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;"><span style="width:8px;height:8px;border-radius:50%;background:#4fd1e8;box-shadow:0 0 6px #4fd1e8;"></span> Биом</div>
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;"><span style="width:8px;height:8px;background:#fbbf24;box-shadow:0 0 6px #fbbf24;"></span> Структура</div>
            <div style="margin-top:8px; font-size:10px; color:var(--text-dimmer);">Колесо — зум<br>ЛКМ — перетаскивание</div>
          </div>
        </div>
      `;
    }

    function initGraph() {
      canvas = document.getElementById('wg-canvas');
      if (!canvas) return;
      ctx = canvas.getContext('2d');
      
      const wrap = canvas.parentElement;
      const dpr = window.devicePixelRatio || 1;

      // Очистка старых слушателей перед инициализацией
      const newCanvas = canvas.cloneNode(true);
      canvas.parentNode.replaceChild(newCanvas, canvas);
      canvas = newCanvas;
      ctx = canvas.getContext('2d');

      const resize = () => {
        const W = wrap.clientWidth;
        const H = wrap.clientHeight;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        view.x = W / 2;
        view.y = H / 2;
        drawGraph(W, H);
      };
      
      const onResize = () => resize();
      window.addEventListener('resize', onResize);
      // Сохраняем функцию очистки в замыкании (в реальном проекте нужно отписываться при unmount)
      
      nodes = [];
      const biomeSet = new Set();
      
      for (const set of Object.values(worldgenData.structureSets)) {
        for (const s of set.structures) {
          const st = worldgenData.structures[s.structure];
          if (st && Array.isArray(st.biomes)) {
            st.biomes.forEach(b => biomeSet.add(b));
          }
        }
      }

      const biomes = Array.from(biomeSet).slice(0, 150); 
      const biomeNodes = biomes.map((b, i) => {
        const angle = (i / biomes.length) * Math.PI * 2;
        const r = Math.min(wrap.clientWidth, wrap.clientHeight) * 0.38;
        return { id: b, type: 'biome', x: Math.cos(angle)*r, y: Math.sin(angle)*r, baseR: 6 };
      });
      nodes.push(...biomeNodes);

      let structIndex = 0;
      for (const [setId, set] of Object.entries(worldgenData.structureSets)) {
        for (const s of set.structures) {
          const st = worldgenData.structures[s.structure];
          const angle = (structIndex / 40) * Math.PI * 2;
          const r = Math.random() * 80 + 20; 
          nodes.push({
            id: s.structure,
            type: 'structure',
            weight: s.weight,
            biomes: st && Array.isArray(st.biomes) ? st.biomes : [],
            x: Math.cos(angle)*r,
            y: Math.sin(angle)*r,
            baseR: 8
          });
          structIndex++;
        }
      }

      canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        view.scale *= zoomFactor;
        drawGraph(wrap.clientWidth, wrap.clientHeight);
      });

      canvas.addEventListener('mousedown', e => {
        isDragging = true;
        dragStart = { x: e.clientX - view.x, y: e.clientY - view.y };
        canvas.style.cursor = 'grabbing';
      });
      
      window.addEventListener('mouseup', () => {
        isDragging = false;
        if(canvas) canvas.style.cursor = 'grab';
      });
      
      canvas.addEventListener('mousemove', e => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (isDragging) {
          view.x = e.clientX - dragStart.x;
          view.y = e.clientY - dragStart.y;
          drawGraph(wrap.clientWidth, wrap.clientHeight);
          return;
        }

        const worldX = (mouseX - view.x) / view.scale;
        const worldY = (mouseY - view.y) / view.scale;
        
        let found = null;
        for (const n of nodes) {
          const dist = Math.hypot(n.x - worldX, n.y - worldY);
          const hitRadius = (n.type === 'biome' ? 12 : 16) / view.scale;
          if (dist < hitRadius) { found = n; break; }
        }
        
        if (hoveredNode !== found) {
          hoveredNode = found;
          drawGraph(wrap.clientWidth, wrap.clientHeight);
        }
      });

      canvas.addEventListener('mouseleave', () => {
        hoveredNode = null;
        drawGraph(wrap.clientWidth, wrap.clientHeight);
      });

      resize();
    }

    function drawGraph(W, H) {
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      
      ctx.save();
      ctx.translate(view.x, view.y);
      ctx.scale(view.scale, view.scale);

      if (hoveredNode) {
        const isBiome = hoveredNode.type === 'biome';
        const connectedNodes = nodes.filter(n => {
          if (isBiome && n.type === 'structure') return n.biomes.includes(hoveredNode.id);
          if (!isBiome && n.type === 'biome') return hoveredNode.biomes.includes(n.id);
          return false;
        });

        for (const target of connectedNodes) {
          const start = hoveredNode;
          const end = target;
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const mx = (start.x + end.x) / 2;
          const my = (start.y + end.y) / 2;
          const cx1 = mx + (-dy * 0.15); 
          const cy1 = my + (dx * 0.15);

          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.quadraticCurveTo(cx1, cy1, end.x, end.y);
          
          const color = isBiome ? '#fbbf24' : '#4fd1e8';
          ctx.strokeStyle = hexA(color, 0.6);
          
          const weight = isBiome ? (end.weight || 1) : (start.weight || 1);
          ctx.lineWidth = Math.max(1.5, Math.min(weight / 2, 4)) / view.scale;
          ctx.stroke();
        }
      }

      for (const n of nodes) {
        const isHover = n === hoveredNode;
        const isConnected = hoveredNode && (
          (hoveredNode.type === 'biome' && n.type === 'structure' && n.biomes.includes(hoveredNode.id)) ||
          (hoveredNode.type === 'structure' && n.type === 'biome' && hoveredNode.biomes.includes(n.id))
        );
        const isDimmed = hoveredNode && !isHover && !isConnected;

        const color = n.type === 'biome' ? '#4fd1e8' : '#fbbf24';
        const r = n.baseR * (isHover ? 1.5 : 1) / view.scale;
        
        if (!isDimmed) {
          const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3);
          grd.addColorStop(0, hexA(color, isHover ? 0.8 : 0.4));
          grd.addColorStop(1, hexA(color, 0));
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r * 3, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = isDimmed ? hexA(color, 0.2) : color;
        if (n.type === 'biome') {
          ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillRect(n.x - r, n.y - r, r * 2, r * 2);
        }

        if (!isDimmed) {
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.lineWidth = 1 / view.scale;
          if (n.type === 'biome') {
            ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.stroke();
          } else {
            ctx.strokeRect(n.x - r, n.y - r, r * 2, r * 2);
          }
        }
      }
      ctx.restore();

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = '600 11px -apple-system, Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      if (hoveredNode) {
        const sp = { x: hoveredNode.x * view.scale + view.x, y: hoveredNode.y * view.scale + view.y };
        const label = hoveredNode.id;
        const metrics = ctx.measureText(label);
        const padX = 6, padY = 4;
        const boxW = metrics.width + padX * 2;
        const boxH = 15 + padY * 2;
        const dy = (hoveredNode.baseR * 1.5 / view.scale * view.scale) + 8;

        ctx.fillStyle = 'rgba(10,14,22,0.92)';
        roundRect(ctx, sp.x - boxW / 2, sp.y - dy - boxH + 4, boxW, boxH, 4);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, sp.x, sp.y - dy);

        if (hoveredNode.type === 'structure') {
          ctx.font = '400 10px -apple-system, Inter, sans-serif';
          ctx.fillStyle = '#fbbf24';
          ctx.fillText(`Вес: ${hoveredNode.weight}`, sp.x, sp.y - dy + 14);
        }
      }
    }

    // ================================================================
    // РЕЖИМ 2: ИНФО (Таблица)
    // ================================================================
    function renderInfoLayout() {
      const rows = [];
      for (const [setId, set] of Object.entries(worldgenData.structureSets)) {
        for (const s of set.structures) {
          const st = worldgenData.structures[s.structure];
          rows.push({
            structure: s.structure,
            set: setId,
            weight: s.weight,
            frequency: s.frequency,
            biomes: (st && Array.isArray(st.biomes)) ? st.biomes.join(', ') : '—'
          });
        }
      }

      return `
        <div class="table-wrap" style="flex:1; overflow:auto; border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
          <table class="table">
            <thead>
              <tr>
                <th>Структура</th>
                <th>Набор</th>
                <th>Вес</th>
                <th>Частота</th>
                <th>Биомы</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td class="mono">${esc(r.structure)}</td>
                  <td class="mono" style="color:var(--text-secondary);">${esc(r.set)}</td>
                  <td>${r.weight}</td>
                  <td>${r.frequency}</td>
                  <td style="font-size:11px; color:var(--text-secondary); max-width:300px; white-space:normal;">${esc(r.biomes)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    // ================================================================
    // РЕЖИМ 3: РЕДАКТОР (Оптимизированный)
    // ================================================================
    function renderEditorLayout() {
      return `
        <div style="display:flex; width:100%; height:100%; gap:16px; border:1px solid var(--border-subtle); border-radius:var(--radius-md); overflow:hidden; background:var(--bg-panel);">
          <!-- Левая панель (Список наборов) -->
          <div id="wg-set-list" style="width:300px; border-right:1px solid var(--border-subtle); overflow-y:auto; flex-shrink:0;">
            <div class="panel-head">Наборы структур</div>
            <div id="wg-set-items"></div>
          </div>
          <!-- Правая панель (Редактор) -->
          <div id="wg-editor-container" style="flex:1; overflow-y:auto;"></div>
        </div>
      `;
    }

    function initEditor() {
      // 1. Рендерим левый список ОДИН РАЗ
      renderEditorLeftList();
      
      // 2. Если ничего не выбрано, выбираем первый набор
      if (!activeSetId) {
        const sets = Object.keys(worldgenData.structureSets);
        if (sets.length > 0) activeSetId = sets[0];
      }

      // 3. Рендерим правую панель
      renderEditorRightPanel();
    }

    function renderEditorLeftList() {
      const listEl = document.getElementById('wg-set-items');
      if (!listEl) return;

      listEl.innerHTML = Object.keys(worldgenData.structureSets).map(id => `
        <div class="list-item ${id === activeSetId ? 'active' : ''}" data-setid="${esc(id)}" style="cursor:pointer; padding:10px; border-bottom:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:4px;">
          <span style="font-weight:600; color:var(--text-primary); font-size:13px;">${esc(id)}</span>
          <span style="font-size:11px; color:var(--text-secondary);">${worldgenData.structureSets[id].structures.length} структур</span>
        </div>
      `).join('');

      // Вешаем обработчик клика
      listEl.querySelectorAll('[data-setid]').forEach(el => {
        el.onclick = () => {
          // Меняем активный класс без перерисовки всего списка
          listEl.querySelectorAll('.list-item').forEach(item => item.classList.remove('active'));
          el.classList.add('active');
          
          activeSetId = el.dataset.setid;
          // Перерисовываем ТОЛЬКО правую панель
          renderEditorRightPanel();
        };
      });
    }

    function renderEditorRightPanel() {
      const container = document.getElementById('wg-editor-container');
      if (!container) return;

      const currentSet = worldgenData.structureSets[activeSetId];
      if (!currentSet) {
        container.innerHTML = '<div class="empty-state">Выберите набор структур слева</div>';
        return;
      }

      // Инициализируем кэш, если его нет
      if (!editCache[activeSetId]) {
        editCache[activeSetId] = JSON.parse(JSON.stringify(currentSet.structures));
      }

      const structuresToRender = editCache[activeSetId];

      container.innerHTML = `
        <div style="padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="margin:0; font-size:16px; color:var(--text-primary);">${esc(activeSetId)}</h3>
            <button class="btn primary" id="wg-save" ${hasEdits ? '' : 'disabled'}>Сохранить датапак</button>
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Структура</th>
                  <th style="width:120px;">Вес (Weight)</th>
                  <th style="width:120px;">Частота (Frequency)</th>
                </tr>
              </thead>
              <tbody>
                ${structuresToRender.map((s, idx) => `
                  <tr>
                    <td class="mono" style="font-size:12px;">${esc(s.structure)}</td>
                    <td>
                      <input type="number" class="cfg-number" data-idx="${idx}" data-field="weight" value="${s.weight}" style="width:100%;" step="1" min="1">
                    </td>
                    <td>
                      <input type="number" class="cfg-number" data-idx="${idx}" data-field="frequency" value="${s.frequency}" style="width:100%;" step="0.1" min="0">
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      // Вешаем обработчики на инпуты
      container.querySelectorAll('input[data-idx]').forEach(inp => {
        inp.onchange = (e) => {
          const idx = parseInt(e.target.dataset.idx, 10);
          const field = e.target.dataset.field;
          let val = parseFloat(e.target.value);
          if (isNaN(val)) val = field === 'weight' ? 1 : 0;
          
          editCache[activeSetId][idx][field] = val;
          hasEdits = true;
          
          const saveBtn = document.getElementById('wg-save');
          if (saveBtn) saveBtn.disabled = false;
        };
      });

      // Вешаем обработчик на кнопку сохранения
      const saveBtn = document.getElementById('wg-save');
      if (saveBtn) {
        saveBtn.onclick = async () => {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Сохранение...';
          
          const changes = [];
          for (const [setId, structs] of Object.entries(editCache)) {
            changes.push({
              id: setId,
              structures: structs,
              raw: worldgenData.structureSets[setId].raw
            });
          }

          try {
            const res = await window.API.worldgen.save(state.scan.root, changes);
            if (res.ok) {
              window.Toast.success('Сохранено', 'Датапак создан. Перезапустите Minecraft.');
              hasEdits = false;
              saveBtn.textContent = 'Сохранить датапак';
            } else {
              window.Toast.error('Ошибка', res.error);
              saveBtn.disabled = false;
              saveBtn.textContent = 'Сохранить датапак';
            }
          } catch (err) {
            window.Toast.error('Ошибка', err.message);
            saveBtn.disabled = false;
            saveBtn.textContent = 'Сохранить датапак';
          }
        };
      }
    }

    // ================================================================
    // Сканирование
    // ================================================================
    async function runScan() {
      if (!state.scan) return;
      scanning = true;
      render();
      try {
        const res = await window.API.worldgen.scan(state.scan.root);
        worldgenData = res;
        // Сбрасываем кэш редактора при новом скане
        editCache = {};
        activeSetId = null;
        hasEdits = false;
        window.Toast.success('Генерация загружена', `Наборов: ${Object.keys(res.structureSets).length}, Структур: ${Object.keys(res.structures).length}`);
      } catch (e) {
        window.Toast.error('Ошибка сканирования', e.message);
      } finally {
        scanning = false;
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