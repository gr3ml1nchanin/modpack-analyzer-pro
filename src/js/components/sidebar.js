window.Sidebar = (function () {
  const items = [
    { id: 'overview',  key: 'nav.overview',  icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
    { id: 'mods',      key: 'nav.mods',      icon: 'M12 2L3 7v10l9 5 9-5V7l-9-5zM3 7l9 5 9-5M12 22V12' },
    { id: 'recipes',   key: 'nav.recipes',   icon: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18' },
    { id: 'loot',      key: 'nav.loot',      icon: 'M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z' },
    { id: 'graph',     key: 'nav.graph',     icon: 'M18 4a2 2 0 100 4 2 2 0 000-4zM6 10a2 2 0 100 4 2 2 0 000-4zM18 16a2 2 0 100 4 2 2 0 000-4zM8 12l8-6M8 12l8 6' },
    { id: 'configs',   key: 'nav.configs',   icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h8M8 17h5' },
    { id: 'logs',      key: 'nav.logs',      icon: 'M4 6h16M4 12h16M4 18h10' },
    { id: 'items',     key: 'nav.items',     icon: 'M6 2l-4 8 10 12 10-12-4-8zM2 10h20M12 2v8M12 12v10' },
    { id: 'aboutMods', key: 'nav.aboutMods', icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zM12 8h.01M11 12h1v4h1' },
    { id: 'analysis',  key: 'nav.analysis',  icon: 'M3 3v18h18M7 15l4-4 4 4 6-6' },
    { id: 'generation', key: 'nav.generation', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
    { id: 'reports', key: 'nav.reports', icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8' },
    { id: 'about',     key: 'nav.about',     icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zM12 16v-4M12 8h.01' }
  ];

  let activeId = null;

  function render() {
    const t = window.I18n.t;
    const el = document.getElementById('sidebar');
    const lang = window.I18n.getLang();

    el.innerHTML = `
      <nav class="nav">
        ${items.map(it => `
          <div class="nav-item ${activeId === it.id ? 'active' : ''}" data-view="${it.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${it.icon}"/></svg>
            <span>${t(it.key)}</span>
          </div>`).join('')}
      </nav>
      <div class="sidebar-spacer"></div>
      <div class="sb-loader" id="sb-loader" style="display:none"></div>
      <div class="lang-switch" title="${t('nav.language')}">
        <div class="lang-switch-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
          </svg>
          <span>${t('nav.language')}</span>
        </div>
        <div class="lang-switch-buttons">
          <button class="lang-switch-btn ${lang === 'ru' ? 'active' : ''}" data-lang="ru">RU</button>
          <button class="lang-switch-btn ${lang === 'en' ? 'active' : ''}" data-lang="en">EN</button>
        </div>
      </div>
    `;

    el.querySelectorAll('.nav-item').forEach(n => {
      n.onclick = () => window.Router.go(n.dataset.view);
    });

    el.querySelectorAll('.lang-switch-btn').forEach(b => {
      b.onclick = () => {
        if (b.dataset.lang === window.I18n.getLang()) return;
        window.I18n.setLang(b.dataset.lang);
      };
    });
  }

  function setActive(view) {
    activeId = view;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  }

  function setLoader(text) {
    const l = document.getElementById('sb-loader');
    if (!l) return;
    if (text) { l.textContent = text; l.style.display = ''; } else l.style.display = 'none';
  }

  return { render, setActive, setLoader };
})();