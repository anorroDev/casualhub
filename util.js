/* Казуал Хаб: общие мелочи для скриптов страниц. Подключается первым на каждой странице, раньше остальных скриптов.
   Раньше каждый файл объявлял их у себя; теперь берёт отсюда: const esc = window.CasualUtil.esc.
   esc(v)                    — текст для вставки в разметку (& < > " ' экранируются; null и undefined — пустая строка)
   read(key)                 — JSON из localStorage или null, если ключа нет или он испорчен
   plural(n, one, few, many) — нужная форма слова: 1 оценка, 2 оценки, 5 оценок
   script(src, ready)        — подгрузить скрипт один раз: Promise, который выполнится, когда ready() вернёт правду.
                               Второй, кто попросит тот же скрипт, дождётся того же тега, а не останется ни с чем */
(() => {
  if (window.CasualUtil) return;
  const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => MAP[c]);
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
  const loading = new Map();
  const script = (src, ready) => {
    if (ready && ready()) return Promise.resolve();
    if (!loading.has(src)) {
      loading.set(src, new Promise((resolve, reject) => {
        let sc = [...document.scripts].find((s) => s.getAttribute('src') === src);
        if (!sc) { sc = document.createElement('script'); sc.src = src; document.head.appendChild(sc); }
        sc.addEventListener('load', () => resolve(), { once: true });
        sc.addEventListener('error', () => { loading.delete(src); reject(new Error('не загрузился ' + src)); }, { once: true });
        // тег уже был и успел загрузиться раньше, чем мы подписались: тогда его событие load мы пропустили
        if (ready) { const t0 = Date.now(), check = () => { if (ready()) resolve(); else if (Date.now() - t0 < 15e3) setTimeout(check, 100); }; setTimeout(check, 100); }
      }));
    }
    return loading.get(src);
  };
  window.CasualUtil = Object.freeze({ esc, read, plural, script });
})();
