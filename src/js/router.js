window.Router = (function () {
  const views = {
    overview:  window.Views.overview,
    mods:      window.Views.mods,
    recipes:   window.Views.recipes,
    loot:      window.Views.loot,
    graph:     window.Views.graph,
    configs:   window.Views.configs,
    logs:      window.Views.logs,
    items:     window.Views.items,
    aboutMods: window.Views.aboutMods,
    analysis:  window.Views.analysis,
    about:     window.Views.about,
    generation: window.Views.generation,
    reports: window.Views.reports,
  };

  function makeTabId(viewName) {
    return 'tab_' + viewName;
  }

  /**
   * Открывает вкладку. Если такая вкладка уже открыта — активирует её.
   * Если нет — создаёт новую, монтирует view, активирует.
   */
  function go(viewName) {
    if (!views[viewName]) {
      console.warn('[router] unknown view:', viewName);
      return;
    }

    const id = makeTabId(viewName);
    const existing = (window.State.data.tabs || []).find(t => t.id === id);
    if (existing) {
      activateTab(id);
      return;
    }

    openTab(viewName, id);
  }

    function openTab(viewName, id) {
    const main = document.getElementById('main');
    if (!main) return;

    const view = views[viewName];
    if (!view || typeof view.mount !== 'function') {
      console.warn('[router] view has no mount:', viewName);
      return;
    }

    // 1) Скрыть все существующие вкладки ЗАРАНЕЕ
    document.querySelectorAll('#main .tab-content').forEach(c => {
      c.style.display = 'none';
    });

    // 2) Создать новую вкладку БЕЗ display:none — чтобы размеры были реальными
    const container = document.createElement('div');
    container.className = 'tab-content';
    container.dataset.tabId = id;
    main.appendChild(container);

    // 3) Дать браузеру просчитать layout (clientWidth/Height) перед mount
    //    Без этого canvas может получить 0×0.
    void container.offsetWidth; // force reflow

    // 4) Монтировать view — теперь контейнер видим и имеет реальные размеры
    try {
      view.mount(container);
    } catch (e) {
      console.error('[router] mount failed:', viewName, e);
      container.innerHTML = '<div class="empty-state">Ошибка рендера: ' + e.message + '</div>';
    }

    // 5) Зарегистрировать вкладку
    const tabs = window.State.data.tabs || [];
    tabs.push({ id, view: viewName, container });
    window.State.data.tabs = tabs;

    activateTab(id);
    Tabs.render();
  }

  function activateTab(id) {
    const tabs = window.State.data.tabs || [];
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;

    window.State.data.activeTabId = id;

    // Скрыть все, показать активную
    document.querySelectorAll('#main .tab-content').forEach(c => {
      c.style.display = c.dataset.tabId === id ? '' : 'none';
    });

    // Обновить sidebar
    if (window.Sidebar && window.Sidebar.setActive) {
      window.Sidebar.setActive(tab.view);
    }

    // Отрисовать полосу вкладок
    Tabs.render();

    // Обновить State (для views, которые слушают currentView)
    window.State.set({ currentView: tab.view });

    // Дать view шанс отреагировать на возврат (например, графу — resize)
    try {
      window.dispatchEvent(new CustomEvent('kat:tab-visible', { detail: { view: tab.view, id } }));
    } catch {}
  }

  function closeTab(id) {
    const tabs = window.State.data.tabs || [];
    const idx = tabs.findIndex(t => t.id === id);
    if (idx < 0) return;

    const tab = tabs[idx];
    // удаляем DOM — это заставит views отписаться (connWatcher)
    if (tab.container && tab.container.parentElement) {
      tab.container.parentElement.removeChild(tab.container);
    }

    tabs.splice(idx, 1);
    window.State.data.tabs = tabs;

    // Если закрыли активную — активируем соседнюю
    if (window.State.data.activeTabId === id) {
      const next = tabs[idx] || tabs[idx - 1] || tabs[tabs.length - 1];
      if (next) {
        activateTab(next.id);
      } else {
        window.State.data.activeTabId = null;
        Tabs.render();
        // Показать empty-state
        const main = document.getElementById('main');
        if (main) main.innerHTML = '<div class="empty-state" style="flex:1;margin:auto">Откройте раздел из меню слева</div>';
      }
    } else {
      Tabs.render();
    }
  }

  function current() {
    const activeId = window.State.data.activeTabId;
    const tab = (window.State.data.tabs || []).find(t => t.id === activeId);
    return tab ? tab.view : null;
  }

  return { go, openTab, activateTab, closeTab, current };
})();