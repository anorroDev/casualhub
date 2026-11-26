// Казуал Хаб: «Хронология» — игра дня (страница games/chrono/, сервер — functions/_lib/game-chrono.js, /api/games/chrono…).
// Пять карточек — расставить по году выхода: перетаскиванием (мышью — за любое место карточки, пальцем — за ручку слева)
// или стрелками ↑/↓ (кнопки на карточке; на ручке — клавиши со стрелками). «Проверить» — одна попытка в день: у карточек
// появляются годы и отметки «на своём месте», справа — счёт из 9, верный порядок и строка «поделиться» из ■ и □.
// Вошедшему итог и опыт записывает сервер. Гость играет так же, итог хранится в этом браузере (casualhub.chrono.v1),
// а после входа сегодняшний ответ гостя уходит в аккаунт тем же порядком — новой попыткой он не становится.
// Годы приходят только с итогом; обложки (IMDb) — отдельным запросом, без них карточка показывает букву.
(() => {
  const U = window.CasualUtil || {};
  const esc = U.esc || ((s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const read = U.read || ((k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } });
  const token = () => { const u = read('ocenshik.user.v1'); return (u && (read('casualhub.tokens.v1') || {})[u.id]) || ''; };
  const T = (t) => (window.CasualLang && window.CasualLang.t ? window.CasualLang.t(t) : t);
  const lang = () => (window.CasualLang && window.CasualLang.lang) || 'ru';
  const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const view = document.getElementById('view');
  const LOCAL = 'casualhub.chrono.v1';
  const TYPE = { game: 'Игра', movie: 'Фильм', series: 'Сериал', anime: 'Аниме' };
  const ICON = {
    grip: '<svg viewBox="0 0 12 18" width="12" height="18" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.6"/><circle cx="9" cy="3" r="1.6"/><circle cx="3" cy="9" r="1.6"/><circle cx="9" cy="9" r="1.6"/><circle cx="3" cy="15" r="1.6"/><circle cx="9" cy="15" r="1.6"/></svg>',
    up: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10l4-4 4 4"/></svg>',
    down: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>',
    ok: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>',
    no: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
  };

  async function api(method, path, body) {
    const t = token();
    const r = await fetch('/api' + path, { method, cache: 'no-store', headers: { ...(t ? { authorization: 'Bearer ' + t } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || 'Не получилось, попробуй ещё раз'); e.status = r.status; throw e; }
    return d;
  }

  // ---------- гость: итоги в этом браузере ----------
  const local = () => { const v = read(LOCAL); return v && typeof v === 'object' && v.days && typeof v.days === 'object' ? v : { days: {} }; };
  function saveLocal(day, rec) {
    const v = local();
    v.days[day] = rec;
    const keys = Object.keys(v.days).sort();
    while (keys.length > 40) delete v.days[keys.shift()];
    try { localStorage.setItem(LOCAL, JSON.stringify(v)); } catch (e) {}
  }
  // записанный ответ подходит к сегодняшнему набору: те же пять карточек и годы у всех
  const fits = (rec, st) => {
    const ids = st.items.map((x) => x.id);
    return !!rec && Array.isArray(rec.order) && rec.order.length === ids.length && ids.every((id) => rec.order.includes(id))
      && !!rec.result && rec.result.years && ids.every((id) => Number.isInteger(rec.result.years[id])) && Array.isArray(rec.result.ok);
  };
  const back = (d, k) => new Date(Date.parse(d + 'T12:00:00Z') - k * 864e5).toISOString().slice(0, 10);
  // дней подряд до сегодня (если сегодня ещё не играл — до вчера), как streakOf на сервере
  function streakOf(days, today) {
    const set = new Set(days);
    let k = set.has(today) ? 0 : 1, n = 0;
    while (set.has(back(today, k))) { n++; k++; }
    return n;
  }
  function withLocal(st) {
    const days = local().days;
    const played = Object.keys(days).filter((k) => days[k] && days[k].result);
    const history = played.filter((k) => k < st.day).sort().reverse().slice(0, 7)
      .map((k) => ({ day: k, n: +days[k].n || 0, score: +days[k].result.score || 0, perfect: !!days[k].result.perfect }));
    const mine = days[st.day];
    return { ...st, result: st.result || (fits(mine, st) ? mine.result : null), history, streak: streakOf(played, st.day) };
  }

  // ---------- состояние ----------
  let S = null, order = [], covers = {}, coversDay = '', loadErr = '';
  let busy = false, msg = '', msgCls = '', copyMsg = '', fresh = false, skew = 0, tok = token(), timer = 0, first = true;
  const byId = (id) => S.items.find((x) => x.id === id);
  // название — на языке сайта, если есть английское; второй строкой — оригинал (по-русски — английское название)
  const name = (x) => (lang() !== 'ru' && x.en ? x.en : x.title);
  const alt = (x) => (lang() === 'ru' && x.en ? x.en : '');

  async function load(keep) {
    tok = token();
    try {
      let st = await api('GET', '/games/chrono');
      if (!st.signed) st = withLocal(st);
      else if (!st.result) {
        // сыграл гостем, потом вошёл: тот же ответ — в аккаунт (опыт за сегодня, если его ещё не было)
        const mine = local().days[st.day];
        if (fits(mine, st) && !mine.synced) {
          try {
            st = await api('POST', '/games/chrono', { order: mine.order, day: st.day });
            saveLocal(st.day, { ...mine, synced: true });
            if (st.saved && !st.again) { msg = 'Сегодняшний ответ сохранён в аккаунте.'; msgCls = 'ok'; }
          } catch (e) {}
        }
      }
      if (S && S.day !== st.day) { copyMsg = ''; if (!keep) msg = ''; }
      S = st;
      skew = (+S.now || Date.now()) - Date.now();
      loadErr = '';
      const ids = S.items.map((x) => x.id);
      if (!(order.length === ids.length && ids.every((id) => order.includes(id)))) order = ids;
    } catch (e) {
      loadErr = e.message;
      if (S) S.next = Date.now() + skew + 30e3; // не ответил в полночь — следующая попытка через полминуты, а не каждую секунду
    }
    paint();
    loadCovers();
  }

  // ---------- разметка ----------
  const dayText = (day) => { try { return new Date(day + 'T12:00:00Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' }); } catch (e) { return day; } };
  const label = () => (S.n >= 1 ? `Хронология №${S.n}` : 'Хронология дня');
  function art(x) {
    const u = covers[x.id];
    const ch = (String(name(x)).match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase();
    return `<span class="cr-art" data-t="${esc(x.type)}" data-art="${x.id}" aria-hidden="true">${esc(ch)}${u ? `<img src="${esc(u)}" alt="" loading="lazy" decoding="async">` : ''}</span>`;
  }
  function textOf(x, extra = '') {
    const a = alt(x);
    return `<span class="cr-txt"><b class="cr-name">${esc(name(x))}</b>${a ? `<span class="cr-alt">${esc(a)}</span>` : ''}<span class="cr-type">${esc(T(TYPE[x.type] || 'Тайтл'))}</span>${extra}</span>`;
  }
  function playItem(id, k) {
    const x = byId(id), nm = name(x);
    return `<li class="cr-item" data-id="${id}">`
      + `<button type="button" class="cr-grip" aria-label="${esc(`${T('Перетащить')}: ${nm}`)}" title="${esc(T('Перетащить'))}">${ICON.grip}</button>`
      + art(x) + textOf(x)
      + `<span class="cr-move"><button type="button" class="cr-up" aria-label="${esc(T('Выше'))}"${k === 0 ? ' disabled' : ''}>${ICON.up}</button>`
      + `<button type="button" class="cr-dn" aria-label="${esc(T('Ниже'))}"${k === order.length - 1 ? ' disabled' : ''}>${ICON.down}</button></span></li>`;
  }
  function doneItem(id, k) {
    const x = byId(id), r = S.result, ok = !!r.ok[k];
    const should = ok ? '' : `<span class="cr-should">${esc(`Верное место: ${r.right.indexOf(id) + 1}`)}</span>`;
    return `<li class="cr-item done ${ok ? 'ok' : 'no'}" data-id="${id}" style="--k:${k}">`
      + `<span class="cr-mark" role="img" aria-label="${esc(T(ok ? 'На своём месте' : 'Не на своём месте'))}">${ok ? ICON.ok : ICON.no}</span>`
      + art(x) + textOf(x, should) + `<b class="cr-year">${esc(r.years[id])}</b></li>`;
  }
  const listHTML = () => (S.result ? S.result.order.map(doneItem) : order.map(playItem)).join('');
  function board() {
    const done = !!S.result;
    const top = done
      ? `<div class="cr-top"><span class="eyebrow"><span class="dot" aria-hidden="true"></span><span>Твой порядок</span></span><span class="cr-date">${esc(label())} · ${esc(dayText(S.day))}</span></div>`
      : `<div class="cr-top"><span class="eyebrow"><span class="dot" aria-hidden="true"></span><span>${esc(label())}</span></span><span class="cr-date">${esc(dayText(S.day))}</span></div>
        <p class="cr-rule" id="crRule">Расставь по году выхода: сверху — самое старое, внизу — самое новое.</p>`;
    const acts = done ? (msg ? `<div class="cr-acts"><span class="cr-msg ${msgCls}" role="status">${esc(msg)}</span></div>` : '')
      : `<div class="cr-acts"><button type="button" class="btn primary" id="crGo"${busy ? ' disabled' : ''}>${busy ? 'Проверяю…' : 'Проверить'}</button><span class="cr-msg ${msgCls}" role="status">${esc(msg)}</span></div>`;
    return `${top}<div class="cr-edge" aria-hidden="true"><span>Раньше</span></div>`
      + `<ol class="cr-list ${done ? 'over' : 'play'}${done && fresh && !calm() ? ' reveal' : ''}" id="crList"${done ? '' : ' aria-describedby="crRule"'}>${listHTML()}</ol>`
      + `<div class="cr-edge end" aria-hidden="true"><span>Позже</span></div>${acts}<p class="vh" aria-live="polite" id="crLive"></p>`;
  }
  const guestNote = () => (S.signed ? '' : `<p class="cr-note">Войди, чтобы сохранять рекорды и получать опыт. <a href="/opinion/#login">Войти</a></p>`);
  function history() {
    const h = S.history || [];
    const streak = S.streak ? `<span class="cr-streak"><span>Дней подряд</span>: <b>${S.streak}</b></span>` : '';
    if (!h.length) return streak ? `<div class="cr-hist">${streak}</div>` : '';
    const days = h.map((x) => `<li class="${x.perfect ? 'best' : ''}" title="${esc(dayText(x.day))}"><span>${esc(x.n >= 1 ? '№' + x.n : dayText(x.day))}</span><b>${x.score}/${S.max}</b></li>`).join('');
    return `<div class="cr-hist"><div class="cr-hist-top"><h3 class="label">Прошлые дни</h3>${streak}</div><ul class="cr-days">${days}</ul></div>`;
  }
  function rules() {
    return `<h2 class="cr-h">Как играть</h2>
      <ol class="cr-how">
        <li>Перетащи карточки или двигай их стрелками: сверху — самое старое, внизу — самое новое.</li>
        <li>Нажми «Проверить». Попытка одна, завтра — новый набор.</li>
        <li>Очко за каждую карточку на своём месте и за каждую пару соседей в верном порядке — всего 9.</li>
      </ol>${guestNote()}${history()}`;
  }
  function shareLines() {
    const r = S.result;
    return [S.n >= 1 ? `Хронология №${S.n} — ${r.score}/${r.max}` : `Хронология — ${r.score}/${r.max}`, r.ok.map((x) => (x ? '■' : '□')).join(''), location.origin + '/games/chrono/'];
  }
  function result() {
    const r = S.result;
    const right = r.right.map((id, k) => { const x = byId(id); return `<li><b>${esc(r.years[id])}</b><span>${esc(name(x))}</span><i class="${r.ok[k] ? 'ok' : 'no'}" role="img" aria-label="${esc(T(r.ok[k] ? 'На своём месте' : 'Не на своём месте'))}">${r.ok[k] ? ICON.ok : ''}</i></li>`; }).join('');
    const lines = shareLines();
    return `<div class="cr-score${r.perfect ? ' best' : ''}"><b class="cr-big" aria-hidden="true">${r.score}<small>/${r.max}</small></b>
        <div class="cr-score-t"><h2 id="crScore" tabindex="-1">${esc(`Счёт: ${r.score} из ${r.max}`)}</h2><p>${esc(`На своём месте: ${r.pos} из ${r.order.length}`)}</p><p>${esc(`Соседи по порядку: ${r.pairs} из ${r.order.length - 1}`)}</p></div></div>
      ${r.perfect ? '<p class="cr-win">Без единой ошибки!</p>' : ''}
      <div><h3 class="label">Как на самом деле</h3><ol class="cr-right">${right}</ol></div>
      <div class="cr-share"><pre>${lines.map((l, k) => `<span${k === 1 ? ' class="cr-marks"' : ''}>${esc(l)}</span>`).join('\n')}</pre>
        <div class="cr-share-row"><button type="button" class="btn ghost small" data-share>Скопировать результат</button><span class="cr-msg ok" role="status">${esc(copyMsg)}</span></div></div>
      <p class="cr-next"><span>Следующая — через</span> <b id="crNext">${esc(left())}</b></p>
      ${guestNote()}${history()}`;
  }
  function paint() {
    if (!S) {
      view.innerHTML = `<div class="cr-grid"><section class="card cr-board">${loadErr
        ? `<div class="cr-empty"><p>${esc(loadErr)}</p><button type="button" class="btn ghost small" data-retry>Попробовать ещё раз</button></div>`
        : '<p class="cr-empty">Загружаю…</p>'}</section></div>`;
      return;
    }
    if (first && !calm()) {
      document.documentElement.classList.add('intro');
      setTimeout(() => document.documentElement.classList.remove('intro'), 1400);
    }
    first = false;
    view.innerHTML = `<div class="cr-grid"><section class="card cr-board">${board()}</section><aside class="card cr-side">${S.result ? result() : rules()}</aside></div>`;
    tick();
  }
  function paintActs() {
    const go = document.getElementById('crGo');
    if (go) { go.disabled = busy; go.textContent = T(busy ? 'Проверяю…' : 'Проверить'); }
    const m = view.querySelector('.cr-board .cr-msg');
    if (m) { m.className = 'cr-msg ' + msgCls; m.textContent = msg; }
  }

  // ---------- до новой «Хронологии» ----------
  function left() {
    if (!S) return '';
    const ms = Math.max(0, S.next - (Date.now() + skew)), s = Math.floor(ms / 1000);
    const p = (v) => String(v).padStart(2, '0');
    return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
  }
  function tick() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (!S) return;
      if (Date.now() + skew >= S.next) { clearInterval(timer); if (!drag) load(); else S.next = Date.now() + skew + 5e3; return; }
      const el = document.getElementById('crNext');
      if (el) el.textContent = left();
    }, 1000);
  }

  // ---------- обложки: один запрос на день; не ответил — до следующей загрузки без них ----------
  async function loadCovers() {
    if (!S || coversDay === S.day) { applyCovers(); return; }
    coversDay = S.day;
    try { const d = await api('GET', '/games/chrono/covers'); if (S && d.day === S.day) covers = d.covers || {}; } catch (e) { return; }
    applyCovers();
  }
  function applyCovers() {
    view.querySelectorAll('.cr-art[data-art]').forEach((el) => {
      const u = covers[el.dataset.art];
      if (!u || el.querySelector('img')) return;
      const img = document.createElement('img');
      img.alt = ''; img.decoding = 'async'; img.loading = 'lazy'; img.src = u;
      el.appendChild(img);
    });
  }
  // картинка не загрузилась — остаётся буква
  view.addEventListener('error', (e) => { if (e.target && e.target.tagName === 'IMG' && e.target.closest('.cr-art')) e.target.remove(); }, true);

  // ---------- перестановка ----------
  const live = (t) => { const el = document.getElementById('crLive'); if (el) el.textContent = t; };
  const say = (id) => { const x = byId(id); if (x) live(`${name(x)} — место ${order.indexOf(id) + 1} из ${order.length}`); };
  const tops = () => { const m = new Map(); view.querySelectorAll('#crList .cr-item').forEach((el) => m.set(el.dataset.id, el.getBoundingClientRect().top)); return m; };
  // карточки переезжают на новые места плавно: с того места, где были видны (FLIP)
  function renderList(was) {
    const list = document.getElementById('crList');
    if (!list) return;
    list.innerHTML = listHTML();
    if (!was || calm()) return;
    list.querySelectorAll('.cr-item').forEach((el) => {
      const a = was.get(el.dataset.id);
      if (a == null || !el.animate) return;
      const dy = a - el.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    });
  }
  const snd = (n, p) => { if (window.CasualSound) window.CasualSound.play(n, p); }; // звуки — /games/sound.js
  function move(id, dir, focus) {
    const k = order.indexOf(id), j = k + dir;
    if (k < 0 || j < 0 || j >= order.length || S.result || busy) return;
    snd('tap');
    const was = tops();
    [order[k], order[j]] = [order[j], order[k]];
    renderList(was);
    const li = view.querySelector(`#crList .cr-item[data-id="${id}"]`);
    let f = li && li.querySelector(focus);
    if (f && f.disabled) f = li.querySelector(focus === '.cr-up' ? '.cr-dn' : '.cr-up');
    if (f) f.focus();
    say(id);
  }

  // перетаскивание: мышью — за любое место карточки (после сдвига на 5 px, чтобы клики по кнопкам оставались кликами),
  // пальцем — за ручку слева (на ней touch-action: none), иначе палец прокручивает страницу. Координаты — пиксели страницы:
  // при размере интерфейса не 100 % их подменяет util.js (sizeShim), делить ничего не нужно
  let drag = null;
  view.addEventListener('pointerdown', (e) => {
    if (!S || S.result || busy || drag || (e.button !== undefined && e.button !== 0)) return;
    const li = e.target.closest('#crList .cr-item');
    if (!li) return;
    const grip = e.target.closest('.cr-grip');
    if (!grip && (e.pointerType === 'touch' || e.target.closest('button, a'))) return;
    drag = { li, id: +li.dataset.id, pid: e.pointerId, x0: e.clientX, y0: e.clientY, sy0: scrollY, y: e.clientY, on: false, raf: 0 };
    try { li.setPointerCapture(e.pointerId); } catch (x) {}
    if (!grip) e.preventDefault();
  });
  view.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    drag.y = e.clientY;
    if (!drag.on) {
      if (Math.abs(e.clientY - drag.y0) < 5 && Math.abs(e.clientX - drag.x0) < 5) return;
      lift();
    }
    e.preventDefault();
    place();
  }, { passive: false });
  const drop = (e) => { if (drag && (!e || e.pointerId === drag.pid)) settle(); };
  view.addEventListener('pointerup', drop);
  view.addEventListener('pointercancel', drop);
  view.addEventListener('lostpointercapture', drop);
  function lift() {
    const list = drag.li.parentElement, items = [...list.children];
    drag.list = list; drag.items = items;
    drag.from = items.indexOf(drag.li); drag.to = drag.from;
    drag.boxes = items.map((el) => { const r = el.getBoundingClientRect(); return { top: r.top + scrollY, h: r.height }; });
    drag.gap = items.length > 1 ? Math.max(0, drag.boxes[1].top - drag.boxes[0].top - drag.boxes[0].h) : 8;
    drag.on = true;
    drag.li.classList.add('lift');
    list.classList.add('sorting');
    document.documentElement.classList.add('cr-dragging');
    const edge = () => {
      if (!drag || !drag.on) return;
      // у края окна страница сама едет дальше
      const z = 56, v = drag.y < z ? -Math.ceil((z - drag.y) / 5) : drag.y > innerHeight - z ? Math.ceil((drag.y - innerHeight + z) / 5) : 0;
      if (v) { const was = scrollY; scrollBy(0, v); if (scrollY !== was) place(); }
      drag.raf = requestAnimationFrame(edge);
    };
    drag.raf = requestAnimationFrame(edge);
  }
  function place() {
    const b = drag.boxes, from = drag.from, me = b[from], last = b[b.length - 1];
    let dy = drag.y + scrollY - (drag.y0 + drag.sy0);
    dy = Math.max(b[0].top - me.top - 16, Math.min(last.top + last.h - me.top - me.h + 16, dy));
    drag.li.style.transform = `translateY(${dy}px)`;
    const mid = me.top + me.h / 2 + dy;
    let to = 0;
    b.forEach((x, k) => { if (k !== from && x.top + x.h / 2 < mid) to++; });
    if (to !== drag.to) { drag.to = to; live(`${name(byId(drag.id))} — место ${to + 1} из ${order.length}`); }
    const shift = me.h + drag.gap;
    drag.items.forEach((el, k) => {
      if (k === from) return;
      const s = from < to && k > from && k <= to ? -shift : to < from && k >= to && k < from ? shift : 0;
      el.style.transform = s ? `translateY(${s}px)` : '';
    });
  }
  function settle() {
    const d = drag;
    drag = null;
    cancelAnimationFrame(d.raf);
    document.documentElement.classList.remove('cr-dragging');
    if (!d.on) return;
    const was = tops();
    d.li.classList.remove('lift');
    d.list.classList.remove('sorting');
    if (d.to !== d.from) { order.splice(d.from, 1); order.splice(d.to, 0, d.id); }
    renderList(was);
    const g = view.querySelector(`#crList .cr-item[data-id="${d.id}"] .cr-grip`);
    if (g && document.activeElement && document.activeElement.closest && document.activeElement.closest('.cr-grip')) g.focus();
  }

  // ---------- ответ ----------
  async function check() {
    if (busy || !S || S.result) return;
    busy = true; msg = ''; msgCls = '';
    paintActs();
    try {
      let r = await api('POST', '/games/chrono', { order, day: S.day });
      if (!r.signed) { saveLocal(r.day, { n: r.n, order: r.result.order, result: r.result, at: Date.now() }); r = withLocal(r); }
      S = r;
      fresh = !r.again;
      if (r.again) { msg = 'Сегодня ты уже отвечал — вот твой итог.'; msgCls = ''; }
    } catch (e) {
      busy = false;
      // наступил новый день (часы на устройстве отстают): сразу показываем новый набор
      if (e.status === 409) { msg = 'Наступил новый день — вот новая «Хронология».'; msgCls = ''; await load(true); return; }
      msg = e.message; msgCls = 'err';
      paintActs();
      return;
    }
    busy = false;
    paint();
    if (fresh) snd(S.result.perfect ? 'win' : S.result.score * 2 >= S.result.max ? 'good' : 'bad');
    // кнопки «Проверить» больше нет: фокус — на счёт (экранный диктор прочтёт итог), страница не прыгает
    const sc = document.getElementById('crScore');
    if (sc) sc.focus({ preventScroll: true });
    if (fresh && S.result.perfect) celebrate();
    fresh = false;
  }
  function celebrate() {
    if (calm() || !U.confetti) return;
    const box = view.querySelector('.cr-board') || view, r = box.getBoundingClientRect();
    const cv = document.createElement('canvas');
    cv.className = 'cr-fx';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    const cs = getComputedStyle(document.documentElement), v = (n) => cs.getPropertyValue(n).trim();
    let stop = null;
    try { stop = U.confetti(cv, { x: r.left + r.width / 2, y: Math.min(innerHeight - 40, Math.max(40, r.top + 120)), colors: [v('--accent'), v('--good'), v('--mid'), v('--bad'), '#F2C230'].filter(Boolean), count: 160 }); } catch (e) {}
    setTimeout(() => { try { if (stop) stop(); } catch (e) {} cv.remove(); }, 6000);
  }
  async function share() {
    const text = shareLines().join('\n');
    try { await navigator.clipboard.writeText(text); copyMsg = 'Скопировано'; }
    catch (e) {
      copyMsg = '';
      const pre = view.querySelector('.cr-share pre');
      if (pre && getSelection) { const rg = document.createRange(); rg.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); }
    }
    const m = view.querySelector('.cr-share .cr-msg');
    if (m) m.textContent = copyMsg;
  }

  view.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const li = b.closest('#crList .cr-item'), id = li ? +li.dataset.id : null;
    if (b.matches('.cr-up')) move(id, -1, '.cr-up');
    else if (b.matches('.cr-dn')) move(id, 1, '.cr-dn');
    else if (b.id === 'crGo') check();
    else if (b.matches('[data-share]')) share();
    else if (b.matches('[data-retry]')) { loadErr = ''; paint(); load(); }
  });
  view.addEventListener('keydown', (e) => {
    const g = e.target.closest && e.target.closest('.cr-grip');
    if (!g || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    move(+g.closest('.cr-item').dataset.id, e.key === 'ArrowUp' ? -1 : 1, '.cr-grip');
  });

  // вошёл или вышел (в этой вкладке или в соседней) — набор и итог под новый вход; гость сыграл в соседней вкладке — тоже
  document.addEventListener('casualhub:auth', () => { if (token() !== tok) load(); });
  addEventListener('storage', (e) => {
    if ((e.key === 'ocenshik.user.v1' || e.key === 'casualhub.tokens.v1') && token() !== tok) load();
    else if (e.key === LOCAL && S && !S.signed && !S.result) load();
  });
  // вернулся на вкладку на следующий день — новый набор
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S && Date.now() + skew >= S.next && !drag) load(); });

  // заголовок по буквам — как на других страницах режимов (стили .title .ch — в index.html)
  (() => {
    const title = document.getElementById('crTitle');
    if (!title || calm()) return;
    const text = title.textContent.trim();
    let i = 0;
    title.setAttribute('aria-label', text);
    title.innerHTML = text.split(' ').map((w) => `<span class="w" aria-hidden="true">${[...w].map((c) => `<span class="ch" style="--i:${i++}">${esc(c)}</span>`).join('')}</span>`).join(' ');
  })();
  load();
})();
