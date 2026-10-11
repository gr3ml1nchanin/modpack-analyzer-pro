window.Toast = (function () {
  const root = () => document.getElementById('toasts');
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function show(title, msg, kind, ttl) {
    kind = kind || 'info';
    ttl = ttl || 4000;
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = '<div style="flex:1"><div class="toast-title">' + esc(title) + '</div>' + (msg ? '<div class="toast-msg">' + esc(msg) + '</div>' : '') + '</div>';
    root().appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .2s'; setTimeout(() => el.remove(), 220); }, ttl);
  }
  return {
    show,
    info:  (t, m) => show(t, m, 'info'),
    success: (t, m) => show(t, m, 'success'),
    warn:  (t, m) => show(t, m, 'warn'),
    error: (t, m) => show(t, m, 'error', 6000)
  };
})();