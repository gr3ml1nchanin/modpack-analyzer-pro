window.Views = window.Views || {};
window.Views.analysis = (function () {
  function t(k, v) { return window.I18n.t(k, v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function human(b) {
    if (!b) return '0 ' + t('human.b');
    if (b < 1024) return b + ' ' + t('human.b');
    if (b < 1024*1024) return (b/1024).toFixed(1) + ' ' + t('human.kb');
    if (b < 1024*1024*1024) return (b/1024/1024).toFixed(1) + ' ' + t('human.mb');
    return (b/1024/1024/1024).toFixed(2) + ' ' + t('human.gb');
  }

  // Определяем тип issue по русскому заголовку из backend
  const ISSUE_MAP = [
    { re: /Дубликаты модов/i,        titleKey: 'analysis.issue.duplicates',    descKey: 'analysis.issue.duplicatesDesc' },
    { re: /Отсутствующие зависимости/i, titleKey: 'analysis.issue.missing',    descKey: 'analysis.issue.missingDesc' },
    { re: /Моды без метаданных/i,     titleKey: 'analysis.issue.noMeta',       descKey: 'analysis.issue.noMetaDesc' },
    { re: /Аномально крупные моды/i,  titleKey: 'analysis.issue.huge',         descKey: 'analysis.issue.hugeDesc' },
    { re: /Несколько версий/i,        titleKey: 'analysis.issue.multiVersion', descKey: 'analysis.issue.multiVersionDesc' }
  ];

  function trIssueTitle(rawTitle) {
    for (const m of ISSUE_MAP) {
      if (m.re.test(rawTitle || '')) return t(m.titleKey);
    }
    return rawTitle;
  }

  function trIssueDesc(rawDesc, rawTitle, items) {
    for (const m of ISSUE_MAP) {
      if (m.re.test(rawTitle || '')) return t(m.descKey, {n: items.length});
    }
    return rawDesc;
  }

  function trDetail(detail) {
    if (!detail) return detail;
    return String(detail).replace(/^требуется модом/, t('analysis.detail.requiredByPrefix'));
  }

  function mount(container) {
    let state = window.State.data;

    function render() {
      const a = state.analysis;
      const logA = state.logAnalysis;
      const junk = state.junk;

      const subText = a
        ? t('analysis.sub.loaded', {mods: state.scan.summary.mods, problems: a.summary.problems})
        : t('analysis.sub.empty');

      container.innerHTML = `
        <div class="view">
          <div class="view-header">
            <div>
              <div class="view-title">${t('analysis.title')}</div>
              <div class="view-sub">${subText}</div>
            </div>
            <div class="view-actions">
              <button class="btn" id="an-refresh" ${state.scan ? '' : 'disabled'}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16"/></svg>
                ${t('analysis.refresh')}
              </button>
            </div>
          </div>
          <div class="view-body">
            ${!a && !logA && !junk ? '<div class="empty-state">' + t('analysis.empty') + '</div>' : ''}
            ${junk ? renderJunk(junk) : ''}
            ${logA ? renderLogAnalysis(logA) : ''}
            ${a && a.issues.length ? a.issues.map(renderIssue).join('') : (a ? '<div class="empty-state" style="padding:40px 0">' + t('analysis.noIssues') + '</div>' : '')}
          </div>
        </div>`;

      const btn = document.getElementById('an-refresh');
      if (btn && !btn.disabled) btn.onclick = runAnalysis;
    }

    /* ========== JUNK ========== */
    function renderJunk(j) {
      const nothing = !j.emptyConfigs.length && !j.junkDirs.length && !j.junkFiles.length && !j.duplicateJars.length && !j.staleLogs.length;

      let html = '<div style="margin-bottom:18px">' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">' +
          '<div style="font-size:14px;font-weight:700">' + t('analysis.junk.title') + '</div>' +
          (j.totalWastedBytes ? '<div style="color:var(--text-dim);font-size:12px">' + t('analysis.junk.total', {size: human(j.totalWastedBytes)}) + '</div>' : '') +
        '</div>';

      if (nothing) {
        html += '<div class="issue" style="padding:20px">' +
          '<div style="color:var(--emerald);font-weight:600">' + t('analysis.junk.clean') + '</div>' +
          '<div style="color:var(--text-dimmer);font-size:12px;margin-top:4px">' + t('analysis.junk.cleanDesc') + '</div>' +
        '</div>';
      }

      if (j.duplicateJars.length) {
        html += '<div class="issue">' +
          '<div class="issue-head">' +
            '<span class="issue-sev critical">' + t('analysis.sev.critical') + '</span>' +
            '<span class="issue-title">' + t('analysis.junk.dupes') + '</span>' +
          '</div>' +
          '<div class="issue-desc">' + t('analysis.junk.dupesDesc', {n: j.duplicateJars.length}) + '</div>' +
          j.duplicateJars.slice(0, 15).map(d =>
            '<div class="issue-item">' +
              '<span class="k">' + esc(d.files[0]) + '</span>' +
              '<span class="d">' + t('analysis.junk.dupesPrefix', {files: esc(d.files.slice(1).join(', ')), size: human(d.size)}) + '</span>' +
            '</div>'
          ).join('') +
          (j.duplicateJars.length > 15 ? '<div style="padding:8px 0;color:var(--text-dimmer);font-size:11px">' + t('common.andMore', {n: j.duplicateJars.length - 15}) + '</div>' : '') +
        '</div>';
      }

      if (j.emptyConfigs.length) {
        html += '<div class="issue">' +
          '<div class="issue-head">' +
            '<span class="issue-sev warning">' + t('analysis.sev.warning') + '</span>' +
            '<span class="issue-title">' + t('analysis.junk.emptyConfigs') + '</span>' +
          '</div>' +
          '<div class="issue-desc">' + t('analysis.junk.emptyConfigsDesc', {n: j.emptyConfigs.length}) + '</div>' +
          j.emptyConfigs.slice(0, 20).map(c =>
            '<div class="issue-item">' +
              '<span class="k">' + esc(c.rel) + '</span>' +
              '<span class="d">' + esc(c.reason) + ' · ' + human(c.size) + '</span>' +
            '</div>'
          ).join('') +
          (j.emptyConfigs.length > 20 ? '<div style="padding:8px 0;color:var(--text-dimmer);font-size:11px">' + t('common.andMore', {n: j.emptyConfigs.length - 20}) + '</div>' : '') +
        '</div>';
      }

      if (j.junkDirs.length) {
        html += '<div class="issue">' +
          '<div class="issue-head">' +
            '<span class="issue-sev info">' + t('analysis.sev.info') + '</span>' +
            '<span class="issue-title">' + t('analysis.junk.junkDirs') + '</span>' +
          '</div>' +
          '<div class="issue-desc">' + t('analysis.junk.junkDirsDesc') + '</div>' +
          j.junkDirs.map(d =>
            '<div class="issue-item">' +
              '<span class="k">' + esc(d.rel) + '/</span>' +
              '<span class="d">' + human(d.size) + '</span>' +
            '</div>'
          ).join('') +
        '</div>';
      }

      if (j.junkFiles.length) {
        html += '<div class="issue">' +
          '<div class="issue-head">' +
            '<span class="issue-sev info">' + t('analysis.sev.info') + '</span>' +
            '<span class="issue-title">' + t('analysis.junk.junkFiles') + '</span>' +
          '</div>' +
          '<div class="issue-desc">' + j.junkFiles.length + ' ' + t('common.files') + '</div>' +
          j.junkFiles.slice(0, 15).map(f =>
            '<div class="issue-item">' +
              '<span class="k">' + esc(f.rel) + '</span>' +
              '<span class="d">' + human(f.size) + '</span>' +
            '</div>'
          ).join('') +
        '</div>';
      }

      if (j.staleLogs.length) {
        html += '<div class="issue">' +
          '<div class="issue-head">' +
            '<span class="issue-sev info">' + t('analysis.sev.info') + '</span>' +
            '<span class="issue-title">' + t('analysis.junk.staleLogs') + '</span>' +
          '</div>' +
          '<div class="issue-desc">' + j.staleLogs.length + ' ' + t('common.files') + '</div>' +
          j.staleLogs.slice(0, 15).map(l =>
            '<div class="issue-item">' +
              '<span class="k">' + esc(l.file) + '</span>' +
              '<span class="d">' + human(l.size) + ' · ' + t('analysis.junk.days', {n: l.ageDays}) + '</span>' +
            '</div>'
          ).join('') +
        '</div>';
      }

      html += '</div>';
      return html;
    }

    /* ========== MODPACK ISSUES ========== */
    function renderIssue(iss) {
      const title = trIssueTitle(iss.title);
      const desc = trIssueDesc(iss.description, iss.title, iss.items);

      return '<div class="issue">' +
        '<div class="issue-head">' +
          '<span class="issue-sev ' + iss.severity + '">' + (t('analysis.sev.' + iss.severity) || iss.severity.toUpperCase()) + '</span>' +
          '<span class="issue-title">' + esc(title) + '</span>' +
        '</div>' +
        '<div class="issue-desc">' + esc(desc) + '</div>' +
        iss.items.slice(0, 40).map(it =>
          '<div class="issue-item">' +
            '<span class="k">' + esc(it.key || '') + '</span>' +
            '<span class="d">' + esc(trDetail(it.detail || '')) + '</span>' +
          '</div>').join('') +
        (iss.items.length > 40 ? '<div style="padding:8px 0;color:var(--text-dimmer);font-size:11px">' + t('common.andMore', {n: iss.items.length - 40}) + '</div>' : '') +
      '</div>';
    }

    /* ========== LOG ANALYSIS ========== */
    function renderLogAnalysis(r) {
      const cats = r.tree.map(g =>
        '<div class="issue">' +
          '<div class="issue-head">' +
            '<span class="issue-sev ' + g.severity + '">' + (t('analysis.sev.' + g.severity) || g.severity.toUpperCase()) + '</span>' +
            '<span class="issue-title">' + t('analysis.logCategory', {cat: esc(g.category)}) + '</span>' +
          '</div>' +
          '<div class="issue-desc">' + t('analysis.logMatches', {n: g.count}) + '</div>' +
          g.nodes.slice(0, 5).map(n =>
            '<div class="issue-item">' +
              '<span class="k">' + esc(n.text).slice(0, 120) + '</span>' +
              '<span class="d">' + esc(n.chain && n.chain[0] ? n.chain[0].fix : '') + '</span>' +
            '</div>').join('') +
        '</div>').join('');
      return '<div style="margin-bottom:18px">' +
        '<div style="color:var(--text-dim);font-size:12px;margin-bottom:10px">' +
          t('analysis.logAnalysis', {src: esc(r.source), total: r.summary.total, critical: r.summary.critical}) +
        '</div>' +
        (cats || '<div style="color:var(--text-dimmer);font-size:12px">' + t('analysis.noIssues') + '</div>') +
      '</div>';
    }

    async function runAnalysis() {
      if (!state.scan) return;
      window.Toast.info(t('analysis.toast.started'), t('analysis.toast.startedDesc'));
      try {
        const [a, j] = await Promise.all([
          window.API.modpack.analyze(state.scan),
          window.API.junk.detect(state.scan.root)
        ]);
        window.State.set({ analysis: a, junk: j });
        window.Toast.success(t('analysis.toast.done'), t('analysis.toast.doneDesc', {n: a.summary.problems}));
      } catch (e) {
        window.Toast.error(t('status.error'), e.message);
      }
    }

    render();
    const unsub = window.State.sub(() => {
      if (!container.isConnected) return;
      state = window.State.data;
      render();
    });
    const connWatcher = setInterval(() => {
      if (!container.isConnected) { unsub(); clearInterval(connWatcher); }
    }, 1000);
  }
  return { mount };
})();