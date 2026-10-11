window.App = (function () {

  async function openModpack() {
    const root = await window.API.dlg.folder();
    if (!root) return;

    window.Sidebar.setLoader('Сканирование...');
    window.StatusBar.setState({ status: 'Сканирование сборки...' });

    try {
      const scan = await window.API.mp.scan(root);
      window.State.set({ root, scan, modInfo: null, analysis: null, junk: null, classify: null, logAnalysis: null });
      window.StatusBar.setState({ status: 'Готово', scan });
      window.Toast.success('Сборка загружена', scan.summary.mods + ' модов, ' + scan.summary.configs + ' конфигов');

      // --- modinfo (структура ассетов) ---
      window.Sidebar.setLoader('ModInfo...');
      window.API.mp.modinfo(root, scan.mods).then(mi => {
        if (window.State.data.scan !== scan) return;
        window.State.set({ modInfo: mi });
      }).catch(e => console.error('[modinfo]', e));

      // --- modpack analyzer (дубли, зависимости) ---
      window.API.modpack.analyze(scan).then(a => {
        if (window.State.data.scan !== scan) return;
        window.State.set({ analysis: a });
      }).catch(e => console.error('[analyze]', e));

      // --- классификатор (client/server/library/meta) ---
      window.Sidebar.setLoader('Классификация...');
      window.API.mods.classify(root).then(list => {
        if (window.State.data.scan !== scan) return;
        // мержим тип в scan.mods
        const byFile = new Map(list.map(c => [c.file, c]));
        for (const m of scan.mods) {
          const c = byFile.get(m.file);
          if (c) {
            m._type = c.type || 'both';
            m._typeReasons = c.reasons || [];
            m._environment = c.environment || null;
            m._categories = c.categories || [];
            m._project = c.project || null;
          } else {
            m._type = 'unknown';
          }
        }
        window.State.set({ classify: list, scan: scan });
        window.Sidebar.setLoader('Готово');
        setTimeout(() => window.Sidebar.setLoader(null), 1200);
        window.Toast.success('Классификация', list.length + ' модов опознано');
      }).catch(e => {
        console.error('[classify]', e);
        window.Sidebar.setLoader(null);
      });

      // --- junk-детектор (пустые конфиги, кэш, дубли) ---
      window.API.junk.detect(root).then(j => {
        if (window.State.data.scan !== scan) return;
        window.State.set({ junk: j });
      }).catch(e => console.error('[junk]', e));

    } catch (e) {
      window.Toast.error('Ошибка сканирования', e.message);
      window.Sidebar.setLoader(null);
      window.StatusBar.setState({ status: 'Ошибка' });
    }
  }

  async function rescan() {
    if (!window.State.data.root) return openModpack();
    return openModpack();
  }

  function init() {
    window.TitleBar.render();
    window.Sidebar.render();
    window.StatusBar.render();

    window.API.on.logEntry(e => {
      if (e.level === 'ERROR' || e.level === 'FATAL') console.error('[APP]', e.scope, e.msg);
    });
        window.API.on.progress(p => {
      const cur = Math.min(p.i + 1, p.total);
      if (p.module === 'classify')      window.Sidebar.setLoader('Классификация ' + cur + '/' + p.total);
      else if (p.module === 'modinfo')  window.Sidebar.setLoader('ModInfo ' + cur + '/' + p.total);
      else if (p.module === 'recipes')  window.Sidebar.setLoader('Рецепты ' + cur + '/' + p.total);
      else if (p.module === 'loot-vanilla') window.Sidebar.setLoader('Ванильный jar ' + cur + '/' + p.total);
    });
    

    window.Router.go('overview');
  }

  window.addEventListener('DOMContentLoaded', init);
  return { openModpack, rescan };
})();