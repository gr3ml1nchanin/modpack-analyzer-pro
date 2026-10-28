window.Tabs = (function () {
  function t(k, v) { return window.I18n ? window.I18n.t(k, v) : k; }

  const ICONS = {
    overview:  'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    mods:      'M12 2L3 7v10l9 5 9-5V7l-9-5zM3 7l9 5 9-5M12 22V12',
    recipes:   'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
    loot:      'M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z',
    graph:     'M18 4a2 2 0 100 4 2 2 0 000-4zM6 10a2 2 0 100 4 2 2 0 000-4zM18 16a2 2 0 100 4 2 2 0 000-4zM8 12l8-6M8 12l8 6',
    configs:   'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h8M8 17h5',
    logs:      'M4 6h16M4 12h16M4 18h10',
    items:     'M6 2l-4 8 10 12 10-12-4-8zM2 10h20M12 2v8M12 12v10',
    aboutMods: 'M12 2a10 10 0 100 20 10 10 0 000-20zM12 8h.01M11 12h1v4h1',
    analysis:  'M3 3v18h18M7 15l4-4 4 4 6-6',
    about:     'M12 2a10 10 0 100 20 10 10 0 000-20zM12 16v-4M12 8h.01'
  };

  const TITLE_KEYS = {
    overview:  'nav.overview',
    mods:      'nav.mods',
    recipes:   'nav.recipes',
    loot:      'nav.loot',
    graph:     'nav.graph',
    configs:   'nav.configs',
    logs:      'nav.logs',
    items:     'nav.items',
    aboutMods: 'nav.aboutMods',
    analysis:  'nav.analysis',
    about:     'nav.about'
  };

  function titleFor(viewName) {
    return t(TITLE_KEYS[viewName] || viewName);
  }

  function render() {
    const bar = document.getElementById('tabs-bar');
    if (!bar) return;

    const tabs = (window.State.data.tabs || []);
    const activeId = window.State.data.activeTabId;

    if (!tabs.length) {
      bar.innerHTML = '';
      return;
    }

    bar.innerHTML = tabs.map(tab => {
      const active = tab.id === activeId;
      const iconPath = ICONS[tab.view] || ICONS.overview;
      return '<div class="tab' + (active ? ' active' : '') + '" data-tab-id="' + tab.id + '" title="' + titleFor(tab.view) + '">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + iconPath + '"/></svg>' +
        '<span class="tab-title">' + titleFor(tab.view) + '</span>' +
        '<button class="tab-close" data-tab-close="' + tab.id + '" title="' + t('common.close') + '">×</button>' +
      '</div>';
    }).join('');

    // привязка событий
    bar.querySelectorAll('.tab').forEach(el => {
      el.onclick = e => {
        if (e.target.dataset.tabClose) return; // клик по крестику
        window.Router.activateTab(el.dataset.tabId);
      };
      // средняя кнопка мыши — закрыть
      el.onauxclick = e => {
        if (e.button === 1) {
          e.preventDefault();
          window.Router.closeTab(el.dataset.tabId);
        }
      };
    });

    bar.querySelectorAll('[data-tab-close]').forEach(b => {
      b.onclick = e => {
        e.stopPropagation();
        window.Router.closeTab(b.dataset.tabClose);
      };
    });

    // скролл к активной вкладке
    const activeEl = bar.querySelector('.tab.active');
    if (activeEl && activeEl.scrollIntoView) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }

  return { render };
})();