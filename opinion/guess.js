// Казуал Хаб: «Угадай оценку друга» в Мнении — кнопка в шапке рядом с «Загадкой дня» и окно игры
// (сервер — functions/_lib/guess.js). Каждый день до 5 оценок друзей: балл угадывают ползунком 1–10 с шагом 0,5,
// баллы друзей страница узнаёт только после ответа. Кнопка и окно — те же классы, что у «Загадки дня»
// (opinion/riddle.js: .rd-open, .rd-ov, .rd-card…), поэтому виды интерфейса оформляют их без своих правил.
(() => {
  const U = window.CasualUtil || {};
  const esc = U.esc;
  const read = U.read;
  const token = () => { const u = read('ocenshik.user.v1'); return (u && (read('casualhub.tokens.v1') || {})[u.id]) || ''; };
  const T = (t) => (window.CasualLang && window.CasualLang.t ? window.CasualLang.t(t) : t);
  const api = async (path, body) => {
    const r = await fetch('/api' + path, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { authorization: 'Bearer ' + token(), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Не получилось, попробуй ещё раз');
    if (r.headers.get('x-levels')) document.dispatchEvent(new CustomEvent('casualhub:levels'));
    return d;
  };

  const css = document.createElement('style');
  css.textContent = `
.masthead .rd-open { margin-right: 8px; }
.gs-list { list-style: none; margin: 0 0 14px; padding: 0; display: grid; gap: 8px; }
.gs-q { padding: 10px 12px; border-radius: 14px; background: color-mix(in srgb, var(--ink, #fff) 5%, transparent); display: grid; gap: 8px; }
.gs-top { display: flex; align-items: center; gap: 10px; min-width: 0; }
.gs-cov { flex: none; width: 40px; height: 52px; border-radius: 8px; overflow: hidden; display: grid; place-items: center; background: color-mix(in srgb, var(--accent, #5B74FF) 16%, transparent); color: var(--accent, #5B74FF); font-weight: 800; }
.gs-cov img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gs-top div { min-width: 0; display: grid; gap: 2px; }
.gs-top b { font-size: 14.5px; line-height: 1.25; overflow-wrap: anywhere; }
.gs-top small { font-size: 12.5px; color: var(--ink-2, #b8bcc8); overflow-wrap: anywhere; }
.gs-sl { display: flex; align-items: center; gap: 10px; }
.gs-sl input { flex: 1; min-width: 0; accent-color: var(--accent, #5B74FF); }
.gs-sl output { flex: none; min-width: 34px; text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; }
.gs-res { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; font-size: 13.5px; }
.gs-res span { color: var(--ink-2, #b8bcc8); }
.gs-res b { font-variant-numeric: tabular-nums; }
.gs-pt { margin-left: auto; padding: 3px 9px; border-radius: 999px; font-size: 12.5px; font-weight: 800; background: color-mix(in srgb, var(--ink, #fff) 8%, transparent); }
.gs-pt.p3 { background: color-mix(in srgb, #2EAD60 20%, transparent); color: #2EAD60; }
.gs-pt.p2 { background: color-mix(in srgb, #2EAD60 12%, transparent); color: #2EAD60; }
.gs-pt.p1 { background: color-mix(in srgb, #E2A925 16%, transparent); color: #B98410; }
.gs-go { width: 100%; height: 44px; border: 0; border-radius: 12px; background: var(--accent, #5B74FF); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
.gs-go:disabled { opacity: .5; cursor: default; }
.gs-fr li.me span { font-weight: 800; }
`;
  document.head.appendChild(css);

  let S = null, ov = null, busy = false, msg = '', lastFocus = null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rd-open gs-open';
  btn.innerHTML = '<i aria-hidden="true"></i><span>Угадай оценку друга</span>';
  btn.addEventListener('click', () => open());

  function mountBtn() {
    const at = document.querySelector('.masthead > div:first-child');
    if (at && !btn.isConnected) at.appendChild(btn);
    btn.hidden = !token();
    btn.classList.toggle('done', !!(S && S.done));
  }
  const nf = (v) => String(v);
  // обложка: ссылка (из поиска) — сразу; своё загруженное фото друга — из его аккаунта, уменьшенной копией (pics),
  // как в профиле друга. Пока не пришло или фото нет — буква названия
  const pics = new Map(); // «друг|оценка» → data URL, '' (фото нет) или промис, пока грузится
  const picKey = (x) => x.friend.id + '|' + x.rid;
  const cover = (x) => {
    const adult = U.nsfw ? U.nsfw.attr(x.adult) : '';
    const src = x.photo || (typeof pics.get(picKey(x)) === 'string' ? pics.get(picKey(x)) : '');
    return `<span class="gs-cov"${adult}${x.photo ? '' : ` data-gs-pic="${esc(picKey(x))}"`}>${src ? `<img src="${esc(src)}" alt="" decoding="async" referrerpolicy="no-referrer">` : esc(String(x.name || '?').trim().charAt(0).toUpperCase())}</span>`;
  };
  function loadPics() {
    if (!S || !S.items) return;
    for (const x of S.items) {
      const k = picKey(x);
      if (x.photo || pics.has(k)) continue;
      pics.set(k, api(`/photo/${encodeURIComponent(x.friend.id)}/${encodeURIComponent(x.rid)}?thumb=1`)
        .then((d) => { pics.set(k, d && typeof d.data === 'string' && d.data.startsWith('data:image/') ? d.data : ''); }, () => pics.set(k, ''))
        .then(() => {
          const v = pics.get(k), el = ov && [...ov.querySelectorAll('[data-gs-pic]')].find((e) => e.dataset.gsPic === k);
          if (v && el) el.innerHTML = `<img src="${esc(v)}" alt="" decoding="async">`;
        }));
    }
  }
  const who = (x) => esc(x.friend.username || (x.friend.handle ? '@' + x.friend.handle : ''));
  function paint() {
    if (!ov) return;
    const card = ov.querySelector('.rd-card');
    const head = `<div class="rd-head"><h2>${T('Угадай оценку друга')}</h2><button type="button" class="rd-x" data-rd-x aria-label="${esc(T('Закрыть'))}">✕</button></div>`;
    if (!S) { card.innerHTML = `${head}<p class="rd-sub">${esc(msg || T('Загружаю…'))}</p>`; return; }
    if (!S.items.length) {
      card.innerHTML = `${head}<p class="rd-sub">${S.empty === 'friends' ? T('Здесь угадывают, как друзья оценили игры, фильмы и музыку. Добавь друзей — кнопка «Друзья» в шапке.') : T('Друзья пока не оценили ничего, что тебе видно. Загляни позже.')}</p>`;
      return;
    }
    const rows = S.items.map((x) => {
      const top = `<div class="gs-top">${cover(x)}<div><b>${esc(x.name)}</b><small>${who(x)}${x.cat ? ` · ${esc(x.cat)}` : ''}</small></div></div>`;
      if (!S.done) return `<li class="gs-q">${top}<div class="gs-sl"><input type="range" min="1" max="10" step="0.5" value="5.5" data-k="${x.k}" aria-label="${esc(T('Балл друга'))}: ${esc(x.name)}"><output>5.5</output></div></li>`;
      return `<li class="gs-q">${top}<div class="gs-res"><span>${T('Ты')}: <b>${x.guess == null ? '—' : nf(x.guess)}</b></span><span>${who(x)}: <b>${nf(x.total)}</b></span><i class="gs-pt p${x.points}">+${x.points}</i></div></li>`;
    }).join('');
    const board = (S.board || []).length ? `<div class="rd-fr gs-fr"><h3>${T('Неделя с друзьями')}</h3><ul>${S.board.map((b) => `<li class="${b.me ? 'me' : ''}"><span>${esc(b.username || '@' + b.handle)}</span><b>${b.score}</b></li>`).join('')}</ul></div>` : '';
    const res = S.done ? `<div class="rd-res"><p><b>${T(`Очки: ${S.score} из ${S.max}`)}</b></p><p>${T('Завтра — новые оценки друзей.')}</p></div>` : '';
    card.innerHTML = `${head}
      <p class="rd-sub">${S.done ? T('Вот как друзья оценили на самом деле.') : T('Как друзья это оценили? Ближе к их баллу — больше очков: в точку — 3, рядом — 2, почти — 1.')}</p>
      <ol class="gs-list">${rows}</ol>
      ${S.done ? '' : `<button type="button" class="gs-go" data-gs-go${busy ? ' disabled' : ''}>${T('Проверить')}</button>`}
      ${msg ? `<p class="rd-msg err">${esc(msg)}</p>` : ''}${res}${board}`;
    loadPics();
  }
  async function load() {
    if (!token()) { S = null; mountBtn(); return; }
    try { S = await api('/guess'); msg = ''; } catch (e) { msg = e.message; }
    mountBtn(); paint();
  }
  function close() {
    if (!ov) return;
    ov.remove(); ov = null;
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function open() {
    lastFocus = document.activeElement;
    ov = document.createElement('div');
    ov.className = 'rd-ov';
    ov.innerHTML = `<div class="rd-card" role="dialog" aria-modal="true" aria-label="${esc(T('Угадай оценку друга'))}"></div>`;
    ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-rd-x]')) close(); else if (e.target.closest('[data-gs-go]')) check(); });
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    ov.addEventListener('input', (e) => { const i = e.target.closest('input[data-k]'); if (i) i.nextElementSibling.value = i.value; });
    document.body.appendChild(ov);
    document.documentElement.style.overflow = 'hidden';
    msg = '';
    paint();
    load().then(() => { const f = ov && ov.querySelector('input[data-k], [data-rd-x]'); if (f) f.focus({ preventScroll: true }); });
  }
  async function check() {
    if (busy || !S || S.done) return;
    const answers = {};
    ov.querySelectorAll('input[data-k]').forEach((i) => { answers[i.dataset.k] = +i.value; });
    busy = true; msg = ''; paint();
    try { S = await api('/guess', { answers }); } catch (e) { msg = e.message; }
    busy = false;
    mountBtn(); paint();
    const card = ov && ov.querySelector('.rd-card');
    if (card) card.scrollTop = 0;
  }
  // вошёл или вышел в соседней вкладке или в окне входа — кнопка и набор под другой аккаунт
  document.addEventListener('casualhub:auth', () => { S = null; load(); });
  addEventListener('storage', (e) => { if (e.key === 'ocenshik.user.v1' || e.key === 'casualhub.tokens.v1') { S = null; load(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { mountBtn(); load(); }); else { mountBtn(); load(); }
})();
