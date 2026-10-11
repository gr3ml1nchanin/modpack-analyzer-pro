window.State = (function () {
  const data = {
    root: null, scan: null, modInfo: null, junk: null, analysis: null,
    classify: null, logAnalysis: null, loadedLog: null, loadedCfg: null,
    loading: false, currentView: 'overview'
  };
  const subs = [];
  return {
    data,
    set(patch) { Object.assign(data, patch); subs.forEach(fn => { try { fn(data); } catch(e){ console.error(e); } }); },
    sub(fn) { subs.push(fn); try { fn(data); } catch(e){ console.error(e); } return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
    emit() { subs.forEach(fn => { try { fn(data); } catch(e){ console.error(e); } }); }
  };
})();