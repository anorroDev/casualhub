// Казуал Хаб: «Тир-лист вместе» (сервер — functions/_lib/tiercoop.js). Кнопка «Вместе» в редакторе тир-листа
// открывает комнату по ссылке /tierlist/?coop=<код>: каждый раскладывает элементы сам, все видят средний тир-лист.
(() => {
  const U = window.CasualUtil || {};
  const esc = U.esc || ((s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const token = () => { const u = read('ocenshik.user.v1'); return (u && (read('casualhub.tokens.v1') || {})[u.id]) || ''; };
  const T = (t) => (window.CasualLang && window.CasualLang.t ? window.CasualLang.t(t) : t);
  async function api(method, path, body) {
    const t = token();
    const r = await fetch('/api' + path, { method, cache: 'no-store', headers: { ...(t ? { authorization: 'Bearer ' + t } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Не получилось, попробуй ещё раз');
    return d;
  }
  const css = document.createElement('style');
  css.textContent = `
.tc-ov { position: fixed; inset: 0; z-index: 124; display: grid; place-items: center; padding: max(14px, env(safe-area-inset-top)) 14px 14px; background: rgb(0 0 0 / .55); animation: tc-fade .16s ease-out; }
@keyframes tc-fade { from { opacity: 0; } }
.tc-card { width: min(980px, 100%); max-height: 100%; overflow-y: auto; padding: 20px; border: 1px solid var(--line, #2b2e38); border-radius: 22px; background: var(--panel, #17181c); color: var(--ink, #f2f2f2); animation: tc-in .22s cubic-bezier(.2, .8, .2, 1); }
@keyframes tc-in { from { opacity: 0; transform: translateY(8px) scale(.985); } }
.tc-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.tc-head h2 { margin: 0; font-size: 21px; }
.tc-head small { display: block; margin-top: 2px; font-size: 12.5px; color: var(--ink-2, #b8bcc8); }
.tc-acts { display: flex; flex-wrap: wrap; gap: 6px; }
.tc-btn { height: 34px; padding: 0 12px; border: 1px solid var(--line, #2b2e38); border-radius: 10px; background: var(--panel, #17181c); color: inherit; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.tc-btn[aria-pressed="true"] { border-color: var(--accent, #5B74FF); background: color-mix(in srgb, var(--accent, #5B74FF) 14%, var(--panel, #17181c)); }
.tc-rows { display: grid; gap: 6px; margin-top: 10px; }
.tc-row { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 6px; min-height: 64px; }
.tc-lab { display: grid; place-items: center; border: 0; border-radius: 10px; font: inherit; font-size: 18px; font-weight: 900; color: #14161C; cursor: pointer; overflow-wrap: anywhere; padding: 4px; }
.tc-lab:disabled { cursor: default; }
.tc-its { display: flex; flex-wrap: wrap; gap: 6px; align-content: flex-start; padding: 6px; border-radius: 10px; background: color-mix(in srgb, var(--ink, #fff) 4%, transparent); }
.tc-it { position: relative; display: grid; place-items: center; width: 64px; height: 64px; padding: 2px; border: 2px solid transparent; border-radius: 10px; background: var(--panel-2, #20232c); color: inherit; font: inherit; font-size: 11px; line-height: 1.15; text-align: center; overflow: hidden; overflow-wrap: anywhere; cursor: pointer; transition: border-color .16s, transform .16s cubic-bezier(.2, .8, .2, 1); }
.tc-it img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.tc-it span { position: relative; padding: 1px 3px; border-radius: 4px; background: rgb(0 0 0 / .55); color: #fff; }
.tc-it.sel { border-color: var(--accent, #5B74FF); transform: translateY(-2px); }
.tc-it em { position: absolute; right: 2px; top: 2px; padding: 0 4px; border-radius: 6px; background: rgb(0 0 0 / .65); color: #fff; font-style: normal; font-size: 10px; font-weight: 800; }
.tc-it.hot { box-shadow: inset 0 0 0 2px #E5534B; }
.tc-pool { margin-top: 10px; }
.tc-pool h3 { margin: 0 0 6px; font-size: 13px; color: var(--ink-2, #b8bcc8); }
.tc-note { margin: 10px 0 0; font-size: 13px; color: var(--ink-2, #b8bcc8); }
.tc-msg { margin: 8px 0 0; font-size: 13px; font-weight: 600; color: #E5534B; }
@media (max-width: 520px) { .tc-row { grid-template-columns: 48px minmax(0, 1fr); } .tc-it { width: 54px; height: 54px; } }
@media (prefers-reduced-motion: reduce) { .tc-ov, .tc-card { animation: none; } .tc-it { transition: none; } }
html.unslop:not([data-ui]) :is(.tc-ov, .tc-card) { animation: none; }
`;
  document.head.appendChild(css);

  // ---------- создать комнату из тир-листа редактора ----------
  // что комната возьмёт из тир-листа — те же правила, что у cleanRoom на сервере (TC в functions/_lib/tiercoop.js, сверяет
  // tests/tiercoop.test.mjs): не больше ITEMS карточек и ROWS рядов, одинаковые названия — одна карточка, а картинка
  // с устройства становится текстом (в комнате только ссылки на картинки — стикеры)
  const ROOM = { ROWS: 10, ITEMS: 60, NAME: 60 };
  const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  function plan(l) {
    const all = [...l.rows.flatMap((r) => r.items), ...(l.pool || [])];
    const seen = new Set(), items = [], cut = { over: 0, same: 0, pics: 0, rows: Math.max(0, l.rows.length - ROOM.ROWS) };
    all.forEach((id, k) => {
      const it = l.items[id] || {}, n = clean(it.name, ROOM.NAME) || `${T('Элемент')} ${k + 1}`;
      if (items.length >= ROOM.ITEMS) { cut.over += 1; return; }
      if (seen.has(n.toLowerCase())) { cut.same += 1; return; }
      seen.add(n.toLowerCase());
      items.push({ n, img: it.kind === 'url' ? it.src : '' });
      if (it.kind === 'img') cut.pics += 1;
    });
    return { rows: l.rows.slice(0, ROOM.ROWS).map((r) => ({ t: r.label, c: r.color })), items, cut };
  }
  async function create(l) {
    const p = plan(l), c = p.cut;
    // что не попадёт в комнату, видно до того, как она создана, а не потом
    const lost = [
      c.over && `Лишние карточки (в комнате до ${ROOM.ITEMS}): ${c.over}`,
      c.same && `Повторы названий (станут одной карточкой): ${c.same}`,
      c.pics && `Картинки с устройства (в комнате станут текстом): ${c.pics}`,
      c.rows && `Лишние ряды (в комнате до ${ROOM.ROWS}): ${c.rows}`,
    ].filter(Boolean);
    if (p.rows.length < 2) throw new Error('Нужно хотя бы два ряда.');
    if (p.items.length < 2) throw new Error('Нужно хотя бы два элемента.');
    if (lost.length && !confirm([T('Не всё из тир-листа попадёт в комнату:'), ...lost.map((s) => '• ' + T(s)), '', T('Создать комнату?')].join('\n'))) return;
    const d = await api('POST', '/tiercoop', { title: l.title, rows: p.rows, items: p.items });
    location.href = '/tierlist/?coop=' + d.id;
  }
  window.CasualTierCoop = Object.freeze({ create, plan });

  // ---------- комната ----------
  const code = (/^[A-Za-z0-9]{12}$/.exec(new URLSearchParams(location.search).get('coop') || '') || [''])[0];
  if (!code) return;
  // edits — сколько раз раскладку меняли здесь; asked — номер последнего запроса, shown — того, чей ответ уже на экране
  let D = null, tab = 'mine', picks = {}, sel = '', msg = '', ov = null, timer = 0, saveT = 0, dirty = false, edits = 0, asked = 0, shown = 0;
  const it = (id) => D.room.items.find((x) => x.id === id) || { n: '?', img: '' };
  // названия, ряды, заголовок и ник — от людей: translate="no", перевод сайта (lang-core.js) их не трогает.
  // Комната без своего названия — «Тир-лист вместе» от сервера, его переводим
  function tile(id, extra) {
    const x = it(id);
    return `<button type="button" class="tc-it${sel === id ? ' sel' : ''}${extra && extra.hot ? ' hot' : ''}" data-it="${esc(id)}" title="${esc(x.n)}" translate="no">${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}<span>${esc(x.n)}</span>${extra && extra.n ? `<em>${extra.n}</em>` : ''}</button>`;
  }
  function paint() {
    if (!ov || !D) return;
    const R = D.room, open = R.status === 'open', mine = tab === 'mine';
    const avg = new Map(D.avg.map((a) => [a.id, a]));
    const rowsHTML = R.rows.map((r, k) => {
      const ids = mine ? R.items.filter((x) => picks[x.id] === k).map((x) => x.id) : R.items.filter((x) => (avg.get(x.id) || {}).row === k).sort((a, b) => avg.get(a.id).mean - avg.get(b.id).mean).map((x) => x.id);
      const tiles = ids.map((id) => (mine ? tile(id) : tile(id, { n: avg.get(id).n, hot: avg.get(id).spread >= 1.2 }))).join('');
      return `<div class="tc-row"><button type="button" class="tc-lab" data-row="${k}" style="background:${esc(r.c)}" translate="no"${mine && open && token() ? '' : ' disabled'}>${esc(r.t)}</button><div class="tc-its">${tiles}</div></div>`;
    }).join('');
    const rest = mine ? R.items.filter((x) => picks[x.id] == null).map((x) => x.id) : R.items.filter((x) => (avg.get(x.id) || {}).row < 0).map((x) => x.id);
    const note = !open ? T('Голосование закрыто: это итог компании.') : mine ? (token() ? T('Нажми на элемент, потом на ряд. Раскладка сохраняется сама.') : T('Войди в аккаунт, чтобы разложить по-своему.')) : T('Средний тир-лист: элемент стоит там, куда его в среднем ставили. Цифра — сколько голосов, красная рамка — мнения сильно разошлись.');
    ov.querySelector('.tc-card').innerHTML = `<div class="tc-head"><div><h2${R.title === 'Тир-лист вместе' ? '' : ' translate="no"'}>${esc(R.title)}</h2><small>${T('Тир-лист вместе')} · ${T('ведёт')} <span translate="no">${esc(R.owner)}</span> · ${T('голосов')}: ${D.voters}${open ? '' : ` · ${T('закрыт')}`}</small></div>
      <div class="tc-acts"><button type="button" class="tc-btn" data-tab="mine" aria-pressed="${mine}">${T('Моя раскладка')}</button><button type="button" class="tc-btn" data-tab="avg" aria-pressed="${!mine}">${T('Средний')}</button><button type="button" class="tc-btn" data-tc="share">${T('Ссылка')}</button>${R.own && open ? `<button type="button" class="tc-btn" data-tc="close">${T('Закрыть голосование')}</button>` : ''}<button type="button" class="tc-btn" data-tc="x" aria-label="${T('Закрыть')}">✕</button></div></div>
      <div class="tc-rows">${rowsHTML}</div>
      ${rest.length ? `<div class="tc-pool"><h3>${mine ? T('Ещё не разложено') : T('Пока без голосов')}</h3><div class="tc-its">${rest.map((id) => tile(id)).join('')}</div></div>` : ''}
      <p class="tc-note">${note}</p>${msg ? `<p class="tc-msg">${esc(msg)}</p>` : ''}`;
  }
  // ответ на запрос старше того, что уже на экране (опрос ушёл раньше сохранения), комнату не перерисовывает
  const take = (n, d) => { if (n <= shown) return false; shown = n; D = d; return true; };
  async function load() {
    const n = ++asked, at = edits;
    try {
      const first = !D;
      // раскладку с сервера берём, только если здесь её не меняли с тех пор, как ушёл запрос: иначе опрос откатил бы
      // только что поставленное
      if (take(n, await api('GET', `/tiercoop/room?c=${code}`)) && !dirty && at === edits) picks = { ...(D.mine || {}) };
      // закрыто или без входа — сразу итог компании
      if (first && (D.room.status !== 'open' || !token())) tab = 'avg';
      msg = '';
    }
    catch (e) { msg = e.message; }
    paint();
  }
  function poll() { clearTimeout(timer); timer = setTimeout(async () => { if (!document.hidden && ov) await load(); if (ov) poll(); }, 5000); }
  function save() {
    clearTimeout(saveT); dirty = true;
    const at = ++edits;
    saveT = setTimeout(async () => {
      const n = ++asked;
      try {
        take(n, await api('POST', '/tiercoop/vote', { c: code, picks }));
        if (at === edits) dirty = false; // пока ждали ответ, поставили ещё: та правка уйдёт своим сохранением
        msg = '';
      }
      catch (e) { msg = e.message; }
      paint();
    }, 600);
  }
  function close() {
    if (!ov) return;
    ov.remove(); ov = null; clearTimeout(timer);
    document.documentElement.style.overflow = '';
    history.replaceState(history.state, '', '/tierlist/');
  }
  function open() {
    ov = document.createElement('div');
    ov.className = 'tc-ov';
    ov.innerHTML = `<div class="tc-card" role="dialog" aria-modal="true" aria-label="${esc(T('Тир-лист вместе'))}"><p>${T('Загружаю…')}</p></div>`;
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    ov.addEventListener('click', async (e) => {
      if (e.target === ov) return close();
      const b = e.target.closest('[data-it], [data-row], [data-tab], [data-tc]');
      if (!b || !D) return;
      if (b.dataset.tab) { tab = b.dataset.tab; sel = ''; return paint(); }
      if (b.dataset.tc === 'x') return close();
      if (b.dataset.tc === 'share') {
        const url = `${location.origin}/tierlist/?coop=${code}`;
        try { await navigator.clipboard.writeText(url); msg = ''; b.textContent = T('Скопировано'); } catch (er) { msg = url; paint(); }
        return;
      }
      if (b.dataset.tc === 'close') { if (!confirm(T('Закрыть голосование? Раскладки больше не будут меняться.'))) return; const n = ++asked; try { take(n, await api('POST', '/tiercoop/close', { c: code })); } catch (er) { msg = er.message; } tab = 'avg'; return paint(); }
      if (tab !== 'mine' || D.room.status !== 'open' || !token()) return;
      if (b.dataset.it) { sel = sel === b.dataset.it ? '' : b.dataset.it; return paint(); }
      if (b.dataset.row != null && sel) { picks[sel] = +b.dataset.row; sel = ''; paint(); save(); }
    });
    document.body.appendChild(ov);
    document.documentElement.style.overflow = 'hidden';
    load().then(poll);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', open); else open();
})();
