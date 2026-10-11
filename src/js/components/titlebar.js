window.TitleBar = (function () {
  function render() {
    const el = document.getElementById('titlebar');
    el.innerHTML = `
      <div class="tb-logo">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z"/>
          <path d="M3 7l9 5 9-5"/><path d="M12 22V12"/>
        </svg>
               ${window.I18n ? window.I18n.t('titlebar.brand') : 'Modpack Analyzer'} <span class="tb-badge">PRO</span>
      </div>
      <div class="tb-spacer"></div>
      <div class="tb-controls">
        <button class="tb-btn" id="tb-min" title="Свернуть">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" stroke-width="1.3"/></svg>
        </button>
        <button class="tb-btn" id="tb-max" title="Развернуть">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.3"><rect x=".5" y=".5" width="9" height="9"/></svg>
        </button>
        <button class="tb-btn close" id="tb-close" title="Закрыть">
          <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.3"><path d="M0 0l10 10M10 0L0 10"/></svg>
        </button>
      </div>`;
    document.getElementById('tb-min').onclick = () => window.API.win.minimize();
    document.getElementById('tb-max').onclick = () => window.API.win.maximize();
    document.getElementById('tb-close').onclick = () => window.API.win.close();
  }
  return { render };
})();