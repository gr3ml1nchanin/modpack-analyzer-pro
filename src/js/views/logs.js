window.Views = window.Views || {};
window.Views.logs = (function () {
  function t(k, v) { return window.I18n.t(k, v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function human(b) {
    if (!b) return '';
    if (b < 1024) return b + ' ' + t('human.b');
    if (b < 1024*1024) return (b/1024).toFixed(1) + ' ' + t('human.kb');
    return (b/1024/1024).toFixed(1) + ' ' + t('human.mb');
  }

  function mount(container) {
    let state = window.State.data;
    let filterLevel = 'ALL';
    let selected = null;
    let isLiveTracking = false;

    function render() {
      const logs = state.scan ? state.scan.logs : [];
      const crashes = state.scan ? state.scan.crashes : [];

      container.innerHTML = `
        <div class="view">
          <div class="view-header">
            <div>
              <div class="view-title">${t('logs.title')}</div>
              <div class="view-sub">${t('logs.sub', {logs: logs.length, crashes: crashes.length})}</div>
            </div>
            <div class="view-actions">
              <button class="btn ${isLiveTracking ? 'primary' : ''}" id="log-live">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                ${isLiveTracking ? 'Остановить трекер' : 'Live-трекер'}
              </button>
              <div class="filter-chips" id="log-chips">
                ${['ALL','FATAL','ERROR','WARN','INFO','DEBUG','TRACE'].map(l =>
                  '<div class="chip ' + (filterLevel===l?'active':'') + '" data-l="' + l + '">' + t('logs.chip.' + l.toLowerCase()) + '</div>'
                ).join('')}
              </div>
              <button class="btn" id="log-group">${t('logs.groupErrors')}</button>
            </div>
          </div>
          <div class="view-body" style="padding:0 28px 0; display:flex; min-height:0">
            <div class="split two" style="width:100%">
              <div class="split-panel split-left">
                <div class="panel-head">${t('logs.panel.crashes')}</div>
                <div class="panel-list" style="flex:0 0 auto; max-height:30%">
                  ${crashes.map(c => '<div class="list-item" data-path="' + esc(c.path) + '" data-kind="crash" data-name="' + esc(c.file) + '">' +
                    '<span class="badge crash">CR</span>' +
                    '<span class="li-title" title="' + esc(c.file) + '">' + esc(c.file) + '</span>' +
                    '<span class="li-sub">' + human(c.size) + '</span>' +
                  '</div>').join('') || '<div style="padding:12px;color:var(--text-dimmer);font-size:11px">' + t('logs.noCrashes') + '</div>'}
                </div>
                <div class="panel-head">${t('logs.panel.logs')}</div>
                <div class="panel-list">
                  ${logs.map(c => '<div class="list-item" data-path="' + esc(c.path) + '" data-kind="log" data-name="' + esc(c.file) + '">' +
                    '<span class="badge log">LOG</span>' +
                    '<span class="li-title" title="' + esc(c.file) + '">' + esc(c.file) + '</span>' +
                    '<span class="li-sub">' + human(c.size) + '</span>' +
                  '</div>').join('') || '<div style="padding:12px;color:var(--text-dimmer);font-size:11px">' + t('logs.noLogs') + '</div>'}
                </div>
              </div>
              <div class="split-panel split-right" id="log-panel">
                <div class="empty-state">${t('logs.empty')}</div>
              </div>
            </div>
          </div>
        </div>`;

      if (selected) {
        document.querySelectorAll('.list-item[data-kind]').forEach(x => {
          if (x.dataset.path === selected.path) x.classList.add('active');
        });
        loadFile(selected);
      }

      document.querySelectorAll('#log-chips .chip').forEach(el => {
        el.onclick = () => { 
          filterLevel = el.dataset.l; 
          document.querySelectorAll('#log-chips .chip').forEach(c => c.classList.toggle('active', c === el));
          if (selected) loadFile(selected); 
        };
      });
      
      document.querySelectorAll('.list-item[data-kind]').forEach(el => {
        el.onclick = () => {
          document.querySelectorAll('.list-item[data-kind]').forEach(x => x.classList.remove('active'));
          el.classList.add('active');
          selected = { path: el.dataset.path, name: el.dataset.name, kind: el.dataset.kind };
          loadFile(selected);
        };
      });
      
      const groupBtn = document.getElementById('log-group');
      if (groupBtn) groupBtn.onclick = analyzeCurrent;

      const liveBtn = document.getElementById('log-live');
      if (liveBtn) {
        liveBtn.onclick = async () => {
          if (isLiveTracking) {
            await window.API.live.stop();
            isLiveTracking = false;
            window.Toast.info('Live-трекер', 'Отслеживание остановлено');
            render();
          } else {
            const logs = state.scan.logs;
            if (!logs || !logs.length) return window.Toast.error('Нет логов', 'В сборке не найдены файлы логов.');
            const latestLog = logs.find(l => l.file === 'latest.log') || logs[0];
            const res = await window.API.live.start(latestLog.path);
            if (res.ok) {
              isLiveTracking = true;
              window.Toast.success('Live-трекер', `Слушаем ${latestLog.file}`);
              render();
            } else {
              window.Toast.error('Ошибка', res.error);
            }
          }
        };
      }
    }

    async function loadFile(sel) {
      const panel = document.getElementById('log-panel');
      panel.innerHTML = '<div class="empty-state">' + t('common.loading') + '</div>';
      let res;
      if (sel.path.toLowerCase().endsWith('.gz')) res = await window.API.file.openGzText(sel.path);
      else res = await window.API.file.openText(sel.path);
      
      if (res.error) {
        panel.innerHTML = '<div class="empty-state">' + t('logs.loadingError', {msg: esc(res.error)}) + '</div>';
        return;
      }
      
      const isCrash = sel.kind === 'crash';
      const lines = (res.content || '').split(/\r?\n/);
      const parsedLines = [];
      let currentLevel = isCrash ? 'FATAL' : 'OTHER';
      
      for (let i = 0; i < lines.length; i++) {
        const text = lines[i];
        
        if (isCrash) {
          // В краш-логах нет тегов, поэтому считаем весь файл FATAL
          parsedLines.push({ n: i + 1, level: 'FATAL', text });
        } else {
          const match = text.match(/\[(?:[^\/]+\/)?(FATAL|ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\]/i);
          if (match) {
            currentLevel = match[1].toUpperCase();
            if (currentLevel === 'WARNING') currentLevel = 'WARN';
          }
          parsedLines.push({ n: i + 1, level: currentLevel, text });
        }
      }
      
      // Логика фильтрации: краш-логи показываются, если выбран ALL, FATAL или ERROR
      const filtered = parsedLines.filter(l => {
        if (filterLevel === 'ALL') return true;
        if (isCrash && (filterLevel === 'FATAL' || filterLevel === 'ERROR')) return true;
        return l.level === filterLevel;
      });

      panel.innerHTML = `
        <div class="panel-head">
          <span style="text-transform:none;letter-spacing:0;font-size:11px;font-family:var(--font-mono);color:var(--text-dim);flex:1">${esc(sel.name)}</span>
          <span style="text-transform:none;letter-spacing:0;font-size:11px;color:var(--text-dimmer)">${t('logs.lines', {n: filtered.length})}</span>
        </div>
        <div class="code-wrap" style="background:var(--bg-card)">
          <div class="code-gutter">${filtered.map(l => l.n).join('<br>')}</div>
          <div class="code-content" style="font-size:11.5px">${filtered.map(l => colorLine(l.text, l.level)).join('\n')}</div>
        </div>`;
    }

    function colorLine(text, level) {
      const s = esc(text);
      
      // Если это строка из стектрейса, делаем её чуть тусклее
      const isStack = /^\s+at\s+/.test(text) || /^\s*\.\.\.\s+\d+\s+more/.test(text);
      
      if (level === 'FATAL' || level === 'ERROR') {
        if (isStack) return '<span style="color:#b91c1c">' + s + '</span>';
        if (/Caused by:/.test(text)) return '<span style="color:#ef4444; font-weight:bold;">' + s + '</span>';
        return '<span style="color:#f87171">' + s + '</span>';
      }
      if (level === 'WARN') return '<span style="color:#fbbf24">' + s + '</span>';
      if (level === 'INFO') return '<span style="color:#8b94a7">' + s + '</span>';
      if (level === 'DEBUG' || level === 'TRACE') return '<span style="color:#5a6478">' + s + '</span>';
      return s;
    }

    async function analyzeCurrent() {
      if (!selected) return;
      try {
        const r = await window.API.log.analyze(selected.path);
        window.State.set({ logAnalysis: r });
        window.Router.go('analysis');
        window.Toast.success(t('logs.toast.analyzed'), t('logs.toast.analyzedDesc', {n: r.summary.total}));
      } catch (e) {
        window.Toast.error(t('logs.toast.analysisFailed'), e.message);
      }
    }

    render();
    const unsub = window.State.sub(() => {
      if (!container.isConnected) return;
      state = window.State.data;
      if (selected) loadFile(selected);
      else render();
    });
    const connWatcher = setInterval(() => {
      if (!container.isConnected) { unsub(); clearInterval(connWatcher); }
    }, 1000);
  }
  return { mount };
})();