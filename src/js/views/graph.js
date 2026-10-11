window.Views = window.Views || {};
window.Views.graph = (function () {
  function t(k, v) { return window.I18n.t(k, v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  const COLORS = {
    dep:        '#4fd1e8',
    dupConflict:'#ef4444',
    missing:    '#fbbf24',
    libIssue:   '#a855f7',
    nodeLib:    '#a855f7',
    nodeNormal: '#4ade80',
    nodeClient: '#4fd1e8',
    nodeServer: '#fbbf24',
    nodeMissing:'#ef4444'
  };

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
    let mode = 'deps';
    let query = '';
    let lastScanRef = null;
    let lastClassifyRef = null;
    let currentCleanup = null;

    function getNodeColor(m) {
      const type = (m._type || '').toLowerCase();
      if (type === 'library') return COLORS.nodeLib;
      if (type === 'client') return COLORS.nodeClient;
      if (type === 'server') return COLORS.nodeServer;
      const loader = (m.loader || '').toLowerCase();
      if (loader.indexOf('forge') >= 0) return '#8b8dfb';
      if (loader.indexOf('fabric') >= 0) return '#c084fc';
      if (loader.indexOf('quilt') >= 0) return '#f472b6';
      if (loader.indexOf('neo') >= 0) return '#fbbf24';
      return COLORS.nodeNormal;
    }

    function render() {
      if (!container.isConnected) return;

      if (currentCleanup) {
        try { currentCleanup(); } catch (e) { console.error('[graph cleanup]', e); }
        currentCleanup = null;
      }

      const hasScan = state.scan && state.scan.mods && state.scan.mods.length;

      container.innerHTML = `
        <div class="view">
          <div class="view-header">
            <div>
              <div class="view-title">${t('graph.title')}</div>
              <div class="view-sub" id="g-sub">${hasScan ? t('common.loading') : t('graph.empty')}</div>
            </div>
            <div class="view-actions">
              <div class="graph-modes" id="g-modes">
                <button class="graph-mode-btn ${mode === 'deps' ? 'active' : ''}" data-mode="deps">${t('graph.mode.deps')}</button>
                <button class="graph-mode-btn conflicts ${mode === 'conflicts' ? 'active' : ''}" data-mode="conflicts">${t('graph.mode.conflicts')}</button>
                <button class="graph-mode-btn ${mode === 'all' ? 'active' : ''}" data-mode="all">${t('graph.mode.all')}</button>
              </div>
              <input class="input" id="g-q" placeholder="${t('graph.search')}" value="${esc(query)}" style="width:180px"/>
              <button class="btn" id="g-reset">${t('graph.reset')}</button>
            </div>
          </div>
          <div class="view-body" style="padding:0 32px 32px">
            <div id="graph-wrap" style="position:relative;height:100%;background:radial-gradient(ellipse at center, #0e1420 0%, #0a0e16 100%);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
              <canvas id="graph-canvas"></canvas>
              <div class="graph-tooltip" id="g-tip" style="opacity:0;left:0;top:0"></div>

              <div style="position:absolute;top:14px;right:14px;display:flex;flex-direction:column;gap:6px">
                <button class="btn" id="g-zoom-in"  title="${t('graph.zoomIn')}"  style="padding:6px 10px;min-width:36px;justify-content:center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
                </button>
                <button class="btn" id="g-zoom-out" title="${t('graph.zoomOut')}" style="padding:6px 10px;min-width:36px;justify-content:center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14"/></svg>
                </button>
                <button class="btn" id="g-fit"      title="${t('graph.fit')}"     style="padding:6px 10px;min-width:36px;justify-content:center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/></svg>
                </button>
              </div>

              <div style="position:absolute;bottom:14px;right:14px;background:rgba(11,16,24,.85);border:1px solid var(--border-bright);border-radius:var(--radius);padding:8px 12px;font-size:11px;color:var(--text-dim);font-family:var(--mono);pointer-events:none">
                <span id="g-zoom-label">100%</span>
              </div>

              <div class="graph-legend">
                <div class="graph-legend-title">${t('graph.legend')}</div>
                <div class="graph-legend-row"><span class="graph-legend-line" style="background:${COLORS.dep};box-shadow:0 0 6px ${COLORS.dep}"></span><span>${t('graph.legend.dep')}</span></div>
                <div class="graph-legend-row"><span class="graph-legend-line" style="background:${COLORS.dupConflict};box-shadow:0 0 6px ${COLORS.dupConflict}"></span><span>${t('graph.legend.dup')}</span></div>
                <div class="graph-legend-row"><span class="graph-legend-line" style="background:${COLORS.missing};box-shadow:0 0 6px ${COLORS.missing}"></span><span>${t('graph.legend.missing')}</span></div>
                <div class="graph-legend-row"><span class="graph-legend-line" style="background:${COLORS.libIssue};box-shadow:0 0 6px ${COLORS.libIssue}"></span><span>${t('graph.legend.libHub')}</span></div>
                <div class="graph-legend-row" style="margin-top:4px"><span class="graph-legend-node" style="background:${COLORS.nodeNormal}"></span><span>${t('graph.legend.mod')}</span></div>
                <div class="graph-legend-row"><span class="graph-legend-node" style="background:${COLORS.nodeLib}"></span><span>${t('graph.legend.library')}</span></div>
                <div class="graph-legend-row"><span class="graph-legend-node" style="background:${COLORS.nodeClient}"></span><span>${t('graph.legend.client')}</span></div>
                <div class="graph-legend-row"><span class="graph-legend-node" style="background:${COLORS.nodeMissing}"></span><span>${t('graph.legend.missing.node')}</span></div>
              </div>
            </div>
          </div>
        </div>`;

      if (!hasScan) return;

      const canvas = document.getElementById('graph-canvas');
      const wrap = document.getElementById('graph-wrap');
      const tip = document.getElementById('g-tip');
      const ctx = canvas.getContext('2d', { alpha: true });
      const dpr = window.devicePixelRatio || 1;

      const view = { x: 0, y: 0, scale: 1 };
      const MIN_SCALE = 0.15;
      const MAX_SCALE = 6;

      let W = 0, H = 0;
      let animFrame = null;
      let animView = null;
      let pulseTimer = null;
      let resizeTimeout = null;
      let needsRedraw = true;
      let pulses = [];
      let hovered = null;
      let panning = false, panStart = null;
      let nodeDrag = null;
      let cleaned = false;

      function buildGraph() {
        const mods = state.scan ? state.scan.mods : [];
        const byId = new Map();
        const nodes = [];
        const links = [];

        for (const m of mods) {
          if (!m.id) continue;
          const nd = { id: m.id, name: m.name || m.file, mod: m, color: getNodeColor(m), conflict: null };
          nodes.push(nd); byId.set(m.id, nd);
        }

        const idCount = new Map();
        for (const m of mods) { if (!m.id) continue; idCount.set(m.id, (idCount.get(m.id) || 0) + 1); }
        idCount.forEach((count, id) => {
          if (count > 1) {
            const nd = byId.get(id);
            if (nd) { nd.conflict = 'duplicate'; nd.color = COLORS.dupConflict; }
          }
        });

        for (const m of mods) {
          if (!m.id) continue;
          for (const d of (m.dependencies || [])) {
            if (!d.id) continue;
            const idLower = String(d.id).toLowerCase();
            if (['minecraft','forge','fabricloader','fabric','fabric-api','neoforge','java'].indexOf(idLower) >= 0) continue;
            let target = byId.get(d.id);
            if (!target) {
              for (const n of nodes) { if (n.id.toLowerCase().indexOf(idLower) >= 0) { target = n; break; } }
            }
            if (target) {
              links.push({ source: m.id, target: target.id, kind: 'dep', color: COLORS.dep });
            } else {
              const fakeId = '__missing__' + d.id;
              if (!byId.has(fakeId)) {
                const fake = {
                  id: fakeId, name: d.id,
                  mod: { id: d.id, name: d.id, file: d.id, loader: 'MISSING' },
                  color: COLORS.nodeMissing, conflict: 'missing', phantom: true
                };
                nodes.push(fake); byId.set(fakeId, fake);
              }
              links.push({ source: m.id, target: fakeId, kind: 'missing', color: COLORS.missing });
            }
          }
        }

        const libUsage = new Map();
        for (const l of links) libUsage.set(l.target, (libUsage.get(l.target) || 0) + 1);
        libUsage.forEach((usage, id) => {
          const nd = byId.get(id);
          if (nd && (nd.mod._type || '').toLowerCase() === 'library' && usage >= 3 && !nd.conflict) {
            nd.conflict = 'libHub';
            nd.color = COLORS.nodeLib;
          }
        });

        return { nodes, links, byId };
      }

      function layout(nodes, links, W, H) {
        const cx = W / 2, cy = H / 2;
        const R = Math.min(W, H) * 0.36;
        nodes.forEach((n, i) => {
          const a = (i / nodes.length) * Math.PI * 2;
          n.x = cx + Math.cos(a) * R * (0.7 + Math.random() * 0.3);
          n.y = cy + Math.sin(a) * R * (0.7 + Math.random() * 0.3);
          n.vx = 0; n.vy = 0;
        });
        const iterations = 140;
        const linkMap = new Map(nodes.map(n => [n.id, n]));
        for (let it = 0; it < iterations; it++) {
          const cooling = 1 - it / iterations;
          for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
              const a = nodes[i], b = nodes[j];
              let dx = b.x - a.x, dy = b.y - a.y;
              let d2 = dx*dx + dy*dy;
              if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
              const d = Math.sqrt(d2);
              const force = 1800 / d2 * cooling;
              const fx = (dx / d) * force, fy = (dy / d) * force;
              a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
            }
          }
          for (const l of links) {
            const a = linkMap.get(l.source), b = linkMap.get(l.target);
            if (!a || !b) continue;
            const dx = b.x - a.x, dy = b.y - a.y;
            const d = Math.sqrt(dx*dx + dy*dy) || 1;
            const desired = 90;
            const force = (d - desired) * 0.012 * cooling;
            const fx = (dx / d) * force, fy = (dy / d) * force;
            a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
          }
          for (const n of nodes) { n.x += n.vx; n.y += n.vy; n.vx *= 0.6; n.vy *= 0.6; }
        }
        const pad = 60;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const n of nodes) {
          if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
          if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
        }
        const w = maxX - minX || 1, h = maxY - minY || 1;
        const s = Math.min((W - pad*2) / w, (H - pad*2) / h, 1.2);
        for (const n of nodes) {
          n.x = pad + (n.x - minX) * s;
          n.y = pad + (n.y - minY) * s;
        }
      }

      function resize() {
        W = wrap.clientWidth; H = wrap.clientHeight;
        canvas.width = W * dpr; canvas.height = H * dpr;
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
        needsRedraw = true;
      }

      const graph = buildGraph();
      const nodes = graph.nodes;
      let links = graph.links;

      let _activeNodesCache = null;
      let _nodeMapCache = null;
      let _activeSetCache = null;
      function invalidateCaches() { _activeNodesCache = null; _nodeMapCache = null; _activeSetCache = null; }

      function applyMode() {
        if (mode === 'conflicts') {
          const conflictIds = new Set();
          nodes.forEach(n => { if (n.conflict) conflictIds.add(n.id); });
          links = graph.links.filter(l =>
            l.kind === 'missing' ||
            (conflictIds.has(l.source) || conflictIds.has(l.target))
          );
        } else if (mode === 'deps') {
          links = graph.links.filter(l => l.kind === 'dep' || l.kind === 'missing');
        } else {
          links = graph.links.slice();
        }
        invalidateCaches();
      }
      applyMode();

      function activeNodes() {
        if (_activeNodesCache) return _activeNodesCache;
        if (mode === 'all' || mode === 'deps') _activeNodesCache = nodes;
        else {
          const used = new Set();
          for (const l of links) { used.add(l.source); used.add(l.target); }
          _activeNodesCache = nodes.filter(n => used.has(n.id) || n.conflict);
        }
        return _activeNodesCache;
      }
      function nodeMap() {
        if (_nodeMapCache) return _nodeMapCache;
        _nodeMapCache = new Map(nodes.map(n => [n.id, n]));
        return _nodeMapCache;
      }
      function activeSet() {
        if (_activeSetCache) return _activeSetCache;
        _activeSetCache = new Set(activeNodes().map(n => n.id));
        return _activeSetCache;
      }

      function screenToWorld(sx, sy) { return { x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale }; }
      function worldToScreen(wx, wy) { return { x: wx * view.scale + view.x, y: wy * view.scale + view.y }; }

      function fitView(animate) {
        if (!nodes.length) return;
        const act = activeNodes();
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const n of act) {
          if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
          if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
        }
        if (!isFinite(minX)) return;
        const pad = 80;
        const w = maxX - minX || 1, h = maxY - minY || 1;
        const targetScale = Math.min((W - pad*2) / w, (H - pad*2) / h, 1.6);
        const targetX = W/2 - (minX + w/2) * targetScale;
        const targetY = H/2 - (minY + h/2) * targetScale;
        if (animate) animateView({ x: targetX, y: targetY, scale: targetScale }, 260);
        else { view.x = targetX; view.y = targetY; view.scale = targetScale; updateZoomLabel(); needsRedraw = true; }
      }

      function animateView(to, duration) {
        if (animView) cancelAnimationFrame(animView);
        const fx = view.x, fy = view.y, fs = view.scale;
        const start = performance.now();
        function step(now) {
          if (cleaned) return;
          const p = Math.min(1, (now - start) / duration);
          const e = 1 - Math.pow(1 - p, 3);
          view.x = fx + (to.x - fx) * e;
          view.y = fy + (to.y - fy) * e;
          view.scale = fs + (to.scale - fs) * e;
          updateZoomLabel();
          needsRedraw = true;
          if (p < 1) animView = requestAnimationFrame(step);
          else animView = null;
        }
        animView = requestAnimationFrame(step);
      }

      function updateZoomLabel() {
        const el = document.getElementById('g-zoom-label');
        if (el) el.textContent = Math.round(view.scale * 100) + '%';
      }

      function spawnPulse() {
        if (cleaned) return;
        if (!links.length || pulses.length >= 6) return;
        const l = links[Math.floor(Math.random() * links.length)];
        pulses.push({ link: l, t: 0, speed: 0.014 + Math.random() * 0.008 });
        needsRedraw = true;
      }

      function draw() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        ctx.save();
        ctx.translate(view.x, view.y);
        ctx.scale(view.scale, view.scale);

        const nm = nodeMap();
        const aset = activeSet();
        const actArr = activeNodes();

        const queryActive = !!query;
        const lineWidthBase = 1.2 / view.scale * Math.max(0.6, Math.min(1.4, view.scale));
        for (const l of links) {
          const a = nm.get(l.source), b = nm.get(l.target);
          if (!a || !b) continue;
          if (mode === 'conflicts' && !aset.has(a.id) && !aset.has(b.id)) continue;

          const isHi = queryActive && (a.id.toLowerCase().indexOf(query) >= 0 || b.id.toLowerCase().indexOf(query) >= 0);
          const alpha = queryActive ? (isHi ? 0.85 : 0.06) : 0.32;

          ctx.strokeStyle = hexA(l.color, alpha);
          ctx.lineWidth = isHi ? lineWidthBase * 1.8 : lineWidthBase;

          const dx = b.x - a.x, dy = b.y - a.y;
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const cx1 = mx + (-dy * 0.12), cy1 = my + (dx * 0.12);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo(cx1, cy1, b.x, b.y);
          ctx.stroke();
        }

        const rPulse = 2.2 / view.scale * Math.max(0.5, Math.min(1.6, view.scale));
        for (const p of pulses) {
          const a = nm.get(p.link.source), b = nm.get(p.link.target);
          if (!a || !b) { p.t = 1; continue; }
          const dx = b.x - a.x, dy = b.y - a.y;
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const cx1 = mx + (-dy * 0.12), cy1 = my + (dx * 0.12);
          const pp = p.t;
          const ix = (1-pp)*(1-pp)*a.x + 2*(1-pp)*pp*cx1 + pp*pp*b.x;
          const iy = (1-pp)*(1-pp)*a.y + 2*(1-pp)*pp*cy1 + pp*pp*b.y;

          ctx.fillStyle = hexA(p.link.color, 0.25);
          ctx.beginPath(); ctx.arc(ix, iy, rPulse * 2.2, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = p.link.color;
          ctx.beginPath(); ctx.arc(ix, iy, rPulse, 0, Math.PI*2); ctx.fill();
          p.t += p.speed;
        }
        if (pulses.length) pulses = pulses.filter(p => p.t < 1);

        const radiusScale = 1 / view.scale * Math.max(0.5, Math.min(1.6, view.scale));
        for (const n of actArr) {
          const isHi = queryActive && (n.id.toLowerCase().indexOf(query) >= 0 || n.name.toLowerCase().indexOf(query) >= 0);
          const dimmed = queryActive && !isHi;
          const isHover = hovered === n;
          const baseR = n.phantom ? 6 : (n.conflict ? 9 : 7);
          const r = (baseR + (isHover ? 3 : 0) + (isHi ? 2 : 0)) * radiusScale;

          if (!dimmed) {
            ctx.fillStyle = hexA(n.color, isHover ? 0.28 : 0.16);
            ctx.beginPath(); ctx.arc(n.x, n.y, r * 2.4, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = hexA(n.color, isHover ? 0.18 : 0.1);
            ctx.beginPath(); ctx.arc(n.x, n.y, r * 1.7, 0, Math.PI*2); ctx.fill();
          }

          ctx.fillStyle = dimmed ? hexA(n.color, 0.25) : n.color;
          ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI*2); ctx.fill();

          ctx.strokeStyle = dimmed ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.35)';
          ctx.lineWidth = 1.2 * radiusScale;
          ctx.stroke();

          if (n.phantom) {
            ctx.setLineDash([3 * radiusScale, 3 * radiusScale]);
            ctx.strokeStyle = hexA(n.color, 0.65);
            ctx.beginPath(); ctx.arc(n.x, n.y, r + 4 * radiusScale, 0, Math.PI*2); ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        ctx.restore();

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.font = '600 11px -apple-system, Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        const fLabel = Math.max(0.5, Math.min(1.6, view.scale));
        const labelsAlwaysOn = view.scale > 0.85;

        for (const n of actArr) {
          const isHi = queryActive && (n.id.toLowerCase().indexOf(query) >= 0 || n.name.toLowerCase().indexOf(query) >= 0);
          const isHover = hovered === n;
          if (!isHover && !(isHi && queryActive) && !labelsAlwaysOn) continue;

          const sp = worldToScreen(n.x, n.y);
          const baseR = n.phantom ? 6 : (n.conflict ? 9 : 7);
          const rScreen = (baseR + (isHover ? 3 : 0) + (isHi ? 2 : 0)) * fLabel;
          const dy = rScreen + 5;

          const label = n.name.length > 28 ? n.name.slice(0, 26) + '…' : n.name;
          const metrics = ctx.measureText(label);
          const padX = 5, padY = 3;
          const boxW = metrics.width + padX * 2;
          const boxH = 15 + padY * 2;

          ctx.fillStyle = isHover ? 'rgba(10,14,22,.92)' : 'rgba(10,14,22,.7)';
          roundRect(ctx, sp.x - boxW / 2, sp.y - dy - boxH + 3, boxW, boxH, 4);
          ctx.fill();

          ctx.fillStyle = isHover ? '#ffffff' : (isHi ? '#4ade80' : '#c8d2e0');
          ctx.fillText(label, sp.x, sp.y - dy);
        }
      }

      function loop() {
        if (cleaned) return;
        if (!canvas.isConnected) { cleanup(); return; }

        if (needsRedraw) { draw(); needsRedraw = false; }
        if (pulses.length) needsRedraw = true;

        animFrame = requestAnimationFrame(loop);
      }

      function pos(e) {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      }

      function onWheel(e) {
        e.preventDefault();
        const sp = pos(e);
        const wpBefore = screenToWorld(sp.x, sp.y);
        const factor = e.deltaY < 0 ? 1.15 : 1/1.15;
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * factor));
        view.x = sp.x - wpBefore.x * newScale;
        view.y = sp.y - wpBefore.y * newScale;
        view.scale = newScale;
        updateZoomLabel();
        needsRedraw = true;
      }

      function onMouseDown(e) {
        const sp = pos(e);
        const wp = screenToWorld(sp.x, sp.y);
        if (e.button === 1) {
          panning = true;
          panStart = { mx: e.clientX, my: e.clientY, vx: view.x, vy: view.y };
          e.preventDefault();
          return;
        }
        if (e.button === 0) {
          const act = activeNodes();
          let found = null;
          for (const n of act) {
            const dx = n.x - wp.x, dy = n.y - wp.y;
            const baseR = n.phantom ? 6 : (n.conflict ? 9 : 7);
            const rHit = (baseR + 6) / view.scale * Math.max(0.6, Math.min(1.4, view.scale));
            if (dx*dx + dy*dy < rHit*rHit) { found = n; break; }
          }
          if (found) {
            nodeDrag = found;
            nodeDrag._offsetX = found.x - wp.x;
            nodeDrag._offsetY = found.y - wp.y;
            canvas.style.cursor = 'grabbing';
          } else {
            panning = true;
            panStart = { mx: e.clientX, my: e.clientY, vx: view.x, vy: view.y };
            canvas.style.cursor = 'grabbing';
          }
        }
      }

      function onWindowMouseUp() {
        if (cleaned) return;
        if (panning) { panning = false; panStart = null; canvas.style.cursor = hovered ? 'pointer' : 'grab'; }
        if (nodeDrag) { nodeDrag = null; canvas.style.cursor = 'pointer'; }
      }

      function onMouseMove(e) {
        const sp = pos(e);
        const wp = screenToWorld(sp.x, sp.y);

        if (panning && panStart) {
          view.x = panStart.vx + (e.clientX - panStart.mx);
          view.y = panStart.vy + (e.clientY - panStart.my);
          needsRedraw = true;
          return;
        }
        if (nodeDrag) {
          nodeDrag.x = wp.x + nodeDrag._offsetX;
          nodeDrag.y = wp.y + nodeDrag._offsetY;
          needsRedraw = true;
          return;
        }

        const act = activeNodes();
        let found = null;
        for (const n of act) {
          const dx = n.x - wp.x, dy = n.y - wp.y;
          const baseR = n.phantom ? 6 : (n.conflict ? 9 : 7);
          const rHit = (baseR + 6) / view.scale * Math.max(0.6, Math.min(1.4, view.scale));
          if (dx*dx + dy*dy < rHit*rHit) { found = n; break; }
        }
        if (hovered !== found) { hovered = found; needsRedraw = true; }

        if (found) {
          const m = found.mod;
          tip.style.opacity = '1';
          tip.style.left = (sp.x + 18) + 'px';
          tip.style.top = (sp.y + 18) + 'px';
          tip.innerHTML =
            '<div class="tt-name">' + esc(found.name) + '</div>' +
            '<div class="tt-id">' + esc(found.id) + '</div>' +
            (found.phantom
              ? '<div style="color:var(--gold);font-size:11px;margin-top:6px">' + t('graph.tip.missing') + '</div>'
              : '<div style="color:var(--text-dim);font-size:11px;margin-top:6px">' + esc(m.loader || '') + (m.version ? ' · ' + esc(m.version) : '') + '</div>') +
            (found.conflict === 'duplicate' ? '<div style="color:var(--redstone);font-size:11px;margin-top:4px">' + t('graph.tip.duplicate') + '</div>' : '') +
            (found.conflict === 'libHub' ? '<div style="color:var(--amethyst);font-size:11px;margin-top:4px">' + t('graph.tip.libHub') + '</div>' : '');
          canvas.style.cursor = 'pointer';
        } else {
          tip.style.opacity = '0';
          canvas.style.cursor = 'grab';
        }
      }

      function onMouseLeave() {
        if (hovered) { hovered = null; needsRedraw = true; }
        tip.style.opacity = '0';
      }

      function onDblClick(e) {
        const sp = pos(e);
        const wp = screenToWorld(sp.x, sp.y);
        let found = null;
        for (const n of activeNodes()) {
          const dx = n.x - wp.x, dy = n.y - wp.y;
          if (dx*dx + dy*dy < 144) { found = n; break; }
        }
        if (!found) fitView(true);
      }

      function onContextMenu(e) { e.preventDefault(); }

      function onWindowResize() {
        if (cleaned || !canvas.isConnected) return;
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          if (cleaned) return;
          resize();
          fitView(true);
        }, 120);
      }

      canvas.addEventListener('wheel', onWheel, { passive: false });
      canvas.addEventListener('mousedown', onMouseDown);
      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('mouseleave', onMouseLeave);
      canvas.addEventListener('dblclick', onDblClick);
      canvas.addEventListener('contextmenu', onContextMenu);
      window.addEventListener('mouseup', onWindowMouseUp);
      window.addEventListener('resize', onWindowResize);

      document.querySelectorAll('#g-modes .graph-mode-btn').forEach(btn => {
        btn.onclick = () => {
          mode = btn.dataset.mode;
          document.querySelectorAll('#g-modes .graph-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
          applyMode();
          updateSub();
          fitView(true);
        };
      });

      const q = document.getElementById('g-q');
      if (q) q.oninput = e => { query = e.target.value.toLowerCase(); needsRedraw = true; };

      const reset = document.getElementById('g-reset');
      if (reset) reset.onclick = () => {
        query = ''; const i = document.getElementById('g-q'); if (i) i.value = '';
        for (const n of nodes) { n.x = undefined; n.y = undefined; }
        resize();
        layout(nodes, graph.links, W, H);
        fitView(true);
      };

      function zoomCenter(factor) {
        const cx = W / 2, cy = H / 2;
        const wpBefore = screenToWorld(cx, cy);
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * factor));
        view.x = cx - wpBefore.x * newScale;
        view.y = cy - wpBefore.y * newScale;
        view.scale = newScale;
        updateZoomLabel();
        needsRedraw = true;
      }
      const zIn = document.getElementById('g-zoom-in');  if (zIn)  zIn.onclick  = () => zoomCenter(1.25);
      const zOut = document.getElementById('g-zoom-out'); if (zOut) zOut.onclick = () => zoomCenter(1/1.25);
      const zFit = document.getElementById('g-fit');      if (zFit) zFit.onclick = () => fitView(true);

      function updateSub() {
        const sub = document.getElementById('g-sub');
        if (!sub) return;
        const activeLinks = mode === 'conflicts' ? links.length : graph.links.length;
        const conflicts = nodes.filter(n => n.conflict).length;
        if (mode === 'conflicts') {
          sub.textContent = t('graph.sub.conflicts', {mods: graph.byId.size, links: activeLinks, conflicts: conflicts}) + t('graph.sub.hint');
        } else {
          sub.textContent = t('graph.sub', {mods: graph.byId.size, links: activeLinks}) + t('graph.sub.hint');
        }
      }
      updateSub();

      resize();
      layout(nodes, graph.links, W, H);
      fitView(false);

      pulseTimer = setInterval(spawnPulse, 400);
      animFrame = requestAnimationFrame(loop);

      function cleanup() {
        if (cleaned) return;
        cleaned = true;
        if (animFrame) { try { cancelAnimationFrame(animFrame); } catch {} animFrame = null; }
        if (animView) { try { cancelAnimationFrame(animView); } catch {} animView = null; }
        if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
        if (resizeTimeout) { clearTimeout(resizeTimeout); resizeTimeout = null; }
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('mousedown', onMouseDown);
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('mouseleave', onMouseLeave);
        canvas.removeEventListener('dblclick', onDblClick);
        canvas.removeEventListener('contextmenu', onContextMenu);
        window.removeEventListener('mouseup', onWindowMouseUp);
        window.removeEventListener('resize', onWindowResize);
        pulses = [];
      }
      currentCleanup = cleanup;
    }

    render();

    const unsub = window.State.sub(() => {
      if (!container.isConnected) return;
      state = window.State.data;
      const scanChanged = state.scan !== lastScanRef;
      const classifyChanged = state.classify !== lastClassifyRef;
      if (scanChanged || classifyChanged) {
        lastScanRef = state.scan;
        lastClassifyRef = state.classify;
        render();
      }
    });

    const connWatcher = setInterval(() => {
      if (!container.isConnected) {
        unsub();
        clearInterval(connWatcher);
      }
    }, 1000);
  }

  return { mount };
})();