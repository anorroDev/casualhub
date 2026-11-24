/* «Разбор альбома»: оценить каждый трек альбома отдельной оценкой под 30-секундные отрывки.
   Трек — обычная оценка в той же категории: status «Трек», albumOf — id оценки альбома, trackNo — номер, балл — критерий
   «Оценка трека» (TRK_SCORE) или критерии категории. У альбома: trackCount, skip (пропущенные номера), albumSrc (откуда треклист).
   Карточка альбома в рейтинге рисует кардиограмму (баллы треков по порядку), вердикты и треки; треки в общем списке свёрнуты.
   Опыт: каждый трек — оценка rate по обычным правилам, весь альбом целиком — album_full (functions/_lib/levels.js → albumsFull).
   Треклист: /api/music/album (Deezer, Apple), без аккаунта — Apple прямо из браузера. Работает поверх opinion/app.js (его функции общие). */
(() => {
  const VOL_KEY = 'casualhub.albvol.v1';
  const volume = () => { try { const v = parseFloat(localStorage.getItem(VOL_KEY)); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8; } catch (e) { return 0.8; } };
  const TAGS = ['Бэнгер', 'На репит', 'Лучший текст', 'Проходной'];
  const COLORS = ['#F472B6', '#FBBF24', '#60A5FA', '#A78BFA', '#34D399', '#FB923C'];
  const friendsCache = new Map(); // название альбома → разборы друзей (по кнопке «Друзья»)
  let ses = null; // открытая прослушка
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const catOf = (r) => state.cats.find((c) => c.id === r.cat) || { id: r.cat, name: r.catName || '' };
  const isAlbum = (r) => !!r && !r.albumOf && !r.example && (r.trackCount > 0 || (r.status === 'Альбом' && isMusicCat(catOf(r))));
  const tracksOf = (id) => state.ratings.filter((x) => x.albumOf === id).sort((a, b) => a.trackNo - b.trackNo);
  const scoreOf = (t) => (typeof t.total === 'number' ? t.total : null);
  const fmtS = (v) => (v == null ? '—' : Number.isInteger(v) ? String(v) : fmt(v));
  const tagsOf = (r) => String(r.meta || '').split(/\s*,\s*/).filter((x) => TAGS.includes(x));
  const yearOf = (s) => (String(s || '').match(/\b(19|20)\d{2}\b/) || [''])[0];
  const titleOf = (r) => r.title || (r.artist && r.name.startsWith(r.artist + ' — ') ? r.name.slice(r.artist.length + 3) : r.name);

  // ---------- вердикты: характер альбома по баллам треков в порядке треклиста ----------
  function verdicts(rows) {
    const vs = rows.map((x) => x.v);
    const n = vs.length;
    if (n < 3) return [];
    const avg = vs.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(vs.reduce((a, b) => a + (b - avg) ** 2, 0) / n);
    const third = Math.max(1, Math.round(n / 3));
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const head = mean(vs.slice(0, third)), tail = mean(vs.slice(-third)), mid = n >= 5 ? mean(vs.slice(third, n - third)) : null;
    const out = [];
    if (vs.every((v) => v >= 8)) out.push({ t: 'Ни одного проходного', k: 'good' });
    else if (vs.filter((v) => v >= 9).length / n >= 0.5) out.push({ t: 'Бэнгер на бэнгере', k: 'good' });
    if (sd < 0.9) out.push({ t: 'Ровный от начала до конца', k: 'none' });
    else if (sd >= 2.2) out.push({ t: 'Американские горки', k: 'mid' });
    if (tail - head >= 1.2) out.push({ t: 'Разгоняется к финалу', k: 'good' });
    else if (head - tail >= 1.2) out.push({ t: 'Сильный старт, слабый финал', k: 'mid' });
    if (mid != null && mid <= Math.min(head, tail) - 1) out.push({ t: 'Провис в середине', k: 'bad' });
    // ничего яркого: хотя бы одна подпись, чтобы кардиограмма не осталась без вывода
    if (!out.length) out.push(Math.min(...vs) >= 6 ? { t: 'Без провалов', k: 'good' } : Math.max(...vs) - Math.min(...vs) >= 4 ? { t: 'Есть и хиты, и проходные', k: 'mid' } : { t: 'Без сюрпризов', k: 'none' });
    return out.slice(0, 3);
  }
  // согласие с другом: трек «сошлись», если баллы разнятся не больше чем на 1; главный спор — от 3 баллов разницы
  function agreement(mine, theirs) {
    const m = new Map(mine.map((x) => [x.n, x.v]));
    const both = theirs.filter((x) => m.has(x.n));
    if (both.length < 2) return null;
    const agree = both.filter((x) => Math.abs(m.get(x.n) - x.v) <= 1).length;
    const fight = both.map((x) => ({ ...x, mine: m.get(x.n), d: Math.abs(m.get(x.n) - x.v) })).sort((a, b) => b.d - a.d)[0];
    return { agree, of: both.length, fight: fight && fight.d >= 3 ? fight : null };
  }

  // ---------- кардиограмма: SVG, баллы треков по порядку ----------
  function curveSVG(rows, total, friends, opts) {
    const W = 320, H = 118, L = 14, R = 10, T = 14, B = 18;
    const N = Math.max(total || 0, rows.reduce((a, x) => Math.max(a, x.n), 0), 2);
    const X = (n) => L + ((n - 1) / (N - 1)) * (W - L - R);
    const Y = (v) => T + (1 - v / 10) * (H - T - B);
    const line = (pts) => pts.map((x) => `${X(x.n).toFixed(1)},${Y(x.v).toFixed(1)}`).join(' ');
    const avg = rows.length ? rows.reduce((a, x) => a + x.v, 0) / rows.length : null;
    const best = rows.length ? rows.reduce((a, x) => (x.v > a.v ? x : a), rows[0]) : null;
    const worst = rows.length ? rows.reduce((a, x) => (x.v < a.v ? x : a), rows[0]) : null;
    const fl = (friends || []).map((f, i) => `<polyline class="alb-fl" points="${line(f.tracks.slice().sort((a, b) => a.n - b.n))}" style="--c:${COLORS[i % COLORS.length]}"/>`).join('');
    const ticks = Array.from({ length: N }, (_, i) => i + 1).filter((n) => N <= 16 || n === 1 || n === N || n % 5 === 0)
      .map((n) => `<text class="alb-tk" x="${X(n).toFixed(1)}" y="${H - 4}">${n}</text>`).join('');
    const dots = rows.map((x) => `<circle class="alb-dot" data-tier="${tierV(x.v)}" cx="${X(x.n).toFixed(1)}" cy="${Y(x.v).toFixed(1)}" r="${best && x.n === best.n ? 4.6 : 3.2}"><title>${esc(x.n + '. ' + (x.t || '') + ' — ' + fmtS(x.v))}</title></circle>`).join('');
    const tag = (x, text, below) => `<text class="alb-lab" x="${Math.min(W - 24, Math.max(24, X(x.n))).toFixed(1)}" y="${(below ? Y(x.v) + 14 : Y(x.v) - 8).toFixed(1)}">${text}</text>`;
    return `<svg class="alb-curve${opts && opts.big ? ' big' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Баллы треков по порядку${avg != null ? ', в среднем ' + fmt(Math.round(avg * 10) / 10) : ''}">
      ${[2.5, 5, 7.5].map((v) => `<line class="alb-grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/>`).join('')}
      ${avg != null ? `<line class="alb-avg" x1="${L}" x2="${W - R}" y1="${Y(avg).toFixed(1)}" y2="${Y(avg).toFixed(1)}"/>` : ''}
      ${fl}
      ${rows.length > 1 ? `<polyline class="alb-line" points="${line(rows)}"/>` : ''}
      ${dots}
      ${best && rows.length > 2 ? tag(best, 'лучший') : ''}
      ${worst && rows.length > 2 && avg - worst.v >= 1.5 ? tag(worst, 'провал', true) : ''}
      ${ticks}
    </svg>`;
  }
  const rowsOf = (tracks) => tracks.filter((t) => scoreOf(t) != null).map((t) => ({ n: t.trackNo, v: scoreOf(t), t: titleOf(t) }));

  // ---------- карточка в рейтинге ----------
  function cardHTML(r) {
    if (r.albumOf) {
      const al = state.ratings.find((x) => x.id === r.albumOf);
      return (al ? `<p class="alb-from">Трек ${r.trackNo} из альбома <button type="button" class="linkish" data-alb="goto" data-id="${esc(al.id)}">${esc(titleOf(al))}</button>${tagsOf(r).length ? ' · ' + esc(tagsOf(r).join(', ')) : ''}</p>` : '') + listenBtn(r);
    }
    if (!isAlbum(r)) return isMusicCat(catOf(r)) && !r.example ? listenBtn(r) : '';
    const tracks = tracksOf(r.id);
    const own = state.canWrite && (!r.author || !state.user || r.author.id === state.user.id);
    if (!tracks.length) {
      return own ? `<div class="alb-card alb-empty"><p>${r.total != null ? 'Эту оценку можно уточнить: разбери альбом по трекам под отрывки — получится кардиограмма, а потом обнови оценку альбома.' : 'Оцени каждый трек отдельно под отрывки — получится кардиограмма альбома.'}</p><button type="button" class="btn small primary" data-alb="open" data-id="${esc(r.id)}">Разобрать по трекам</button></div>` : '';
    }
    const rows = rowsOf(tracks);
    const N = r.trackCount || tracks.length;
    const done = rows.length + (r.skip || []).filter((n) => !rows.some((x) => x.n === n)).length;
    const avg = rows.length ? Math.round((rows.reduce((a, x) => a + x.v, 0) / rows.length) * 10) / 10 : null;
    const fr = friendsCache.get(keyOf(r.name)) || null;
    const chips = verdicts(rows).map((v) => `<span class="alb-chip" data-k="${v.k}">${esc(v.t)}</span>`);
    if (fr && fr.length) fr.forEach((f, i) => {
      const a = agreement(rows, f.tracks);
      if (!a) return;
      chips.push(`<span class="alb-chip" style="--c:${COLORS[i % COLORS.length]}" data-k="friend">${esc(f.user.username)}: сошлись в ${a.agree} из ${a.of}</span>`);
      if (a.fight) chips.push(`<span class="alb-chip" data-k="bad">Главный спор: трек ${a.fight.n} — ты ${fmtS(a.fight.mine)}, ${esc(f.user.username)} ${fmtS(a.fight.v)}</span>`);
    });
    const list = tracks.map((t) => {
      const v = scoreOf(t);
      return `<li><button type="button" data-alb="track" data-id="${esc(r.id)}" data-n="${t.trackNo}"${own ? '' : ' disabled'}><span class="alb-n">${t.trackNo}</span><span class="alb-t">${esc(titleOf(t))}${tagsOf(t).map((g) => ` <small>${esc(g)}</small>`).join('')}</span><b class="badge" data-tier="${tierT(v)}">${fmtS(v)}</b></button></li>`;
    }).join('');
    return `<div class="alb-card">
      <div class="alb-head"><b>Кардиограмма альбома</b><span>${avg != null ? 'среднее по трекам ' + fmt(avg) : ''}${done < N ? ` · разобрано ${done} из ${N}` : ''}</span></div>
      ${curveSVG(rows, N, fr)}
      ${fr && fr.length ? `<p class="alb-legend"><span style="--c:var(--accent)">ты</span>${fr.map((f, i) => `<span style="--c:${COLORS[i % COLORS.length]}">${esc(f.user.username)}</span>`).join('')}</p>` : fr ? '<p class="alb-legend">Никто из друзей ещё не разбирал этот альбом.</p>' : ''}
      ${chips.length ? `<div class="alb-chips">${chips.join('')}</div>` : ''}
      ${rescoreHTML(r, avg, own)}
      <div class="alb-acts">
        ${own ? `<button type="button" class="btn small ${done < N ? 'primary' : 'ghost'}" data-alb="open" data-id="${esc(r.id)}">${done < N ? 'Продолжить разбор' : 'Переслушать'}</button>` : ''}
        ${window.casualApi && window.casualApi.online() && !fr ? `<button type="button" class="btn small ghost" data-alb="friends" data-id="${esc(r.id)}">Сравнить с друзьями</button>` : ''}
        <a class="btn small ghost" href="/tierlist/#album=${encodeURIComponent(r.id)}">Тир-лист треков</a>
        ${rows.length >= 2 ? `<button type="button" class="btn small ghost" data-alb="png" data-id="${esc(r.id)}">Картинка</button>` : ''}
      </div>
      <details class="alb-list"><summary>${tracks.length} ${plural(tracks.length, 'трек', 'трека', 'треков')}</summary><ol>${list}</ol></details>
    </div>`;
  }
  // старая оценка альбома (поставлена до разбора): показать разницу со средним по трекам и попросить обновить
  function rescoreHTML(r, avg, own) {
    if (!r.rescore || r.total == null || avg == null) return '';
    const d = Math.round((avg - r.total) * 10) / 10;
    return `<div class="alb-old"><p><b>Оценка альбома старая</b> — она поставлена до разбора по трекам: у альбома ${fmt(r.total)}, а в среднем по трекам ${fmt(avg)}${Math.abs(d) >= 0.5 ? ` (${d > 0 ? 'на ' + fmt(d) + ' выше' : 'на ' + fmt(-d) + ' ниже'})` : ''}. Обнови её с учётом треков.</p>${own ? `<button type="button" class="btn small primary" data-alb="rescore" data-id="${esc(r.id)}">Изменить оценку альбома</button>` : ''}</div>`;
  }
  // ---------- отрывок одного трека: синглы и треки из прошлых и новых оценок ----------
  const previews = new Map(); // ключ трека → { preview, link } или null (не нашёлся)
  let solo = null; // { audio, key, btn }
  const listenBtn = (r) => `<div class="alb-listen"><button type="button" class="btn small ghost" data-alb="listen" data-id="${esc(r.id)}" aria-pressed="false"><span class="alb-li" aria-hidden="true">▶</span> Слушать отрывок</button><small class="alb-lmsg" role="status"></small></div>`;
  async function previewOf(q) {
    const key = keyOf((q.artist || '') + '|' + q.title + '|' + (q.link || ''));
    if (previews.has(key)) return previews.get(key);
    let t = null;
    if (window.casualApi && window.casualApi.online()) {
      try { t = ((await window.casualApi.get('/music/track?' + new URLSearchParams({ artist: q.artist || '', title: q.title, link: q.link || '' }).toString())) || {}).track || null; } catch (e) {}
    }
    if (!t) { // без аккаунта: Apple прямо из браузера
      try {
        const d = await (await fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=5&country=US&term=${encodeURIComponent(((q.artist || '') + ' ' + q.title).trim())}`)).json();
        const hit = (d.results || []).find((x) => x.previewUrl && keyOf(x.trackName).includes(keyOf(q.title).slice(0, 20)));
        if (hit) t = { preview: hit.previewUrl, link: musicLinkOk(hit.trackViewUrl) };
      } catch (e) {}
    }
    previews.set(key, t);
    return t;
  }
  function stopSolo() {
    if (!solo) return;
    solo.audio.pause();
    if (solo.btn && solo.btn.isConnected) { solo.btn.setAttribute('aria-pressed', 'false'); solo.btn.querySelector('.alb-li').textContent = '▶'; }
    solo = null;
  }
  async function listen(btn, q) {
    const key = keyOf((q.artist || '') + '|' + q.title + '|' + (q.link || ''));
    if (solo && solo.key === key) { stopSolo(); return; }
    stopSolo();
    const msg = btn.parentElement.querySelector('.alb-lmsg');
    btn.disabled = true;
    const t = await previewOf(q);
    btn.disabled = false;
    if (!t || !t.preview) { if (msg) msg.textContent = 'Отрывок не нашёлся ни в Deezer, ни в Apple Music.'; return; }
    if (msg) msg.textContent = '';
    if (ses) { ses.audio.pause(); ses.playing = false; paintPlay(); }
    const audio = new Audio(t.preview);
    audio.volume = volume();
    solo = { audio, key, btn };
    btn.setAttribute('aria-pressed', 'true');
    btn.querySelector('.alb-li').textContent = '❚❚';
    audio.addEventListener('ended', () => { if (solo && solo.audio === audio) stopSolo(); });
    audio.play().catch(() => stopSolo());
  }
  // треки, свёрнутые в карточку альбома (альбом есть в рейтинге); тот, к которому ведут ссылкой, остаётся в списке
  function folded(pool) {
    const albums = new Set(state.ratings.filter((x) => x.trackCount > 0).map((x) => x.id));
    if (!albums.size) return null;
    const keep = new Set([state.pinId, state.flashId, state.confirmDel].filter(Boolean));
    const out = new Set(pool.filter((r) => r.albumOf && albums.has(r.albumOf) && !keep.has(r.id)).map((r) => r.id));
    return out.size ? out : null;
  }

  // ---------- кнопка в форме: «Разобрать по трекам» у альбома ----------
  function formHint() {
    const box = document.getElementById('albumGo');
    if (!box) return;
    const st = String(form.status || '').trim();
    const on = state.canWrite && formMusic() && st === 'Альбом';
    const single = formMusic() && st !== 'Альбом' && String(form.name || '').trim().length > 1;
    const al = form.editingId ? state.ratings.find((x) => x.id === form.editingId) : null;
    const n = al ? tracksOf(al.id).length : 0;
    // разбор альбома — заметной карточкой между фото и критериями; отрывок сингла — под названием
    const html = on ? `<span class="alb-go-disc" aria-hidden="true"></span><span class="alb-go-t"><b>${n ? 'Разбор по трекам начат' : 'Разбор по трекам'}</b><small>Оцени каждый трек под 30-секундный отрывок — получится кардиограмма альбома. Сам альбом можно оценить потом</small></span><button type="button" class="btn primary" id="albumGoBtn">${n ? 'Продолжить разбор' : 'Разобрать по трекам'}</button>` : '';
    const thtml = single ? `<div class="alb-listen"><button type="button" class="btn small ghost" id="albumListenBtn" aria-pressed="false"><span class="alb-li" aria-hidden="true">▶</span> Слушать отрывок</button><small class="alb-lmsg" role="status"></small></div>` : '';
    if (!single && solo && solo.btn && solo.btn.id === 'albumListenBtn') stopSolo();
    box.hidden = !html;
    if (box.dataset.h !== html) { box.dataset.h = html; box.innerHTML = html; }
    const tb = document.getElementById('trackGo');
    if (tb) { tb.hidden = !thtml; if (tb.dataset.h !== thtml) { tb.dataset.h = thtml; tb.innerHTML = thtml; } }
  }

  // ---------- треклист ----------
  async function loadAlbum(al) {
    const q = { src: al.albumSrc || '', link: al.link || '', artist: al.artist || '', title: titleOf(al) };
    if (window.casualApi && window.casualApi.online()) {
      try {
        const d = await window.casualApi.get('/music/album?' + new URLSearchParams(q).toString());
        if (d && d.album && d.album.tracks && d.album.tracks.length) return d.album;
      } catch (e) {}
    }
    // без аккаунта (или сервер не нашёл): Apple прямо из браузера
    try {
      const term = (q.artist ? q.artist + ' ' : '') + q.title;
      const s = await (await fetch(`https://itunes.apple.com/search?media=music&entity=album&limit=5&country=US&term=${encodeURIComponent(term)}`)).json();
      const hit = (s.results || []).find((x) => keyOf(x.collectionName).includes(keyOf(q.title)) || keyOf(q.title).includes(keyOf(x.collectionName)));
      if (!hit) return null;
      const d = await (await fetch(`https://itunes.apple.com/lookup?id=${hit.collectionId}&entity=song&country=US&limit=200`)).json();
      const songs = (d.results || []).filter((x) => x.wrapperType === 'track').sort((a, b) => (a.discNumber - b.discNumber) || (a.trackNumber - b.trackNumber)).slice(0, 60);
      if (!songs.length) return null;
      return {
        src: 'it:' + hit.collectionId, title: hit.collectionName, artist: hit.artistName, year: String(hit.releaseDate || '').slice(0, 4),
        art: String(hit.artworkUrl100 || '').replace(/\/\d+x\d+bb\./, '/600x600bb.'), link: '',
        tracks: songs.map((x, i) => ({ n: i + 1, title: x.trackName, artist: x.artistName, dur: Math.round((x.trackTimeMillis || 0) / 1000), preview: /^https:/.test(x.previewUrl || '') ? x.previewUrl : '', link: musicLinkOk(x.trackViewUrl) })),
      };
    } catch (e) { return null; }
  }

  // ---------- прослушка ----------
  async function open(albumId, startN) {
    const al = state.ratings.find((x) => x.id === albumId);
    if (!al) return;
    if (ses) close();
    const ov = document.createElement('div');
    ov.className = 'alb-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Разбор альбома ' + al.name);
    ov.innerHTML = `<div class="alb-box"><div class="alb-load"><span class="alb-disc spin"></span><p>Ищу треклист «${esc(titleOf(al))}»…</p></div></div>`;
    document.body.append(ov);
    document.documentElement.classList.add('locked');
    ses = { al, ov, data: null, i: 0, playing: false, crit: false, audio: new Audio(), prevFocus: document.activeElement, tags: new Set(), cs: {} };
    ses.audio.preload = 'auto';
    ses.audio.volume = volume();
    // громкость: ползунок у отрывка, запоминается в этом браузере
    ov.addEventListener('input', (e) => {
      if (!ses || !e.target.matches('.alb-vol')) return;
      const v = Math.max(0, Math.min(1, +e.target.value || 0));
      ses.audio.volume = v;
      e.target.style.setProperty('--v', v * 100 + '%');
      e.target.setAttribute('aria-valuetext', Math.round(v * 100) + '%');
      try { localStorage.setItem(VOL_KEY, String(v)); } catch (x) {}
    });
    ov.addEventListener('click', onClick);
    ov.addEventListener('keydown', onKey);
    ses.audio.addEventListener('timeupdate', paintTime);
    ses.audio.addEventListener('ended', () => { ses && (ses.playing = false); paintPlay(); });
    const data = await loadAlbum(al);
    if (!ses || ses.al !== al) return;
    if (!data) {
      ov.querySelector('.alb-box').innerHTML = `<div class="alb-load"><p>Не нашёл треклист этого альбома в Deezer и Apple Music. Проверь исполнителя и название альбома в оценке.</p><button type="button" class="btn small" data-alb-x="close">Закрыть</button></div>`;
      ov.querySelector('button').focus();
      return;
    }
    ses.data = data;
    // уже оценённые раньше синглы с тем же названием цепляются к альбому, а не дублируются
    const loose = new Map(state.ratings.filter((x) => !x.albumOf && x.id !== al.id && isMusicCat(catOf(x))).map((x) => [x.nameKey, x]));
    ses.have = new Map();
    for (const t of data.tracks) {
      const mine = state.ratings.find((x) => x.albumOf === al.id && x.trackNo === t.n) || loose.get(keyOf(composeName(t.artist || al.artist || '', t.title)));
      if (mine) ses.have.set(t.n, mine);
    }
    ses.skip = new Set(al.skip || []);
    // альбом запоминает, откуда треклист и сколько в нём треков
    const old = al.total != null && !tracksOf(al.id).length && !al.trackCount;
    if (al.trackCount !== data.tracks.length || al.albumSrc !== data.src || old) await saveAlbum({ trackCount: data.tracks.length, albumSrc: data.src, ...(old ? { rescore: true } : {}) });
    const first = startN ? data.tracks.findIndex((t) => t.n === startN) : data.tracks.findIndex((t) => !ses.have.has(t.n) && !ses.skip.has(t.n));
    ses.i = first >= 0 ? first : 0;
    if (!startN && first < 0) ses.summary = true;
    paint();
  }
  function close() {
    if (!ses) return;
    stopSolo();
    ses.audio.pause();
    ses.audio.src = '';
    ses.ov.remove();
    document.documentElement.classList.remove('locked');
    const f = ses.prevFocus;
    ses = null;
    renderBoard();
    if (f && f.isConnected) f.focus({ preventScroll: true });
  }
  async function saveAlbum(patch) {
    const al = state.ratings.find((x) => x.id === ses.al.id) || ses.al;
    const doc = { ...al, ...patch, updatedAt: new Date().toISOString() };
    await putRating(al.id, doc);
    ses.al = state.ratings.find((x) => x.id === al.id) || doc;
  }
  const cur = () => ses.data.tracks[ses.i];
  function critRows() {
    const cat = state.cats.find((c) => c.id === ses.al.cat);
    return cat ? cat.criteria : [];
  }
  function paint() {
    const { al, data } = ses;
    const box = ses.ov.querySelector('.alb-box');
    const art = data.art || resolvePhotoUrl(al.photo) || '';
    if (ses.summary) { paintSummary(box, art); return; }
    const t = cur();
    const prev = ses.have.get(t.n);
    const v = prev ? scoreOf(prev) : null;
    ses.tags = new Set(prev ? tagsOf(prev) : []);
    ses.cs = {};
    if (prev) prev.scores.forEach((s) => { if (s.id !== TRK_SCORE && s.v) ses.cs[s.id] = s.v; });
    const crit = critRows();
    const strip = data.tracks.map((x, i) => {
      const h = ses.have.get(x.n), sv = h ? scoreOf(h) : null;
      return `<button type="button" class="alb-bar${i === ses.i ? ' cur' : ''}${ses.skip.has(x.n) && sv == null ? ' sk' : ''}" data-alb-i="${i}" data-tier="${sv != null ? tierV(sv) : 'none'}" style="--h:${sv != null ? Math.max(8, sv * 10) : 8}%" title="${esc(x.n + '. ' + x.title + (sv != null ? ' — ' + fmtS(sv) : ses.skip.has(x.n) ? ' — пропущен' : ''))}" aria-label="${esc('Трек ' + x.n + ': ' + x.title)}"><i></i></button>`;
    }).join('');
    box.innerHTML = `
      <header class="alb-top"><span class="alb-at"><b>${esc(titleOf(al))}</b><small>${esc(al.artist || data.artist || '')}${data.year ? ' · ' + esc(data.year) : ''}</small></span>
        <button type="button" class="alb-x" data-alb-x="close" aria-label="Закрыть разбор">✕</button></header>
      <div class="alb-stage">
        <div class="alb-vinyl${ses.playing ? ' on' : ''}"><span class="alb-disc"></span>${art ? `<img src="${esc(art)}" alt="" referrerpolicy="no-referrer">` : ''}<span class="alb-hole"></span></div>
        <div class="alb-now">
          <small>Трек ${t.n} из ${data.tracks.length}</small>
          <b class="alb-title">${esc(t.title)}</b>
          ${t.artist && keyOf(t.artist) !== keyOf(al.artist) ? `<span class="alb-feat">${esc(t.artist)}</span>` : ''}
          <div class="alb-play">${t.preview ? `<button type="button" class="alb-pp" data-alb-x="play" aria-label="${ses.playing ? 'Пауза' : 'Слушать отрывок'}">${ses.playing ? '❚❚' : '▶'}</button><span class="alb-time"><i style="width:0%"></i></span><small class="alb-sec">0:30</small><label class="alb-volw" title="Громкость"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6h2.5l3.5-3v10L5 10H2.5z"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M13 3.5a6.3 6.3 0 0 1 0 9"/></svg><input type="range" class="alb-vol" min="0" max="1" step="0.05" value="${ses.audio.volume}" style="--v:${ses.audio.volume * 100}%" aria-label="Громкость" aria-valuetext="${Math.round(ses.audio.volume * 100)}%"></label>` : `<span class="alb-noprev">Отрывка нет.</span>`}${t.link ? `<a class="linkish" href="${esc(t.link)}" target="_blank" rel="noopener">Целиком</a>` : ''}</div>
        </div>
      </div>
      <div class="alb-scale" role="group" aria-label="Балл трека от 1 до 10">${Array.from({ length: 10 }, (_, k) => k + 1).map((n) => `<button type="button" data-alb-v="${n}" data-tier="${tierV(n)}" aria-pressed="${v != null && Math.round(v) === n}">${n}</button>`).join('')}</div>
      <div class="alb-tags" role="group" aria-label="Метки трека">${TAGS.map((g) => `<button type="button" data-alb-tag="${esc(g)}" aria-pressed="${ses.tags.has(g)}">${esc(g)}</button>`).join('')}</div>
      ${ses.crit && crit.length ? `<div class="alb-crit">${crit.map((c) => `<div class="alb-cr"><span>${esc(c.name)}</span><span class="alb-mini">${Array.from({ length: 10 }, (_, k) => k + 1).map((n) => `<button type="button" data-alb-c="${esc(c.id)}" data-v="${n}" data-tier="${tierV(n)}" aria-pressed="${ses.cs[c.id] === n}" aria-label="${esc(c.name)}: ${n}">${n}</button>`).join('')}</span></div>`).join('')}<button type="button" class="btn small primary" data-alb-x="crit-save">Сохранить трек${Object.keys(ses.cs).length ? ' · ' + fmt(totalOf(crit.filter((c) => ses.cs[c.id]).map((c) => ({ v: ses.cs[c.id], w: c.w })))) : ''}</button></div>` : ''}
      <div class="alb-row">
        <button type="button" class="btn small ghost" data-alb-x="prev"${ses.i ? '' : ' disabled'}>← Назад</button>
        ${crit.length ? `<button type="button" class="btn small ghost" data-alb-x="crit" aria-pressed="${ses.crit}">По критериям</button>` : ''}
        <button type="button" class="btn small ghost" data-alb-x="skip">${ses.skip.has(t.n) ? 'Пропущен' : 'Пропустить'}</button>
        <button type="button" class="btn small ghost" data-alb-x="next"${ses.i < data.tracks.length - 1 ? '' : ' disabled'}>Дальше →</button>
        <button type="button" class="btn small ghost" data-alb-x="rate-album" title="Оценить альбом целиком по всем критериям музыки">Оценить целиком</button>
      </div>
      <div class="alb-strip" aria-label="Треки альбома">${strip}</div>
      <p class="alb-keys">Клавиши: 1–9 и 0 (=10) — балл и следующий трек · пробел — отрывок · S — пропустить</p>`;
    if (t.preview && ses.audio.dataset.n !== String(t.n)) {
      ses.audio.src = t.preview;
      ses.audio.dataset.n = String(t.n);
      if (ses.playing) ses.audio.play().catch(() => { ses.playing = false; paintPlay(); });
    } else if (!t.preview) { ses.audio.pause(); ses.audio.dataset.n = ''; }
    const focus = box.querySelector(`.alb-scale [aria-pressed="true"]`) || box.querySelector('.alb-scale button');
    if (focus && !box.contains(document.activeElement)) focus.focus({ preventScroll: true });
  }
  function paintPlay() {
    if (!ses) return;
    const b = ses.ov.querySelector('.alb-pp');
    if (b) { b.textContent = ses.playing ? '❚❚' : '▶'; b.setAttribute('aria-label', ses.playing ? 'Пауза' : 'Слушать отрывок'); }
    const vin = ses.ov.querySelector('.alb-vinyl');
    if (vin) vin.classList.toggle('on', ses.playing);
  }
  function paintTime() {
    if (!ses) return;
    const a = ses.audio, i = ses.ov.querySelector('.alb-time i'), s = ses.ov.querySelector('.alb-sec');
    if (i && a.duration) i.style.width = (a.currentTime / a.duration) * 100 + '%';
    if (s && a.duration) s.textContent = '0:' + String(Math.max(0, Math.ceil(a.duration - a.currentTime))).padStart(2, '0');
  }
  function paintSummary(box, art) {
    const { al, data } = ses;
    const tracks = tracksOf(al.id);
    const rows = rowsOf(tracks);
    const avg = rows.length ? Math.round((rows.reduce((a, x) => a + x.v, 0) / rows.length) * 10) / 10 : null;
    const best = rows.slice().sort((a, b) => b.v - a.v)[0];
    const left = data.tracks.filter((t) => !ses.have.has(t.n) && !ses.skip.has(t.n)).length;
    box.innerHTML = `
      <header class="alb-top"><span class="alb-at"><b>${esc(titleOf(al))}</b><small>${esc(al.artist || data.artist || '')}</small></span>
        <button type="button" class="alb-x" data-alb-x="close" aria-label="Закрыть разбор">✕</button></header>
      <div class="alb-sum">
        ${art ? `<img class="alb-sumart" src="${esc(art)}" alt="" referrerpolicy="no-referrer">` : ''}
        <div><p class="alb-big">${avg != null ? fmt(avg) : '—'}<small>среднее по ${rows.length} ${plural(rows.length, 'треку', 'трекам', 'трекам')}</small></p>
        ${best ? `<p class="alb-best">Лучший трек: <b>${esc(best.t)}</b> · ${fmtS(best.v)}</p>` : ''}
        ${left ? `<p class="alb-best">Осталось разобрать: ${left}</p>` : ''}</div>
      </div>
      ${al.rescore && al.total != null && avg != null ? `<p class="alb-old-s"><b>Оценка альбома старая:</b> ${fmt(al.total)} — она поставлена до разбора. Обнови её с учётом треков.</p>` : ''}
      ${curveSVG(rows, data.tracks.length, null, { big: true })}
      <div class="alb-chips">${verdicts(rows).map((v) => `<span class="alb-chip" data-k="${v.k}">${esc(v.t)}</span>`).join('')}</div>
      <div class="alb-row">
        ${left ? '<button type="button" class="btn small primary" data-alb-x="resume">Продолжить</button>' : ''}
        ${al.total == null || al.rescore ? `<button type="button" class="btn small${left ? ' ghost' : ' primary'}" data-alb-x="rate-album">${al.rescore ? 'Изменить оценку альбома' : 'Оценить альбом целиком'}</button>` : ''}
        <a class="btn small ghost" href="/tierlist/#album=${encodeURIComponent(al.id)}">Тир-лист треков</a>
        ${rows.length >= 2 ? '<button type="button" class="btn small ghost" data-alb-x="png">Картинка</button>' : ''}
        <button type="button" class="btn small ghost" data-alb-x="close">Готово</button>
      </div>`;
    (box.querySelector('.alb-row .primary') || box.querySelector('.alb-x')).focus({ preventScroll: true });
  }
  // сохранить балл текущего трека отдельной оценкой и перейти к следующему неразобранному
  async function rate(scores) {
    const { al, data } = ses;
    const t = cur();
    const prev = ses.have.get(t.n);
    const now = new Date().toISOString();
    const artist = (t.artist || al.artist || data.artist || '').slice(0, 80);
    const name = composeName(artist, t.title).slice(0, 140);
    const year = yearOf(al.meta) || data.year || '';
    const keepMeta = prev ? String(prev.meta || '').split(/\s*,\s*/).filter((x) => x && !TAGS.includes(x) && x !== year) : [];
    const art = data.art || '';
    const id = prev ? prev.id : newId('r');
    const doc = {
      cat: al.cat, catName: al.catName, name, nameKey: keyOf(name), scores, total: totalOf(scores),
      fav: !!(prev && prev.fav), status: 'Трек', ...(al.vis ? { vis: al.vis } : {}),
      meta: [year, ...keepMeta, ...TAGS.filter((g) => ses.tags.has(g))].filter(Boolean).join(', ').slice(0, 80),
      ...(musicLinkOk(t.link) ? { link: t.link } : prev && prev.link ? { link: prev.link } : {}),
      pros: prev ? prev.pros : '', cons: prev ? prev.cons : '', note: prev ? prev.note : '', example: false,
      createdAt: prev ? prev.createdAt || now : now, updatedAt: now,
      artist, title: t.title.slice(0, 140), ...(artistFpOf(artist) ? { artistAva: artistFpOf(artist) } : {}),
      albumOf: al.id, trackNo: t.n,
    };
    if (prev && prev.photo) doc.photo = prev.photo;
    else if (/^https:\/\//.test(art)) doc.photo = { id: art, data: '', w: 600, h: 600 };
    try {
      await putRating(id, doc);
      logRatingSave(prev || null, id, doc, scores.length);
    } catch (e) { handleWriteError(e); return; }
    const saved = state.ratings.find((x) => x.id === id) || doc;
    ses.have.set(t.n, saved);
    if (ses.skip.has(t.n)) { ses.skip.delete(t.n); await saveAlbum({ skip: [...ses.skip] }); }
    ses.crit = false;
    advance();
  }
  function advance() {
    const { data } = ses;
    const next = data.tracks.findIndex((x, i) => i > ses.i && !ses.have.has(x.n) && !ses.skip.has(x.n));
    const any = data.tracks.findIndex((x) => !ses.have.has(x.n) && !ses.skip.has(x.n));
    const go = () => { if (!ses) return; if (next >= 0) ses.i = next; else if (any >= 0) ses.i = any; else ses.summary = true; paint(); };
    if (reduce()) go(); else { ses.ov.querySelector('.alb-box').classList.add('flip'); setTimeout(() => { if (ses) { ses.ov.querySelector('.alb-box').classList.remove('flip'); go(); } }, 220); }
  }
  async function toggleSkip() {
    const t = cur();
    if (ses.skip.has(t.n)) ses.skip.delete(t.n); else ses.skip.add(t.n);
    await saveAlbum({ skip: [...ses.skip] });
    if (ses.skip.has(t.n)) advance(); else paint();
  }
  function play() {
    const a = ses.audio;
    if (ses.playing) { a.pause(); ses.playing = false; }
    else { ses.playing = true; a.play().catch(() => { if (ses) { ses.playing = false; paintPlay(); } }); }
    paintPlay();
  }
  function onClick(e) {
    if (!ses) return;
    if (e.target === ses.ov) { close(); return; }
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const crit = critRows();
    if (b.dataset.albV) { rate([{ id: TRK_SCORE, name: 'Оценка трека', desc: '', w: 1, v: +b.dataset.albV }]); return; }
    if (b.dataset.albTag) { const g = b.dataset.albTag; if (ses.tags.has(g)) ses.tags.delete(g); else ses.tags.add(g); b.setAttribute('aria-pressed', String(ses.tags.has(g))); retag(); return; }
    if (b.dataset.albC) { ses.cs[b.dataset.albC] = +b.dataset.v; repaintCrit(); return; }
    if (b.dataset.albI != null) { ses.i = +b.dataset.albI; ses.summary = false; ses.crit = false; paint(); return; }
    switch (b.dataset.albX) {
      case 'close': close(); break;
      case 'play': play(); break;
      case 'prev': if (ses.i > 0) { ses.i--; ses.crit = false; paint(); } break;
      case 'next': if (ses.i < ses.data.tracks.length - 1) { ses.i++; ses.crit = false; paint(); } break;
      case 'skip': toggleSkip(); break;
      case 'crit': ses.crit = !ses.crit; paint(); break;
      case 'crit-save': {
        const sc = crit.filter((c) => ses.cs[c.id]).map((c) => ({ id: c.id, name: c.name, desc: c.desc || '', w: c.w || 1, v: ses.cs[c.id] }));
        if (sc.length) rate(sc); else toast('Поставь балл хотя бы по одному критерию');
        break;
      }
      case 'resume': ses.summary = false; advance(); break;
      case 'rate-album': { const al = state.ratings.find((x) => x.id === ses.al.id); const avg = rowsOf(tracksOf(al.id)); close(); loadIntoForm(al, { rate: true }); if (avg.length) setTimeout(() => toast(`Среднее по трекам: ${fmt(Math.round((avg.reduce((a, x) => a + x.v, 0) / avg.length) * 10) / 10)}. Теперь оцени альбом целиком`), 2900); break; }
      case 'png': sharePNG(ses.al.id); break;
    }
  }
  // метки меняются и у уже оценённого трека — без перехода к следующему
  async function retag() {
    const t = cur(), prev = ses.have.get(t.n);
    if (!prev) return;
    const year = yearOf(ses.al.meta) || ses.data.year || '';
    const rest = String(prev.meta || '').split(/\s*,\s*/).filter((x) => x && !TAGS.includes(x) && x !== year);
    const doc = { ...prev, meta: [year, ...rest, ...TAGS.filter((g) => ses.tags.has(g))].filter(Boolean).join(', ').slice(0, 80), updatedAt: new Date().toISOString() };
    await putRating(prev.id, doc);
    ses.have.set(t.n, state.ratings.find((x) => x.id === prev.id) || doc);
  }
  function repaintCrit() {
    const crit = critRows();
    ses.ov.querySelectorAll('[data-alb-c]').forEach((b) => b.setAttribute('aria-pressed', String(ses.cs[b.dataset.albC] === +b.dataset.v)));
    ses.ov.querySelectorAll('.alb-tags [data-alb-tag]').forEach((b) => b.setAttribute('aria-pressed', String(ses.tags.has(b.dataset.albTag))));
    const sv = ses.ov.querySelector('[data-alb-x="crit-save"]');
    const sc = crit.filter((c) => ses.cs[c.id]).map((c) => ({ v: ses.cs[c.id], w: c.w }));
    if (sv) sv.textContent = 'Сохранить трек' + (sc.length ? ' · ' + fmt(totalOf(sc)) : '');
  }
  function onKey(e) {
    if (!ses) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') { // фокус не уходит из окна
      const f = [...ses.ov.querySelectorAll('button:not([disabled]), a[href]')];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      return;
    }
    if (!ses.data || ses.summary || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key) && !ses.crit) { e.preventDefault(); rate([{ id: TRK_SCORE, name: 'Оценка трека', desc: '', w: 1, v: e.key === '0' ? 10 : +e.key }]); return; }
    if (e.key === ' ' && !e.target.closest('button, a')) { e.preventDefault(); if (cur().preview) play(); return; }
    if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') { e.preventDefault(); toggleSkip(); return; }
    if (e.key === 'ArrowRight' && !e.target.closest('.alb-scale, .alb-mini')) { if (ses.i < ses.data.tracks.length - 1) { ses.i++; paint(); } }
    if (e.key === 'ArrowLeft' && !e.target.closest('.alb-scale, .alb-mini')) { if (ses.i > 0) { ses.i--; paint(); } }
  }

  // ---------- картинка для друзей: обложка, кардиограмма, лучший трек ----------
  const loadImg = (src) => new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.referrerPolicy = 'no-referrer'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  async function sharePNG(albumId) {
    const al = state.ratings.find((x) => x.id === albumId);
    if (!al) return;
    const rows = rowsOf(tracksOf(al.id));
    if (rows.length < 2) return;
    const cs = getComputedStyle(document.documentElement);
    const col = (v, d) => (cs.getPropertyValue(v) || '').trim() || d;
    const C = { bg: col('--bg', '#0D0F14'), panel: col('--panel', '#161922'), ink: col('--ink', '#F3F4F6'), ink3: col('--ink-3', '#8A90A0'), line: col('--line', '#2B2E38'), accent: col('--accent', '#3550E8'), good: col('--good', '#43C97A'), mid: col('--mid', '#F2BA44'), bad: col('--bad', '#F26A55') };
    const W = 1080, H = 1350, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    const art = (ses && ses.al.id === al.id && ses.data && ses.data.art) || (/^https:/.test((tracksOf(al.id)[0] || {}).photo?.id || '') ? tracksOf(al.id)[0].photo.id : '') || resolvePhotoUrl(al.photo);
    const im = art ? await loadImg(art) : null;
    const disp = cs.getPropertyValue('--font-display').trim() || 'Handjet, sans-serif';
    if (im) { try { g.drawImage(im, 80, 80, 360, 360); g.getImageData(0, 0, 1, 1); } catch (e) { g.fillStyle = C.bg; g.fillRect(80, 80, 360, 360); } }
    g.fillStyle = C.ink; g.font = `700 64px ${disp}`;
    // название в несколько строк: лишнее обрезается многоточием
    const lines = (text, max, n) => {
      const out = [];
      let line = '';
      for (const w of String(text).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > max && line) { out.push(line); line = w; } else line = t; }
      if (line) out.push(line);
      if (out.length > n) { out.length = n; out[n - 1] = out[n - 1].replace(/\s*\S*$/, '') + '…'; }
      return out;
    };
    const tl = lines(titleOf(al), 520, 3);
    tl.forEach((x, i) => g.fillText(x, 480, 150 + i * 66));
    const n1 = tl.length;
    g.fillStyle = C.ink3; g.font = `500 36px Onest, sans-serif`; g.fillText(al.artist || '', 480, 150 + n1 * 66 + 6);
    const avg = Math.round((rows.reduce((a, x) => a + x.v, 0) / rows.length) * 10) / 10;
    g.fillStyle = C.ink; g.font = `700 150px ${disp}`; g.fillText(fmt(avg), 480, 430);
    g.fillStyle = C.ink3; g.font = `500 30px Onest, sans-serif`; g.fillText(`среднее по ${rows.length} ${plural(rows.length, 'треку', 'трекам', 'трекам')}`, 480, 470);
    // кардиограмма
    const N = Math.max(al.trackCount || 0, ...rows.map((x) => x.n), 2), L = 90, R = 990, T = 560, B = 960;
    const X = (n) => L + ((n - 1) / (N - 1)) * (R - L), Y = (v) => T + (1 - v / 10) * (B - T);
    g.strokeStyle = C.line; g.lineWidth = 2;
    [2.5, 5, 7.5, 10].forEach((v) => { g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(R, Y(v)); g.stroke(); });
    g.strokeStyle = C.accent; g.lineWidth = 7; g.lineJoin = 'round'; g.beginPath();
    rows.forEach((x, i) => (i ? g.lineTo(X(x.n), Y(x.v)) : g.moveTo(X(x.n), Y(x.v)))); g.stroke();
    rows.forEach((x) => { g.fillStyle = x.v >= 8 ? C.good : x.v >= 5 ? C.mid : C.bad; g.beginPath(); g.arc(X(x.n), Y(x.v), 13, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = C.ink3; g.font = `500 26px Onest, sans-serif`; g.textAlign = 'center';
    for (let n = 1; n <= N; n++) if (N <= 16 || n === 1 || n === N || n % 5 === 0) g.fillText(String(n), X(n), B + 46);
    g.textAlign = 'left';
    const best = rows.slice().sort((a, b) => b.v - a.v)[0];
    g.fillStyle = C.ink; g.font = `600 40px Onest, sans-serif`;
    const bl = lines('Лучший трек: ' + best.t + ' · ' + fmtS(best.v), 900, 2);
    bl.forEach((x, i) => g.fillText(x, 90, 1080 + i * 50));
    const vs = verdicts(rows).map((v) => v.t);
    g.fillStyle = C.ink3; g.font = `500 34px Onest, sans-serif`;
    if (vs.length) g.fillText(lines(vs.join(' · '), 900, 1)[0], 90, 1080 + bl.length * 50 + 14);
    g.fillStyle = C.ink3; g.font = `600 32px ${disp}`; g.fillText('Казуал Хаб · разбор альбома', 90, 1270);
    let blob = null;
    try { blob = await new Promise((res) => cv.toBlob(res, 'image/png')); } catch (e) {}
    if (!blob) { toast('Картинка не собралась: обложку не дали нарисовать. Попробуй ещё раз'); return; }
    const file = new File([blob], `${titleOf(al).replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 60) || 'album'}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = file.name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Картинка скачана');
  }

  // ---------- кнопки в рейтинге и в форме ----------
  document.addEventListener('click', async (e) => {
    const fl = e.target.closest('#albumListenBtn');
    if (fl) { listen(fl, { artist: (form.artist || '').trim(), title: String(form.name || '').trim(), link: form.link || '' }); return; }
    const go = e.target.closest('#albumGoBtn');
    if (go) {
      if (form.editingId && state.ratings.some((x) => x.id === form.editingId && x.trackCount)) { const id = form.editingId; open(id); return; }
      save({ breakdown: true });
      return;
    }
    const b = e.target.closest('[data-alb]');
    if (!b || !b.closest('.entry')) return;
    const id = b.dataset.id;
    switch (b.dataset.alb) {
      case 'open': open(id); break;
      case 'track': open(id, +b.dataset.n); break;
      case 'goto': goToRating(id); break;
      case 'rescore': { const al = state.ratings.find((x) => x.id === id); if (al) loadIntoForm(al); break; }
      case 'png': sharePNG(id); break;
      case 'listen': { const r = state.ratings.find((x) => x.id === id); if (r) listen(b, { artist: r.artist || '', title: titleOf(r), link: r.link || '' }); break; }
      case 'friends': {
        const al = state.ratings.find((x) => x.id === id);
        if (!al) return;
        b.disabled = true;
        let items = [];
        try { items = ((await window.casualApi.get('/music/album-friends?name=' + encodeURIComponent(al.name))) || {}).items || []; } catch (x) { toast('Не получилось спросить друзей. Попробуй ещё раз'); b.disabled = false; return; }
        friendsCache.set(keyOf(al.name), items);
        renderBoard();
        break;
      }
    }
  });

  // кнопка «Слушать отрывок» в форме появляется, как только набрано название трека
  document.addEventListener('input', (e) => { if (e.target && (e.target.id === 'itemName' || e.target.id === 'itemArtist')) formHint(); });

  window.CasualAlbum = { cardHTML, folded, formHint, open, verdicts, agreement };
})();
