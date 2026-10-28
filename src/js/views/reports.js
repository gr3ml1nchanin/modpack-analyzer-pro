window.Views = window.Views || {};
window.Views.reports = (function () {
  function t(k, v) { return window.I18n.t(k, v); }
  
  function mount(container) {
    let state = window.State.data;
    let activeTab = 'prompt'; // 'prompt' | 'txt' | 'html' | 'preview'
    
    let promptOpts = {
      logs: true,
      issues: true,
      mods: false,
      loot: false
    };

    function render() {
      const hasScan = state.scan && state.scan.mods && state.scan.mods.length;

      const tabsHtml = `
        <div class="graph-modes" style="margin-bottom: 16px;">
          <button class="graph-mode-btn ${activeTab === 'prompt' ? 'active' : ''}" data-tab="prompt">Промт-дебаг</button>
          <button class="graph-mode-btn ${activeTab === 'txt' ? 'active' : ''}" data-tab="txt">TXT-отчёт</button>
          <button class="graph-mode-btn ${activeTab === 'html' ? 'active' : ''}" data-tab="html">HTML-отчёт</button>
          <button class="graph-mode-btn ${activeTab === 'preview' ? 'active' : ''}" data-tab="preview">Превью для игрока</button>
        </div>
      `;

      let bodyHtml = '';
      if (!hasScan) {
        bodyHtml = `<div class="empty-state" style="margin:auto">Загрузите сборку, чтобы создать отчёт.</div>`;
      } else {
        if (activeTab === 'prompt') bodyHtml = renderPromptTab();
        else if (activeTab === 'txt') bodyHtml = renderTxtTab();
        else if (activeTab === 'html') bodyHtml = renderHtmlTab();
        else if (activeTab === 'preview') bodyHtml = renderPreviewTab();
      }

      container.innerHTML = `
        <div class="view">
          <div class="view-header">
            <div>
              <div class="view-title">Отчёты</div>
              <div class="view-sub">Экспорт данных о сборке и ошибках</div>
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

      document.querySelectorAll('.graph-mode-btn').forEach(btn => {
        btn.onclick = () => { activeTab = btn.dataset.tab; render(); };
      });

      bindEvents();
    }

    function renderPromptTab() {
      return `
        <div style="display:flex; gap:16px; height:100%;">
          <div style="width:300px; background:var(--bg-panel); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px; flex-shrink:0;">
            <h3 style="font-size:14px; margin-bottom:16px; color:var(--text-primary);">Конструктор</h3>
            <div style="display:flex; flex-direction:column; gap:12px;">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px;">
                <input type="checkbox" id="opt-logs" ${promptOpts.logs ? 'checked' : ''}> Извлечь ошибки из логов
              </label>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px;">
                <input type="checkbox" id="opt-issues" ${promptOpts.issues ? 'checked' : ''}> Включить список проблем
              </label>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px;">
                <input type="checkbox" id="opt-mods" ${promptOpts.mods ? 'checked' : ''}> Список всех модов
              </label>
            </div>
          </div>
          <div style="flex:1; display:flex; flex-direction:column; gap:12px;">
            <div class="code-wrap" style="flex:1; background:var(--bg-input); border:1px solid var(--border-strong); border-radius:var(--radius-sm); padding:16px; overflow:auto;">
              <pre id="prompt-preview" style="font-family:var(--font-mono); font-size:12px; color:var(--text-secondary); margin:0; white-space:pre-wrap;"></pre>
            </div>
            <button class="btn primary" id="btn-export-prompt" style="align-self:flex-end;">Сохранить отчёт для ИИ</button>
          </div>
        </div>
      `;
    }

    function renderTxtTab() {
      return `
        <div style="display:flex; flex-direction:column; height:100%; gap:12px;">
          <div class="code-wrap" style="flex:1; background:var(--bg-input); border:1px solid var(--border-strong); border-radius:var(--radius-sm); padding:16px; overflow:auto;">
            <pre id="txt-preview" style="font-family:var(--font-mono); font-size:12px; color:var(--text-secondary); margin:0; white-space:pre-wrap;">Генерация...</pre>
          </div>
          <button class="btn primary" id="btn-export-txt" style="align-self:flex-end;">Сохранить TXT</button>
        </div>
      `;
    }

    function renderHtmlTab() {
      return `
        <div style="display:flex; flex-direction:column; height:100%; gap:12px;">
          <div style="flex:1; border:1px solid var(--border-strong); border-radius:var(--radius-sm); overflow:hidden; background:#121212;">
            <iframe id="html-preview" style="width:100%; height:100%; border:none;"></iframe>
          </div>
          <button class="btn primary" id="btn-export-html" style="align-self:flex-end;">Сохранить HTML</button>
        </div>
      `;
    }

    function renderPreviewTab() {
      return `<div class="empty-state" style="margin:auto">Превью для игрока находится в разработке.</div>`;
    }

    function bindEvents() {
      // Формируем "безопасный" объект для IPC (без DOM-элементов и функций)
      const safeData = () => ({
        scan: state.scan,
        analysis: state.analysis,
        junk: state.junk,
        modInfo: state.modInfo
      });

      if (activeTab === 'prompt') {
        const updatePrompt = async () => {
          promptOpts.logs = document.getElementById('opt-logs').checked;
          promptOpts.issues = document.getElementById('opt-issues').checked;
          promptOpts.mods = document.getElementById('opt-mods').checked;
          
          let extractedLogs = [];
          if (promptOpts.logs && state.scan.logs.length > 0) {
            try {
              const latestLog = state.scan.logs[0];
              const res = await window.API.file.openGzText(latestLog.path).catch(() => window.API.file.openText(latestLog.path));
              if (res.content) {
                extractedLogs = res.content.split('\n').filter(l => /\[(ERROR|FATAL)\]/.test(l)).slice(0, 50);
              }
            } catch (e) {}
          }

          const payload = {
            ...safeData(),
            logs: extractedLogs
          };

          const text = await window.API.report.prompt(promptOpts, payload);
          const preview = document.getElementById('prompt-preview');
          if (preview) preview.textContent = text;
        };

        document.getElementById('opt-logs').onchange = updatePrompt;
        document.getElementById('opt-issues').onchange = updatePrompt;
        document.getElementById('opt-mods').onchange = updatePrompt;

        document.getElementById('btn-export-prompt').onclick = async () => {
          const text = document.getElementById('prompt-preview').textContent;
          const res = await window.API.report.save(text, 'katan-prompt-' + state.scan.name + '.txt');
          if (res.ok) window.Toast.success('Сохранено', res.path);
        };

        updatePrompt();
      }

      if (activeTab === 'txt') {
        window.API.report.txt(safeData()).then(text => {
          const preview = document.getElementById('txt-preview');
          if (preview) preview.textContent = text;
        }).catch(e => console.error(e));

        document.getElementById('btn-export-txt').onclick = async () => {
          const text = document.getElementById('txt-preview').textContent;
          const res = await window.API.report.save(text, 'katan-report-' + state.scan.name + '.txt');
          if (res.ok) window.Toast.success('Сохранено', res.path);
        };
      }

      if (activeTab === 'html') {
        window.API.report.html(safeData()).then(html => {
          const iframe = document.getElementById('html-preview');
          if (iframe) {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            doc.open();
            doc.write(html);
            doc.close();
          }
        }).catch(e => console.error(e));

        document.getElementById('btn-export-html').onclick = async () => {
          const html = await window.API.report.html(safeData());
          const res = await window.API.report.save(html, 'katan-report-' + state.scan.name + '.html');
          if (res.ok) window.Toast.success('Сохранено', res.path);
        };
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