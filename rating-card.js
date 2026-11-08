/* Казуал Хаб: чужая оценка в окне — как карточка в профиле — и кнопки «В планы» / «Оценить», чтобы забрать её себе.
   Главная открывает здесь оценки из ленты «Что у друзей» (CasualRatingCard.open), профиль друга берёт только кнопки
   (takeHTML + bindTake). «В планы» добавляет оценку в этом браузере и сразу шлёт в аккаунт; если такой категории у тебя
   ещё нет, её создаёт Мнение (там свежий список категорий из аккаунта). «Оценить» открывает Мнение с заполненной формой. */
(() => {
  const RKEY = 'ocenshik.ratings.v2', CKEY = 'ocenshik.cats.v2', TAKE_KEY = 'casualhub.take.v1';
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // как keyOf в Мнении: одно и то же название пишут по-разному
  const keyOf = (s) => String(s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
  const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
  const fmt = (n) => Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const tierT = (t) => (t == null ? 'none' : t >= 7.5 ? 'good' : t >= 5 ? 'mid' : 'bad');
  const tierV = (v) => (v >= 8 ? 'good' : v >= 5 ? 'mid' : v >= 1 ? 'bad' : 'none');
  const WORDS = ['—', 'Ужас', 'Провал', 'Плохо', 'Слабо', 'Средне', 'Нормально', 'Неплохо', 'Хорошо', 'Отлично', 'Шедевр'];
  const lines = (s) => String(s || '').split(/\r?\n/).map((x) => x.replace(/^[+\-•*]\s*/, '').trim()).filter(Boolean);
  const dayFmt = (t) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  let idSeq = 0;
  const newId = (p) => { idSeq = (idSeq + 1) % 1296; return p + Date.now().toString(36) + idSeq.toString(36) + Math.random().toString(36).slice(2, 6); };
  const profUrl = (id, h) => (typeof h === 'string' && /^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$/.test(h) ? '/profile/' + h : '/profile/?id=' + encodeURIComponent(id));
  const me = () => read('ocenshik.user.v1');
  const token = () => { const u = me(), t = read('casualhub.tokens.v1') || {}; return u && t[u.id] ? t[u.id] : ''; };
  const api = (path, o = {}) => fetch('/api' + path, { ...o, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token() }, cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)));

  let toastEl = null, toastT = 0;
  function toast(text) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'rc-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  // ---------- что забираем себе: одинаково из оценки с сервера и из профиля ----------
  // uid — чей это; обложка-файл (photo.remote) лежит на сервере у друга, её скачиваем по uid и id оценки
  function srcOf(r, uid) {
    const ph = r.photo || {};
    const url = typeof ph.url === 'string' && /^https:\/\//.test(ph.url) ? ph.url : typeof ph.id === 'string' && /^https:\/\//.test(ph.id) ? ph.id : '';
    const scores = (Array.isArray(r.scores) ? r.scores : []).filter((s) => s && s.name && s.id !== 'lb-score');
    return {
      name: String(r.name || '').trim(), title: r.title || '', artist: r.artist || '',
      catName: String(r.catName || r.catLabel || r.cat || '').trim(),
      criteria: scores.map((s) => ({ name: String(s.name).slice(0, 60), desc: String(s.desc || '').slice(0, 120), w: [0.5, 1, 2].includes(s.w) ? s.w : 1 })),
      meta: String(r.meta || '').slice(0, 80), link: typeof r.link === 'string' ? r.link : '',
      photoUrl: url, photoFrom: !url && ph.remote && uid && r.id ? { uid, rid: r.id } : null, w: ph.w || 0, h: ph.h || 0,
    };
  }
  // своя оценка этого же: сначала в той же категории, потом в любой
  function findMine(src) {
    const u = me(), k = keyOf(src.name), kc = keyOf(src.catName);
    const list = (read(RKEY) || []).filter((x) => x && !x.example && x.name && (!u || !x.author || !x.author.id || x.author.id === u.id) && (x.nameKey || keyOf(x.name)) === k);
    return list.find((x) => keyOf(x.catName) === kc) || list[0] || null;
  }
  const planned = (x) => /В планах/.test(x.status || '') && !(typeof x.total === 'number');
  function takeHTML(r) {
    const src = srcOf(r);
    if (!src.name) return '';
    const mine = findMine(src);
    if (mine && planned(mine)) return `<span class="rc-take"><span class="rc-have">В твоих планах</span><button type="button" class="rc-btn primary" data-take="rate">Оценить</button></span>`;
    if (mine) return `<span class="rc-take"><span class="rc-have">У тебя: <b data-tier="${tierT(mine.total)}">${typeof mine.total === 'number' ? fmt(mine.total) : '—'}</b></span><a class="rc-btn" href="/opinion/#r=${encodeURIComponent(mine.id)}">Моя оценка</a></span>`;
    return `<span class="rc-take"><button type="button" class="rc-btn" data-take="plan">${PLUS}В планы</button><button type="button" class="rc-btn primary" data-take="rate">Оценить</button></span>`;
  }
  const PLUS = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  // кнопки внутри карточки: root — карточка, r — оценка друга, after — перерисовать кнопки после «В планы»
  function bindTake(root, r, after, uid) {
    const box = root.querySelector('.rc-take');
    if (!box || box.dataset.bound) return;
    box.dataset.bound = '1';
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-take]');
      if (!b) return;
      b.disabled = true;
      take(r, b.dataset.take, uid).then((ok) => { b.disabled = false; if (ok && after) after(); });
    });
  }
  // в Мнение: оно само создаст категорию, заполнит форму или сохранит план
  function toOpinion(src, mode) {
    try { localStorage.setItem(TAKE_KEY, JSON.stringify({ ...src, mode, at: Date.now() })); } catch (e) {}
    location.href = '/opinion/#take';
  }
  // фото оценок хранятся в IndexedDB (photo-store.js), в самой оценке только ссылка — как в Мнении
  function photoStore() {
    if (window.CasualPhotos) return window.CasualPhotos.ready;
    return new Promise((res) => { const s = document.createElement('script'); s.src = '/photo-store.js'; s.onload = () => res(window.CasualPhotos ? window.CasualPhotos.ready : false); s.onerror = () => res(false); document.head.appendChild(s); });
  }
  // отпечаток фото — как fp в friends.js: по нему сервер и Мнение понимают, что фото то же самое
  const fpOf = (d) => { let h = 0x811c9dc5; for (let i = 0; i < d.length; i += 7) { h ^= d.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36) + '.' + d.length.toString(36); };
  const thumbOf = (src) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { const k = Math.min(1, 320 / Math.max(im.naturalWidth, im.naturalHeight)), cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(im.naturalWidth * k)); cv.height = Math.max(1, Math.round(im.naturalHeight * k)); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); try { res(cv.toDataURL('image/jpeg', 0.8)); } catch (e) { res(''); } };
    im.onerror = () => res('');
    im.src = src;
  });
  async function take(r, mode, uid) {
    const src = srcOf(r, uid);
    if (!src.name) return false;
    const mine = findMine(src);
    if (mode === 'rate') {
      if (mine) { location.href = `/opinion/#r=${encodeURIComponent(mine.id)}&${planned(mine) ? 'rate' : 'edit'}=1`; return false; }
      toOpinion(src, 'rate');
      return false;
    }
    if (mine) { toast('Это уже есть у тебя'); return true; }
    const cs = read(CKEY);
    const cats = Array.isArray(cs) ? cs : (cs && cs.items) || [];
    const cat = cats.find((c) => c && keyOf(c.name) === keyOf(src.catName));
    if (!cat) { toOpinion(src, 'plan'); return false; }
    // обложка: ссылка остаётся ссылкой, файл скачиваем у друга и кладём к себе
    let data = '', photo = src.photoUrl ? { id: src.photoUrl, data: '', w: src.w, h: src.h } : null;
    if (!photo && src.photoFrom) {
      data = await api(`/photo/${encodeURIComponent(src.photoFrom.uid)}/${encodeURIComponent(src.photoFrom.rid)}`).then((d) => (d && typeof d.data === 'string' && d.data.startsWith('data:image/') ? d.data : ''), () => '');
      if (data) {
        let key = '';
        if (await photoStore()) { key = window.CasualPhotos.keyOf(data); if (!(await window.CasualPhotos.put(key, data))) key = ''; }
        photo = key ? { ref: key, w: src.w, h: src.h } : { id: data, data, w: src.w, h: src.h };
      }
    }
    const u = me(), now = new Date().toISOString();
    const doc = {
      id: newId('r'), cat: cat.id, catName: cat.name, name: src.name.slice(0, 140), nameKey: keyOf(src.name),
      scores: [], total: null, fav: false, status: 'В планах', meta: src.meta, pros: '', cons: '', note: '', example: false,
      createdAt: now, updatedAt: now,
      author: u ? { id: u.id, name: u.name || u.username || '', avatar: u.avatar || String(u.name || '?').charAt(0).toUpperCase(), color: u.color || '#3550E8' } : { name: 'Гость' },
      ...(photo ? { photo } : {}),
      ...(/^https:\/\//.test(src.link) ? { link: src.link } : {}),
      ...(src.artist ? { artist: src.artist, title: src.title } : {}),
    };
    const all = read(RKEY) || [];
    all.push(doc);
    try { localStorage.setItem(RKEY, JSON.stringify(all)); } catch (e) { toast('Браузер не дал сохранить: мало места'); return false; }
    // в аккаунт сразу: так план виден на других устройствах и друзьям, даже если Мнение здесь не откроют
    let sent = null;
    if (token()) {
      const c = { ...doc, catLabel: cat.name };
      c.photo = src.photoUrl ? { url: src.photoUrl, w: src.w, h: src.h } : data ? { remote: fpOf(data), w: src.w, h: src.h } : undefined;
      if (!c.photo) delete c.photo;
      sent = await api('/shelf', { method: 'PUT', body: JSON.stringify({ ratings: [c] }) }).then(() => true, () => false);
      // сама картинка и её превью: друзья увидят обложку сразу, не дожидаясь Мнения
      if (sent && data) {
        await api('/photo/' + encodeURIComponent(doc.id), { method: 'PUT', body: JSON.stringify({ data }) }).catch(() => {});
        const t = await thumbOf(data);
        if (t) await api('/photo/' + encodeURIComponent(doc.id + '.t'), { method: 'PUT', body: JSON.stringify({ data: t }) }).catch(() => {});
      }
    }
    toast(sent === false ? `«${doc.name}» в планах. В аккаунт уйдёт, когда откроешь Мнение` : `«${doc.name}» в планах`);
    return true;
  }

  // ---------- окно с оценкой друга ----------
  const shelves = new Map();
  const shelfOf = (uid) => { if (!shelves.has(uid)) shelves.set(uid, api('/shelf/' + encodeURIComponent(uid)).catch((e) => { shelves.delete(uid); throw e; })); return shelves.get(uid); };
  let box = null, back = null;
  function close() {
    if (!box || box.hidden) return;
    box.hidden = true;
    document.body.style.overflow = '';
    if (back && back.focus) back.focus({ preventScroll: true });
  }
  function ensureBox() {
    if (box) return box;
    box = document.createElement('div');
    box.className = 'rc-pick'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'rcTitle');
    document.body.appendChild(box);
    box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('[data-rc="close"]')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    return box;
  }
  const LB_MARK = '<span class="rc-lb" aria-hidden="true"><i></i><i></i><i></i></span>';
  function cardHTML(r, uid, who, handle) {
    const total = typeof r.total === 'number' ? r.total : null;
    const word = total != null ? WORDS[Math.max(1, Math.min(10, Math.round(total)))] : 'Без балла';
    const lb = r.src === 'letterboxd' || (r.scores || []).some((s) => s && s.id === 'lb-score');
    const scores = (r.scores || []).filter((s) => s && s.name);
    const n = scores.filter((s) => +s.v > 0).length;
    const pros = lines(r.pros), cons = lines(r.cons);
    const cat = r.catName || r.catLabel || r.cat || '';
    const when = +new Date(r.createdAt || r.updatedAt || 0) || 0;
    return `<article class="rc-card" data-tier="${tierT(total)}">
      <button type="button" class="rc-x" data-rc="close" aria-label="Закрыть">✕</button>
      ${r.photo ? `<div class="rc-pic" id="rcPic"><span class="rc-ltr">${esc([...String(r.name).trim()][0] || '?')}</span>${lb ? LB_MARK : ''}</div>` : ''}
      <div class="rc-top">
        <div class="rc-name"><span class="rc-label">${esc(cat)}</span><h2 id="rcTitle">${esc(r.name)}</h2>
          <p>${esc([word, n ? `${n} ${plural(n, 'критерий', 'критерия', 'критериев')}` : '', r.status, r.meta].filter(Boolean).join(' · '))}${lb ? ' · из Letterboxd' : ''}</p></div>
        <div class="rc-score"><b>${total != null ? fmt(total) : '—'}</b><small>из 10</small></div>
      </div>
      ${window.CasualIMDb && window.CasualIMDb.isMovie(cat) ? `<div class="imdb-slot" data-imdb-row="1" data-imdb-n="${esc(r.name)}" data-imdb-y="${window.CasualIMDb.yearOf(r.meta) || ''}"></div>` : ''}
      ${scores.length ? `<ul class="rc-crit">${scores.map((s) => { const v = Math.max(0, Math.min(10, Math.round(+s.v || 0))); return `<li data-tier="${tierV(v)}">
        <div class="rc-ct"><b>${esc(s.name)}</b><span>${v || '—'}</span></div>
        ${s.desc ? `<small class="rc-desc">${esc(s.desc)}</small>` : ''}
        <div class="rc-bar" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i${i < v ? ' class="on"' : ''}></i>`).join('')}</div>
        ${s.note ? `<em>${esc(s.note)}</em>` : ''}</li>`; }).join('')}</ul>` : ''}
      ${pros.length || cons.length ? `<div class="rc-pc">${pros.length ? `<div><span class="rc-label">Плюсы</span><ul>${pros.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}${cons.length ? `<div><span class="rc-label">Минусы</span><ul>${cons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}</div>` : ''}
      ${r.note ? `<p class="rc-note">${esc(r.note)}</p>` : ''}
      <div class="rc-foot"><span class="rc-when">${when ? dayFmt(when) + ' · ' : ''}<a class="rc-who" href="${profUrl(uid, handle)}" title="Открыть профиль">${esc(who || 'друг')}</a></span>${takeHTML(r)}<a class="rc-btn ghost" href="/opinion/#friend=${encodeURIComponent(uid)}&amp;r=${encodeURIComponent(r.id)}">Открыть в Мнении</a></div>
      <div class="rc-cm" id="rcComments"></div>
    </article>`;
  }
  function loadComments() {
    if (window.CasualComments) return Promise.resolve();
    return new Promise((res) => { const s = document.createElement('script'); s.src = '/comments.js'; s.onload = res; s.onerror = res; document.head.appendChild(s); });
  }
  async function open({ uid, rid, who, handle, preview }) {
    ensureBox();
    if (box.hidden) back = document.activeElement;
    const pv = preview || { name: '…' };
    box.innerHTML = `<article class="rc-card" data-tier="${tierT(typeof pv.total === 'number' ? pv.total : null)}"><button type="button" class="rc-x" data-rc="close" aria-label="Закрыть">✕</button>
      <div class="rc-top"><div class="rc-name"><span class="rc-label">${esc(pv.cat || '')}</span><h2 id="rcTitle">${esc(pv.name)}</h2><p>Загружаю оценку…</p></div></div></article>`;
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    box.querySelector('.rc-x').focus({ preventScroll: true });
    let r = null;
    try { const s = await shelfOf(uid); r = (s.ratings || []).find((x) => x && x.id === rid) || null; if (s.user) { who = who || s.user.username; handle = handle || s.user.handle; } } catch (e) {}
    if (box.hidden) return;
    if (!r) { box.querySelector('.rc-name p').textContent = 'Эта оценка не открылась: друг мог её удалить или скрыть.'; return; }
    const paint = () => {
      box.innerHTML = cardHTML(r, uid, who, handle);
      bindTake(box, r, paint, uid);
      if (window.CasualIMDb) window.CasualIMDb.fill(box);
      box.querySelector('.rc-x').focus({ preventScroll: true });
      // фото: ссылка сразу, загруженное — с сервера
      const pic = box.querySelector('#rcPic');
      const show = (src) => { if (!src || !pic.isConnected) return; const img = new Image(); img.alt = ''; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; img.onload = () => { const l = pic.querySelector('.rc-ltr'); if (l) l.remove(); pic.appendChild(img); }; img.src = src; };
      if (pic && r.photo.url) show(r.photo.url);
      else if (pic && r.photo.remote) api(`/photo/${encodeURIComponent(uid)}/${encodeURIComponent(r.id)}`).then((d) => show(d.data), () => {});
      const cm = box.querySelector('#rcComments');
      if (token()) loadComments().then(() => { if (window.CasualComments && cm.isConnected) window.CasualComments.mount(cm, { uid, target: 'r.' + r.id, token: token(), title: 'Комментарии к оценке', placeholder: 'Что думаешь об этой оценке?' }); });
      else cm.remove();
    };
    paint();
  }

  const css = document.createElement('style');
  css.textContent = `
.rc-pick { position: fixed; inset: 0; z-index: 60; display: grid; place-items: start center; overflow: auto; padding: 16px; background: color-mix(in srgb, var(--bg, #0d0f14) 70%, transparent); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.rc-pick[hidden] { display: none; }
.rc-card { --tier: var(--cell, #272c36); position: relative; width: min(560px, 100%); margin: auto; display: grid; gap: 18px; padding: 22px; background: var(--panel, #161920); color: var(--ink, #e8eaf0); border: 1px solid var(--line, #2a2f3a); border-radius: 26px; box-shadow: 0 30px 70px -30px rgba(0, 0, 0, .6); font-family: var(--font-body, system-ui, sans-serif); animation: rc-in .3s cubic-bezier(.22, 1, .36, 1) both; }
@keyframes rc-in { from { transform: translateY(14px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .rc-card { animation: none; } }
.rc-card[data-tier="good"] { --tier: var(--good); } .rc-card[data-tier="mid"] { --tier: var(--mid); } .rc-card[data-tier="bad"] { --tier: var(--bad); }
.rc-x { position: absolute; top: 12px; right: 12px; z-index: 2; width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel-2); color: var(--ink); font-size: 18px; cursor: pointer; }
.rc-pic { position: relative; aspect-ratio: 4 / 3; border-radius: 16px; overflow: hidden; display: grid; place-items: center; background: color-mix(in srgb, var(--tier) 22%, var(--panel-2)); }
.rc-pic img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.rc-ltr { font-family: var(--font-display); font-weight: 800; font-size: 90px; color: color-mix(in srgb, var(--tier) 70%, var(--ink)); }
.rc-lb { position: absolute; right: 7px; bottom: 7px; z-index: 2; display: inline-flex; padding: 5px 6px; border-radius: 99px; background: rgb(20 24 28 / .82); }
.rc-lb i { width: 10px; height: 10px; border-radius: 50%; background: #ff8000; }
.rc-lb i:nth-child(2) { background: #00e054; margin-left: -2px; } .rc-lb i:nth-child(3) { background: #40bcf4; margin-left: -2px; }
.rc-top { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
.rc-x + .rc-top { padding-right: 40px; }
.rc-label { display: block; font-size: 12px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-2); }
html.unslop .rc-label { letter-spacing: normal; text-transform: none; }
.rc-name h2 { margin: 6px 0 0; font-size: clamp(24px, 5vw, 32px); font-weight: 800; line-height: 1.12; overflow-wrap: anywhere; }
.rc-name p { margin: 8px 0 0; color: var(--ink-2); font-size: 15px; font-weight: 600; }
.rc-score { display: grid; justify-items: center; gap: 6px; }
.rc-score b { min-width: 104px; padding: 10px 14px; border-radius: 18px; background: var(--tier); color: var(--on-tier, #0d0f14); font-family: var(--font-display); font-weight: 800; font-size: 46px; line-height: 1; text-align: center; font-variant-numeric: tabular-nums; }
.rc-score small { font-size: 13px; color: var(--ink-2); }
.rc-crit { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.rc-crit li { --tier: var(--cell); display: grid; gap: 4px; }
.rc-crit li[data-tier="good"] { --tier: var(--good); } .rc-crit li[data-tier="mid"] { --tier: var(--mid); } .rc-crit li[data-tier="bad"] { --tier: var(--bad); }
.rc-ct { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.rc-ct b { font-size: 16px; font-weight: 700; }
.rc-ct span { font-family: var(--font-display); font-weight: 800; font-size: 26px; line-height: 1; }
.rc-desc { color: var(--ink-2); font-size: 13px; }
.rc-bar { display: grid; grid-template-columns: repeat(10, 1fr); gap: 5px; margin-top: 4px; }
.rc-bar i { height: 10px; border-radius: 4px; background: var(--cell); }
.rc-bar i.on { background: var(--tier); }
.rc-crit em { font-style: normal; font-size: 13px; color: var(--ink-2); }
.rc-pc { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
.rc-pc ul { margin: 4px 0 0; padding-left: 18px; font-size: 13.5px; }
.rc-note { margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--panel-2); font-size: 13.5px; white-space: pre-wrap; overflow-wrap: anywhere; }
.rc-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding-top: 14px; border-top: 1px solid var(--line); color: var(--ink-2); font-size: 14px; }
.rc-who { color: var(--ink); font-weight: 700; text-decoration: none; }
.rc-who:hover { color: var(--accent); text-decoration: underline; }
.rc-take { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.rc-have { color: var(--ink-2); font-size: 14px; }
.rc-have b { display: inline-block; padding: 2px 8px; border-radius: 8px; background: var(--cell); color: var(--on-tier, #0d0f14); font-family: var(--font-display); font-size: 18px; }
.rc-have b[data-tier="good"] { background: var(--good); } .rc-have b[data-tier="mid"] { background: var(--mid); } .rc-have b[data-tier="bad"] { background: var(--bad); }
.rc-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 40px; padding: 0 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel-2); color: var(--ink); font: inherit; font-size: 14px; font-weight: 700; text-decoration: none; cursor: pointer; transition: border-color .15s, background-color .15s; }
.rc-btn:hover { border-color: var(--accent); }
.rc-btn.primary { background: var(--ink); border-color: var(--ink); color: var(--panel); }
.rc-btn.primary:hover { background: color-mix(in srgb, var(--ink) 84%, var(--accent)); }
.rc-btn.ghost { background: transparent; }
.rc-btn:focus-visible, .rc-x:focus-visible, .rc-who:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.rc-cm { margin-top: -4px; padding-top: 14px; border-top: 1px solid var(--line); }
.rc-cm:empty { display: none; }
.rc-toast { position: fixed; left: 50%; bottom: calc(env(safe-area-inset-bottom, 0px) + 20px); z-index: 90; max-width: min(92vw, 460px); padding: 11px 18px; border-radius: 14px; background: var(--ink); color: var(--panel); font: 600 14px/1.35 var(--font-body, system-ui, sans-serif); text-align: center; opacity: 0; transform: translate(-50%, 12px); transition: opacity .2s, transform .3s cubic-bezier(.22, 1, .36, 1); pointer-events: none; }
.rc-toast.show { opacity: 1; transform: translate(-50%, 0); }
@media (max-width: 560px) { .rc-card { padding: 16px; border-radius: 22px; } .rc-score b { min-width: 84px; font-size: 38px; } .rc-foot .rc-take, .rc-foot .rc-btn.ghost { flex: 1 1 100%; } .rc-take .rc-btn { flex: 1 1 0; } }`;
  document.head.appendChild(css);

  window.CasualRatingCard = { open, close, takeHTML, bindTake, take, srcOf, profUrl };
})();
