// Казуал Хаб: «Угадай по пикселям» (/games/pixel/, сервер — functions/_lib/game-pixel.js). Обложка дня — крупными
// пикселями на холсте: картинка приходит с нашего адреса (/api/games/pixel/img?d=день), клетка — средний цвет её куска,
// клеток в ширину столько, сколько говорит steps с сервера (с каждой попыткой больше), на последней — картинка целиком.
// Название страница узнаёт только в конце игры. Без входа попытки живут в этом браузере (casualhub.pixel.v1) и уходят на
// сервер списком prev — он только сверяет ответ; вошёл в тот же день — сыгранное переносится в аккаунт (/games/pixel/claim).
// Тексты пишутся по-русски целыми фразами: перевод (lang-core.js) меняет их в разметке и в скопированном итоге.
(() => {
  const U = window.CasualUtil || {};
  const esc = U.esc || ((s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const read = U.read || ((k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } });
  const lang = () => (window.CasualLang && window.CasualLang.lang) || 'ru';
  const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const token = () => { const u = read('ocenshik.user.v1'); return (u && (read('casualhub.tokens.v1') || {})[u.id]) || ''; };
  const $ = (id) => document.getElementById(id);
  const GUEST = 'casualhub.pixel.v1'; // { day, tries, solved, over, answer } — игра без входа
  const TYPE = { game: 'Игра', movie: 'Фильм', series: 'Сериал', anime: 'Аниме' };
  // как norm в functions/_lib/riddle.js: без регистра, «ё» = «е», без знаков
  const nrm = (s) => String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/&/g, 'and').replace(/[^a-zа-я0-9]+/g, '');
  const HANDLE_RE = /^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$/;
  const ICON = {
    bad: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
    skip: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 8h8"/></svg>',
    good: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  };

  const cv = $('pxCv'), wait = $('pxWait'), cells = $('pxCells'), no = $('pxNo'), res = $('pxRes');
  const game = $('pxGame'), form = $('pxForm'), inp = $('pxIn'), sug = $('pxSug'), go = $('pxGo'), skipBtn = $('pxSkip');
  const msgEl = $('pxMsg'), triesEl = $('pxTries'), endEl = $('pxEnd'), guestEl = $('pxGuest'), statsEl = $('pxStats'), frEl = $('pxFriends');
  let S = null; // состояние с сервера
  let names = []; // все названия: { a, en, al }
  let pic = null; // { day, bmp, w, h, ww, wh, data, cache } — картинка дня и её уменьшенная копия для средних цветов
  let picDay = '', shownN = null, anim = 0, busy = false, loadN = 0, retryT = 0, clockT = 0, sugIdx = -1, sugList = [];
  let skew = 0; // часы сервера минус часы браузера

  async function api(method, path, body) {
    const t = token();
    const r = await fetch('/api' + path, { method, cache: 'no-store', headers: { ...(t ? { authorization: 'Bearer ' + t } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || 'Не получилось, попробуй ещё раз'); e.status = r.status; throw e; }
    return d;
  }
  const guestRead = () => { const g = read(GUEST); return g && typeof g.day === 'string' && Array.isArray(g.tries) ? g : null; };
  const guestSave = () => { try { localStorage.setItem(GUEST, JSON.stringify({ day: S.day, tries: S.tries, solved: S.solved, over: S.over, answer: S.answer })); } catch (e) {} };
  const guestDrop = () => { try { localStorage.removeItem(GUEST); } catch (e) {} };
  const done = () => !!(S && (S.solved || S.over));

  // ---------- состояние ----------
  async function load() {
    const my = ++loadN;
    clearTimeout(retryT);
    let d;
    try { d = await api('GET', '/games/pixel'); }
    catch (e) { if (my === loadN) { showWait(e.message, true); } return; }
    if (my !== loadN) return;
    skew = (+d.now || Date.now()) - Date.now();
    if (!d.ready) {
      S = null;
      // первый заход дня ищет обложку: если не успел — спросим ещё раз
      const n = (load.tries = (load.tries || 0) + 1);
      if (n <= 8) { showWait('Ищу картинку дня…'); retryT = setTimeout(load, 2500 + n * 500); }
      else showWait('Не получилось найти картинку дня. Обнови страницу через минуту.', true);
      return;
    }
    load.tries = 0;
    const g = guestRead(), mine = !!(g && g.day === d.day && g.tries.length);
    if (d.guest) {
      // гость: попытки в браузере — сервер сверит их и скажет, кончилась ли игра (и ответ, если да). Не ответил — как было
      if (mine) {
        try { d = await api('POST', '/games/pixel/guess', { day: d.day, prev: g.tries, peek: true }); }
        catch (e) { d = { ...d, tries: g.tries, solved: !!g.solved, over: !!g.over, answer: g.answer || null }; }
        if (my !== loadN) return;
      }
    } else if (mine && !d.tries.length) {
      // сыграл сегодня без входа, а потом вошёл: сыгранное — в аккаунт, пока там сегодня пусто
      try { d = await api('POST', '/games/pixel/claim', { day: d.day, tries: g.tries }); guestDrop(); } catch (e) {}
      if (my !== loadN) return;
    } else if (g) guestDrop(); // вчерашнее или аккаунт уже играл сегодня
    const newDay = !S || S.day !== d.day;
    S = d;
    if (S.guest) guestSave();
    if (newDay) { setMsg(''); inp.value = ''; }
    paint();
    loadPic();
  }

  // ---------- картинка ----------
  async function decode(blob) {
    if (window.createImageBitmap) { try { return await createImageBitmap(blob); } catch (e) {} }
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('img'));
      im.src = URL.createObjectURL(blob);
    });
  }
  async function loadPic() {
    if (!S || !S.ready || picDay === S.day) { draw(); return; }
    const day = S.day;
    picDay = day;
    showWait('Загружаю картинку…');
    try {
      const r = await fetch(S.img);
      if (!r.ok) throw new Error(String(r.status));
      const bmp = await decode(await r.blob());
      if (!S || S.day !== day) return;
      pic = prepare(day, bmp);
      shownN = null;
      wait.hidden = true;
      cv.classList.add('on');
      fit();
      draw();
    } catch (e) {
      if (picDay === day) picDay = '';
      showWait('Картинка не загрузилась.', true);
    }
  }
  // уменьшенная копия (240 точек в ширину) — из неё средний цвет каждой клетки
  function prepare(day, bmp) {
    const w = bmp.width || bmp.naturalWidth || 1, h = bmp.height || bmp.naturalHeight || 1;
    const ww = 240, wh = Math.max(1, Math.min(720, Math.round((ww * h) / w)));
    const c = document.createElement('canvas');
    c.width = ww; c.height = wh;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = getComputedStyle(document.body).backgroundColor || '#808080';
    g.fillRect(0, 0, ww, wh);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, ww, wh);
    let data = null;
    try { data = g.getImageData(0, 0, ww, wh).data; } catch (e) {}
    cv.style.setProperty('--ar', String(Math.max(0.4, Math.min(2.5, w / h)).toFixed(4)));
    return { day, bmp, w, h, ww, wh, data, small: c, cache: new Map() };
  }
  // n клеток в ширину (в высоту — сколько выйдет по пропорциям картинки): средние цвета, по 3 числа на клетку
  function blocks(n) {
    if (pic.cache.has(n)) return pic.cache.get(n);
    const cols = n, rows = Math.max(1, Math.round((n * pic.h) / pic.w)), { ww, wh, data } = pic;
    const rgb = new Uint8ClampedArray(cols * rows * 3);
    for (let by = 0; by < rows; by++) {
      const y0 = Math.floor((by * wh) / rows), y1 = Math.max(y0 + 1, Math.floor(((by + 1) * wh) / rows));
      for (let bx = 0; bx < cols; bx++) {
        const x0 = Math.floor((bx * ww) / cols), x1 = Math.max(x0 + 1, Math.floor(((bx + 1) * ww) / cols));
        let r = 0, g = 0, b = 0, k = 0;
        for (let y = y0; y < y1; y++) for (let x = x0, i = (y * ww + x0) * 4; x < x1; x++, i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; k++; }
        const o = (by * cols + bx) * 3;
        rgb[o] = r / k; rgb[o + 1] = g / k; rgb[o + 2] = b / k;
      }
    }
    const out = { cols, rows, rgb };
    pic.cache.set(n, out);
    return out;
  }
  // нарисовать n клеток в ширину; 0 — картинку целиком
  function paintCanvas(n) {
    const W = cv.width, H = cv.height, g = cv.getContext('2d');
    if (!pic || !W || !H || n == null) return;
    if (!n) {
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.clearRect(0, 0, W, H);
      g.drawImage(pic.bmp, 0, 0, W, H);
      return;
    }
    if (!pic.data) { // без доступа к точкам: уменьшить и растянуть без сглаживания
      const rows = Math.max(1, Math.round((n * pic.h) / pic.w)), t = document.createElement('canvas');
      t.width = n; t.height = rows;
      t.getContext('2d').drawImage(pic.small, 0, 0, n, rows);
      g.imageSmoothingEnabled = false;
      g.drawImage(t, 0, 0, W, H);
      return;
    }
    const { cols, rows, rgb } = blocks(n);
    for (let by = 0; by < rows; by++) {
      const y0 = Math.round((by * H) / rows), y1 = Math.round(((by + 1) * H) / rows);
      for (let bx = 0; bx < cols; bx++) {
        const x0 = Math.round((bx * W) / cols), x1 = Math.round(((bx + 1) * W) / cols), o = (by * cols + bx) * 3;
        g.fillStyle = `rgb(${rgb[o]},${rgb[o + 1]},${rgb[o + 2]})`;
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
  }
  // размер холста — по месту на странице (CSS), точек — с учётом плотности экрана
  function fit() {
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1), W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; paintCanvas(shownN); }
  }
  // сколько клеток сейчас: попытка k — steps[k], игра кончилась — картинка целиком
  const target = () => (!S || !S.ready ? null : done() ? 0 : S.steps[Math.min(S.tries.length, S.steps.length - 1)]);
  // к новой резкости — в три коротких шага (клетки делятся), без «меньше движения» — сразу
  function draw() {
    const to = target();
    if (to == null || !pic || pic.day !== (S && S.day)) return;
    const from = shownN;
    cancelAnimationFrame(anim);
    clearTimeout(draw.t);
    if (from == null || !from || from === to || (to && to < from) || calm() || document.hidden) { shownN = to; paintCanvas(to); return; }
    const end = to || Math.max(72, from * 2), seq = [];
    for (let k = 1; k <= 3; k++) { const v = Math.round(from * Math.pow(end / from, k / 3)); if (v > (seq.length ? seq[seq.length - 1] : from)) seq.push(v); }
    if (to) seq[seq.length - 1] = to; else seq.push(0);
    let i = 0, t0 = 0;
    const step = (t) => {
      if (!t0) t0 = t;
      if (t - t0 >= i * 70) { shownN = seq[i]; paintCanvas(seq[i]); i++; }
      if (i < seq.length) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
    // кадры не идут (вкладку свернули посреди анимации) — последний всё равно будет нарисован
    draw.t = setTimeout(() => { if (shownN !== to) { cancelAnimationFrame(anim); shownN = to; paintCanvas(to); } }, seq.length * 70 + 150);
  }
  if (window.ResizeObserver) new ResizeObserver(() => fit()).observe(cv);
  else addEventListener('resize', fit);
  function showWait(text, again) {
    wait.hidden = false;
    wait.innerHTML = `<span>${esc(text)}</span>${again ? '<button type="button" class="btn ghost small" data-px-again>Попробовать ещё раз</button>' : ''}`;
  }
  wait.addEventListener('click', (e) => {
    if (!e.target.closest('[data-px-again]')) return;
    load.tries = 0;
    if (S && S.ready && picDay !== S.day) { loadPic(); return; }
    showWait('Загружаю…');
    load();
  });

  // ---------- конфетти цветами обложки ----------
  function palette() {
    if (!pic || !pic.data) return undefined;
    const { rgb } = blocks(9), out = [];
    const all = [];
    for (let o = 0; o < rgb.length; o += 3) {
      const r = rgb[o], g = rgb[o + 1], b = rgb[o + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      all.push({ c: `rgb(${r},${g},${b})`, s: mx ? (mx - mn) / mx : 0, v: mx, r, g, b });
    }
    all.sort((x, y) => y.s * y.v - x.s * x.v);
    for (const x of all) {
      if (out.length >= 5) break;
      if (x.v < 60 || out.some((o) => Math.abs(o.r - x.r) + Math.abs(o.g - x.g) + Math.abs(o.b - x.b) < 90)) continue;
      out.push(x);
    }
    return out.length >= 3 ? out.map((x) => x.c) : undefined;
  }
  function celebrate() {
    if (calm() || !U.confetti) return;
    const fx = document.createElement('canvas');
    fx.className = 'px-fx';
    fx.setAttribute('aria-hidden', 'true');
    document.body.appendChild(fx);
    const r = cv.getBoundingClientRect();
    const stop = U.confetti(fx, { x: r.left + r.width / 2, y: r.top + r.height / 3, colors: palette(), count: 150, part: (g, w) => { g.fillRect(-w / 2, -w / 2, w, w); return true; } });
    setTimeout(() => { stop(); fx.remove(); }, 4200);
  }

  // ---------- разметка ----------
  function setMsg(text, cls) { msgEl.textContent = text || ''; msgEl.className = 'px-msg' + (cls ? ' ' + cls : ''); }
  const profUrl = (f) => (HANDLE_RE.test(f.handle || '') ? '/profile/' + f.handle : '');
  function shareLines() {
    const n = S.tries.length;
    return [S.solved ? `Пиксели №${S.n}: с ${n}-й попытки` : `Пиксели №${S.n}: не угадал`, Array.from({ length: S.max }, (_, i) => (i < n ? '■' : '□')).join('')];
  }
  function clock() {
    const el = $('pxNext');
    if (!el || !S) return;
    const left = Math.max(0, S.next - (Date.now() + skew));
    const p = (v) => String(v).padStart(2, '0');
    const s = Math.floor(left / 1000);
    el.textContent = `Новая картинка через ${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  }
  function paint() {
    if (!S) return;
    const over = done(), n = S.tries.length;
    no.textContent = `Картинка дня №${S.n}`;
    res.textContent = !over ? `Попытка ${n + 1} из ${S.max}` : S.solved ? 'Угадано' : 'Не угадано';
    cv.setAttribute('aria-label', over && S.answer ? `Обложка: ${S.answer.title}` : 'Обложка крупными пикселями');
    // клетки попыток: были — мимо, пропуск или верно; текущая — рамкой
    cells.innerHTML = Array.from({ length: S.max }, (_, i) => {
      const t = S.tries[i];
      if (i < n) { const k = S.solved && i === n - 1 ? 'good' : t ? 'bad' : 'skip'; return `<li class="${k}">${ICON[k]}</li>`; }
      return `<li class="${i === n && !over ? 'now' : ''}">${i + 1}</li>`;
    }).join('');
    game.hidden = over;
    go.disabled = busy;
    skipBtn.disabled = busy;
    // попытки: свежие первыми; верный ответ — в итогах
    const shown = S.tries.map((t, i) => ({ t, i })).filter((x) => !(S.solved && x.i === n - 1)).reverse();
    triesEl.innerHTML = shown.map((x) => (x.t ? `<li>${esc(x.t)}</li>` : '<li class="skip">Пропуск</li>')).join('');
    triesEl.hidden = !shown.length;
    // итог
    if (over && S.answer) {
      const a = S.answer, lines = shareLines();
      endEl.innerHTML = `<p class="px-verdict ${S.solved ? 'ok' : 'bad'}">${S.solved ? `Угадал с ${n}-й попытки!` : 'Попытки кончились'}</p>
        <div class="px-ans"><span class="label">Ответ</span><p class="px-title">${esc(a.title)}</p>${a.en ? `<p class="px-en">${esc(a.en)}</p>` : ''}<p class="px-meta">${esc(a.year)} · ${esc(TYPE[a.type] || '')}</p></div>
        <div class="px-share"><div class="px-share-t">${lines.map((l) => `<div>${esc(l)}</div>`).join('')}</div><button type="button" class="btn ghost small" data-px-copy>Скопировать результат</button><span class="px-copied" id="pxCopied" role="status"></span></div>
        <p class="px-next" id="pxNext"></p>`;
      endEl.hidden = false;
      clock();
    } else { endEl.hidden = true; endEl.innerHTML = ''; }
    guestEl.hidden = !S.guest;
    // рекорды — у вошедшего
    const st = S.stats;
    if (st && st.played) {
      const max = Math.max(1, ...st.dist), mine = S.solved ? n : 0;
      statsEl.innerHTML = `<h3 class="label">Твои рекорды</h3>
        <div class="px-stats">${[[st.played, 'Сыграно'], [st.won, 'Угадано'], [st.streak, 'Серия'], [st.best, 'Лучшая серия']].map(([v, l]) => `<div class="px-stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
        <div class="px-dist" role="img" aria-label="С какой попытки угадано">${st.dist.map((v, i) => `<div><span>${i + 1}</span><i class="${mine === i + 1 ? 'me' : ''}" style="width:${Math.max(8, Math.round((v / max) * 100))}%">${v}</i></div>`).join('')}</div>`;
      statsEl.hidden = false;
    } else { statsEl.hidden = true; statsEl.innerHTML = ''; }
    const fr = S.friends || [];
    if (fr.length) {
      frEl.innerHTML = `<h3 class="label">Друзья сегодня</h3><ul>${fr.map((f) => {
        const u = profUrl(f), name = u ? `<a href="${esc(u)}">${esc(f.name)}</a>` : `<span>${esc(f.name)}</span>`;
        return `<li>${name}<b>${f.solved ? `${f.tries}/${S.max}` : 'X'}</b></li>`;
      }).join('')}</ul>`;
      frEl.hidden = false;
    } else { frEl.hidden = true; frEl.innerHTML = ''; }
    clearInterval(clockT);
    if (over) clockT = setInterval(() => { clock(); if (S && S.next - (Date.now() + skew) <= 0) { clearInterval(clockT); setTimeout(load, 1500); } }, 1000);
  }

  const snd = (n, p) => { if (window.CasualSound) window.CasualSound.play(n, p); }; // звуки — /games/sound.js
  // ---------- ответ ----------
  async function submit(skip) {
    if (busy || !S || !S.ready || done()) return;
    const g = skip ? '' : inp.value.replace(/\s+/g, ' ').trim();
    if (!skip && !g) { setMsg('Напиши ответ или нажми «Пропустить».', 'err'); inp.focus(); return; }
    if (!skip && S.tries.some((t) => t && nrm(t) === nrm(g))) { setMsg('Этот ответ уже был.', 'err'); return; }
    closeSug();
    busy = true;
    paint();
    const body = { day: S.day, at: S.tries.length, ...(skip ? { skip: true } : { guess: g }), ...(S.guest ? { prev: S.tries } : {}) };
    try {
      const d = await api('POST', '/games/pixel/guess', body);
      S = d;
      if (S.guest) guestSave();
      if (d.right != null) snd(S.solved && d.right ? 'win' : done() ? 'lose' : skip ? 'skip' : 'bad');
      // верный ответ и конец игры объявляет сам итог; мимо — строка под полем
      if (d.right === false && !done()) setMsg(skip ? 'Пропущено — картинка стала чётче' : 'Мимо — картинка стала чётче', 'err');
      else setMsg('');
      if (d.right != null) inp.value = '';
    } catch (e) {
      setMsg(e.message, 'err');
      if (e.status === 409) { busy = false; load(); return; }
    }
    busy = false;
    paint();
    draw();
    if (S.solved && S.right) celebrate();
    // на телефоне клавиатура закрыла бы картинку, которая только что стала чётче: фокус возвращаем только с мышью
    if (!done() && !matchMedia('(pointer: coarse)').matches) inp.focus({ preventScroll: true });
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); if (sugIdx >= 0 && !sug.hidden) { pick(sugIdx); return; } submit(false); });
  skipBtn.addEventListener('click', () => submit(true));
  endEl.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-px-copy]')) return;
    const text = [...shareLines(), location.origin + '/games/pixel/'].join('\n');
    const note = $('pxCopied'), say = (t, bad) => { if (note) { note.textContent = t; note.classList.toggle('bad', !!bad); } };
    try { await navigator.clipboard.writeText(text); say('Результат скопирован.'); }
    catch (err) {
      // браузер не дал доступ к буферу: выделяем итог, чтобы скопировать его самому
      try { const box = endEl.querySelector('.px-share-t'); if (box) getSelection().selectAllChildren(box); } catch (x) {}
      say('Не получилось скопировать — итог выделен, скопируй его сам.', true);
    }
  });

  // ---------- подсказки при вводе: все названия, по любому написанию ----------
  const labelOf = (it) => (lang() === 'en' ? [it.en || it.a, ''] : [it.a, it.en]);
  function suggest(q) {
    const k = nrm(q);
    if (k.length < 2) return [];
    const tried = new Set((S ? S.tries : []).map(nrm));
    const out = [];
    for (const it of names) {
      let s = 0;
      for (const x of [it.a, it.en, ...(it.al || [])].filter(Boolean).map(nrm)) s = Math.max(s, x === k ? 3 : x.startsWith(k) ? 2 : x.includes(k) ? 1 : 0);
      if (s && !tried.has(nrm(labelOf(it)[0]))) out.push([s, it]);
    }
    return out.sort((x, y) => y[0] - x[0] || x[1].a.localeCompare(y[1].a, 'ru')).slice(0, 6).map((x) => x[1]);
  }
  function closeSug() { sug.hidden = true; sug.innerHTML = ''; sugIdx = -1; sugList = []; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); }
  function openSug() {
    sugList = document.activeElement === inp ? suggest(inp.value) : [];
    sugIdx = -1;
    inp.removeAttribute('aria-activedescendant');
    if (!sugList.length) { closeSug(); return; }
    sug.innerHTML = sugList.map((it, i) => { const [main, sub] = labelOf(it); return `<li role="option" id="pxOpt${i}" aria-selected="false"><b>${esc(main)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</li>`; }).join('');
    sug.hidden = false;
    inp.setAttribute('aria-expanded', 'true');
  }
  function mark(i) {
    sugIdx = i;
    [...sug.children].forEach((li, k) => li.setAttribute('aria-selected', String(k === i)));
    if (i >= 0) { inp.setAttribute('aria-activedescendant', 'pxOpt' + i); sug.children[i].scrollIntoView({ block: 'nearest' }); }
    else inp.removeAttribute('aria-activedescendant');
  }
  function pick(i) {
    const it = sugList[i];
    if (!it) return;
    inp.value = labelOf(it)[0];
    closeSug();
    inp.focus();
  }
  inp.addEventListener('input', () => { setMsg(''); openSug(); });
  inp.addEventListener('focus', openSug);
  inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== inp) closeSug(); }, 120));
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (sug.hidden) openSug();
      if (!sugList.length) return;
      e.preventDefault();
      const n = sugList.length;
      mark(e.key === 'ArrowDown' ? (sugIdx + 1) % n : (sugIdx - 1 + n) % n);
    } else if (e.key === 'Escape' && !sug.hidden) { e.preventDefault(); closeSug(); }
  });
  // нажатие на подсказку не уводит фокус из поля
  sug.addEventListener('pointerdown', (e) => e.preventDefault());
  sug.addEventListener('click', (e) => { const li = e.target.closest('li[role="option"]'); if (li) pick([...sug.children].indexOf(li)); });

  // ---------- заголовок по буквам (как на страницах режимов) ----------
  (() => {
    const title = $('pxTitle');
    if (!title || calm()) return;
    const text = title.textContent.trim();
    let i = 0;
    title.setAttribute('aria-label', text);
    title.innerHTML = text.split(' ').map((w) => `<span class="w" aria-hidden="true">${[...w].map((c) => `<span class="ch" style="--i:${i++}">${esc(c)}</span>`).join('')}</span>`).join(' ');
    document.documentElement.classList.add('intro');
    setTimeout(() => document.documentElement.classList.remove('intro'), 1400);
  })();

  // вход и выход — в этой вкладке (friends.js) или в соседней: перечитать игру под новый аккаунт
  let who = token();
  const authChanged = () => { const t = token(); if (t === who) return; who = t; load(); };
  addEventListener('storage', (e) => { if (e.key === 'casualhub.tokens.v1' || e.key === 'ocenshik.user.v1') authChanged(); });
  document.addEventListener('casualhub:auth', authChanged);
  // вкладка пролежала до следующего дня — новая картинка
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S && S.next && Date.now() + skew > S.next) load(); });
  api('GET', '/games/pixel/names').then((d) => { names = Array.isArray(d.items) ? d.items : []; }, () => {});
  load();
})();
