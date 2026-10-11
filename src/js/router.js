window.Router = (function () {
      const views = {
    overview: window.Views.overview,
    mods:     window.Views.mods,
    recipes:  window.Views.recipes,
    loot:     window.Views.loot,
    graph:    window.Views.graph,
    configs:  window.Views.configs,
    logs:     window.Views.logs,
    items:    window.Views.items,
    aboutMods: window.Views.aboutMods,
    analysis: window.Views.analysis,
    about:    window.Views.about
  };
  let current = null;

  function go(name) {
    if (!views[name]) return;
    current = name;
    window.State.set({ currentView: name });
    window.Sidebar.setActive(name);
    const main = document.getElementById('main');
    main.innerHTML = '';
    const host = document.createElement('div');
    host.style.height = '100%';
    main.appendChild(host);
    try { views[name].mount(host); }
    catch (e) { host.innerHTML = '<div class="empty-state">Ошибка рендера: ' + e.message + '</div>'; console.error(e); }
  }

  return { go, current: () => current };
})();