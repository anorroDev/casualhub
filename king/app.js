// Казуал Хаб: «Царь Горы» — турниры по ссылке (/king/, сервер — functions/_lib/king.js).
// Без ?c= — создание турнира и свои турниры; с ?c=<код> — турнир: бой, голоса, пульт ведущего, очередь или сетка.
(() => {
  const U = window.CasualUtil || {};
  const esc = U.esc || ((s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const token = () => { const u = read('ocenshik.user.v1'); return (u && (read('casualhub.tokens.v1') || {})[u.id]) || ''; };
  const T = (t) => (window.CasualLang && window.CasualLang.t ? window.CasualLang.t(t) : t);
  const view = document.getElementById('view');
  const code = (/^[A-Za-z0-9]{12}$/.exec(new URLSearchParams(location.search).get('c') || '') || [''])[0];
  async function api(method, path, body, etag) {
    const t = token();
    const r = await fetch('/api' + path, { method, cache: 'no-store', headers: { ...(t ? { authorization: 'Bearer ' + t } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...(etag ? { 'if-none-match': etag } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 304) return { same: true };
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Не получилось, попробуй ещё раз');
    return { d, etag: r.headers.get('etag') || '' };
  }

  const css = document.createElement('style');
  css.textContent = `
.kg { display: grid; gap: 18px; }
.kg .card { animation: kg-in .24s cubic-bezier(.2, .8, .2, 1) backwards; }
@keyframes kg-in { from { opacity: 0; transform: translateY(8px); } }
.kg-f { display: grid; gap: 6px; margin: 0 0 14px; font-size: 13px; font-weight: 700; color: var(--ink-2); }
.kg-f textarea { min-height: 150px; resize: vertical; }
.kg-seg { display: flex; flex-wrap: wrap; gap: 6px; }
.kg-seg button { height: 36px; padding: 0 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); color: var(--ink); font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; transition: border-color .16s, background-color .16s; }
.kg-seg button[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, var(--panel)); }
.kg-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.kg-head h2 { margin: 0; font-size: 22px; }
.kg-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.kg-tags span { padding: 3px 9px; border-radius: 999px; background: color-mix(in srgb, var(--ink) 7%, transparent); font-size: 12px; font-weight: 700; color: var(--ink-2); }
.kg-tags .live { background: color-mix(in srgb, #2EAD60 18%, transparent); color: #2EAD60; }
.kg-acts { display: flex; flex-wrap: wrap; gap: 8px; }
.kg-bout { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 12px; align-items: stretch; margin-top: 14px; }
.kg-side { position: relative; display: grid; gap: 8px; align-content: start; justify-items: center; min-height: 180px; padding: 14px 10px 12px; border: 2px solid var(--line); border-radius: 18px; background: var(--panel); color: var(--ink); font: inherit; text-align: center; overflow: hidden; cursor: default; transition: border-color .18s, transform .18s cubic-bezier(.2, .8, .2, 1); }
button.kg-side:not(:disabled) { cursor: pointer; }
button.kg-side:not(:disabled):hover { border-color: color-mix(in srgb, var(--accent) 60%, var(--line)); transform: translateY(-2px); }
.kg-side.on { border-color: var(--accent); }
.kg-side .kg-img { width: min(150px, 100%); aspect-ratio: 1; border-radius: 12px; object-fit: cover; background: color-mix(in srgb, var(--ink) 6%, transparent); }
.kg-side .kg-ini { width: min(150px, 100%); aspect-ratio: 1; display: grid; place-items: center; border-radius: 12px; background: color-mix(in srgb, var(--accent) 16%, var(--panel)); font-size: 48px; font-weight: 800; }
.kg-side b { position: relative; font-size: 16px; line-height: 1.25; overflow-wrap: anywhere; }
.kg-side small { position: relative; font-size: 12px; font-weight: 800; color: #D9A21B; }
.kg-side em { position: relative; font-style: normal; font-size: 13px; font-weight: 800; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.kg-side .kg-bar { position: absolute; inset: auto 0 0 0; height: var(--p, 0%); background: color-mix(in srgb, var(--accent) 12%, transparent); transition: height .3s cubic-bezier(.2, .8, .2, 1); }
.kg-vs { align-self: center; font-size: 20px; font-weight: 900; color: var(--ink-3); }
.kg-note { margin: 10px 0 0; font-size: 13.5px; color: var(--ink-2); text-align: center; }
.kg-note b { color: var(--ink); }
.kg-msg { margin: 10px 0 0; font-size: 13px; font-weight: 600; color: #E5534B; }
.kg-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 12px; }
.kg-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: 13.5px; }
.kg-list li { display: flex; justify-content: space-between; gap: 8px; padding: 6px 8px; border-radius: 8px; background: color-mix(in srgb, var(--ink) 4%, transparent); }
.kg-list li.out { color: var(--ink-3); text-decoration: line-through; }
.kg-list a { color: var(--ink); font-weight: 700; text-decoration: none; }
.kg-rounds { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(150px, 1fr); gap: 10px; overflow-x: auto; padding-bottom: 6px; }
.kg-round { display: grid; gap: 8px; align-content: space-around; }
.kg-round h4 { margin: 0; font-size: 12px; color: var(--ink-3); }
.kg-m { display: grid; gap: 2px; padding: 6px; border: 1px solid var(--line); border-radius: 10px; font-size: 12.5px; }
.kg-m span { padding: 3px 6px; border-radius: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kg-m span.w { background: color-mix(in srgb, #2EAD60 18%, transparent); font-weight: 800; }
.kg-m.now { border-color: var(--accent); }
.kg-champ { display: grid; justify-items: center; gap: 8px; padding: 18px; text-align: center; }
.kg-champ .kg-crown { width: 56px; height: 56px; }
.kg-champ b { font-size: 24px; }
@media (max-width: 520px) { .kg-bout { gap: 6px; } .kg-side { min-height: 150px; padding: 10px 6px; } .kg-vs { font-size: 15px; } .kg-side b { font-size: 14px; } }
@media (prefers-reduced-motion: reduce) { .kg .card { animation: none; } .kg-side, .kg-side .kg-bar, .kg-seg button { transition: none; } }
html.unslop:not([data-ui]) .kg .card { animation: none; }
`;
  document.head.appendChild(css);
  view.classList.add('kg');
  const CROWN = '<img class="kg-crown" src="/art/logo/king.svg" width="56" height="56" alt="">';

  // ---------- создание и свои турниры ----------
  const F = { fmt: 'hill', size: 8, mode: 'host', timer: 30, seed: 'order' };
  function seg(key, opts) {
    return `<div class="kg-seg" role="group">${opts.map(([v, t]) => `<button type="button" data-set="${key}" data-v="${v}" aria-pressed="${String(F[key]) === String(v)}">${esc(T(t))}</button>`).join('')}</div>`;
  }
  async function paintNew() {
    let mine = '';
    if (token()) {
      try {
        const { d } = await api('GET', '/king/mine');
        const ST = { ready: 'ещё не начался', live: 'идёт', done: 'закончен' };
        mine = d.rooms && d.rooms.length ? `<section class="card"><div class="card-head"><h2 class="eyebrow"><span class="dot" aria-hidden="true"></span>${T('Мои турниры')}</h2></div>
          <ul class="kg-list">${d.rooms.map((r) => `<li><a href="/king/?c=${esc(r.id)}">${esc(r.title)}</a><span>${esc(T(ST[r.status] || r.status))}${r.king ? ` · ${esc(r.king)}` : ''}</span></li>`).join('')}</ul></section>` : '';
      } catch (e) {}
    }
    const form = token() ? `
      <label class="kg-f">${T('Название')}<input class="inp" id="kgTitle" maxlength="80" placeholder="${esc(T('Например, лучшая игра 2010-х'))}"></label>
      <div class="kg-f">${T('Формат')}${seg('fmt', [['hill', 'Царь горы'], ['bracket', 'Сетка']])}</div>
      ${F.fmt === 'bracket' ? `<div class="kg-f">${T('Размер сетки')}${seg('size', [[4, '4'], [8, '8'], [16, '16'], [32, '32']])}</div>` : ''}
      <div class="kg-f">${T('Кто решает бой')}${seg('mode', [['host', 'Ведущий'], ['vote', 'Голосование по ссылке']])}</div>
      ${F.mode === 'vote' ? `<div class="kg-f">${T('Таймер голосования')}${seg('timer', [[0, 'без таймера'], [15, '15 с'], [30, '30 с'], [60, '1 мин'], [120, '2 мин']])}</div>` : ''}
      <div class="kg-f">${T('Порядок')}${seg('seed', [['order', 'Как в списке'], ['random', 'Случайно']])}</div>
      <label class="kg-f">${T('Участники — по одному в строке. Картинку можно добавить через «|»: Hades | https://…')}<textarea class="inp" id="kgPeople" placeholder="Hades&#10;Celeste&#10;Doom&#10;Portal 2"></textarea></label>
      <div class="kg-acts"><button type="button" class="btn primary" data-k="create">${T('Начать турнир')}</button></div>
      <p class="kg-msg" id="kgMsg" role="status"></p>`
      : `<p class="lots-empty">${T('Войди в аккаунт, чтобы создавать турниры. Смотреть и голосовать по ссылке можно и так.')}</p>`;
    const keep = { t: (document.getElementById('kgTitle') || {}).value || '', p: (document.getElementById('kgPeople') || {}).value || '' };
    view.innerHTML = `<section class="card"><div class="card-head"><h2 class="eyebrow"><span class="dot" aria-hidden="true"></span>${T('Новый турнир')}</h2></div>
      <p class="kg-note" style="text-align:left;margin:0 0 14px">${T('«Царь горы»: царь бьётся с претендентами по очереди, проигравший выбывает, считается серия побед. «Сетка»: пары на выбывание до финала.')}</p>${form}</section>${mine}`;
    if (keep.t) document.getElementById('kgTitle').value = keep.t;
    if (keep.p) document.getElementById('kgPeople').value = keep.p;
  }
  async function create() {
    const msg = document.getElementById('kgMsg');
    const p = document.getElementById('kgPeople').value.split('\n').map((l) => { const [n, img] = l.split('|').map((x) => (x || '').trim()); return n ? { n, img: img || '' } : null; }).filter(Boolean);
    try {
      const { d } = await api('POST', '/king', { title: document.getElementById('kgTitle').value, fmt: F.fmt, size: F.size, mode: F.mode, timer: F.mode === 'vote' ? F.timer : 0, seed: F.seed, p, start: true });
      location.href = '/king/?c=' + d.room.id;
    } catch (e) { msg.textContent = e.message; }
  }

  // ---------- турнир ----------
  let R = null, people = new Map(), pv = '', etag = '', off = 0, pollT = 0, tickT = 0, busy = false, msg = '', addOpen = false, cheered = false;
  const now = () => Date.now() + off;
  const P = (id) => people.get(id) || { n: '…', img: '' };
  function take(d) {
    R = d; off = (d.now || Date.now()) - Date.now();
    if (Array.isArray(d.state.p)) { people = new Map(d.state.p.map((x) => [x.id, x])); pv = String(d.state.pv); }
  }
  const pic = (x) => (x.img ? `<img class="kg-img" src="${esc(x.img)}" alt="" referrerpolicy="no-referrer">` : `<span class="kg-ini" aria-hidden="true">${esc([...x.n][0] || '?')}</span>`);
  function boutHTML() {
    const st = R.state, bt = st.bout, own = R.room.own;
    if (!bt) return '';
    const a = P(bt.a), b = P(bt.b), t = R.tally || { a: 0, b: 0 }, sum = (t.a || 0) + (t.b || 0);
    const vote = st.mode === 'vote', waiting = now() < bt.opens;
    const canVote = vote && !waiting && !!token() && !own;
    const canPick = own && !waiting && (!vote || true);
    const side = (k, x, n) => {
      const pct = sum ? Math.round(((t[k] || 0) / sum) * 100) : 0;
      const clickable = canVote || (own && !vote && !waiting);
      return `<${clickable ? 'button type="button"' : 'div'} class="kg-side${R.mine === k ? ' on' : ''}" ${canVote ? `data-vote="${k}"` : own && !vote ? `data-win="${k}"` : ''}>
        ${vote ? `<span class="kg-bar" style="--p:${pct}%"></span>` : ''}${pic(x)}<b>${esc(x.n)}</b>${st.fmt === 'hill' && k === 'a' ? `<small>${T('Царь горы')}${st.streak ? ` · ${T('серия')} ${st.streak}` : ''}</small>` : ''}${vote ? `<em>${n} · ${pct}%</em>` : ''}
      </${clickable ? 'button' : 'div'}>`;
    };
    const left = bt.ends ? Math.max(0, Math.ceil((bt.ends - now()) / 1000)) : 0;
    let note = '';
    if (waiting) note = `${T('Следующий бой через')} <b data-k-tick>${Math.max(0, Math.ceil((bt.opens - now()) / 1000))}</b> ${T('с')}`;
    else if (vote) note = `${bt.ends ? `${T('Голосование')}: <b data-k-tick>${left}</b> ${T('с')}. ` : bt.idle ? `${T('Никто не проголосовал — решает ведущий.')} ` : ''}${own ? T('Закрой голосование, когда хватит голосов.') : token() ? (R.mine ? T('Твой голос учтён, можно передумать.') : T('Нажми на того, кто лучше.')) : T('Войди, чтобы голосовать.')}`;
    else note = own ? T('Нажми на победителя боя.') : T('Бой решает ведущий.');
    return `<div class="kg-bout">${side('a', a, t.a || 0)}<span class="kg-vs">VS</span>${side('b', b, t.b || 0)}</div><p class="kg-note">${note}</p>
      ${own ? `<div class="kg-acts" style="justify-content:center;margin-top:10px">${vote && !waiting ? `<button type="button" class="btn primary small" data-k="close">${T('Закрыть голосование')}</button><button type="button" class="btn ghost small" data-win="a">${T('Победил левый')}</button><button type="button" class="btn ghost small" data-win="b">${T('Победил правый')}</button>` : ''}</div>` : ''}`;
  }
  function hillHTML() {
    const st = R.state;
    const q = (st.queue || []).slice(0, 8).map((id) => `<li><span>${esc(P(id).n)}</span></li>`).join('');
    const out = (st.out || []).slice(-8).reverse().map((id) => `<li class="out"><span>${esc(P(id).n)}</span></li>`).join('');
    return `<div class="kg-grid">
      <div><h3 class="label">${T('Рекорд серии')}</h3><p class="kg-note" style="text-align:left">${st.best ? `<b>${esc(P(st.best.id).n)}</b> — ${st.best.n}` : '—'}</p></div>
      <div><h3 class="label">${T('Очередь')} (${(st.queue || []).length})</h3><ul class="kg-list">${q || `<li>${T('Пусто')}</li>`}</ul></div>
      ${out ? `<div><h3 class="label">${T('Выбыли')}</h3><ul class="kg-list">${out}</ul></div>` : ''}</div>`;
  }
  function bracketHTML() {
    const st = R.state;
    if (!st.rounds) return '';
    const name = (r) => (r === st.rounds.length - 1 ? T('Финал') : r === st.rounds.length - 2 ? T('Полуфинал') : `${T('Раунд')} ${r + 1}`);
    return `<div class="kg-rounds">${st.rounds.map((round, r) => `<div class="kg-round"><h4>${name(r)}</h4>${round.map((m, i) => {
      const now = st.bout && st.bout.r === r && st.bout.m === i;
      const s = (id) => `<span class="${m.w && m.w === id ? 'w' : ''}">${id ? esc(P(id).n) : '—'}</span>`;
      return `<div class="kg-m${now ? ' now' : ''}">${s(m.a)}${s(m.b)}</div>`;
    }).join('')}</div>`).join('')}</div>`;
  }
  function paintRoom() {
    const st = R.state, room = R.room, own = room.own;
    const STATUS = { ready: 'ещё не начался', live: 'идёт', done: 'закончен' };
    const head = `<div class="kg-head"><div><h2>${esc(room.title)}</h2><div class="kg-tags"><span class="${st.status === 'live' ? 'live' : ''}">${T(STATUS[st.status] || st.status)}</span><span>${T(st.fmt === 'hill' ? 'Царь горы' : 'Сетка')}</span><span>${T(st.mode === 'vote' ? 'голосование' : 'решает ведущий')}</span>${room.owner ? `<span>${T('ведёт')} ${esc(room.owner)}</span>` : ''}</div></div>
      <div class="kg-acts"><button type="button" class="btn ghost small" data-k="share">${T('Ссылка')}</button>${own && st.canUndo ? `<button type="button" class="btn ghost small" data-k="undo">${T('Отменить бой')}</button>` : ''}${own && st.status === 'live' && st.fmt === 'hill' ? `<button type="button" class="btn ghost small" data-k="finish">${T('Закончить')}</button>` : ''}</div></div>`;
    let main = '';
    if (st.status === 'ready') main = `<ul class="kg-list" style="margin-top:12px">${[...people.values()].map((x) => `<li><span>${esc(x.n)}</span></li>`).join('')}</ul>${own ? `<div class="kg-acts" style="margin-top:12px"><button type="button" class="btn primary" data-k="start">${T('Начать')}</button></div>` : `<p class="kg-note">${T('Турнир ещё не начался.')}</p>`}`;
    else if (st.status === 'live') main = boutHTML();
    else {
      const c = st.champ ? P(st.champ) : null;
      main = `<div class="kg-champ">${CROWN}<span class="label">${T('Победитель')}</span><b>${c ? esc(c.n) : '—'}</b>${st.fmt === 'hill' && st.best ? `<p class="kg-note">${T('Рекорд серии')}: <b>${esc(P(st.best.id).n)}</b> — ${st.best.n}</p>` : ''}</div>`;
      if (c && !cheered) { cheered = true; try { if (window.CasualFx && window.CasualFx.confetti) window.CasualFx.confetti(); } catch (e) {} }
    }
    const add = own && st.status !== 'done' && (st.fmt === 'hill' || st.status === 'ready')
      ? `<details class="kg-add"${addOpen ? ' open' : ''}><summary>${T('Добавить участников')}</summary><textarea class="inp" id="kgAdd" placeholder="${esc(T('По одному в строке'))}" style="width:100%;min-height:90px;margin-top:8px"></textarea><div class="kg-acts" style="margin-top:8px"><button type="button" class="btn ghost small" data-k="add">${T('Добавить')}</button></div></details>` : '';
    const log = (st.log || []).slice(-8).reverse().map((e) => `<li><span>${esc(P(e.w === 'a' ? e.a : e.b).n)} ${T('победил')} ${esc(P(e.w === 'a' ? e.b : e.a).n)}</span><span>${e.by === 'host' ? '' : `${e.va}:${e.vb}`}</span></li>`).join('');
    view.innerHTML = `<section class="card">${head}${main}${msg ? `<p class="kg-msg">${esc(msg)}</p>` : ''}</section>
      ${st.status !== 'ready' ? `<section class="card">${st.fmt === 'hill' ? hillHTML() : bracketHTML()}</section>` : ''}
      ${log ? `<section class="card"><h3 class="label">${T('Последние бои')}</h3><ul class="kg-list">${log}</ul></section>` : ''}
      ${add ? `<section class="card">${add}</section>` : ''}`;
  }
  function tick() {
    clearTimeout(tickT);
    if (!R || R.state.status !== 'live' || !R.state.bout) return;
    const bt = R.state.bout, el = view.querySelector('[data-k-tick]');
    if (el) {
      const target = now() < bt.opens ? bt.opens : bt.ends;
      const s = Math.max(0, Math.ceil((target - now()) / 1000));
      if (el.textContent !== String(s)) el.textContent = s;
      if (s === 0) { poll(true); return; }
      if (now() >= bt.opens && el.closest('.kg-note') && !bt.ends) paintRoom();
    }
    tickT = setTimeout(tick, 500);
  }
  async function poll(soon) {
    clearTimeout(pollT);
    if (!document.hidden || soon) {
      try {
        const r = await api('GET', `/king/room?c=${code}&pv=${encodeURIComponent(pv)}`, null, etag);
        if (!r.same) { etag = r.etag; take(r.d); if (!busy && !(document.activeElement && document.activeElement.id === 'kgAdd')) paintRoom(); }
      } catch (e) { if (!R) { view.innerHTML = `<section class="card"><p class="lots-empty">${esc(e.message)}</p><a class="btn primary" href="/king/">${T('К турнирам')}</a></section>`; return; } }
    }
    tick();
    pollT = setTimeout(() => poll(), R && R.state.status === 'live' ? 2000 : 8000);
  }
  async function act(body) {
    busy = true; msg = '';
    try { const { d } = await api('POST', body.act ? '/king/act' : '/king/vote', { c: code, pv, ...body }); etag = ''; take(d); }
    catch (e) { msg = e.message; }
    busy = false;
    paintRoom(); tick();
  }

  view.addEventListener('click', async (e) => {
    const set = e.target.closest('[data-set]');
    if (set) { F[set.dataset.set] = /^\d+$/.test(set.dataset.v) ? +set.dataset.v : set.dataset.v; paintNew(); return; }
    const k = e.target.closest('[data-k], [data-win], [data-vote]');
    if (!k || busy) return;
    if (k.dataset.k === 'create') return create();
    if (k.dataset.k === 'share') {
      const url = `${location.origin}/king/?c=${code}`;
      try { await navigator.clipboard.writeText(url); msg = T('Ссылка скопирована: зрители откроют турнир и смогут голосовать.'); } catch (er) { msg = url; }
      paintRoom(); return;
    }
    if (k.dataset.vote) return act({ n: R.state.bout.n, pick: k.dataset.vote });
    if (k.dataset.win) return act({ act: 'pick', n: R.state.bout.n, w: k.dataset.win });
    if (k.dataset.k === 'close') return act({ act: 'close', n: R.state.bout.n });
    if (k.dataset.k === 'add') {
      const p = document.getElementById('kgAdd').value.split('\n').map((l) => { const [n, img] = l.split('|').map((x) => (x || '').trim()); return n ? { n, img: img || '' } : null; }).filter(Boolean);
      addOpen = true; pv = ''; return act({ act: 'add', p });
    }
    if (k.dataset.k === 'finish' && !confirm(T('Закончить турнир? Победителем станет нынешний царь горы.'))) return;
    if (['start', 'undo', 'finish'].includes(k.dataset.k)) return act({ act: k.dataset.k });
  });

  if (!code) paintNew();
  else { document.title = `${T('Царь Горы')} · Казуал Хаб`; poll(true); }
})();
