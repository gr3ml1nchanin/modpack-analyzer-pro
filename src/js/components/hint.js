window.Hint = (function () {
  let uid = 0;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  /**
   * Возвращает HTML со знаком "?" + раскрываемым блоком.
   *   Hint.html('Текст подсказки')
   *   Hint.html('Заголовок', 'HTML содержимое')
   */
  function html(title, bodyHtml) {
    const id = 'hint_' + (++uid);
    const content = bodyHtml !== undefined ? bodyHtml : title;
    return '<span class="hint-wrap">' +
      '<button type="button" class="hint-btn" data-hint-toggle="' + id + '" title="Подсказка">?</button>' +
      '<span class="hint-body" id="' + id + '">' + content + '</span>' +
    '</span>';
  }

  /**
   * Возвращает только кнопку (без inline-обёртки). Раскрываемый блок
   * вставляется отдельно — там где нужно.
   *   Hint.btn('hint-cfg-source')
   */
  function btn(id) {
    return '<button type="button" class="hint-btn" data-hint-toggle="' + id + '" title="Подсказка">?</button>';
  }

  /**
   * Возвращает раскрываемый блок с заданным id.
   */
  function body(id, content) {
    return '<div class="hint-body" id="' + id + '">' + content + '</div>';
  }

  /**
   * Привязывает обработчики клика на все .hint-btn в контейнере.
   * Вызывать после вставки HTML в DOM.
   */
  function bind(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-hint-toggle]').forEach(b => {
      if (b._hintBound) return;
      b._hintBound = true;
      b.onclick = e => {
        e.stopPropagation();
        const id = b.dataset.hintToggle;
        const body = document.getElementById(id);
        if (!body) return;
        const isOpen = body.classList.contains('open');
        // закрываем остальные открытые в том же контейнере
        const parent = b.closest('.hint-wrap') ? b.closest('.hint-wrap').parentElement : scope;
        parent.querySelectorAll('.hint-body.open').forEach(x => {
          if (x.id !== id) x.classList.remove('open');
        });
        parent.querySelectorAll('.hint-btn.active').forEach(x => {
          if (x !== b) x.classList.remove('active');
        });
        body.classList.toggle('open', !isOpen);
        b.classList.toggle('active', !isOpen);
      };
    });
  }

  return { html, btn, body, bind };
})();