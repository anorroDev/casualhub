/* Казуал Хаб: общие мелочи для скриптов страниц. Подключается первым на каждой странице, раньше остальных скриптов.
   Раньше каждый файл объявлял их у себя; теперь берёт отсюда: const esc = window.CasualUtil.esc.
   esc(v)                    — текст для вставки в разметку (& < > " ' экранируются; null и undefined — пустая строка)
   read(key)                 — JSON из localStorage или null, если ключа нет или он испорчен
   plural(n, one, few, many) — нужная форма слова: 1 оценка, 2 оценки, 5 оценок */
(() => {
  if (window.CasualUtil) return;
  const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => MAP[c]);
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
  window.CasualUtil = Object.freeze({ esc, read, plural });
})();
