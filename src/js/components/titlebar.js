window.TitleBar = (function () {
  function render() {
    const el = document.getElementById('titlebar');
    el.innerHTML = `
            <div class="tb-logo">
        <img src="icon.png" alt="KatAn" style="width:18px;height:18px;image-rendering:crisp-edges;border-radius:4px"/>
        ${window.I18n ? window.I18n.t('titlebar.brand') : 'KatAn'}
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