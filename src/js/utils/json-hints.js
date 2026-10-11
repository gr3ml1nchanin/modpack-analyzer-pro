window.JsonHints = (function () {
  function infer(key, value) {
    const k = String(key || '').toLowerCase();
    const t = typeof value;

    if (t === 'boolean') return { kind: 'bool' };

    if (t === 'number') {
      // Шансы / доли / множители
      if (/chance|probab|rate|ratio|factor|multiplier|percent|percentage/.test(k)) {
        if (value >= 0 && value <= 1) return { kind: 'slider', min: 0, max: 1, step: 0.01, hint: '0..1' };
        return { kind: 'slider', min: 0, max: 100, step: 1, hint: '0..100%' };
      }
      // Вес (обычно целый)
      if (/weight|priority|tier|level|rank/.test(k)) return { kind: 'number', step: 1, hint: 'целое' };
      // Радиус / дистанция / размер
      if (/radius|distance|range|size|scale/.test(k)) return { kind: 'number', step: 0.1 };
      // Время (в тиках)
      if (/time|duration|delay|interval|cooldown|ticks?|period/.test(k)) return { kind: 'number', step: 1, hint: 'тики (20 = 1 сек)' };
      // Цвета
      if (/color|colour|hex|rgb/.test(k)) return { kind: 'color' };
      // Количество
      if (/count|amount|quantity|limit|max|min/.test(k)) return { kind: 'number', step: 1 };
      return { kind: 'number' };
    }

    if (t === 'string') {
      // Уже hex-цвет
      if (/^#[0-9a-f]{6}$/i.test(value) || /^#[0-9a-f]{8}$/i.test(value)) return { kind: 'color' };
      if (/color|colour|hex/i.test(k)) return { kind: 'color' };

      // Registry ID (namespace:path)
      if (/^[a-z0-9_\-]+:[a-z0-9_\-\/\.]+$/i.test(value)) return { kind: 'registry' };

      // Явно похоже на id / reference
      if (/^(id|key|ref|target|source|parent|type|mode|biome|dimension|entity|item|block|effect|sound|structure|recipe|tag|namespace)/.test(k) ||
          /(id|biome|dimension|entity|item|block|effect|sound|structure|recipe|tag|namespace)$/.test(k)) {
        return { kind: 'registry' };
      }

      if (/password|secret|token|apikey/.test(k)) return { kind: 'password' };
      if (value.length > 60) return { kind: 'textarea' };
      return { kind: 'text' };
    }

    return { kind: 'text' };
  }

  return { infer };
})();