/* Казуал Хаб: лоты по ссылке. Зрители вписывают лоты в категории, которую выбрал ведущий, и смотрят его колесо: та же отрисовка и та же заставка победы.
   Снимок колеса приходит по WebSocket от комнаты лотов (ответ сбора rt: true), без неё — опросом раз в пару секунд с ETag.
   Прокрутку страница рисует сама по общему времени сервера. */
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = window.CasualUtil.esc; // общий, /util.js
  const plural = window.CasualUtil.plural; // общий, /util.js
  const read = window.CasualUtil.read; // общий, /util.js
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;
  const mod = (a, b) => ((a % b) + b) % b;
  const FONT = 'Onest, ui-sans-serif, system-ui, sans-serif';
  const PALETTE = ['#3550E8', '#EAA92C', '#2EAD60', '#EC4899', '#9333EA', '#F97316', '#06B6D4', '#E4553F', '#84CC16', '#64748B'];

  const user = read('ocenshik.user.v1');
  const token = user ? (read('casualhub.tokens.v1') || {})[user.id] || null : null;
  async function api(path, method = 'GET', body) {
    let r;
    try {
      r = await fetch('/api' + path, { method, cache: 'no-store', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch (e) { const er = new Error('Нет связи с сервером.'); er.status = 0; throw er; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const er = new Error(d.error || 'Сервер не ответил.'); er.status = r.status; throw er; }
    return d;
  }

  const KINDS = {
    game: { label: 'Игры', add: 'Добавить игру', ph: 'Название игры или ссылка на неё в Steam' },
    movie: { label: 'Фильмы и сериалы', add: 'Добавить фильм или сериал', ph: 'Название фильма или сериала' },
    anime: { label: 'Аниме', add: 'Добавить аниме', ph: 'Название аниме' },
    book: { label: 'Книги', add: 'Добавить книгу', ph: 'Название книги или автор' },
    music: { label: 'Музыка', add: 'Добавить трек или альбом', ph: 'Название или исполнитель' },
    any: { label: 'Что угодно', add: 'Добавить лот', ph: 'Что добавить?' },
  };
  const kindOf = () => KINDS[S.room && S.room.kind] || KINDS.game;
  // те же треки, что в списке Колеса: ведущий передаёт только их id
  const PRESETS = [
    { id: 'vika', title: 'VI KA — Гимн Папича (Arthas)', key: 'SXe1aTEJU2w', start: 0.6 },
    { id: 'mk', title: 'Mortal Kombat — Techno Syndrome', key: 'kWO2AuJT67w', start: 0.4 },
    { id: 'serious', title: 'Serious Sam — The Grand Cathedral', key: '0IVRoqDWwIk', start: 5.5 },
    { id: 'chopin', title: 'Шопен — Вальс до-диез минор, оп. 64 № 2', key: 'SUT_0c2QVzo', start: 5 },
    { id: 'eva', title: 'Evangelion — E05 (ReMaster TV Original)', key: '7dVDG6IqtV8', alt: ['ELcLRK8LZ-o'], start: 0 },
  ];
  // адрес сбора: /lots/<код>; старые ссылки /lots/#<код> тоже работают
  const pathCode = /^\/lots\/([A-Za-z0-9]{12})\/?$/.exec(location.pathname);
  const code = pathCode ? pathCode[1] : location.hash.slice(1);
  const view = $('#view');
  const S = { room: null, lots: [], live: null, offset: 0, results: [], busy: false, winner: null, firstPoll: true, pending: null, replacing: null, admin: false };
  // за этим сбором следит мини-плеер на других страницах сайта (lots-follow.js): музыка не обрывается при переходе
  const FOLLOW_KEY = 'casualhub.lots.follow.v1';
  // on — эта страница открыта сейчас (мини-плеер молчит), heard — зритель включил звук (без этого мини-плеер не играет)
  const keepFollow = () => { try { if (S.room && !S.room.own) localStorage.setItem(FOLLOW_KEY, JSON.stringify({ code, title: S.room.title || '', owner: S.room.owner || '', at: Date.now(), on: true, heard: canPlay() })); } catch (e) {} };
  // страницу закрывают или уходят с неё: место в треке запоминается, на следующей странице музыка продолжится отсюда
  addEventListener('pagehide', () => {
    try {
      const f = JSON.parse(localStorage.getItem(FOLLOW_KEY) || 'null');
      if (!f || f.code !== code) return;
      const y = EMB.yt.bg;
      f.on = false; f.at = Date.now(); f.heard = canPlay();
      f.bg = CH.bg.active && y && y.getCurrentTime ? { id: CH.bg.id, pos: +y.getCurrentTime() || 0, at: Date.now() } : null;
      localStorage.setItem(FOLLOW_KEY, JSON.stringify(f));
    } catch (e) {}
  });
  const dropFollow = () => { try { const f = JSON.parse(localStorage.getItem(FOLLOW_KEY) || 'null'); if (f && f.code === code) localStorage.removeItem(FOLLOW_KEY); } catch (e) {} };
  const serverNow = () => Date.now() + S.offset;
  // лоты, которые ведущий убрал с колеса (они были на колесе, а теперь их там нет и они не вылетали).
  // Зрителям они не показываются, игру не занимают и в лимит не считаются: сервер удалит их при следующем добавлении
  // лоты, которые вкладка ведущего уже забрала: по списку id, у снимков старой версии — первые seen
  function seenLots(live) {
    if (Array.isArray(live.ids)) { const s = new Set(live.ids); return S.lots.filter((l) => s.has(l.id)); }
    return S.lots.slice(0, +live.seen || 0);
  }
  // кто вылетел — id лотов (outIds): два одинаковых названия — разные лоты. В старых снимках только имена (out),
  // тогда каждое имя выбивает один лот, а не все с таким названием (так же считает сервер, functions/_lib/lots-live.js)
  function outLotIds(live) {
    if (!live) return new Set();
    if (Array.isArray(live.outIds)) return new Set(live.outIds);
    const gone = new Set();
    for (const x of Array.isArray(live.out) ? live.out : []) {
      const l = S.lots.find((y) => !gone.has(y.id) && y.name.toLowerCase() === String(x).toLowerCase());
      if (l) gone.add(l.id);
    }
    return gone;
  }
  // сектор колеса — этот лот: у секторов из сбора есть id (l), у старых снимков — только название
  const onWheelOf = (segs) => { const ids = new Set(), names = new Set(); for (const x of segs) { if (x.l) ids.add(x.l); else names.add(x.n.toLowerCase()); } return (l) => ids.has(l.id) || names.has(l.name.toLowerCase()); };
  // id лотов, которые были на колесе, а теперь их там нет и они не вылетали: их убрал ведущий
  function removedKeys() {
    const live = S.live;
    if (!live) return new Set();
    const out = outLotIds(live), onWheel = onWheelOf(liveSegs());
    return new Set(seenLots(live).filter((l) => !onWheel(l) && !out.has(l.id)).map((l) => l.id));
  }
  const mine = () => { const gone = removedKeys(); return S.lots.filter((l) => l.mine && !gone.has(l.id)).length; };
  const timeLeft = () => (S.room && S.room.endsAt ? S.room.endsAt - serverNow() : null);
  const isOpen = () => !!S.room && !S.room.closed && (S.room.endsAt == null || timeLeft() > 0);
  const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`; };

  // ---------- звук и музыка: как в Колесе. Браузер разрешит их только после первого нажатия на странице ----------
  const SOUND_KEY = 'casualhub.lots.sound.v1';
  const snd = Object.assign({ on: true, vol: 80 }, read(SOUND_KEY) || {});
  const keepSound = () => { try { localStorage.setItem(SOUND_KEY, JSON.stringify(snd)); } catch (e) {} };
  let ac = null, lastTick = 0, unlocked = false, justUnlocked = false;
  const volume = () => (snd.on ? Math.max(0, Math.min(100, +snd.vol)) / 100 : 0);
  const canPlay = () => unlocked && snd.on;
  function ensureAudio() {
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
    } catch (e) { ac = null; }
  }
  function tone(freq, t, len, vol, type) {
    vol = Math.max(0.0002, vol * volume());
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + len + 0.02);
  }
  function tickSound() {
    if (!canPlay() || !ac) return;
    const t = ac.currentTime;
    if (t - lastTick < 0.035) return;
    lastTick = t;
    tone(1500, t, 0.03, 0.05, 'square');
  }
  function playOut() {
    if (!canPlay() || !ac) return;
    const t = ac.currentTime;
    tone(330, t, 0.18, 0.12); tone(220, t + 0.12, 0.3, 0.12);
  }
  function playWin() {
    if (!canPlay() || !ac) return;
    const t = ac.currentTime + 0.02;
    [523, 659, 784, 1047, 784, 1047].forEach((f, k) => { tone(f, t + k * 0.13, 0.34, 0.22); tone(f / 2, t + k * 0.13, 0.3, 0.08, 'square'); });
    const end = t + 6 * 0.13;
    [523, 659, 784, 1047].forEach((f) => tone(f, end, 1.4, 0.16));
    tone(262, end, 1.4, 0.1, 'square');
  }
  const presetOf = (id) => PRESETS.find((x) => x.id === id) || null;
  const CH = { bg: { active: false, id: '' }, win: { active: false, id: '' } };
  const EMB = { api: null, yt: {}, ready: {}, cued: {}, failed: false };
  function ytApi() {
    if (!EMB.api) {
      EMB.api = Promise.race([new Promise((res, rej) => {
        if (window.YT && window.YT.Player) { res(); return; }
        window.onYouTubeIframeAPIReady = () => res();
        const sc = document.createElement('script');
        sc.src = 'https://www.youtube.com/iframe_api'; sc.async = true; sc.onerror = rej;
        document.head.appendChild(sc);
      }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))]);
      EMB.api.catch(() => { EMB.failed = true; });
    }
    return EMB.api;
  }
  function ytPlayer(ch) {
    if (!EMB.ready[ch]) {
      EMB.ready[ch] = ytApi().then(() => new Promise((res) => {
        EMB.yt[ch] = new YT.Player('yt-' + ch, {
          width: 192, height: 108,
          playerVars: { playsinline: 1, rel: 0 },
          events: {
            onReady: () => res(EMB.yt[ch]),
            onStateChange: (e) => { if (e.data === 0) channelEnded(ch); },
            onError: () => {
              const c = CH[ch];
              if (c.active && c.alts && c.alts.length) { EMB.yt[ch].loadVideoById({ videoId: c.alts.shift(), startSeconds: 0 }); return; }
              channelFailed(ch, true); // сам YouTube отказал (например, ошибка 150)
            },
          },
        });
      }));
    }
    return EMB.ready[ch];
  }
  const applyVolume = (ch) => {
    try {
      const y = EMB.yt[ch];
      if (!y || !y.setVolume) return;
      y.setVolume(Math.round(volume() * (ch === 'bg' ? 0.6 : 1) * 100));
      if (canPlay()) y.unMute(); else y.mute();
    } catch (e) {}
  };
  // hard — YouTube ответил ошибкой; иначе просто не дождались звука (браузер не пустил)
  function channelFailed(ch, hard) {
    const c = CH[ch];
    if (!c.active) return;
    const f = c.onFail;
    Object.assign(c, { active: false, id: '', onFail: null });
    paintPlaying();
    if (f) f(hard);
  }
  function stopChannel(ch) {
    const c = CH[ch];
    Object.assign(c, { active: false, id: '', onFail: null });
    try { if (EMB.yt[ch] && EMB.yt[ch].pauseVideo) EMB.yt[ch].pauseVideo(); } catch (e) {}
    paintPlaying();
  }
  function channelEnded(ch) {
    const c = CH[ch];
    if (!c.active) return;
    if (c.loop) {
      try { EMB.yt[ch].seekTo(c.start || 0); EMB.yt[ch].playVideo(); } catch (e) {}
      if (ch === 'bg' && hostSide()) hostMusicPush({ pos: c.start || 0 });
      return;
    }
    stopChannel(ch);
    if (ch === 'bg') bgNext(false); // фон идёт подряд: за этим треком следующий из списка
    if (ch === 'win') syncBg();
  }
  async function playChannel(ch, p, opts = {}) {
    const c = CH[ch];
    Object.assign(c, { active: true, id: p.id, loop: !!opts.loop, onFail: opts.onFail || null, alts: (p.alt || []).slice(), start: p.start || 0 });
    const from = opts.at != null ? opts.at : p.start || 0;
    paintPlaying();
    try {
      const y = await ytPlayer(ch);
      if (!c.active || c.id !== p.id) return;
      applyVolume(ch);
      if (EMB.cued[ch] === p.key) y.seekTo(from, true);
      else y.loadVideoById({ videoId: p.key, startSeconds: from });
      EMB.cued[ch] = null;
      y.playVideo();
      // телефоны молча блокируют звук: если трек так и не заиграл, на победе звучит стандартная фанфара
      setTimeout(() => {
        if (!c.active || c.id !== p.id) return;
        let st = -1;
        try { st = y.getPlayerState(); } catch (e) {}
        if (st !== 1 && st !== 3) channelFailed(ch);
      }, 4000);
    } catch (e) { channelFailed(ch); }
  }
  // музыка ведущего: какой трек (cur), с какой секунды (pos) в момент at по часам сервера, на паузе ли, переключать ли треки сами (auto)
  function normMusic(m) {
    m = m || {};
    const bg = m.bg && m.bg !== 'vika' && presetOf(m.bg) ? m.bg : '';
    const cur = bg && m.cur && m.cur !== 'vika' && presetOf(m.cur) ? m.cur : bg;
    return { bg, win: 'vika', cur, pos: +m.pos || 0, at: +m.at || 0, pause: !!m.pause, auto: m.auto !== false };
  }
  const liveMusic = () => normMusic(S.live && S.live.music);
  const hostSide = () => !!(token && S.room && S.room.own);
  // где сейчас трек по часам ведущего, в секундах видео
  function musicAt(m) {
    if (!m.at) return (presetOf(m.cur) || {}).start || 0;
    return m.pause ? m.pos : m.pos + Math.max(0, serverNow() - m.at) / 1000;
  }
  // фон: с трека, который выбрал ведущий, дальше подряд по списку и по кругу. VI KA — только песня победы.
  // Трек, который YouTube не даёт играть на чужом сайте (ошибка 150), пропускается до следующей смены фона
  const BG_LIST = PRESETS.filter((p) => p.id !== 'vika');
  const BG = { key: '', cur: '', local: false, bad: new Set(), dur: {} };
  function nextTrack(id) {
    const i = BG_LIST.findIndex((p) => p.id === id);
    for (let k = 1; k <= BG_LIST.length; k++) { const p = BG_LIST[(i + k + BG_LIST.length) % BG_LIST.length]; if (!BG.bad.has(p.id)) return p.id; }
    return '';
  }
  function bgNext(failed) {
    if (failed && BG.cur) BG.bad.add(BG.cur);
    const next = nextTrack(BG.cur);
    // ведущий объявляет следующий трек всем; зритель, если ведущий ещё не успел, переходит сам и потом сверяется
    if (hostSide() && next) { hostMusicPush({ cur: next, pause: false }); return; }
    BG.cur = next; BG.local = true; BG.localAt = Date.now();
    syncBg();
  }
  // фон играет, пока его выбрал ведущий, он не на паузе и не звучит трек победы. Позиция — по часам ведущего
  function syncBg() {
    const m = liveMusic();
    const key = [m.bg, m.cur, m.at, m.pause].join('|');
    if (key !== BG.key) { BG.key = key; BG.cur = m.cur; BG.local = false; if (!m.bg) BG.bad.clear(); }
    // свой трек — только мостик, пока ведущий не объявит следующий; потом снова как у ведущего (если его трек здесь играет)
    if (BG.local && m.cur && m.cur !== BG.cur && !BG.bad.has(m.cur) && Date.now() - (BG.localAt || 0) > 6000) { BG.cur = m.cur; BG.local = false; }
    const p = presetOf(BG.cur);
    if (!(canPlay() || hostSide()) || !p || EMB.failed || CH.win.active || m.pause) { if (CH.bg.active) stopChannel('bg'); paintTrack(); return; }
    if (CH.bg.active && CH.bg.id === p.id) {
      CH.bg.loop = !m.auto;
      applyVolume('bg');
      // разошлись больше чем на 2,5 секунды (перемотка ведущего, фоновая вкладка) — догоняем
      const y = EMB.yt.bg, want = musicAt(m), dur = BG.dur[p.id] || 0;
      if (!BG.local && y && y.getCurrentTime && (!dur || want < dur - 1)) {
        try { const st = y.getPlayerState(); if ((st === 1 || st === 2) && Math.abs(y.getCurrentTime() - want) > 2.5) y.seekTo(want, true); } catch (e) {}
      }
      paintTrack();
      return;
    }
    // не дождались звука — повторим при следующем обновлении; ошибка YouTube — следующий трек
    playChannel('bg', p, { loop: !m.auto, at: BG.local ? p.start || 0 : musicAt(m), onFail: (hard) => { if (hard) bgNext(true); } });
    paintTrack();
  }
  const tsec = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), mi = Math.floor(s / 60) % 60, se = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(mi).padStart(2, '0')}:${se}` : `${mi}:${se}`; };
  // что играет и где: у ведущего — полоса с перемоткой, у зрителей — та же полоса без управления
  let seeking = false;
  function paintTrack() {
    const m = liveMusic(), id = BG.cur || m.cur, p = m.bg && presetOf(id);
    const y = EMB.yt.bg;
    let pos = musicAt(m);
    if (CH.bg.active && CH.bg.id === id && y && y.getCurrentTime) { try { pos = y.getCurrentTime() || pos; const d = y.getDuration(); if (d > 0) BG.dur[id] = d; } catch (e) {} }
    const dur = (p && BG.dur[id]) || 0;
    const host = hostSide();
    const hp = $('#hostPlayer');
    if (hp) {
      hp.hidden = !host || !p;
      if (host && p) {
        $('#hostTrack').textContent = p.title;
        const pb = $('#hostPlay');
        pb.innerHTML = m.pause ? PLAY_IC : PAUSE_IC;
        pb.setAttribute('aria-label', m.pause ? 'Продолжить музыку для всех' : 'Пауза для всех');
        pb.title = pb.getAttribute('aria-label');
        $('#hostAutoNext').checked = m.auto;
        const sk = $('#hostSeek');
        sk.disabled = !dur;
        sk.max = String(Math.round(dur) || 1);
        if (!seeking) { sk.value = String(Math.round(Math.min(pos, dur || pos))); $('#hostPos').textContent = tsec(pos); }
        $('#hostDurT').textContent = dur ? tsec(dur) : '—:—';
        sk.style.setProperty('--fill', dur ? Math.min(100, (seeking ? +sk.value : pos) / dur * 100).toFixed(2) + '%' : '0%');
      }
    }
    const vt = $('#lotTrack');
    if (vt) {
      vt.hidden = host || !p;
      if (!host && p) {
        $('#lotTrackName').textContent = (m.pause ? 'На паузе: ' : '') + p.title;
        $('#lotTrackPos').textContent = tsec(pos);
        $('#lotTrackDur').textContent = dur ? tsec(dur) : '—:—';
        $('#lotTrackBar').style.width = dur ? Math.min(100, pos / dur * 100).toFixed(2) + '%' : '0%';
      }
    }
  }
  // песню победы подгружаем заранее: на победе она заиграет сразу
  function cueWin() {
    const p = presetOf(liveMusic().win);
    if (!canPlay() || !p || EMB.failed || CH.win.active) return;
    ytPlayer('win').then((y) => { if (CH.win.active) return; try { y.cueVideoById({ videoId: p.key, startSeconds: p.start || 0 }); EMB.cued.win = p.key; } catch (e) {} }).catch(() => {});
  }
  function playWinMusic() {
    if (CH.bg.active) stopChannel('bg');
    if (!canPlay()) return;
    const p = presetOf(liveMusic().win);
    if (p && !EMB.failed) playChannel('win', p, { onFail: playWin }); else playWin();
  }
  function winTrack() {
    if (!CH.win.active) return null;
    try { const y = EMB.yt.win; if (y && y.getDuration) return { pos: y.getCurrentTime() || 0, dur: y.getDuration() || 0 }; } catch (e) {}
    return { pos: 0, dur: 0 };
  }
  function paintSound() {
    const b = $('#lotSound'), v = $('#lotVol');
    if (!b) return;
    b.innerHTML = !unlocked && snd.on ? '<span class="u-old">🔊 </span>Включить звук' : snd.on ? '<span class="u-old">🔊 </span>Звук включён' : '<span class="u-old">🔇 </span>Звук выключен';
    b.className = 'btn small ' + (!unlocked && snd.on ? 'primary' : 'ghost');
    b.setAttribute('aria-pressed', String(!!(snd.on && unlocked)));
    if (document.activeElement !== v) v.value = snd.vol;
  }
  function paintPlaying() {
    const box = $('#lotPlaying');
    if (!box) return;
    const on = CH.win.active ? CH.win : CH.bg.active ? CH.bg : null;
    const p = on && presetOf(on.id);
    box.textContent = (S.room && S.room.own ? 'Ты ведущий: колесо закрутится через 2–3 секунды после нажатия, у тебя и у зрителей одновременно.' : 'Колесо крутится у всех одновременно, как у ведущего.') + (p ? ' Сейчас играет: ' + p.title : '') + (S.room && !S.room.own ? ' Музыка продолжит играть и на других страницах сайта, пока ты следишь за этим сбором.' : '');
  }
  const unlock = () => {
    if (unlocked) return;
    unlocked = true; justUnlocked = true;
    setTimeout(() => { justUnlocked = false; }, 0);
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
    if (snd.on) ensureAudio();
    paintSound();
    syncBg();
  };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
  $('#lotSound').addEventListener('click', () => {
    if (!unlocked) unlock(); // на случай нажатия с клавиатуры без pointerdown
    else if (!justUnlocked) {
      snd.on = !snd.on;
      keepSound();
      if (snd.on) ensureAudio();
      if (!snd.on) { if (CH.win.active) stopChannel('win'); }
      ['bg', 'win'].forEach(applyVolume);
      syncBg();
    }
    paintSound();
  });
  $('#lotVol').addEventListener('input', (e) => { snd.vol = +e.target.value; keepSound(); ['bg', 'win'].forEach(applyVolume); });

  // ---------- колесо: та же отрисовка, что у ведущего ----------
  let canvas, ctx, size = 0, dpr = 1, hubPct = 24, T = {}, spinRaf = 0, tweenRaf = 0, pulseRaf = 0, spinKey = '', shown = [], restSig = '';
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const inkOn = (c) => { const L = lum(c); return (L + 0.05) / (lum('#14161C') + 0.05) >= 1.05 / (L + 0.05) ? '#14161C' : '#FFFFFF'; };
  // сектора ведущего. Лот, который зритель заменил, пока вкладка ведущего его не забрала (она в фоне или закрыта),
  // показываем уже под новым названием: сектор знает id своего лота. Иначе на колесе висело бы старое название,
  // а новый лот считался бы убранным ведущим
  function liveSegs(exact) {
    const live = S.live;
    const segs = live && Array.isArray(live.segs) ? live.segs : [];
    if (exact) return segs;
    const byId = new Map(S.lots.map((l) => [l.id, l.name]));
    // сектор лота, которого в сборе уже нет (удалили, а вкладка ведущего ещё не обновила колесо), не показываем:
    // иначе он висел бы на колесе и в списке как игра ведущего
    const kept = segs.filter((x) => !(x.l && !byId.has(x.l)));
    const sum = kept.reduce((a, x) => a + x.p, 0);
    const scale = kept.length < segs.length && sum > 0 ? 1 / sum : 1;
    return kept.map((x) => { const n = x.l && byId.get(x.l); return n && n !== x.n ? { ...x, n, p: x.p * scale } : scale !== 1 ? { ...x, p: x.p * scale } : x; });
  }
  // на колесе то же, что у ведущего. Новые лоты, которые его вкладка ещё не забрала, видны сразу: она может быть в фоне
  function shownSegs() {
    const live = S.live;
    // пока крутится и после победы колесо должно точно совпадать с колесом ведущего
    if (live && (live.winner || (live.spin && serverNow() < live.spin.at + live.spin.ms))) return liveSegs(true);
    const hostSegs = liveSegs();
    const onWheel = onWheelOf(hostSegs), out = outLotIds(live);
    const taken = live ? new Set(seenLots(live).map((l) => l.id)) : new Set();
    const wait = S.lots.filter((x) => !taken.has(x.id) && !onWheel(x) && !out.has(x.id));
    if (!wait.length) return hostSegs;
    const n = hostSegs.length + wait.length;
    return [...hostSegs.map((x) => ({ ...x, p: x.p * hostSegs.length / n })), ...wait.map((x, i) => { const c = PALETTE[(hostSegs.length + i) % PALETTE.length]; return { n: x.name, p: 1 / n, c, t: inkOn(c) }; })];
  }
  // ---------- обложки лотов: на секторах колеса и под стрелкой ----------
  const pics = new Map();
  let lastPaint = null, picT = 0;
  const picsOn = () => !(S.live && S.live.pics === false);
  function picOf(seg) {
    if (!seg || !picsOn()) return '';
    const lot = (seg.l && S.lots.find((x) => x.id === seg.l)) || S.lots.find((x) => x.name.toLowerCase() === String(seg.n).toLowerCase());
    return lot && /^https:\/\//.test(lot.img || '') ? lot.img : '';
  }
  // картинка грузится один раз; когда загрузилась, колесо перерисовывается в том же положении
  function picImg(url) {
    let im = pics.get(url);
    if (im) return im.complete && im.naturalWidth ? im : null;
    im = new Image();
    im.decoding = 'async';
    im.referrerPolicy = 'no-referrer';
    im.onload = () => { clearTimeout(picT); picT = setTimeout(() => { if (lastPaint && !tweenRaf && !pulseRaf) paint(lastPaint.segs, lastPaint.rot); }, 60); };
    im.src = url;
    pics.set(url, im);
    return null;
  }
  // под стрелкой: название и обложка лота
  function showTick(seg) {
    $('#ticker').textContent = seg ? seg.n : '—';
    const im = $('#tickerImg'), url = seg ? picOf(seg) : '';
    if (!im) return;
    if (url) { if (im.getAttribute('src') !== url) im.src = url; im.hidden = false; } else { im.hidden = true; im.removeAttribute('src'); }
  }
  const place = (segs) => { let acc = 0; return segs.map((s) => { const start = acc * TAU; acc += s.p; return { ...s, start, end: acc * TAU }; }); };
  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    T = { panel: g('--panel'), panel2: g('--panel-2'), ink: g('--ink'), ink3: g('--ink-3') };
  }
  function resize() {
    if (!canvas) return;
    dpr = Math.min(2.5, devicePixelRatio || 1);
    size = Math.round(canvas.clientWidth * dpr);
    if (size) { canvas.width = size; canvas.height = size; }
  }
  function fit(text, maxW, font) {
    ctx.font = font;
    let s = text;
    if (ctx.measureText(s).width > maxW) {
      while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
      s += '…';
    }
    return s;
  }
  function paint(segs, rot, hl) {
    if (!size) resize();
    if (!size) return;
    const c = size / 2, ring = Math.max(8, size * 0.03), R = c - ring - 2 * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.translate(c, c);
    if (!segs.length) { ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fillStyle = T.panel2; ctx.fill(); }
    for (const s of segs) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, rot + s.start, rot + s.end); ctx.closePath();
      ctx.fillStyle = s.c; ctx.fill();
      if (hl && (hl.l ? s.l === hl.l : hl.n === s.n)) { ctx.fillStyle = `rgba(255,255,255,${hl.a})`; ctx.fill(); }
    }
    if (segs.length > 1) {
      ctx.lineWidth = Math.max(1.5, 2 * dpr);
      ctx.strokeStyle = T.panel;
      for (const s of segs) { const a = rot + s.start; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); ctx.stroke(); }
    }
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    const inner = (hubPct / 100) * c + 6 * dpr, pad = 12 * dpr;
    lastPaint = { segs, rot };
    for (const s of segs) {
      const ang = s.end - s.start;
      const fs = Math.round(Math.min(R * 0.072, R * 0.68 * Math.min(ang, 1.2) * 0.55));
      // обложка у края: высота по ширине сектора, пропорции 3:2
      const url = picOf(s), im = url && picImg(url);
      const ph = Math.min(R * (segs.length <= 4 ? 0.19 : segs.length <= 6 ? 0.15 : 0.115) * (canvas.clientWidth < 420 ? 0.78 : 1), 2 * (R - pad) * Math.sin(Math.min(ang, 1.2) / 2) * 0.62), pw = ph * 1.5;
      const withPic = !!im && ph >= 15 * dpr;
      if (fs < 9 * dpr && !withPic) continue;
      ctx.save();
      ctx.rotate(rot + (s.start + s.end) / 2);
      let right = R - pad;
      if (withPic) {
        const x = right - pw, y = -ph / 2, rr = Math.min(6 * dpr, ph * 0.18);
        const sw = im.naturalWidth, sh = im.naturalHeight, k = Math.min(sw / 1.5, sh);
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, pw, ph, rr); else ctx.rect(x, y, pw, ph);
        ctx.clip();
        ctx.drawImage(im, (sw - k * 1.5) / 2, (sh - k) / 2, k * 1.5, k, x, y, pw, ph);
        ctx.restore();
        ctx.lineWidth = Math.max(1, dpr); ctx.strokeStyle = 'rgba(0,0,0,.35)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, pw, ph, rr); else ctx.rect(x, y, pw, ph);
        ctx.stroke();
        right = x - 6 * dpr;
      }
      const room = Math.round(right - inner);
      if (fs >= 9 * dpr && room > fs * 1.5) {
        ctx.fillStyle = s.t;
        ctx.fillText(fit(s.n, room, `600 ${fs}px ${FONT}`), right, 0);
      }
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, R + ring / 2, 0, TAU);
    ctx.lineWidth = ring; ctx.strokeStyle = T.ink; ctx.stroke();
    const nb = 36, cs = ring * 0.36;
    ctx.fillStyle = T.panel;
    for (let k = 0; k < nb; k++) {
      const a = (k / nb) * TAU;
      ctx.save();
      ctx.translate(Math.cos(a) * (R + ring / 2), Math.sin(a) * (R + ring / 2));
      ctx.rotate(a);
      ctx.globalAlpha = k % 2 ? 0.4 : 0.9;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-cs / 2, -cs / 2, cs, cs, cs * 0.3); else ctx.rect(-cs / 2, -cs / 2, cs, cs);
      ctx.fill();
      ctx.restore();
    }
    if (!segs.length) {
      ctx.fillStyle = T.ink3; ctx.textAlign = 'center';
      ctx.font = `600 ${Math.round(R * 0.07)}px ${FONT}`;
      ctx.fillText('Колесо пустое', 0, R * 0.55);
    }
  }
  const segAt = (rot, segs) => { const a = mod(-Math.PI / 2 - rot, TAU); return segs.find((s) => a >= s.start && a < s.end) || segs[segs.length - 1]; };
  function kick() {
    const p = $('#pointer');
    if (p && p.animate && !reduced) p.animate([{ transform: 'translateX(-50%) rotate(0deg)' }, { transform: 'translateX(-50%) rotate(-16deg)' }, { transform: 'translateX(-50%) rotate(0deg)' }], { duration: 120, easing: 'ease-in-out' });
  }
  const WEBM_SRC = (src) => '/wheel/' + (WEBM_OK ? src : src.replace(/\.webm$/i, '.mp4'));
  function paintHubImg(src) {
    const img = $('#hubImg'), vid = $('#hubVid'), isVid = /\.webm$/i.test(src || '');
    // своя картинка ведущего приходит с сервера, остальные лежат в каталоге колеса
    const url = src && src[0] === '/' ? src : WEBM_SRC(src || '');
    if (src && !isVid) { if (img.getAttribute('src') !== url) img.src = url; img.hidden = false; }
    else { img.hidden = true; img.removeAttribute('src'); }
    if (isVid) {
      if (vid.getAttribute('src') !== WEBM_SRC(src)) vid.src = WEBM_SRC(src);
      vid.hidden = false;
      vid.play().catch(() => {});
    } else if (!vid.hidden) { vid.pause(); vid.hidden = true; vid.removeAttribute('src'); vid.load(); }
    $('#lotHub').classList.toggle('has-gif', !!src);
  }
  function setTicker(segs, rot) { showTick(segs.length ? segAt(rot, segs) : null); }
  function setSpinning(on) { $('#stage').classList.toggle('is-spinning', on); $('#lotHub').classList.toggle('spinning', on); }
  function stopMotion() { cancelAnimationFrame(spinRaf); cancelAnimationFrame(tweenRaf); cancelAnimationFrame(pulseRaf); spinRaf = tweenRaf = pulseRaf = 0; canvas.style.transform = ''; canvas.style.willChange = ''; }
  // сектор ушедшего лота сужается до нуля, соседи расступаются, как у ведущего.
  // Сектор узнаём по id лота (l): у двух «Hades» названия одинаковые, а уходит только один. У вписанных ведущим id нет
  const segKey = (x) => x.l || 'n:' + x.n;
  function tweenTo(next, rot) {
    const w0 = new Map(shown.map((x) => [segKey(x), x.end - x.start])), w1 = new Map(next.map((x) => [segKey(x), x.end - x.start]));
    const names = new Set(next.map(segKey));
    const order = next.slice();
    shown.forEach((x, k) => {
      if (names.has(segKey(x))) return;
      const before = shown.slice(0, k).reverse().find((p) => names.has(segKey(p)));
      order.splice(before ? order.findIndex((o) => segKey(o) === segKey(before)) + 1 : 0, 0, x);
    });
    const t0 = performance.now(), D = 400;
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / D), k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      let acc = 0;
      const cur = [];
      for (const it of order) {
        const a = w0.get(segKey(it)) || 0, b = w1.get(segKey(it)) || 0, w = a + (b - a) * k;
        if (w > 1e-4) cur.push({ ...it, start: acc, end: acc + w });
        acc += w;
      }
      paint(cur, rot);
      if (t < 1) tweenRaf = requestAnimationFrame(frame); else { shown = next; paint(next, rot); }
    };
    tweenRaf = requestAnimationFrame(frame);
  }
  let lastPics = true;
  function wheel() {
    if (!canvas) return;
    const live = S.live || { rot: 0 };
    // ведущий включил или выключил обложки: колесо перерисовывается
    if (picsOn() !== lastPics) { lastPics = picsOn(); restSig = ''; if (!spinRaf && lastPaint) paint(lastPaint.segs, lastPaint.rot); }
    hubPct = +live.hub || 24;
    $('.wheel-wrap').style.setProperty('--hub', hubPct + '%');
    paintHubImg(live.hubOwn ? `/api/lots/${encodeURIComponent(code)}/hub?v=${encodeURIComponent(live.hubOwn)}` : live.hubImg || '');
    const segs = place(shownSegs());
    const spin = live.spin;
    if (spin && serverNow() < spin.at + spin.ms) {
      const key = String(spin.at);
      if (spinKey === key) return; // прокрутка уже идёт
      spinKey = key;
      pulseFor = '';
      stopMotion();
      if (segs.length <= 2) cueWin(); // этот спин может дать победителя
      restSig = '';
      shown = segs;
      paint(segs, spin.from);
      setSpinning(true);
      canvas.style.willChange = 'transform';
      let last = segAt(spin.from, segs), nameAt = 0, counting = false;
      const frame = (now) => {
        // ведущий запускает прокрутку на пару секунд вперёд, чтобы все успели её получить: до старта идёт отсчёт
        const wait = spin.at - serverNow();
        if (wait > 0) {
          const sec = String(Math.ceil(wait / 1000));
          counting = true;
          if ($('#ticker').textContent !== sec) { $('#ticker').textContent = sec; const im = $('#tickerImg'); if (im) im.hidden = true; }
          spinRaf = requestAnimationFrame(frame);
          return;
        }
        const t = reduced ? 1 : Math.min(1, (serverNow() - spin.at) / spin.ms);
        const rot = spin.from + (spin.to - spin.from) * (1 - Math.pow(1 - t, 4));
        canvas.style.transform = `rotate(${rot - spin.from}rad)`;
        const cur = segAt(rot, segs);
        if (cur !== last) { last = cur; kick(); tickSound(); }
        // как у ведущего: на большой скорости имя меняется не чаще раза в 0,3 секунды
        if (now - nameAt >= 300 || counting) { counting = false; nameAt = now; showTick(last); }
        if (t < 1) { spinRaf = requestAnimationFrame(frame); return; }
        spinRaf = 0;
        showTick(last);
        canvas.style.transform = ''; canvas.style.willChange = '';
        paint(segs, spin.to);
        setSpinning(false);
        restSig = JSON.stringify([segs.map((x) => [x.n, x.p]), mod(spin.to, TAU).toFixed(3)]);
        if (live.pick) pulse(segs, spin.to, live.pick, live.pickL);
        // итог прокрутки спрашиваем сразу, не дожидаясь очередного раза; по сокету он придёт сам
        if (!rtLive()) { clearTimeout(pollT); pollT = setTimeout(poll, 700); }
      };
      spinRaf = requestAnimationFrame(frame);
      return;
    }
    if (spinRaf && spinKey && spin && String(spin.at) === spinKey) return;
    setSpinning(false);
    const rot = spin ? spin.to : live.rot;
    const sig = JSON.stringify([segs.map((x) => [x.n, x.p]), mod(rot, TAU).toFixed(3)]);
    if (live.pick && !pulseRaf && pulseFor !== (live.pickL || live.pick) && sig === restSig) { pulse(segs, rot, live.pick, live.pickL); return; }
    if (restSig === sig) return;
    const changed = shown.length && !reduced && restSig;
    restSig = sig;
    stopMotion();
    setTicker(segs, rot);
    if (changed) tweenTo(segs, rot); else { shown = segs; paint(segs, rot); }
  }
  // выпавший сектор мигает под стрелкой; lid — id выпавшего лота (pickL): из двух «Hades» мигает только он
  let pulseFor = '';
  function pulse(segs, rot, name, lid) {
    if (reduced || pulseFor === (lid || name)) return;
    pulseFor = lid || name;
    if (segs.length > 2) playOut();
    const t0 = performance.now(), D = 600;
    const frame = (now) => {
      const t = (now - t0) / D;
      if (t < 1) { paint(segs, rot, { n: name, l: lid || '', a: 0.5 * Math.abs(Math.sin(t * Math.PI * 3)) }); pulseRaf = requestAnimationFrame(frame); return; }
      pulseRaf = 0;
      paint(segs, rot);
    };
    pulseRaf = requestAnimationFrame(frame);
  }

  // ---------- заставка победителя: та же, что в Колесе ----------
  let STICKERS = [];
  const WEBM_OK = (() => { try { return !!document.createElement('video').canPlayType('video/webm; codecs="vp9"'); } catch (e) { return false; } })();
  fetch('/wheel/hub/index.json').then((r) => r.json()).then((d) => {
    STICKERS = (d.groups || []).flatMap((g) => g.items || []).filter((it) => it && it.src).map((it) => { const video = /\.webm$/i.test(it.src); return { src: '/wheel/' + (video && !WEBM_OK ? it.src.replace(/\.webm$/i, '.mp4') : it.src), video }; });
  }).catch(() => {});
  let fxDone = null;
  function winFx(name, sumText) {
    const fx = $('#winFx');
    if (reduced) return Promise.resolve();
    return new Promise((resolve) => {
      const timers = [];
      const at = (ms, f) => timers.push(setTimeout(f, ms));
      let raf = 0;
      const stage = fx.querySelector('.fx-stage');
      const stick = fx.querySelector('.fx-sticker');
      const brow = fx.querySelector('.fx-eyebrow');
      const nameEl = fx.querySelector('.fx-name');
      const sum = fx.querySelector('.fx-sum');
      sum.hidden = !sumText;
      sum.textContent = sumText || '';
      stage.querySelectorAll('.in').forEach((n) => n.classList.remove('in'));
      const st = STICKERS[Math.floor(Math.random() * STICKERS.length)];
      stick.innerHTML = st ? (st.video ? `<video src="${esc(st.src)}" autoplay muted loop playsinline></video>` : `<img src="${esc(st.src)}" alt="">`) : '';
      stick.hidden = !st;
      const chars = Array.from(name);
      nameEl.style.setProperty('--len', String(Math.min(chars.length, 24)));
      const step = Math.min(110, 1400 / chars.length);
      let k = 0;
      nameEl.innerHTML = name.split(/(\s+)/).map((w) => (/^\s+$/.test(w) ? w : `<span class="fx-word${Array.from(w).length > 12 ? ' long' : ''}">${Array.from(w).map((c) => {
        const a = Math.random() * TAU, dist = 160 + Math.random() * 220;
        return `<span class="fx-ch" style="--dx:${Math.round(Math.cos(a) * dist)}px;--dy:${Math.round(Math.sin(a) * dist)}px;--r:${Math.round((Math.random() - 0.5) * 400)}deg;--d:${(k++ * step).toFixed(0)}ms">${esc(c)}</span>`;
      }).join('')}</span>`)).join('');
      const wr = $('.wheel-wrap').getBoundingClientRect();
      fx.style.setProperty('--fx-x', `${Math.round(wr.left + wr.width / 2)}px`);
      fx.style.setProperty('--fx-y', `${Math.round(wr.top + wr.height / 2)}px`);
      fx.classList.remove('closing');
      fx.hidden = false;
      fx.classList.add('open');
      fx.querySelector('.fx-skip').focus({ preventScroll: true });
      const nameAt = st ? 1100 : 400;
      const lettersEnd = nameAt + 800 + chars.length * step;
      at(st ? 150 : 0, () => stick.classList.add('in'));
      at(nameAt - 150, () => brow.classList.add('in'));
      at(nameAt, () => nameEl.querySelectorAll('.fx-ch').forEach((c) => c.classList.add('in')));
      at(lettersEnd - 250, confetti);
      at(lettersEnd + 600, () => fx.querySelector('.fx-hint').classList.add('in'));
      if (sumText) at(lettersEnd, () => sum.classList.add('in'));
      const prog = fx.querySelector('.fx-prog');
      const end = () => {
        if (!fxDone) return;
        fxDone = null;
        timers.forEach(clearTimeout);
        cancelAnimationFrame(raf);
        fx.removeEventListener('click', end);
        document.removeEventListener('keydown', onKey, true);
        clearInterval(watch);
        fx.querySelector('.fx-hint').classList.remove('in');
        prog.style.width = '0';
        fx.classList.remove('open');
        fx.classList.add('closing');
        setTimeout(() => {
          fx.hidden = true;
          fx.classList.remove('closing');
          stick.innerHTML = '';
          const cv = fx.querySelector('.fx-confetti');
          cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
        }, 400);
        resolve();
      };
      const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); end(); } };
      fxDone = end;
      fx.addEventListener('click', end);
      document.addEventListener('keydown', onKey, true);
      const t0 = Date.now(), minEnd = lettersEnd + 4000;
      let lastBurst = 0, lastSwap = 0;
      // заставка уходит, когда кончилась песня победы; без песни — через несколько секунд
      const watch = setInterval(() => {
        const el = Date.now() - t0;
        const tr = winTrack();
        prog.style.width = (tr && tr.dur > 0 ? Math.min(1, tr.pos / tr.dur) : Math.min(1, el / minEnd)) * 100 + '%';
        if (el < minEnd) return;
        if (!tr) { end(); return; }
        if (el - lastBurst > 9000) { lastBurst = el; confetti(); }
        if (STICKERS.length > 1 && el - lastSwap > 12000) {
          lastSwap = el;
          const nx = STICKERS[Math.floor(Math.random() * STICKERS.length)];
          stick.classList.remove('in');
          stick.innerHTML = nx.video ? `<video src="${esc(nx.src)}" autoplay muted loop playsinline></video>` : `<img src="${esc(nx.src)}" alt="">`;
          void stick.offsetWidth;
          stick.classList.add('in');
        }
      }, 400);
      function confetti() {
        const cv = fx.querySelector('.fx-confetti');
        const r = Math.min(2, devicePixelRatio || 1);
        cv.width = innerWidth * r; cv.height = innerHeight * r;
        const g = cv.getContext('2d');
        g.scale(r, r);
        const nb = nameEl.getBoundingClientRect();
        const ox = nb.left + nb.width / 2, oy = nb.top + nb.height / 2;
        const parts = Array.from({ length: 160 }, (_, i) => {
          const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6, v = 6 + Math.random() * 11;
          return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: 6 + Math.random() * 6, h: 4 + Math.random() * 6, r: Math.random() * TAU, vr: (Math.random() - 0.5) * 0.4, c: PALETTE[i % PALETTE.length] };
        });
        const tick = () => {
          g.clearRect(0, 0, innerWidth, innerHeight);
          let alive = 0;
          for (const p of parts) {
            p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.32; p.x += p.vx; p.y += p.vy; p.r += p.vr;
            if (p.y > innerHeight + 20) continue;
            alive++;
            g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
            g.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.r * 2)), p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1);
            g.restore();
          }
          if (alive) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }
    });
  }
  function openWinner(name) {
    const lot = S.lots.find((l) => l.name.toLowerCase() === name.toLowerCase());
    $('#wName').textContent = name;
    $('#wStats').innerHTML = lot ? `${lot.img ? `<img class="lots-win-img" src="${esc(lot.img)}" alt="" referrerpolicy="no-referrer">` : ''}<div class="total-meta"><strong>Лот от: ${esc(lot.by)}</strong><span>Участников было на колесе: ${S.lots.length}</span></div>` : '';
    $('#wStats').hidden = !lot;
    const link = $('#wLink');
    link.hidden = !(lot && lot.link);
    if (lot && lot.link) { link.href = lot.link; link.textContent = linkName(lot.link); }
    $('#winner').hidden = false;
    $('#wClose').focus({ preventScroll: true });
    if (!reduced) {
      const b = $('#winner .sheet-card').getBoundingClientRect();
      const cs = getComputedStyle(document.documentElement);
      const colors = ['--good', '--mid', '--bad', '--accent'].map((v) => cs.getPropertyValue(v).trim() || '#3550E8').concat(['#EC4899', '#06B6D4']);
      for (let i = 0; i < 44; i++) {
        const s = document.createElement('i');
        s.className = 'burst';
        s.style.background = colors[i % colors.length];
        s.style.left = `${b.left + b.width / 2 - 5}px`;
        s.style.top = `${b.top + Math.min(90, b.height / 3)}px`;
        document.body.appendChild(s);
        const ang = (-170 + Math.random() * 160) * Math.PI / 180, d = 90 + Math.random() * 190, rot = (Math.random() - 0.5) * 900;
        const dx = Math.cos(ang) * d, dy = Math.sin(ang) * d;
        s.animate([
          { transform: 'translate(0, 0) rotate(0) scale(.4)' },
          { transform: `translate(${dx}px, ${dy}px) rotate(${rot / 2}deg) scale(1)`, offset: 0.45 },
          { transform: `translate(${dx * 1.25}px, ${dy + 200}px) rotate(${rot}deg) scale(.5)`, opacity: 0 },
        ], { duration: 1200 + Math.random() * 700, easing: 'cubic-bezier(.2, .7, .4, 1)' }).onfinish = () => s.remove();
      }
      $('#wName').animate([{ transform: 'translateY(26px) scaleY(.6)' }, { transform: 'none' }], { duration: 700, easing: 'cubic-bezier(.34, 1.56, .64, 1)', fill: 'backwards', delay: 80 });
    }
  }
  function paintWinner() {
    const w = S.live && S.live.winner ? S.live.winner.n : '';
    if (S.winner === w) return;
    const at = S.live && S.live.winner ? +S.live.winner.at || 0 : 0;
    const first = S.firstPoll && !(at && serverNow() - at < 60000);
    S.winner = w;
    if (!w) { $('#winner').hidden = true; if (CH.win.active) { stopChannel('win'); syncBg(); } return; }
    const show = () => { if (S.winner === w) { if (first) openWinner(w); else { playWinMusic(); winFx(w, S.live.winner.sum).then(() => { if (S.winner === w) openWinner(w); }); } } };
    // заставка начинается, когда у зрителя закончилась прокрутка
    const spin = S.live.spin, wait = spin ? Math.max(0, spin.at + spin.ms - serverNow()) + 700 : 0;
    setTimeout(show, first ? 0 : wait);
  }

  // ---------- страница ----------
  // заголовок по буквам, как на всём сайте; длинное название мельче
  // буквы собираются из готового текста, поэтому общий заголовок переводим заранее
  const baseTitle = () => (window.CasualLang && window.CasualLang.t ? window.CasualLang.t('Сбор лотов') : 'Сбор лотов');
  function setTitle(title, again) {
    const head = $('#lotTitle');
    if (!again && head.dataset.t === title) return;
    head.dataset.t = title;
    head.classList.toggle('lots-long', [...title].length > 22);
    if (reduced) { head.textContent = title; return; }
    let i = 0;
    head.setAttribute('aria-label', title);
    head.innerHTML = title.split(' ').map((w) => `<span class="w" aria-hidden="true">${[...w].map((c) => `<span class="ch" style="--i:${i++}">${esc(c)}</span>`).join('')}</span>`).join(' ');
  }
  function paintHead() {
    const r = S.room;
    const title = r.title || baseTitle();
    setTitle(title);
    document.title = `${title} · Казуал Хаб`;
    // правила, которые ведущий выбрал галочками; он может менять их вживую, зрители увидят перемену при ближайшем опросе
    const rules = [
      r.uniq ? (r.fuzzy ? 'Одна игра — один лот, похожие названия не пройдут.' : 'Одна игра — один лот.') : 'Одну игру можно добавить несколько раз.',
      r.editOwn ? 'Свой лот можно убрать или заменить, пока идёт сбор.' : 'Добавленный лот убрать нельзя.',
    ];
    $('#lotLede').textContent = `Ведущий: ${r.owner}. Категория: ${kindOf().label}. Можно добавить ${r.perUser} ${plural(r.perUser, 'лот', 'лота', 'лотов')} на человека. ${rules.join(' ')}`;
  }
  function paintRule() {
    const box = $('#lotRule');
    const left = timeLeft();
    let text;
    if (S.room.closed) text = '<b class="lots-off">Сбор закрыт, больше добавлять нельзя.</b>';
    else if (left != null && left <= 0) text = '<b class="lots-off">Время вышло, больше добавлять нельзя.</b>';
    else if (left != null) text = `Осталось времени: <b class="lots-clock">${mmss(left)}</b>`;
    else text = 'Сбор открыт, пока его не закроет ведущий.';
    if (box.dataset.t !== text) { box.dataset.t = text; box.innerHTML = text; }
  }
  function paintAdd() {
    const box = $('#lotAdd');
    const open = isOpen();
    // заменить лот можно и при полном лимите; если ведущий запретил правки или лот уже не твой — замена отменяется
    if (S.replacing && !(S.room.editOwn && open && S.lots.some((l) => l.id === S.replacing && l.mine))) S.replacing = null;
    const own = !!(token && S.room.own);
    const state = !open && !own ? 'off' : !token ? 'guest' : !own && mine() >= S.room.perUser && !S.replacing ? 'full' : 'on';
    const n = S.room.perUser - mine();
    // перемена галочек ведущего не должна стирать то, что зритель уже набрал: в форме «on» от них зависит только подтверждение
    const sig = state + '|' + (S.replacing || '') + (state === 'full' ? '|' + (S.room.editOwn ? 1 : 0) : '');
    if (box.dataset.sig === sig && state === 'on') {
      $('#lotLeft').textContent = S.replacing ? '' : own ? 'Ты ведущий: добавляешь без лимита' : `Можешь добавить ещё ${n} ${plural(n, 'лот', 'лота', 'лотов')}`;
      return;
    }
    box.dataset.sig = sig;
    box.dataset.state = state;
    if (state !== 'on') S.pending = null;
    if (state === 'off') { box.innerHTML = ''; S.results = []; return; }
    if (state === 'guest') { box.innerHTML = '<div class="example-bar"><span>Чтобы добавить лот, войди в аккаунт: так у каждого будет свой лимит.</span> <a class="btn small primary" href="/opinion/#login">Войти</a></div>'; return; }
    if (state === 'full') { box.innerHTML = `<p class="lots-note">Твой лимит исчерпан: ${S.room.perUser} из ${S.room.perUser}. ${S.room.editOwn ? 'Убрать или заменить лот можно в списке ниже.' : 'Убрать лот нельзя.'}</p>`; S.results = []; return; }
    const k = kindOf(), free = S.room.kind === 'any';
    const old = S.replacing && S.lots.find((l) => l.id === S.replacing);
    box.innerHTML = `${old ? `<p class="lots-note lots-replacing">Выбери, чем заменить «${esc(old.name)}». <button type="button" class="lots-link" data-repl-cancel>Не заменять</button></p>` : ''}<label class="label" for="lotQ">${old ? 'Новый лот' : k.add}</label>
      <div class="add-row"><input class="inp" id="lotQ" type="${free ? 'text' : 'search'}" autocomplete="off" maxlength="${free ? 60 : 200}" enterkeyhint="${free ? 'done' : 'search'}" placeholder="${k.ph}">${free ? '<button type="button" class="btn primary" id="lotFree">Добавить</button>' : ''}</div>
      <p class="lots-note" id="lotLeft">${old ? '' : own ? 'Ты ведущий: добавляешь без лимита' : `Можешь добавить ещё ${n} ${plural(n, 'лот', 'лота', 'лотов')}`}</p>
      <p class="lots-note lots-off" id="lotMsg" hidden></p>
      <div class="lots-results" id="lotResults" hidden></div>
      <div class="lots-confirm" id="lotConfirm" hidden></div>`;
    paintConfirm();
  }
  // шаг подтверждения: лот встаёт на колесо только после нажатия «Подтвердить», случайный выбор из списка ничего не добавляет
  function paintConfirm() {
    const box = $('#lotConfirm');
    if (!box) return;
    const p = S.pending;
    box.hidden = !p;
    if (!p) { box.replaceChildren(); delete box.dataset.sig; return; } // без этого тот же лот второй раз не нарисовался бы
    const old = p.replace && S.lots.find((l) => l.id === p.replace);
    const sig = JSON.stringify([p.name, p.sub, p.img, old && old.name, S.room.editOwn]);
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    const pic = p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<em aria-hidden="true">＋</em>';
    box.innerHTML = `<div class="lots-conf-lot">${pic}<span><b>${esc(p.name)}</b>${p.sub ? `<small>${esc(p.sub)}</small>` : ''}</span></div>
      <p class="lots-note">${old ? `Заменить «${esc(old.name)}» этим лотом?` : 'Добавить этот лот на колесо?'} ${S.room.editOwn ? 'Пока идёт сбор, его можно будет убрать или заменить.' : 'Потом убрать его будет нельзя.'}</p>
      <div class="lots-conf-acts"><button type="button" class="btn primary" data-conf="yes">Подтвердить</button><button type="button" class="btn ghost" data-conf="no">Отмена</button></div>`;
  }
  function askConfirm(p) {
    S.pending = { ...p, replace: S.replacing || null };
    lotMsg('');
    paintResults();
    paintConfirm();
    const y = $('#lotConfirm [data-conf="yes"]');
    if (y) y.focus({ preventScroll: true });
  }
  const lotMsg = (t) => { const m = $('#lotMsg'); if (m) { m.textContent = t || ''; m.hidden = !t; } };
  // что ведущий вписал на колесо сам, в сборе не хранится, но зрители должны это видеть
  function hostNames() {
    const live = S.live;
    if (!live) return [];
    const lots = new Set(S.lots.map((l) => l.name.toLowerCase())), seen = new Set();
    return [...liveSegs().map((x) => x.n), ...(Array.isArray(live.out) ? live.out : [])].filter((n) => { const k = n.toLowerCase(); if (lots.has(k) || seen.has(k)) return false; seen.add(k); return true; });
  }
  function paintResults() {
    const box = $('#lotResults');
    if (!box) return;
    box.hidden = !S.results.length || !!S.pending;
    const gone = removedKeys();
    const taken = new Set([...S.lots.filter((l) => !gone.has(l.id)).map((l) => l.name), ...hostNames()].map((n) => n.toLowerCase()));
    const html = S.results.map((g, i) => { const has = taken.has(g.name.toLowerCase()); return `<button type="button" class="lots-opt" data-pick="${i}"${has ? ' disabled' : ''}>${g.img ? `<img src="${esc(g.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<em aria-hidden="true">＋</em>'}<span><b>${esc(g.name)}</b>${g.sub ? `<small>${esc(g.sub)}</small>` : ''}</span><i>${has ? 'уже есть' : ''}</i></button>`; }).join('');
    if (box.dataset.sig !== html) { box.dataset.sig = html; box.innerHTML = html; }
  }
  const linkName = (u) => (/steampowered\.com/.test(u) ? 'Открыть в Steam' : 'Открыть в Википедии');
  const lotImg = (l) => (l.img ? `<img src="${esc(l.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : `<em aria-hidden="true">${esc([...l.name][0] || '?')}</em>`);
  const lotPic = (l) => (l.link ? `<a href="${esc(l.link)}" target="_blank" rel="noopener noreferrer" title="${linkName(l.link)}">${lotImg(l)}</a>` : `<span class="lots-pic">${lotImg(l)}</span>`);
  function paintList() {
    const box = $('#lotList');
    // вылетевшие лоты сбора — по id; то, что ведущий вписал сам, — по названию (у него id нет)
    const outIds = outLotIds(S.live), outNames = new Set((S.live && Array.isArray(S.live.out) ? S.live.out : []).map((x) => x.toLowerCase()));
    const all = [...S.lots, ...hostNames().map((name) => ({ id: 'host:' + name, name, by: 'Ведущий', img: '', link: '' }))];
    // лот уже был на колесе, а теперь его там нет и он не вылетал: его убрал ведущий
    const removed = removedKeys();
    // убранное ведущим зрителям не показываем вовсе: обычно такой лот уже удалён из сбора, а старые сборы просто прячем
    // вылетевшие в списке лотов не показываем: они уходят в «Что выпадало по очереди»
    const rows = all.filter((l) => (String(l.id).startsWith('host:') ? !outNames.has(l.name.toLowerCase()) : !outIds.has(l.id) && !removed.has(l.id)));
    const n = rows.length;
    $('#mnavCount').textContent = n ? String(n) : '';
    // правки доступны, пока ведущий разрешает, сбор открыт, лот не вылетел и колесо не определило победителя
    const canEdit = !!token && !!S.room.editOwn && isOpen() && !(S.live && S.live.winner);
    // админ с открытым входом в админку и хозяин сбора удаляют любой лот и строки «Ведущий»
    const canMod = !!token && (S.admin || !!S.room.own);
    const html = `<p class="board-stat"><b>${n}</b> ${plural(n, 'лот', 'лота', 'лотов')}</p>${n ? `<ul class="lots-list">${rows.map((l) => { const k = l.name.toLowerCase(), gone = String(l.id).startsWith('host:') ? outNames.has(k) : outIds.has(l.id); const own = l.mine && canEdit && !gone ? `<button type="button" class="btn small ghost" data-replace="${esc(l.id)}"${S.replacing === l.id ? ' aria-pressed="true"' : ''}>Заменить</button><button type="button" class="btn small ghost danger" data-del="${esc(l.id)}">Убрать</button>` : ''; const host = String(l.id).startsWith('host:'); const modBtn = canMod && !own ? `<button type="button" class="btn small ghost danger" ${host ? `data-mod-name="${esc(l.name)}"` : `data-mod-lot="${esc(l.id)}"`} title="Удалить из сбора">Удалить</button>` : ''; const edit = own || modBtn ? `<span class="lots-acts">${own}${modBtn}</span>` : ''; return `<li data-lot="${esc(l.id)}" class="${gone ? 'out' : ''}">${lotPic(l)}<span class="lots-who"><b>${esc(l.name)}</b><small>${esc(l.by)}${l.mine ? ' · твой' : ''}${gone ? ' · вылетел' : ''}</small></span>${edit}</li>`; }).join('')}</ul>` : `<p class="lots-empty">${window.CasualUtil.emptyArt('lots')}Пока ни одного лота. Будь первым</p>`}`;
    if (box.dataset.sig === html) return;
    box.dataset.sig = html;
    // как участники в Колесе: оставшиеся плывут на новое место, новые въезжают
    const was = new Map([...box.querySelectorAll('[data-lot]')].map((li) => [li.dataset.lot, li.offsetTop]));
    box.innerHTML = html;
    if (reduced) return;
    let k = 0;
    box.querySelectorAll('[data-lot]').forEach((li) => {
      const top = was.get(li.dataset.lot);
      if (top != null) { if (Math.abs(top - li.offsetTop) > 1) li.animate([{ transform: `translateY(${top - li.offsetTop}px)` }, { transform: 'none' }], { duration: 460, easing: 'cubic-bezier(.2, .8, .2, 1)' }); }
      else if (was.size && k < 14) li.animate([{ transform: 'translateX(-22px) scale(.97)' }, { transform: 'none' }], { duration: 480, delay: 30 * k++, easing: 'cubic-bezier(.34, 1.56, .64, 1)', fill: 'backwards' });
      else if (!was.size && S.firstList !== false && k < 14) li.animate([{ transform: 'translateX(-22px) scale(.97)' }, { transform: 'none' }], { duration: 480, delay: 40 * k++, easing: 'cubic-bezier(.34, 1.56, .64, 1)', fill: 'backwards' });
    });
    S.firstList = false;
  }
  // что выпадало по очереди: видно всем. У снимков до появления истории — порядок вылета
  function paintHist() {
    const box = $('#lotHist');
    if (!box) return;
    const live = S.live || {};
    const hist = Array.isArray(live.hist) && (live.hist.length || !(live.out || []).length) ? live.hist : Array.isArray(live.out) ? live.out : [];
    const win = live.winner && live.winner.n;
    const html = !hist.length && !win ? '' : `${win ? `<p class="hist-win"><span class="u-old">🏆 </span>Победитель: <b>${esc(win)}</b></p>` : ''}${hist.length ? `<ol class="hist-list">${hist.map((n, i) => {
      const lot = S.lots.find((l) => l.name.toLowerCase() === String(n).toLowerCase());
      return `<li><span class="hist-n">${i + 1}</span>${lot ? lotPic(lot) : `<span class="lots-pic"><em aria-hidden="true">${esc([...String(n)][0] || '?')}</em></span>`}<span class="lots-who"><b>${esc(n)}</b>${lot && lot.by ? `<small>${esc(lot.by)}</small>` : ''}</span></li>`;
    }).join('')}</ol>` : ''}`;
    if (box.dataset.sig === html) return;
    box.dataset.sig = html;
    box.hidden = !html;
    $('#lotHistBody').innerHTML = html;
  }
  function paintStatus() {
    const live = S.live;
    const n = shownSegs().length;
    $('#aliveBadge').textContent = n;
    $('#aliveBadge').dataset.tier = live && live.winner ? 'good' : live && live.pick ? 'bad' : 'idle';
    $('#statusMain').textContent = live && live.status ? live.status : 'Ждём, когда ведущий запустит колесо';
    $('#statusSub').textContent = n ? `${n} ${plural(n, 'лот', 'лота', 'лотов')} на колесе` : '';
  }
  // сбор только что закончился или открылся снова: буквы заголовка собираются заново, надпись подпрыгивает
  function watchOpen() {
    const open = isOpen();
    if (S.wasOpen !== undefined && S.wasOpen !== open) {
      setTitle(S.room.title || baseTitle(), true);
      const rule = $('#lotRule');
      if (!reduced && rule && rule.animate) rule.animate([{ transform: 'translateY(10px) scale(.96)' }, { transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.34, 1.56, .64, 1)' });
    }
    S.wasOpen = open;
  }
  function paintAll() {
    paintHead(); paintRule(); paintAdd(); paintConfirm(); paintResults(); paintList(); paintStatus(); wheel(); paintWinner(); syncBg(); watchOpen(); paintHost(); paintHist();
  }
  // телефон: колесо и список лотов — разные вкладки, переключатель вверху
  let section = 'wheel';
  function paintSection() {
    view.dataset.section = section;
    document.querySelectorAll('#mnav [data-section]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.section === section)));
  }
  $('#mnav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-section]');
    if (!b || section === b.dataset.section) return;
    section = b.dataset.section;
    paintSection();
    const y = view.getBoundingClientRect().top + window.scrollY - $('#mnav').offsetHeight - 24;
    if (window.scrollY > y) window.scrollTo(0, Math.max(0, y));
    if (section === 'wheel') { resize(); restSig = ''; wheel(); }
  });
  paintSection();
  // зашли без кода сбора: зрителю — поле для ссылки, ведущему — путь к созданию сбора в Колесе
  function paintStart() {
    $('#mnav').hidden = true;
    setTitle(baseTitle(), true);
    $('#lotLede').textContent = '';
    view.innerHTML = `<section class="card lots-gone lots-start">
      <h2 class="h2">Лоты по ссылке</h2>
      <p class="lots-empty">Друзья предлагают игры или фильмы, а колесо выбирает одно. Открой сбор по ссылке ведущего или собери свой.</p>
      <form class="lots-join" id="lotsJoin"><input id="lotsCode" aria-label="Ссылка или код сбора" placeholder="Ссылка или код сбора" autocomplete="off" spellcheck="false"><button class="btn primary" type="submit">Открыть</button></form>
      <p class="lots-empty" id="lotsJoinMsg" role="status"></p>
      <a class="btn ghost" href="/wheel/#lots">Я ведущий — создать сбор</a>
    </section>`;
    $('#lotsJoin').addEventListener('submit', (e) => {
      e.preventDefault();
      const m = /([A-Za-z0-9]{12})\/?\s*$/.exec($('#lotsCode').value.trim().replace('#', '/'));
      if (m) location.href = '/lots/' + m[1];
      else $('#lotsJoinMsg').textContent = 'Не похоже на ссылку сбора: в ней после /lots/ идут 12 букв и цифр.';
    });
    canvas = null;
    S.room = null;
  }
  function paintGone(text) {
    $('#mnav').hidden = true;
    setTitle(baseTitle(), true);
    $('#lotLede').textContent = '';
    view.innerHTML = `<section class="card lots-gone"><p class="lots-empty">${esc(text)}</p><a class="btn primary" href="/wheel/">Открыть Колесо</a></section>`;
    canvas = null;
    S.room = null;
  }

  // ---------- пульт ведущего: хозяин сбора крутит колесо прямо здесь ----------
  // Зрители видят снимок колеса (live) на сервере. Лоты на колесе, картинку в центре и музыку пишет эта страница
  // у хозяина сбора, а прокрутку, вылеты и победителя считает сервер: страница только просит «крути» и показывает ответ.
  // На колесе все лоты сбора, кроме вылетевших; шансы у всех равные. Режим и длительность хранятся в этом браузере
  const HOST_KEY = 'casualhub.lots.host.v1';
  const hostSaved = read(HOST_KEY) || {};
  const H = { pick: hostSaved.pick === 'one' ? 'one' : 'out', dur: Math.max(1, Math.min(30, Math.round(+hostSaved.dur) || 8)) };
  const keepHost = () => { try { localStorage.setItem(HOST_KEY, JSON.stringify({ pick: H.pick, dur: H.dur })); } catch (e) {} };
  // раньше здесь лежали и списки «Настройки лотов»: теперь они только на сервере
  if ('keep' in hostSaved || 'kick' in hostSaved) keepHost();
  // «Настройка лотов» админа: списки приходят с сервера только админу
  let F = { keep: [], kick: [] };
  const inList = (arr, name) => Array.isArray(arr) && arr.some((x) => low(x) === low(name));
  let hostRes = null, hostT = 0, hostArmT = 0, hostPushing = false;
  const isHost = () => !!(token && S.room && S.room.own);
  // «до победителя» идёт на сервере: пока в снимке есть auto, следующие прокрутки начинаются сами
  const autoOn = () => !!(S.live && S.live.auto);
  const stopAutoSpin = () => { if (autoOn()) hostPush({ auto: false }); };
  // версия этой страницы для PUT /lots/:code/live: по ней сервер отличает вкладки со старой страницей и просит их обновиться
  const LIVE_V = 2;
  const low = (s) => String(s || '').toLowerCase();
  const liveOut = () => (S.live && Array.isArray(S.live.out) ? S.live.out : []);
  const hostSpinning = () => !!hostRes || !!(S.live && S.live.spin && serverNow() < S.live.spin.at + S.live.spin.ms);
  // лоты на колесе: все, кроме вылетевших (по id, см. outLotIds); fresh — после «Вернуть всех»
  function hostAlive(fresh) {
    if (fresh) return S.lots.slice();
    const gone = outLotIds(S.live);
    return S.lots.filter((l) => !gone.has(l.id));
  }
  // цвет сектора закреплён за лотом (по месту в сборе): когда кто-то вылетает, соседи цвет не меняют
  function hostSeg(l, p) {
    const i = Math.max(0, S.lots.indexOf(l)), c = PALETTE[i % PALETTE.length];
    return { n: l.name, p, c, t: inkOn(c), l: l.id };
  }
  // что ведущий пишет в снимок сам: лоты на колесе, картинка в центре, музыка, обложки.
  // Прокрутку, вылеты, победителя и историю сервер берёт из своего снимка, а не отсюда
  function hostBody(over) {
    const live = S.live || {};
    const alive = hostAlive(!!(over && over.reset));
    return Object.assign({
      segs: alive.map((l) => hostSeg(l, 1 / alive.length)),
      hub: +live.hub || 24, hubImg: live.hubImg || '', hubOwn: live.hubOwn || '',
      seen: S.lots.length, ids: S.lots.map((l) => l.id),
      music: hostMusic(live.music),
      pics: live.pics !== false,
    }, over);
  }
  const hostMsg = (t) => { const m = $('#hostMsg'); if (m) { m.textContent = t || ''; m.hidden = !t; } };
  // снимок уходит на сервер; ответы опроса, которые уже были в пути, его не перетрут.
  // Пока ответа нет, страница показывает то, что ушло, поверх последнего снимка
  async function hostPush(body) {
    const { reset, ...shown } = body;
    // пока колесо крутится, сектора на сервере не меняются: и здесь остаются те, с которыми оно крутится
    if (hostSpinning()) delete shown.segs;
    S.live = Object.assign({}, S.live, shown);
    pollSeq++;
    paintAll();
    hostPushing = true;
    try {
      const d = await api(`/lots/${encodeURIComponent(code)}/live`, 'PUT', { ...body, v: LIVE_V });
      // «Вернуть всех» посреди прокрутки сервер не сделал, остальное применил: говорим почему, снимок берём заново
      if (d && d.refused) { hostMsg(d.refused); etag = ''; } else hostMsg('');
    } catch (e) { hostMsg('Зрители не увидят это: ' + e.message); etag = ''; }
    hostPushing = false;
    clearTimeout(pollT);
    pollT = setTimeout(poll, 1500);
  }
  // лоты поменялись (новый, удалённый, заменённый): колесо у зрителей обновляется сразу, если ведущий не крутит
  function hostSync() {
    if (!isHost() || hostSpinning() || hostPushing) return;
    const want = hostBody();
    const live = S.live;
    const same = live && JSON.stringify([live.segs, live.ids, live.seen]) === JSON.stringify([want.segs, want.ids, want.seen]);
    if (!same) hostPush(want);
  }
  // ответ сервера с прокруткой или её итогом: то же, что получает опрос
  function hostTake(d) {
    if (!d) return;
    S.room = d.room;
    S.live = d.live;
    if (d.lots) S.lots = d.lots;
    takeForce(d.live);
    paintAll();
  }
  // «Крутить»: кого выбьет или кто победит, выбирает сервер; страница крутит колесо к выпавшему сектору.
  // auto — «до победителя»: следующие прокрутки сервер начинает сам, вкладку можно и закрыть
  async function hostSpin(auto) {
    if (!isHost() || hostSpinning()) return;
    const live = S.live || {};
    if (H.pick === 'out' && live.winner) { hostMsg('Победитель уже есть. Жми «Вернуть всех», чтобы крутить заново.'); return; }
    if (hostAlive().length < 2) { hostMsg('Чтобы крутить, на колесе нужно хотя бы два лота.'); return; }
    const mode = H.pick;
    hostRes = { mode };
    if (CH.win.active) { stopChannel('win'); syncBg(); }
    paintHost();
    pollSeq++;
    const t0 = Date.now();
    let d = null;
    try { d = await api(`/lots/${encodeURIComponent(code)}/spin`, 'POST', { mode, dur: H.dur, auto: !!auto && mode === 'out' }); }
    catch (e) {
      hostRes = null;
      hostMsg(e.message);
      poll();
      return;
    }
    clockSample(d.now, t0, Date.now());
    hostMsg('');
    hostTake(d);
    const spin = S.live && S.live.spin;
    if (!spin) { hostRes = null; paintHost(); return; }
    clearTimeout(hostT);
    hostT = setTimeout(hostFinish, Math.max(0, spin.at + spin.ms - serverNow()) + 150);
  }
  // прокрутка кончилась: итог записывает сервер. «На выбывание»: сектор мигает, через LIVE_OUT лот вылетает;
  // «Один победитель» — сразу. Страница только забирает итог пораньше, не дожидаясь очередного опроса.
  // «До победителя» следующую прокрутку начинает сервер через LIVE_NEXT после вылета: спрашиваем и её
  const LIVE_OUT = 1100, LIVE_NEXT = 900;
  async function hostFinish() {
    const r = hostRes;
    if (!r) return;
    if (!rtLive()) await poll();
    if (r.mode === 'one') { hostRes = null; paintHost(); return; }
    hostT = setTimeout(async () => {
      if (!rtLive()) await poll();
      hostRes = null;
      paintHost();
      if (autoOn() && !rtLive()) hostT = setTimeout(poll, LIVE_NEXT + 200);
    }, LIVE_OUT + 100);
  }
  // списки «Настройки лотов» из ответа сервера: они там есть, только если спрашивает админ
  function takeForce(live) {
    if (live && Array.isArray(live.keep)) F.keep = live.keep;
    if (live && Array.isArray(live.kick)) F.kick = live.kick;
  }
  // админ поменял списки: уходят только они, остальное в снимке сервер не трогает
  async function forcePush(next) {
    F = next;
    pollSeq++;
    paintHost();
    try { await api(`/lots/${encodeURIComponent(code)}/live`, 'PUT', { keep: next.keep, kick: next.kick, v: LIVE_V }); }
    catch (e) { lotMsg('Настройка лотов не сохранилась: ' + e.message); }
    clearTimeout(pollT);
    pollT = setTimeout(poll, 1500);
  }
  // «Вернуть всех»: вылетевшие снова на колесе, победителя и истории нет. Настройку лотов админа это не трогает
  function hostReset() {
    if (!isHost() || hostSpinning()) return;
    if (CH.win.active) { stopChannel('win'); syncBg(); }
    hostPush(hostBody({ out: [], outIds: [], winner: null, pick: '', spin: null, status: '', hist: [], auto: null, reset: true }));
  }
  async function hostRoom(body) {
    try {
      const d = await api(`/lots/${encodeURIComponent(code)}`, 'PATCH', body);
      if (d.room) S.room = d.room;
      if (d.lots) S.lots = d.lots;
      hostMsg('');
      paintAll();
    } catch (e) { hostMsg(e.message); }
  }
  function hostClockText() {
    const r = S.room;
    if (!r) return '';
    if (r.closed) return 'сбор закрыт';
    const left = timeLeft();
    if (left == null) return 'без таймера';
    return left > 0 ? 'осталось ' + mmss(left) : 'время вышло';
  }
  // картинка в центре колеса: из каталога Колеса или своя. Своя хранится на сервере у ведущего, зрителям она отдаётся по ссылке сбора
  let hubGroups = [], hubTab = '', hubBusy = false;
  fetch('/wheel/hub/index.json').then((r) => r.json()).then((d) => {
    hubGroups = (d.groups || []).map((g) => ({ id: g.id, title: g.title || g.id, items: (g.items || []).filter((it) => it && /^hub\//.test(it.src || '')) })).filter((g) => g.items.length);
    if (!hubTab && hubGroups[0]) hubTab = hubGroups[0].id;
    paintHubPick(true);
  }).catch(() => {});
  function paintHubPick(force) {
    const box = $('#hostHubs'), tabs = $('#hostHubTabs');
    if (!box || !tabs || !isHost()) return;
    const live = S.live || {};
    const cur = live.hubOwn ? 'own' : live.hubImg || '';
    const sig = JSON.stringify([hubTab, cur, hubGroups.length, hubBusy]);
    if (!force && box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    tabs.innerHTML = hubGroups.map((g) => `<button type="button" data-hub-tab="${esc(g.id)}" aria-pressed="${g.id === hubTab}">${esc(g.title)} <b>${g.items.length}</b></button>`).join('');
    $('#hostHubNone').setAttribute('aria-pressed', String(!cur));
    $('#hostHubUp').textContent = hubBusy ? 'Загружаю…' : cur === 'own' ? 'Своя картинка ✓' : 'Загрузить свою';
    $('#hostHubUp').disabled = hubBusy;
    const g = hubGroups.find((x) => x.id === hubTab);
    // при загрузке видео не тянем все сразу: превью грузится, только когда плитка видна
    box.innerHTML = g ? g.items.map((it) => {
      const vid = /\.webm$/i.test(it.src), src = WEBM_SRC(it.src);
      return `<button type="button" class="host-hub" data-hub="${esc(it.src)}" aria-pressed="${it.src === cur}" title="${esc(it.name || '')}">${vid ? `<video src="${esc(src)}#t=0.1" muted playsinline preload="none" data-lazy></video>` : `<img src="/wheel/${esc(it.src)}" alt="" loading="lazy" decoding="async">`}</button>`;
    }).join('') : '<p class="lots-note">Каталог картинок не загрузился.</p>';
    if (hubIo) box.querySelectorAll('video[data-lazy]').forEach((v) => hubIo.observe(v));
  }
  const hubIo = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { const v = e.target; hubIo.unobserve(v); v.preload = 'metadata'; try { v.load(); } catch (er) {} } }), { rootMargin: '80px' }) : null;
  function hostHub(over) {
    if (!isHost()) return;
    hostPush(hostBody(over));
  }
  // своя картинка: квадрат до 480 px; небольшая гифка уходит как есть, чтобы двигалась
  function hubData(file) {
    if (file.type === 'image/gif' && file.size <= 1350 * 1024) return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
    return createImageBitmap(file).then((bmp) => {
      const side = Math.min(bmp.width, bmp.height), size = Math.min(side, 480);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
      const webp = c.toDataURL('image/webp', 0.85);
      return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.85);
    });
  }
  async function hubUpload(file) {
    if (!file || hubBusy) return;
    if (!/^image\//.test(file.type)) { hostMsg('Нужна картинка: PNG, JPG, WebP или GIF.'); return; }
    hubBusy = true; paintHubPick(true);
    try {
      const data = await hubData(file);
      await api('/lots-hub', 'PUT', { data });
      hostHub({ hubImg: '', hubOwn: 'g' + Date.now().toString(36) });
      hostMsg('');
    } catch (e) { hostMsg('Картинка не загрузилась: ' + (e.message || 'попробуй другую')); }
    hubBusy = false; paintHubPick(true);
  }
  // как в Колесе: VI KA звучит только на победе, фоном её не поставить
  const WIN_TRACK = 'vika';
  const presetOpts = (cur, none) => (none ? `<option value=""${cur ? '' : ' selected'}>Без музыки</option>` : '') + PRESETS.filter((p) => (none ? p.id !== WIN_TRACK : p.id === WIN_TRACK)).map((p) => `<option value="${p.id}"${p.id === cur ? ' selected' : ''}>${esc(p.title)}</option>`).join('');
  const hostMusic = (m) => normMusic(m);
  const PLAY_IC = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>', PAUSE_IC = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>';
  // музыка меняется сразу, даже во время прокрутки: снимок колеса уходит тот же, меняется только музыка
  function hostMusicPush(patch) {
    if (!isHost()) return;
    const live = S.live || {};
    const cur = normMusic(live.music);
    const m = Object.assign({}, cur, { pos: musicAt(cur), at: Math.round(serverNow()) }, patch);
    if (patch.cur && patch.pos == null) m.pos = (presetOf(patch.cur) || {}).start || 0;
    if (patch.bg != null && !patch.cur) { m.cur = patch.bg; m.pos = (presetOf(patch.bg) || {}).start || 0; m.pause = false; }
    hostPush(hostBody({ music: m }));
  }
  function paintHost() {
    const panel = $('#hostPanel'), room = $('#hostRoom');
    if (!panel || !room) return;
    const host = isHost(), admin = !!S.admin;
    panel.hidden = !host;
    room.hidden = !host;
    $('#hostReset').hidden = !host;

    // Настройка лотов: доступна только администраторам
    const forceWrap = $('#hostForceWrap');
    if (forceWrap) {
      forceWrap.hidden = !admin;
      if (admin) {
        const aliveList = hostAlive();
        const row = (l, kind) => {
          const name = l.name, on = inList(F[kind], name);
          const pic = /^https:\/\//.test(l.img || '') ? `<img class="hf-pic" src="${esc(l.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : `<em class="hf-pic" aria-hidden="true">${esc([...name][0] || '?')}</em>`;
          return `<label class="lots-chk hf-row"><input type="checkbox" data-force-lot="${esc(name)}" data-force-kind="${kind}"${on ? ' checked' : ''}>${pic}<span>${esc(name)}</span></label>`;
        };
        const keepBox = $('#hostForceKeep'), kickBox = $('#hostForceKick');
        const keepHtml = aliveList.length ? aliveList.map((l) => row(l, 'keep')).join('') : '<span class="host-force-empty">Пока пусто</span>';
        const kickHtml = aliveList.length ? aliveList.map((l) => row(l, 'kick')).join('') : '<span class="host-force-empty">Пока пусто</span>';
        if (keepBox && keepBox.dataset.sig !== keepHtml) { keepBox.dataset.sig = keepHtml; keepBox.innerHTML = keepHtml; }
        if (kickBox && kickBox.dataset.sig !== kickHtml) { kickBox.dataset.sig = kickHtml; kickBox.innerHTML = kickHtml; }
      }
    }

    if (!host) return;

    const live = S.live || {};
    const spinning = hostSpinning(), aliveList = hostAlive(), alive = aliveList.length;
    const b = $('#hostSpin');
    const autoBtn = $('#hostAutoSpin');
    const resetBtn = $('#hostReset');
    if (b) {
      b.disabled = spinning || alive < 2 || (H.pick === 'out' && !!live.winner) || autoOn();
      if (!b.dataset.armed) b.textContent = spinning ? 'Крутится…' : 'Крутить';
      // центр колеса крутит так же, как кнопка в пульте
      const hub = $('#lotHub');
      hub.classList.add('can-spin');
      hub.disabled = b.disabled;
      $('#hubLabel').textContent = b.dataset.armed ? 'Точно?' : 'Крутить';
    }
    if (autoBtn) {
      autoBtn.style.display = H.pick === 'out' ? '' : 'none';
      autoBtn.disabled = !autoOn() && (spinning || alive < 2 || !!live.winner);
      if (autoOn()) {
        autoBtn.textContent = 'Остановить';
        autoBtn.classList.add('danger');
        autoBtn.classList.remove('ghost');
      } else {
        autoBtn.textContent = 'Крутить до победителя';
        autoBtn.classList.remove('danger');
        autoBtn.classList.add('ghost');
      }
    }
    if (resetBtn) resetBtn.disabled = spinning || !(liveOut().length || live.winner) || autoOn();
    $('#hostPick').querySelectorAll('[data-pick]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.pick === H.pick)));
    const durSlider = $('#hostDurSlider'), durVal = $('#hostDurVal');
    if (durSlider) {
      durSlider.value = H.dur;
      durSlider.disabled = spinning || autoOn();
    }
    if (durVal) durVal.textContent = `${H.dur} с`;
    const m = hostMusic(live.music);
    const pics = $('#hostPics');
    if (pics) pics.checked = live.pics !== false;
    paintTrack();
    const bg = $('#hostBg'), win = $('#hostWin');
    if (bg.dataset.v !== m.bg) { bg.dataset.v = m.bg; bg.innerHTML = presetOpts(m.bg, true); }
    if (win.dataset.v !== m.win) { win.dataset.v = m.win; win.innerHTML = presetOpts(m.win, false); }
    // сбор: ссылка, таймер, лимит и правила — только у хозяина
    paintHubPick();
    const r = S.room, open = isOpen(), url = location.origin + '/lots/' + code;
    const clock = $('#hostClock');
    if (clock) clock.textContent = hostClockText();
    const sig = JSON.stringify([open, r.closed, !!r.endsAt, r.perUser, r.editOwn, r.uniq, r.fuzzy]);
    if (room.dataset.sig === sig) return;
    room.dataset.sig = sig;
    room.innerHTML = `<div class="lots-f"><span>Ссылка для зрителей</span><div class="lots-row"><input class="inp" id="hostUrl" readonly value="${esc(url)}"><button type="button" class="btn small primary" data-host="copy">Скопировать</button></div></div>
      <div class="lots-f"><span>Время сбора: <b class="host-clock" id="hostClock">${esc(hostClockText())}</b></span><div class="lots-row">
        <button type="button" class="btn small ghost" data-host="minus"${open && r.endsAt ? '' : ' disabled title="Отнять можно только у идущего таймера"'}>−1 минута</button>
        <button type="button" class="btn small ghost" data-host="plus">+1 минута</button>
        ${open ? '<button type="button" class="btn small ghost" data-host="close">Закрыть сбор</button>' : '<button type="button" class="btn small ghost" data-host="reopen">Открыть снова</button>'}
      </div></div>
      <div class="lots-f"><span>Лотов на человека</span><div class="seg" role="group" aria-label="Лотов на человека">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-host-limit="${n}" aria-pressed="${n === r.perUser}">${n}</button>`).join('')}</div></div>
      <div class="lots-f"><span>Правила для зрителей</span>
        <label class="lots-chk"><input type="checkbox" data-host-rule="editOwn"${r.editOwn ? ' checked' : ''}><span>Зрители могут убирать и менять свои лоты (пока лот не вылетел)</span></label>
        <label class="lots-chk"><input type="checkbox" data-host-rule="uniq"${r.uniq ? ' checked' : ''}><span>Одно название — один лот: никто не займёт два лота одной игрой</span></label>
        <label class="lots-chk"><input type="checkbox" data-host-rule="fuzzy"${r.fuzzy ? ' checked' : ''}${r.uniq ? '' : ' disabled'}><span>Ловить обход по похожему названию (outlast и ooutlast)</span></label>
      </div>`;
  }
  (() => {
    const panel = $('#hostPanel');
    if (!panel) return;
    $('#hostSpin').addEventListener('click', () => {
      const b = $('#hostSpin');
      // сбор ещё идёт: зрители могут добавлять лоты, поэтому сначала спрашиваем
      if (isOpen() && S.room.endsAt && !b.dataset.armed) {
        b.dataset.armed = '1';
        b.textContent = `Сбор идёт ещё ${mmss(timeLeft())}. Крутить?`;
        clearTimeout(hostArmT);
        hostArmT = setTimeout(() => { delete b.dataset.armed; paintHost(); }, 4000);
        return;
      }
      delete b.dataset.armed;
      clearTimeout(hostArmT);
      hostSpin();
    });
    $('#lotHub').addEventListener('click', () => {
      const b = $('#hostSpin');
      if (!isHost() || b.disabled) return;
      b.click();
      $('#hubLabel').textContent = b.dataset.armed ? 'Точно?' : 'Крутить';
    });
    $('#hostAutoSpin')?.addEventListener('click', () => {
      if (!isHost()) return;
      if (autoOn()) {
        stopAutoSpin();
        return;
      }
      const live = S.live || {};
      if (H.pick === 'out' && live.winner) { hostMsg('Победитель уже есть. Жми «Вернуть всех», чтобы крутить заново.'); return; }
      const alive = hostAlive();
      if (alive.length < 2) { hostMsg('Чтобы крутить, на колесе нужно хотя бы два лота.'); return; }
      hostSpin(true);
    });
    $('#hostReset').addEventListener('click', hostReset);
    $('#hostHubTabs').addEventListener('click', (e) => { const t = e.target.closest('[data-hub-tab]'); if (!t) return; hubTab = t.dataset.hubTab; paintHubPick(true); });
    $('#hostHubs').addEventListener('click', (e) => { const t = e.target.closest('[data-hub]'); if (!t) return; hostHub({ hubImg: t.dataset.hub, hubOwn: '' }); });
    $('#hostHubNone').addEventListener('click', () => hostHub({ hubImg: '', hubOwn: '' }));
    $('#hostHubUp').addEventListener('click', () => $('#hostHubFile').click());
    $('#hostHubFile').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; hubUpload(f); });
    $('#hostPick').addEventListener('click', (e) => { const x = e.target.closest('[data-pick]'); if (!x) return; stopAutoSpin(); H.pick = x.dataset.pick === 'one' ? 'one' : 'out'; keepHost(); paintHost(); });
    $('#hostDurSlider')?.addEventListener('input', (e) => {
      const v = Math.max(1, Math.min(30, Math.round(+e.target.value) || 8));
      H.dur = v;
      const durVal = $('#hostDurVal');
      if (durVal) durVal.textContent = `${v} с`;
      keepHost();
    });
    $('#hostBg').addEventListener('change', (e) => hostMusicPush({ bg: e.target.value }));
    $('#hostWin').addEventListener('change', () => hostMusicPush({}));
    // пауза и продолжение для всех: позиция замирает и идёт дальше с того же места
    $('#hostPlay').addEventListener('click', () => { const m = liveMusic(); hostMusicPush({ pause: !m.pause }); });
    $('#hostNext').addEventListener('click', () => { const m = liveMusic(); const n = nextTrack(BG.cur || m.cur); if (n) hostMusicPush({ cur: n, pause: false }); });
    $('#hostAutoNext').addEventListener('change', (e) => hostMusicPush({ auto: e.target.checked }));
    // перемотка: пока тянешь, полоса не прыгает; отпустил — все переходят на это место
    const sk = $('#hostSeek');
    sk.addEventListener('input', () => { seeking = true; $('#hostPos').textContent = tsec(+sk.value); sk.style.setProperty('--fill', (+sk.value / (+sk.max || 1) * 100).toFixed(2) + '%'); });
    sk.addEventListener('change', () => { seeking = false; const v = +sk.value; try { if (CH.bg.active && EMB.yt.bg) EMB.yt.bg.seekTo(v, true); } catch (e) {} hostMusicPush({ pos: v }); });
    $('#hostPics').addEventListener('change', (e) => {
      if (!isHost()) return;
      hostPush(hostBody({ pics: e.target.checked }));
    });
    // «Настройка лотов»: сервер принимает списки только от админа и учитывает их на следующей прокрутке
    $('#hostForceWrap')?.addEventListener('change', (e) => {
      const inp = e.target.closest('input[data-force-lot]');
      if (!inp || !S.admin) return;
      const name = inp.dataset.forceLot, kind = inp.dataset.forceKind, other = kind === 'keep' ? 'kick' : 'keep';
      // названия лотов, которых в сборе уже нет, из списков уходят; вылетевшие остаются до «Вернуть всех»
      const has = new Set(S.lots.map((l) => low(l.name)));
      const next = { keep: F.keep.filter((n) => has.has(low(n))), kick: F.kick.filter((n) => has.has(low(n))) };
      next[kind] = next[kind].filter((n) => low(n) !== low(name));
      if (inp.checked) { next[kind].push(name); next[other] = next[other].filter((n) => low(n) !== low(name)); }
      forcePush(next);
    });
    const room = $('#hostRoom');
    room.addEventListener('click', async (e) => {
      const lim = e.target.closest('[data-host-limit]');
      if (lim) { hostRoom({ perUser: +lim.dataset.hostLimit }); return; }
      const b = e.target.closest('[data-host]');
      if (!b) return;
      const a = b.dataset.host;
      if (a === 'copy') {
        try { await navigator.clipboard.writeText($('#hostUrl').value); b.textContent = 'Скопировано'; setTimeout(() => { if (b.isConnected) b.textContent = 'Скопировать'; }, 1500); }
        catch (er) { const u = $('#hostUrl'); u.focus(); u.select(); }
      } else if (a === 'plus') hostRoom({ extra: 1 });
      else if (a === 'minus') hostRoom({ extra: -1 });
      else if (a === 'close') hostRoom({ closed: true });
      else if (a === 'reopen') hostRoom({ closed: false, ...(timeLeft() != null && timeLeft() <= 0 ? { extra: 5 } : {}) });
    });
    room.addEventListener('change', (e) => {
      const c = e.target.closest('[data-host-rule]');
      if (c) hostRoom({ [c.dataset.hostRule]: c.checked });
    });
  })();

  // ---------- связь с сервером ----------
  // С комнатой лотов (в ответе сбора rt: true) снимок приходит по WebSocket, как только что-то поменялось, а опрос
  // остаётся страховкой раз в минуту. Без комнаты или пока сокет не поднялся — опрос раз в пару секунд с ETag:
  // если ничего не поменялось, сервер отвечает 304 без тела
  let pollT = 0, pollSeq = 0, etag = '', rt = null;
  const rtLive = () => !!(rt && rt.live());
  // часы сервера: ответ шёл туда и обратно, поэтому время сервера — на середине пути. Из последних ответов берём
  // самый быстрый (у него меньше всего погрешность), а во время прокрутки поправку не трогаем, чтобы колесо не дёргалось
  const clock = [];
  function clockSample(now, t0, t1) {
    if (!+now) return;
    clock.push({ off: now - (t0 + t1) / 2, rtt: t1 - t0 });
    if (clock.length > 10) clock.shift();
    if (spinRaf && clock.length > 1) return;
    S.offset = clock.reduce((a, b) => (b.rtt < a.rtt ? b : a)).off;
  }
  const goneText = 'Такого сбора нет: ведущий удалил его или ссылка с ошибкой.';
  async function poll() {
    clearTimeout(pollT);
    // опрос один: устаревший ответ не затирает свежий и не запускает второй круг
    const seq = ++pollSeq;
    let d = null, tag = '';
    const t0 = Date.now();
    try {
      const r = await fetch(`/api/lots/${encodeURIComponent(code)}${S.room ? '?v=' + S.room.ver : ''}`, { cache: 'no-store', headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(etag && S.room ? { 'if-none-match': etag } : {}) } });
      if (r.status === 404) { if (seq === pollSeq) { stopRT(); dropFollow(); paintGone(goneText); } return; }
      if (r.ok) { d = await r.json(); tag = r.headers.get('etag') || ''; }
    } catch (e) {}
    if (seq !== pollSeq) return;
    if (d) {
      etag = tag;
      clockSample(d.now, t0, Date.now());
      S.room = d.room;
      S.live = d.live;
      takeForce(d.live);
      if (d.lots) S.lots = d.lots;
      keepFollow();
      paintAll();
      S.firstPoll = false;
      hostSync();
      if (d.rt && !rt) startRT();
      else if (!d.rt && rt) stopRT();
    }
    // всё, что делает ведущий, видно через пару секунд; с сокетом — сразу, а опрос раз в минуту на всякий случай;
    // в фоновой вкладке и давно после победы спрашиваем реже
    const done = S.live && S.live.winner && serverNow() - (+S.live.winner.at || 0) > 600000;
    const wait = rtLive() ? 60000 : document.hidden ? 8000 : done ? 15000 : 2000;
    pollT = setTimeout(poll, wait);
  }
  // комната лотов: снимок по WebSocket. Пока сокет поднимается или переподключается, страница опрашивает сервер
  function startRT() {
    if (rt || !window.CasualRT) return;
    rt = window.CasualRT.lots(code, {
      token,
      onState(m, clk) {
        if (clk) clockSample(m.now, clk.t0, clk.t1);
        // своя запись ещё в пути: после неё придёт свежий снимок, этот старше
        if (hostPushing) return;
        pollSeq++; // ответы опроса, которые уже в пути, старше этого снимка
        etag = '';
        S.live = m.live;
        takeForce(m.live);
        // поменялись лоты или сам сбор: подробности — обычным запросом
        if (S.room && m.ver !== S.room.ver) { poll(); return; }
        paintAll();
        hostSync();
      },
      onGone() { stopRT(); dropFollow(); paintGone(goneText); },
      // сокет поднялся — опрос раз в минуту; оборвался — снова раз в пару секунд, пока он переподключается
      onStatus(open) { clearTimeout(pollT); pollT = setTimeout(poll, open ? 60000 : 1500); },
    });
  }
  function stopRT() { if (rt) { rt.close(); rt = null; } }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && code && S.room && !rtLive()) poll(); });
  let followAt = 0;
  setInterval(() => {
    if (!S.room) return;
    const was = $('#lotAdd').dataset.state;
    paintRule();
    if (was !== 'off' && !isOpen()) { paintAdd(); paintList(); }
    watchOpen();
    paintHost(); // время сбора на пульте идёт каждую секунду
    syncBg();
    // мини-плеер в других вкладках молчит, пока эта страница открыта: она отмечается раз в 5 секунд
    if (Date.now() - followAt > 5000) { followAt = Date.now(); keepFollow(); }
  }, 1000);

  // лот уходит на сервер только после подтверждения; replace — id своего лота, который заменяем
  async function addLot(payload, btn, replace) {
    if (S.busy) return;
    S.busy = true;
    if (btn) btn.disabled = true;
    lotMsg('');
    try {
      const d = replace ? await api(`/lots/${encodeURIComponent(code)}/${encodeURIComponent(replace)}`, 'PUT', payload) : await api(`/lots/${encodeURIComponent(code)}`, 'POST', payload);
      S.lots = d.lots || S.lots;
      S.room = d.room;
      S.results = [];
      S.pending = null;
      S.replacing = null;
      const q = $('#lotQ');
      if (q) q.value = '';
      paintAll();
      poll(); // ответ, который ещё в пути, старше этого: он не должен убрать новый лот из списка
    } catch (e) {
      // отказ (повтор, похожее название, правки запрещены): подтверждение закрывается, причина видна над списком
      S.pending = null;
      paintResults();
      paintConfirm();
      lotMsg(e.message);
      if (btn) btn.disabled = false;
      poll();
    } finally { S.busy = false; }
  }
  async function modDrop(body, btn) {
    if (S.busy) return;
    S.busy = true;
    if (btn) btn.disabled = true;
    try {
      const d = await api(`/lots/${encodeURIComponent(code)}/drop`, 'POST', body);
      S.lots = d.lots || S.lots;
      S.room = d.room;
      if (d.live !== undefined) S.live = d.live;
      paintAll();
    } catch (e) {
      if (btn) { btn.disabled = false; delete btn.dataset.armed; btn.textContent = 'Удалить'; }
      lotMsg(e.message);
    } finally { S.busy = false; }
  }
  async function removeLot(id, btn) {
    if (S.busy) return;
    S.busy = true;
    if (btn) btn.disabled = true;
    try {
      const d = await api(`/lots/${encodeURIComponent(code)}/${encodeURIComponent(id)}`, 'DELETE');
      S.lots = d.lots || S.lots;
      S.room = d.room;
      if (S.replacing === id) S.replacing = null;
      paintAll();
      poll();
    } catch (e) {
      if (btn) { btn.disabled = false; delete btn.dataset.armed; btn.textContent = 'Убрать'; }
      lotMsg(e.message);
      poll();
    } finally { S.busy = false; }
  }
  function addFree() {
    const q = $('#lotQ');
    if (q && q.value.trim()) askConfirm({ payload: { name: q.value.trim() }, name: q.value.trim().slice(0, 60), sub: '', img: '' });
  }
  // игры может не быть ни в одном каталоге: тогда хватит названия
  const addAsIs = (v) => {
    if (S.results.some((r) => r.name.toLowerCase() === v.toLowerCase())) return;
    S.results.push({ name: v.slice(0, 60), img: '', sub: 'Добавить как есть, без картинки', payload: { custom: v } });
  };
  let searchT = 0, searchSeq = 0;
  view.addEventListener('input', (e) => {
    if (e.target.id !== 'lotQ') return;
    clearTimeout(searchT);
    const v = e.target.value.trim();
    lotMsg('');
    const kind = S.room.kind;
    if (kind === 'any') return;
    const link = kind === 'game' && /store\.steampowered\.com\/(?:agecheck\/)?app\/(\d{1,10})/.exec(v);
    if (link) { searchSeq++; S.results = []; paintResults(); askConfirm({ payload: { appId: +link[1] }, name: 'Игра по ссылке из Steam', sub: 'store.steampowered.com/app/' + link[1], img: '' }); return; }
    if (v.length < 2) { searchSeq++; S.results = []; paintResults(); return; }
    searchT = setTimeout(async () => {
      const seq = ++searchSeq;
      try {
        const d = await api(kind === 'game' ? '/games/search?q=' + encodeURIComponent(v) : `/covers?kind=${kind}&q=${encodeURIComponent(v)}`);
        if (seq !== searchSeq) return;
        // у игр свой поиск (Steam и Википедия), у остальных общий поиск по каталогам сайта
        S.results = (d.items || []).map((x) => (kind === 'game'
          ? { name: x.name, img: x.img, sub: x.sub, payload: x.appId ? { appId: x.appId } : { wiki: x.wiki, lang: x.lang } }
          : { name: x.artist ? x.artist + ' — ' + x.title : x.title, img: x.thumb || x.art, sub: [x.sub, x.year].filter(Boolean).join(' · '), payload: { title: x.title, artist: x.artist || '' } }));
        if (kind === 'game') addAsIs(v);
        paintResults();
        if (!S.results.length) lotMsg('Такого не нашлось. Попробуй написать иначе.');
      } catch (er) { if (seq === searchSeq) { lotMsg(er.message); if (kind === 'game') { S.results = []; addAsIs(v); paintResults(); } } }
    }, 380);
  });
  view.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'lotQ' && S.room.kind === 'any') { e.preventDefault(); addFree(); }
  });
  view.addEventListener('click', async (e) => {
    if (e.target.closest('#lotFree')) { addFree(); return; }
    const opt = e.target.closest('[data-pick]');
    if (opt && S.results[+opt.dataset.pick]) { const r = S.results[+opt.dataset.pick]; askConfirm({ payload: r.payload, name: r.name, sub: r.sub, img: r.img }); return; }
    const conf = e.target.closest('[data-conf]');
    if (conf) {
      const p = S.pending;
      if (conf.dataset.conf === 'yes' && p) addLot(p.payload, conf, p.replace);
      else { S.pending = null; paintResults(); paintConfirm(); const q = $('#lotQ'); if (q) q.focus({ preventScroll: true }); }
      return;
    }
    const rep = e.target.closest('[data-replace]');
    if (rep) {
      S.replacing = S.replacing === rep.dataset.replace ? null : rep.dataset.replace;
      S.pending = null; S.results = [];
      lotMsg('');
      paintAdd(); paintList();
      const q = $('#lotQ');
      if (q) { q.value = ''; q.focus({ preventScroll: false }); q.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }); }
      return;
    }
    if (e.target.closest('[data-repl-cancel]')) { S.replacing = null; S.pending = null; S.results = []; paintAdd(); paintList(); return; }
    const mb = e.target.closest('[data-mod-lot], [data-mod-name]');
    if (mb) {
      if (!mb.dataset.armed) {
        mb.dataset.armed = '1';
        mb.textContent = 'Точно удалить?';
        setTimeout(() => { if (mb.isConnected) { delete mb.dataset.armed; mb.textContent = 'Удалить'; } }, 3000);
        return;
      }
      modDrop(mb.dataset.modLot ? { ids: [mb.dataset.modLot] } : { names: [mb.dataset.modName] }, mb);
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      // убрать нужно подтвердить: лот вернуть нельзя, а лимит освободится
      if (!del.dataset.armed) {
        del.dataset.armed = '1';
        del.textContent = 'Точно убрать?';
        setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = 'Убрать'; } }, 3000);
        return;
      }
      removeLot(del.dataset.del, del);
    }
  });
  // карточка закрылась — песня победы замолкает, возвращается фон
  const closeWinner = () => { if ($('#winner').hidden) return; $('#winner').hidden = true; if (CH.win.active) stopChannel('win'); syncBg(); };
  $('#wClose').addEventListener('click', closeWinner);
  // ссылка на итог: адрес с «?w=…» мессенджер ещё не видел, поэтому покажет карточку с победителем
  const wTag = (s) => { let h = 5381; for (const c of String(s)) h = (h * 33 + c.codePointAt(0)) >>> 0; return h.toString(36); };
  $('#wShare').addEventListener('click', async () => {
    const w = S.live && S.live.winner && S.live.winner.n;
    if (!w) return;
    const b = $('#wShare'), path = '/lots/' + code + '?w=' + wTag(w);
    try { await navigator.clipboard.writeText(location.origin + path); b.textContent = 'Ссылка скопирована'; }
    catch (e) { history.replaceState(history.state, '', path); b.textContent = 'Скопируй адрес из строки браузера'; }
    setTimeout(() => { b.innerHTML = '<span class="u-old">🔗 </span>Ссылка на итог'; }, 2600);
  });
  // песню победы можно выключить и в заставке (нажатие не закрывает её), и в карточке
  const muteWin = (e) => { e.stopPropagation(); if (CH.win.active) stopChannel('win'); };
  $('#fxMute').addEventListener('click', muteWin);
  $('#wMute').addEventListener('click', muteWin);
  setInterval(() => { $('#fxMute').hidden = $('#wMute').hidden = !CH.win.active; }, 300);
  $('#winner').addEventListener('click', (e) => { if (e.target === $('#winner')) closeWinner(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeWinner(); });

  canvas = $('#wheel');
  ctx = canvas.getContext('2d');
  readTheme();
  resize();
  // смена размера очищает холст, поэтому колесо рисуем заново сразу; посреди прокрутки — с её начального положения, поворачивает его CSS
  const repaint = () => {
    readTheme();
    resize();
    const spin = S.live && S.live.spin;
    if (spinRaf && spin && serverNow() < spin.at + spin.ms) { paint(place(shownSegs()), spin.from); return; }
    cancelAnimationFrame(tweenRaf);
    restSig = ''; shown = [];
    wheel();
  };
  new MutationObserver(repaint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', repaint);
  addEventListener('resize', repaint);
  if ('ResizeObserver' in window) new ResizeObserver(repaint).observe(canvas);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(repaint);
  if (!reduced && !window.CasualSettled) {
    document.documentElement.classList.add('intro');
    setTimeout(() => document.documentElement.classList.remove('intro'), 1400);
  }
  if (!reduced) {
    const tick = $('#ticker');
    let lastName = tick.textContent, lastPop = 0;
    new MutationObserver(() => {
      const t = tick.textContent, now = performance.now();
      if (t === lastName) return;
      lastName = t;
      if (now - lastPop < 70) return;
      lastPop = now;
      tick.animate([{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-4px) scale(1.04)' }, { transform: 'translateY(0) scale(1)' }], { duration: 220, easing: 'cubic-bezier(.34, 1.56, .64, 1)' });
    }).observe(tick, { childList: true, characterData: true, subtree: true });
  }
  paint([], 0);
  paintSound();
  paintPlaying();
  // админ с открытым входом в админку видит кнопку «Удалить» у каждого лота
  if (token && user) api('/admin/me').then((d) => { if (d && d.active) { S.admin = true; if (S.room) { paintList(); paintHost(); paintPlaying(); } } }, () => {});
  if (/^[A-Za-z0-9]{12}$/.test(code)) poll();
  else paintStart();
})();
