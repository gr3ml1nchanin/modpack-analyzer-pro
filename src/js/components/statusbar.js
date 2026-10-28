window.StatusBar = (function () {
    function render() {
    const t = window.I18n ? window.I18n.t : (k) => k;
    const el = document.getElementById('statusbar');
    if (!el) return;
    el.innerHTML = `
      <div class="status-item"><span class="dot"></span><span id="sb-status">${t('status.ready')}</span></div>
      <div class="status-spacer"></div>
      <div class="status-item">${t('status.mods')}: <b id="sb-mods" style="margin-left:4px">0</b></div>
      <div class="status-item">${t('status.size')}: <b id="sb-size" style="margin-left:4px">0 Б</b></div>
      <div class="status-item" id="sb-time"></div>`;
    tick();
    setInterval(tick, 1000);
  }
  function tick() {
    const el = document.getElementById('sb-time');
    if (el) el.textContent = new Date().toLocaleTimeString('ru-RU', { hour12: false });
  }
  function setState(patch) {
    if (patch.status !== undefined) {
      const el = document.getElementById('sb-status'); if (el) el.textContent = patch.status;
    }
    if (patch.scan) {
      document.getElementById('sb-mods').textContent = patch.scan.summary.mods;
      document.getElementById('sb-size').textContent = human(patch.scan.summary.totalModSize);
    }
  }
  function human(b) {
    if (!b) return '0 Б';
    if (b < 1024) return b + ' Б';
    if (b < 1024*1024) return (b/1024).toFixed(1) + ' КБ';
    if (b < 1024*1024*1024) return (b/1024/1024).toFixed(1) + ' МБ';
    return (b/1024/1024/1024).toFixed(2) + ' ГБ';
  }
  return { render, setState, human };
})();