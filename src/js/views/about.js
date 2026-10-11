window.Views = window.Views || {};
window.Views.about = (function () {
  function t(k, v) { return window.I18n.t(k, v); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function mount(container) {
    const cfg = window.APP_CONFIG || {};

    function render() {
      container.innerHTML = `
        <div class="view">
          <div class="view-header">
            <div>
              <div class="view-title">${t('about.title')}</div>
              <div class="view-sub">${t('about.sub')}</div>
            </div>
          </div>
          <div class="view-body">

            <div class="about-card">
              <div class="about-logo">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z"/>
                  <path d="M3 7l9 5 9-5"/><path d="M12 22V12"/>
                </svg>
              </div>
              <div class="about-name">${esc(cfg.name || 'Modpack Analyzer')}</div>
              <div class="about-version">${t('about.version')} <strong>${esc(cfg.version || '0.1')}</strong></div>
              <div class="about-author">${esc(cfg.author || 'by gr3ml1')}</div>
            </div>

            <div class="about-actions">
              <button class="btn primary" id="about-check-updates">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16"/></svg>
                ${t('about.checkUpdates')}
              </button>
              <button class="btn" id="about-open-github">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/></svg>
                ${t('about.openGithub')}
              </button>
              <button class="btn" id="about-open-issues">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                ${t('about.reportIssue')}
              </button>
            </div>

            <div class="about-section">
              <div class="about-section-title">
                ${t('about.features')}
                ${window.Hint.btn('hint-what')}
              </div>
              ${window.Hint.body('hint-what', t('about.features.hint'))}
              <ul class="about-list">
                <li>${t('about.feature.overview')}</li>
                <li>${t('about.feature.mods')}</li>
                <li>${t('about.feature.recipes')}</li>
                <li>${t('about.feature.loot')}</li>
                <li>${t('about.feature.graph')}</li>
                <li>${t('about.feature.configs')}</li>
                <li>${t('about.feature.logs')}</li>
                <li>${t('about.feature.analysis')}</li>
              </ul>
            </div>

            <div class="about-section">
              <div class="about-section-title">
                ${t('about.requirements')}
                ${window.Hint.btn('hint-req')}
              </div>
              ${window.Hint.body('hint-req', t('about.requirements.hint'))}
              <div style="color:var(--text-dim);font-size:12px;line-height:1.7">
                ${t('about.requirements.desc')}
              </div>
            </div>

            <div class="about-section">
              <div class="about-section-title">${t('about.links')}</div>
              <div class="about-links">
                <a href="#" id="about-link-github" class="about-link">${t('about.link.repo')}</a>
                <a href="#" id="about-link-releases" class="about-link">${t('about.link.releases')}</a>
                <a href="#" id="about-link-issues" class="about-link">${t('about.link.issues')}</a>
              </div>
            </div>

            <div class="about-footer">
              <span>${esc(cfg.name || '')} v${esc(cfg.version || '')} · ${esc(cfg.author || '')}</span>
              <span style="color:var(--text-dimmer)">© ${cfg.year || new Date().getFullYear()} · ${esc(cfg.license || 'MIT')}</span>
            </div>

          </div>
        </div>`;

      bindEvents();
      window.Hint.bind(container);
    }

    function bindEvents() {
      const cfg = window.APP_CONFIG || {};

      const openUrl = (url) => {
        if (window.API && window.API.sh && window.API.sh.open) {
          window.API.sh.open(url);
        } else {
          window.open(url, '_blank');
        }
      };

      const checkBtn = document.getElementById('about-check-updates');
      if (checkBtn) checkBtn.onclick = () => {
        const url = cfg.githubReleases || (cfg.githubRepo + '/releases');
        window.Toast.info(t('about.checkUpdatesToast'), t('about.checkUpdatesDesc'));
        openUrl(url);
      };

      const ghBtn = document.getElementById('about-open-github');
      if (ghBtn) ghBtn.onclick = () => openUrl(cfg.githubRepo);

      const issBtn = document.getElementById('about-open-issues');
      if (issBtn) issBtn.onclick = () => openUrl(cfg.githubIssues || (cfg.githubRepo + '/issues'));

      const linkGh = document.getElementById('about-link-github');
      if (linkGh) linkGh.onclick = e => { e.preventDefault(); openUrl(cfg.githubRepo); };

      const linkRel = document.getElementById('about-link-releases');
      if (linkRel) linkRel.onclick = e => { e.preventDefault(); openUrl(cfg.githubReleases); };

      const linkIss = document.getElementById('about-link-issues');
      if (linkIss) linkIss.onclick = e => { e.preventDefault(); openUrl(cfg.githubIssues || (cfg.githubRepo + '/issues')); };
    }

    render();

    // about не зависит от scan, но подписываемся, чтобы обновляться при смене языка
    const unsub = window.State.sub(() => {
      if (!container.isConnected) return;
    });
    const connWatcher = setInterval(() => {
      if (!container.isConnected) { unsub(); clearInterval(connWatcher); }
    }, 1000);
  }

  return { mount };
})();