/* Казуал Хаб: «Свой тир-лист». Окно, где оценки раскладываются по рядам S–D вручную, а не по баллу.
   Мышью — перетаскиванием, на телефоне — нажатием: выбрал карточку, потом ряд (или карточку, перед которой поставить).
   Расстановка хранится в этом браузере, отдельно для своих оценок и для каждого друга.
   CasualTierMaker.open({ scope, title, items: [{ id, name, total, img }], png? })
   img — адрес картинки или функция, которая возвращает Promise с адресом; png(buckets) — картинка тир-листа (есть в Мнении). */
(() => {
  const KEY = 'casualhub.tiermaker.v1';
  const TIERS = [
    { id: 'S', col: '#43C97A' }, { id: 'A', col: '#9BCF4E' }, { id: 'B', col: '#F2BA44' },
    { id: 'C', col: '#F28E4C' }, { id: 'D', col: '#F26A55' },
  ];
  const AUTO = { S: 9.2, A: 8.2, B: 7, C: 5, D: -Infinity }; // «По баллам» — как в обычном тир-листе
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const readAll = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
  const keep = () => { try { const all = readAll(); all[S.scope] = { rows: S.rows, at: Date.now() }; localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) {} };

  const touch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches); // на телефоне карточки ставятся нажатиями
  const S = { scope: '', title: '', items: new Map(), rows: {}, sel: '', png: null };
  let sheet = null, drag = null;

  function css() {
    const st = document.createElement('style');
    st.textContent = `
.tm-sheet { position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; padding: 16px; background: rgba(8, 10, 14, .62); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.tm-sheet[hidden] { display: none; }
.tm-card { width: min(980px, 100%); max-height: calc(100dvh - 32px); display: grid; grid-template-rows: auto auto minmax(0, 1fr); gap: 12px; padding: 18px; border: 1px solid var(--line, #2b2e38); border-radius: 20px; background: var(--panel, #1b1d24); color: var(--ink, #f3f4f6); box-shadow: 0 30px 80px -30px rgba(0, 0, 0, .7); }
.tm-head { display: flex; align-items: center; gap: 10px; }
.tm-head h3 { margin: 0; flex: 1; min-width: 0; font-size: 18px; }
.tm-x { flex: none; width: 36px; height: 36px; border: 1px solid var(--line, #2b2e38); border-radius: 50%; background: transparent; color: inherit; font-size: 15px; cursor: pointer; }
.tm-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.tm-tools button { height: 34px; padding: 0 12px; border: 1px solid var(--line, #2b2e38); border-radius: 999px; background: var(--panel-2, #23262f); color: var(--ink, #f3f4f6); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.tm-tools button:hover { border-color: var(--accent, #3550E8); }
.tm-tools .tm-hint { flex: 1 1 220px; margin: 0; font-size: 12.5px; color: var(--ink-3, #8b8f9c); }
.tm-body { overflow: auto; display: grid; gap: 8px; align-content: start; padding-right: 2px; }
.tm-row { display: grid; grid-template-columns: 60px minmax(0, 1fr); min-height: 86px; border: 1px solid var(--line, #2b2e38); border-radius: 14px; overflow: hidden; background: var(--panel-2, #23262f); transition: border-color .15s, box-shadow .15s; }
.tm-row.over, .tm-sheet.picking .tm-row:hover { border-color: var(--accent, #3550E8); box-shadow: inset 0 0 0 1px var(--accent, #3550E8); }
.tm-lab { display: grid; place-items: center; color: #0D0F14; font-weight: 800; font-size: 30px; font-family: var(--font-display, inherit); }
.tm-items { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 6px; padding: 6px; min-height: 74px; }
.tm-row.tm-pool { border-style: dashed; grid-template-columns: minmax(0, 1fr); }
.tm-pool .tm-items { min-height: 90px; }
.tm-pool-t { padding: 8px 10px 0; font-size: 12.5px; font-weight: 700; color: var(--ink-2, #b9bdc8); }
.tm-it { position: relative; flex: none; width: 64px; display: grid; gap: 3px; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: center; cursor: grab; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
.tm-it .tm-pic { width: 64px; height: 64px; border-radius: 10px; overflow: hidden; display: grid; place-items: center; background: var(--panel, #1b1d24); border: 1px solid var(--line, #2b2e38); font-weight: 800; font-size: 26px; color: var(--ink-3, #8b8f9c); }
.tm-it img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
.tm-it small { font-size: 10.5px; line-height: 1.15; color: var(--ink-2, #b9bdc8); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
.tm-it b { position: absolute; right: 3px; top: 47px; padding: 1px 5px; border-radius: 6px; background: rgba(13, 15, 20, .82); font-size: 11px; color: #fff; }
.tm-it.sel .tm-pic { outline: 3px solid var(--accent, #3550E8); outline-offset: 1px; }
.tm-it.ghost-src { opacity: .35; }
.tm-ghost { position: fixed; z-index: 130; width: 64px; pointer-events: none; transform: translate(-50%, -60%) rotate(-4deg); filter: drop-shadow(0 10px 18px rgba(0, 0, 0, .5)); }
.tm-empty { align-self: center; padding: 0 6px; font-size: 12.5px; color: var(--ink-3, #8b8f9c); }
@media (max-width: 560px) {
  .tm-sheet { padding: 0; place-items: stretch; }
  .tm-card { max-height: none; height: 100dvh; border-radius: 0; padding: 14px 12px; }
  .tm-row { grid-template-columns: 44px minmax(0, 1fr); min-height: 74px; }
  .tm-lab { font-size: 24px; }
  .tm-it, .tm-it .tm-pic { width: 54px; }
  .tm-it .tm-pic { height: 54px; }
  .tm-it b { top: 38px; }
}`;
    document.head.appendChild(st);
  }

  function ensure() {
    if (sheet) return;
    css();
    sheet = document.createElement('div');
    sheet.className = 'tm-sheet';
    sheet.hidden = true;
    sheet.innerHTML = `<div class="tm-card" role="dialog" aria-modal="true" aria-labelledby="tmTitle">
      <div class="tm-head"><h3 id="tmTitle">Свой тир-лист</h3><button type="button" class="tm-x" data-tm="close" aria-label="Закрыть">✕</button></div>
      <div class="tm-tools"></div>
      <div class="tm-body"></div></div>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', onClick);
    sheet.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', (e) => {
      if (sheet.hidden) return;
      if (e.key === 'Escape') { if (S.sel) { S.sel = ''; paint(); } else close(); }
    });
  }

  // где лежит карточка: ряд S–D или '' (не распределена)
  function moveTo(id, tier, beforeId) {
    TIERS.forEach((t) => { S.rows[t.id] = (S.rows[t.id] || []).filter((x) => x !== id); });
    if (tier) {
      const list = S.rows[tier];
      const at = beforeId ? list.indexOf(beforeId) : -1;
      if (at >= 0) list.splice(at, 0, id); else list.push(id);
    }
    keep();
  }

  function itemHTML(id) {
    const it = S.items.get(id);
    return `<button type="button" class="tm-it${S.sel === id ? ' sel' : ''}" data-id="${esc(id)}" title="${esc(it.name)}${it.total != null ? ' · ' + String(it.total).replace('.', ',') : ''}">
      <span class="tm-pic" data-img="${esc(id)}">${esc([...String(it.name).trim()][0] || '?')}</span>${it.total != null ? `<b>${String(it.total).replace('.', ',')}</b>` : ''}<small>${esc(it.name)}</small></button>`;
  }
  function paint() {
    const placed = new Set(TIERS.flatMap((t) => S.rows[t.id] || []));
    const pool = [...S.items.keys()].filter((id) => !placed.has(id));
    const shown = (t) => (S.rows[t.id] || []).filter((id) => S.items.has(id));
    sheet.querySelector('#tmTitle').textContent = S.title;
    sheet.classList.toggle('picking', !!S.sel);
    sheet.querySelector('.tm-tools').innerHTML = `<button type="button" data-tm="auto">По баллам</button><button type="button" data-tm="clear">Всё убрать</button>${S.png ? '<button type="button" data-tm="png">Скачать PNG</button>' : ''}
      <p class="tm-hint">${S.sel ? 'Теперь нажми на ряд — или на карточку, перед которой поставить. Нажми на нижний блок, чтобы убрать из рядов.' : (touch ? 'Нажми на карточку, а потом на ряд. Всё сохраняется само.' : 'Перетаскивай карточки по рядам или нажми на карточку, а потом на ряд. Всё сохраняется само.')}</p>`;
    sheet.querySelector('.tm-body').innerHTML = TIERS.map((t) => `<div class="tm-row" data-row="${t.id}"><div class="tm-lab" style="background:${t.col}">${t.id}</div>
        <div class="tm-items">${shown(t).map(itemHTML).join('') || `<span class="tm-empty">${touch ? 'пусто' : 'перетащи сюда'}</span>`}</div></div>`).join('')
      + `<div class="tm-row tm-pool" data-row=""><div><div class="tm-pool-t">Без места · ${pool.length}</div><div class="tm-items">${pool.map(itemHTML).join('') || '<span class="tm-empty">Все разложены 👌</span>'}</div></div></div>`;
    hydrate();
  }
  const imgCache = new Map();
  function hydrate() {
    sheet.querySelectorAll('[data-img]').forEach((n) => {
      const id = n.dataset.img, it = S.items.get(id);
      if (!it || !it.img) return;
      if (!imgCache.has(id)) imgCache.set(id, Promise.resolve(typeof it.img === 'function' ? it.img() : it.img).catch(() => null));
      imgCache.get(id).then((src) => {
        if (!src || !n.isConnected) return;
        const img = new Image(); img.alt = ''; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
        img.onload = () => { if (n.isConnected) { n.textContent = ''; n.appendChild(img); } };
        img.src = src;
      });
    });
  }

  function onClick(e) {
    if (drag && drag.moved) return;
    if (e.target === sheet) return close();
    const b = e.target.closest('[data-tm]');
    if (b) {
      const a = b.dataset.tm;
      if (a === 'close') return close();
      if (a === 'auto') {
        TIERS.forEach((t) => { S.rows[t.id] = []; });
        [...S.items.values()].filter((it) => it.total != null).sort((x, y) => y.total - x.total)
          .forEach((it) => { const t = TIERS.find((x) => it.total >= AUTO[x.id]); S.rows[t.id].push(it.id); });
        keep(); S.sel = ''; paint(); return;
      }
      if (a === 'clear') { TIERS.forEach((t) => { S.rows[t.id] = (S.rows[t.id] || []).filter((id) => !S.items.has(id)); }); keep(); S.sel = ''; paint(); return; }
      if (a === 'png') {
        b.disabled = true;
        Promise.resolve(S.png(buckets())).finally(() => { b.disabled = false; });
        return;
      }
    }
    const it = e.target.closest('.tm-it');
    // выбрана карточка: нажатие на другую карточку ставит перед ней, на ряд — в конец ряда
    if (S.sel) {
      if (it && it.dataset.id === S.sel) { S.sel = ''; paint(); return; }
      const row = e.target.closest('[data-row]');
      if (row) {
        moveTo(S.sel, row.dataset.row, it ? it.dataset.id : '');
        S.sel = '';
        paint();
        return;
      }
    }
    if (it) { S.sel = it.dataset.id; paint(); }
  }

  // перетаскивание мышью (и пером); пальцем — нажатиями, чтобы список можно было листать
  function onDown(e) {
    const it = e.target.closest('.tm-it');
    if (!it || e.button > 0 || e.pointerType === 'touch') return;
    drag = { id: it.dataset.id, x: e.clientX, y: e.clientY, moved: false, src: it, ghost: null, over: null };
    const move = (ev) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 6) return;
      if (!drag.moved) {
        drag.moved = true;
        S.sel = '';
        drag.ghost = drag.src.cloneNode(true);
        drag.ghost.className = 'tm-it tm-ghost';
        document.body.appendChild(drag.ghost);
        drag.src.classList.add('ghost-src');
      }
      drag.ghost.style.left = ev.clientX + 'px';
      drag.ghost.style.top = ev.clientY + 'px';
      const row = document.elementFromPoint(ev.clientX, ev.clientY);
      const r = row && row.closest('.tm-sheet [data-row]');
      if (drag.over !== r) { if (drag.over) drag.over.classList.remove('over'); drag.over = r; if (r) r.classList.add('over'); }
      // у краёв окна список прокручивается сам
      const body = sheet.querySelector('.tm-body'), bx = body.getBoundingClientRect();
      if (ev.clientY < bx.top + 40) body.scrollTop -= 12; else if (ev.clientY > bx.bottom - 40) body.scrollTop += 12;
    };
    const up = (ev) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      const d = drag;
      if (!d) return;
      if (d.moved) {
        if (d.ghost) d.ghost.remove();
        if (d.over) d.over.classList.remove('over');
        const hit = ev.type === 'pointerup' ? document.elementFromPoint(ev.clientX, ev.clientY) : null;
        const row = hit && hit.closest('.tm-sheet [data-row]');
        const before = hit && hit.closest('.tm-it');
        if (row) moveTo(d.id, row.dataset.row, before && before.dataset.id !== d.id ? before.dataset.id : '');
        paint();
        setTimeout(() => { drag = null; }, 0); // клик после перетаскивания не считаем выбором
      } else drag = null;
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  }

  const buckets = () => TIERS.map((t) => ({ t: { id: t.id, col: t.col, range: '' }, items: (S.rows[t.id] || []).filter((id) => S.items.has(id)).map((id) => S.items.get(id).ref || S.items.get(id)) }));

  function open(o) {
    ensure();
    S.scope = String(o.scope || 'me');
    S.title = o.title || 'Свой тир-лист';
    S.items = new Map((o.items || []).map((it) => [it.id, it]));
    S.png = typeof o.png === 'function' ? o.png : null;
    S.sel = '';
    const saved = readAll()[S.scope];
    S.rows = {};
    TIERS.forEach((t) => { S.rows[t.id] = saved && saved.rows && Array.isArray(saved.rows[t.id]) ? saved.rows[t.id].filter((x) => typeof x === 'string') : []; });
    imgCache.clear();
    sheet.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    paint();
  }
  function close() {
    if (!sheet) return;
    sheet.hidden = true;
    document.documentElement.style.overflow = '';
    S.sel = '';
  }
  window.CasualTierMaker = { open, close };
})();
