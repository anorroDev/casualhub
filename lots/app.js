/* Казуал Хаб: лоты по ссылке. Зрители вписывают лоты в категории, которую выбрал ведущий, и смотрят его колесо: та же отрисовка и та же заставка победы.
   Постоянного соединения нет: страница спрашивает сервер раз в несколько секунд, а прокрутку считает сама по общему времени. */
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const PREFS_KEY = 'ocenshik.prefs.v1';
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
    game: { label: 'Игры из Steam', add: 'Добавить игру из Steam', ph: 'Название игры или ссылка на неё в Steam' },
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
  const code = location.hash.slice(1);
  const view = $('#view');
  const S = { room: null, lots: [], live: null, offset: 0, results: [], busy: false, winner: null, firstPoll: true };
  const serverNow = () => Date.now() + S.offset;
  const mine = () => S.lots.filter((l) => l.mine).length;
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
              channelFailed(ch);
            },
          },
        });
      }));
    }
    return EMB.ready[ch];
  }
  const applyVolume = (ch) => { try { if (EMB.yt[ch] && EMB.yt[ch].setVolume) EMB.yt[ch].setVolume(Math.round(volume() * (ch === 'bg' ? 0.6 : 1) * 100)); } catch (e) {} };
  function channelFailed(ch) {
    const c = CH[ch];
    if (!c.active) return;
    const f = c.onFail;
    Object.assign(c, { active: false, id: '', onFail: null });
    paintPlaying();
    if (f) f();
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
    if (c.loop) { try { EMB.yt[ch].seekTo(c.start || 0); EMB.yt[ch].playVideo(); } catch (e) {} return; }
    stopChannel(ch);
    if (ch === 'win') syncBg();
  }
  async function playChannel(ch, p, opts = {}) {
    const c = CH[ch];
    Object.assign(c, { active: true, id: p.id, loop: !!opts.loop, onFail: opts.onFail || null, alts: (p.alt || []).slice(), start: p.start || 0 });
    paintPlaying();
    try {
      const y = await ytPlayer(ch);
      if (!c.active || c.id !== p.id) return;
      applyVolume(ch);
      if (EMB.cued[ch] === p.key) y.seekTo(p.start || 0, true);
      else y.loadVideoById({ videoId: p.key, startSeconds: p.start || 0 });
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
  const liveMusic = () => (S.live && S.live.music) || {};
  // фон играет, пока его выбрал ведущий и не звучит трек победы
  function syncBg() {
    const p = presetOf(liveMusic().bg);
    if (!canPlay() || !p || EMB.failed || CH.win.active) { if (CH.bg.active) stopChannel('bg'); return; }
    if (CH.bg.active && CH.bg.id === p.id) return;
    playChannel('bg', p, { loop: true });
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
    b.textContent = !unlocked && snd.on ? '🔊 Включить звук' : snd.on ? '🔊 Звук включён' : '🔇 Звук выключен';
    b.className = 'btn small ' + (!unlocked && snd.on ? 'primary' : 'ghost');
    b.setAttribute('aria-pressed', String(!!(snd.on && unlocked)));
    if (document.activeElement !== v) v.value = snd.vol;
  }
  function paintPlaying() {
    const box = $('#lotPlaying');
    if (!box) return;
    const on = CH.win.active ? CH.win : CH.bg.active ? CH.bg : null;
    const p = on && presetOf(on.id);
    box.textContent = 'Колесо показывается с задержкой в пару секунд.' + (p ? ' Сейчас играет: ' + p.title : '');
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
      if (hl && hl.n === s.n) { ctx.fillStyle = `rgba(255,255,255,${hl.a})`; ctx.fill(); }
    }
    if (segs.length > 1) {
      ctx.lineWidth = Math.max(1.5, 2 * dpr);
      ctx.strokeStyle = T.panel;
      for (const s of segs) { const a = rot + s.start; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); ctx.stroke(); }
    }
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    const inner = (hubPct / 100) * c + 6 * dpr, pad = 12 * dpr, maxW = Math.round(R - inner - pad);
    for (const s of segs) {
      const ang = s.end - s.start;
      const fs = Math.round(Math.min(R * 0.072, R * 0.68 * Math.min(ang, 1.2) * 0.55));
      if (fs < 9 * dpr) continue;
      const font = `600 ${fs}px ${FONT}`;
      ctx.save();
      ctx.rotate(rot + (s.start + s.end) / 2);
      const label = fit(s.n, maxW, font);
      ctx.fillStyle = s.t;
      ctx.fillText(label, R - pad, 0);
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
    if (src && !isVid) { if (img.getAttribute('src') !== WEBM_SRC(src)) img.src = WEBM_SRC(src); img.hidden = false; }
    else { img.hidden = true; img.removeAttribute('src'); }
    if (isVid) {
      if (vid.getAttribute('src') !== WEBM_SRC(src)) vid.src = WEBM_SRC(src);
      vid.hidden = false;
      vid.play().catch(() => {});
    } else if (!vid.hidden) { vid.pause(); vid.hidden = true; vid.removeAttribute('src'); vid.load(); }
    $('#lotHub').classList.toggle('has-gif', !!src);
  }
  function setTicker(segs, rot) { const t = $('#ticker'); if (t) t.textContent = segs.length ? segAt(rot, segs).n : '—'; }
  function setSpinning(on) { $('#stage').classList.toggle('is-spinning', on); $('#lotHub').classList.toggle('spinning', on); }
  function stopMotion() { cancelAnimationFrame(spinRaf); cancelAnimationFrame(tweenRaf); cancelAnimationFrame(pulseRaf); spinRaf = tweenRaf = pulseRaf = 0; canvas.style.transform = ''; canvas.style.willChange = ''; }
  // сектор ушедшего лота сужается до нуля, соседи расступаются, как у ведущего
  function tweenTo(next, rot) {
    const w0 = new Map(shown.map((x) => [x.n, x.end - x.start])), w1 = new Map(next.map((x) => [x.n, x.end - x.start]));
    const names = new Set(next.map((x) => x.n));
    const order = next.slice();
    shown.forEach((x, k) => {
      if (names.has(x.n)) return;
      const before = shown.slice(0, k).reverse().find((p) => names.has(p.n));
      order.splice(before ? order.findIndex((o) => o.n === before.n) + 1 : 0, 0, x);
    });
    const t0 = performance.now(), D = 400;
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / D), k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      let acc = 0;
      const cur = [];
      for (const it of order) {
        const a = w0.get(it.n) || 0, b = w1.get(it.n) || 0, w = a + (b - a) * k;
        if (w > 1e-4) cur.push({ ...it, start: acc, end: acc + w });
        acc += w;
      }
      paint(cur, rot);
      if (t < 1) tweenRaf = requestAnimationFrame(frame); else { shown = next; paint(next, rot); }
    };
    tweenRaf = requestAnimationFrame(frame);
  }
  function wheel() {
    if (!canvas || !S.live) { if (canvas && !shown.length && !restSig) { restSig = 'empty'; paint([], 0); } return; }
    const live = S.live;
    hubPct = +live.hub || 24;
    $('.wheel-wrap').style.setProperty('--hub', hubPct + '%');
    paintHubImg(live.hubImg || '');
    const segs = place(live.segs || []);
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
      let last = segAt(spin.from, segs), nameAt = 0;
      const frame = (now) => {
        const t = reduced ? 1 : Math.min(1, (serverNow() - spin.at) / spin.ms);
        const rot = spin.from + (spin.to - spin.from) * (1 - Math.pow(1 - t, 4));
        canvas.style.transform = `rotate(${rot - spin.from}rad)`;
        const cur = segAt(rot, segs);
        if (cur !== last) { last = cur; kick(); tickSound(); }
        // как у ведущего: на большой скорости имя меняется не чаще раза в 0,3 секунды
        if (now - nameAt >= 300) { nameAt = now; $('#ticker').textContent = last.n; }
        if (t < 1) { spinRaf = requestAnimationFrame(frame); return; }
        $('#ticker').textContent = last.n;
        canvas.style.transform = ''; canvas.style.willChange = '';
        paint(segs, spin.to);
        setSpinning(false);
        restSig = JSON.stringify([segs.map((x) => [x.n, x.p]), mod(spin.to, TAU).toFixed(3)]);
        if (live.pick) pulse(segs, spin.to, live.pick);
        // итог прокрутки спрашиваем сразу, не дожидаясь очередного раза
        clearTimeout(pollT);
        pollT = setTimeout(poll, 700);
      };
      spinRaf = requestAnimationFrame(frame);
      return;
    }
    if (spinRaf && spinKey && spin && String(spin.at) === spinKey) return;
    setSpinning(false);
    const rot = spin ? spin.to : live.rot;
    const sig = JSON.stringify([segs.map((x) => [x.n, x.p]), mod(rot, TAU).toFixed(3)]);
    if (live.pick && !pulseRaf && pulseFor !== live.pick && sig === restSig) { pulse(segs, rot, live.pick); return; }
    if (restSig === sig) return;
    const changed = shown.length && !reduced && restSig;
    restSig = sig;
    stopMotion();
    setTicker(segs, rot);
    if (changed) tweenTo(segs, rot); else { shown = segs; paint(segs, rot); }
  }
  // выпавший сектор мигает под стрелкой
  let pulseFor = '';
  function pulse(segs, rot, name) {
    if (reduced || pulseFor === name) return;
    pulseFor = name;
    if (segs.length > 2) playOut();
    const t0 = performance.now(), D = 600;
    const frame = (now) => {
      const t = (now - t0) / D;
      if (t < 1) { paint(segs, rot, { n: name, a: 0.5 * Math.abs(Math.sin(t * Math.PI * 3)) }); pulseRaf = requestAnimationFrame(frame); return; }
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
    const lot = S.lots.find((l) => l.name === name);
    $('#wName').textContent = name;
    $('#wStats').innerHTML = lot ? `${lot.img ? `<img class="lots-win-img" src="${esc(lot.img)}" alt="" referrerpolicy="no-referrer">` : ''}<div class="total-meta"><strong>Лот от: ${esc(lot.by)}</strong><span>Участников было на колесе: ${S.lots.length}${S.live && S.live.winner && S.live.winner.sum ? ' · донат ' + esc(S.live.winner.sum) : ''}</span></div>` : '';
    $('#wStats').hidden = !lot;
    const link = $('#wLink');
    link.hidden = !(lot && lot.link);
    if (lot && lot.link) link.href = lot.link;
    $('#winner').hidden = false;
    $('#wClose').focus({ preventScroll: true });
  }
  function paintWinner() {
    const w = S.live && S.live.winner ? S.live.winner.n : '';
    if (S.winner === w) return;
    const first = S.firstPoll;
    S.winner = w;
    if (!w) { $('#winner').hidden = true; if (CH.win.active) { stopChannel('win'); syncBg(); } return; }
    const show = () => { if (S.winner === w) { if (first) openWinner(w); else { playWinMusic(); winFx(w, S.live.winner.sum).then(() => { if (S.winner === w) openWinner(w); }); } } };
    // заставка начинается, когда у зрителя закончилась прокрутка
    const spin = S.live.spin, wait = spin ? Math.max(0, spin.at + spin.ms - serverNow()) + 700 : 0;
    setTimeout(show, first ? 0 : wait);
  }

  // ---------- страница ----------
  function paintHead() {
    const r = S.room;
    const title = r.title || 'Сбор лотов';
    $('#lotTitle').textContent = title;
    document.title = `${title} · Казуал Хаб`;
    $('#lotLede').textContent = `Ведущий: ${r.owner}. Категория: ${kindOf().label}. Можно добавить ${r.perUser} ${plural(r.perUser, 'лот', 'лота', 'лотов')} на человека.`;
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
    const state = !open ? 'off' : !token ? 'guest' : mine() >= S.room.perUser ? 'full' : 'on';
    const n = S.room.perUser - mine();
    if (box.dataset.state === state && state === 'on') {
      $('#lotLeft').textContent = `Можешь добавить ещё ${n} ${plural(n, 'лот', 'лота', 'лотов')}`;
      return;
    }
    box.dataset.state = state;
    if (state === 'off') { box.innerHTML = ''; S.results = []; return; }
    if (state === 'guest') { box.innerHTML = '<div class="example-bar"><span>Чтобы добавить лот, войди в аккаунт: так у каждого будет свой лимит.</span> <a class="btn small primary" href="/opinion/#login">Войти</a></div>'; return; }
    if (state === 'full') { box.innerHTML = `<p class="lots-note">Твой лимит исчерпан: ${S.room.perUser} из ${S.room.perUser}. Чтобы заменить лот, сначала убери его.</p>`; S.results = []; return; }
    const k = kindOf(), free = S.room.kind === 'any';
    box.innerHTML = `<label class="label" for="lotQ">${k.add}</label>
      <div class="add-row"><input class="inp" id="lotQ" type="${free ? 'text' : 'search'}" autocomplete="off" maxlength="${free ? 60 : 200}" enterkeyhint="${free ? 'done' : 'search'}" placeholder="${k.ph}">${free ? '<button type="button" class="btn primary" id="lotFree">Добавить</button>' : ''}</div>
      <p class="lots-note" id="lotLeft">Можешь добавить ещё ${n} ${plural(n, 'лот', 'лота', 'лотов')}</p>
      <p class="lots-note lots-off" id="lotMsg" hidden></p>
      <div class="lots-results" id="lotResults" hidden></div>`;
  }
  const lotMsg = (t) => { const m = $('#lotMsg'); if (m) { m.textContent = t || ''; m.hidden = !t; } };
  function paintResults() {
    const box = $('#lotResults');
    if (!box) return;
    box.hidden = !S.results.length;
    const taken = new Set(S.lots.map((l) => l.name.toLowerCase()));
    box.innerHTML = S.results.map((g, i) => { const has = taken.has(g.name.toLowerCase()); return `<button type="button" class="lots-opt" data-pick="${i}"${has ? ' disabled' : ''}><img src="${esc(g.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span><b>${esc(g.name)}</b>${g.sub ? `<small>${esc(g.sub)}</small>` : ''}</span><i>${has ? 'уже есть' : ''}</i></button>`; }).join('');
  }
  const lotImg = (l) => (l.img ? `<img src="${esc(l.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : `<em aria-hidden="true">${esc([...l.name][0] || '?')}</em>`);
  const lotPic = (l) => (l.link ? `<a href="${esc(l.link)}" target="_blank" rel="noopener noreferrer" title="Открыть в Steam">${lotImg(l)}</a>` : `<span class="lots-pic">${lotImg(l)}</span>`);
  function paintList() {
    const box = $('#lotList');
    const out = new Set(S.live && Array.isArray(S.live.out) ? S.live.out : []);
    const n = S.lots.length;
    const canEdit = isOpen();
    box.innerHTML = `<p class="board-stat"><b>${n}</b> ${plural(n, 'лот', 'лота', 'лотов')}</p>${n ? `<ul class="lots-list">${S.lots.map((l) => `<li class="${out.has(l.name) ? 'out' : ''}">${lotPic(l)}<span class="lots-who"><b>${esc(l.name)}</b><small>${esc(l.by)}${out.has(l.name) ? ' · вылетел' : ''}</small></span>${(l.mine && canEdit) || S.room.own ? `<button type="button" class="lots-del" data-del="${esc(l.id)}" aria-label="Убрать ${esc(l.name)}" title="Убрать">✕</button>` : ''}</li>`).join('')}</ul>` : '<p class="lots-empty">Пока ни одного лота. Будь первым!</p>'}`;
  }
  function paintStatus() {
    // ведущему центр колеса ведёт на его Колесо: крутит он оттуда
    const hub = $('#lotHub');
    if (!!S.room.own !== (hub.dataset.own === '1')) {
      hub.dataset.own = S.room.own ? '1' : '';
      hub.classList.toggle('lots-own', !!S.room.own);
      const link = hub.querySelector('a');
      if (S.room.own && !link) hub.insertAdjacentHTML('beforeend', '<a class="hub-label" href="/wheel/">Крутить</a>');
      else if (!S.room.own && link) link.remove();
    }
    const live = S.live;
    const n = live && Array.isArray(live.segs) ? live.segs.length : 0;
    $('#aliveBadge').textContent = n;
    $('#aliveBadge').dataset.tier = live && live.winner ? 'good' : live && live.pick ? 'bad' : 'idle';
    $('#statusMain').textContent = live && live.status ? live.status : 'Ждём, когда ведущий запустит колесо';
    $('#statusSub').textContent = n ? `${n} ${plural(n, 'лот', 'лота', 'лотов')} на колесе` : '';
  }
  function paintAll() {
    paintHead(); paintRule(); paintAdd(); paintResults(); paintList(); paintStatus(); wheel(); paintWinner(); syncBg();
  }
  function paintGone(text) {
    $('#lotTitle').textContent = 'Сбор лотов';
    $('#lotLede').textContent = '';
    view.innerHTML = `<section class="card"><p class="lots-empty">${esc(text)}</p><div class="dfoot"><a class="btn small primary" href="/wheel/">Открыть Колесо</a></div></section>`;
    canvas = null;
    S.room = null;
  }

  // ---------- связь с сервером ----------
  let pollT = 0;
  async function poll() {
    clearTimeout(pollT);
    if (document.hidden) return; // вернётся, когда вкладку откроют снова
    let d = null;
    try { d = await api(`/lots/${encodeURIComponent(code)}${S.room ? '?v=' + S.room.ver : ''}`); }
    catch (e) {
      if (e.status === 404) { paintGone('Такого сбора нет: ведущий удалил его или ссылка с ошибкой.'); return; }
    }
    if (d) {
      S.offset = d.now - Date.now();
      S.room = d.room;
      S.live = d.live;
      if (d.lots) S.lots = d.lots;
      paintAll();
      S.firstPoll = false;
    }
    // пока идёт сбор, спешить некуда; когда колесо началось, спрашиваем чаще; после победы почти не спрашиваем
    const started = S.live && (S.live.spin || (S.live.out && S.live.out.length));
    const wait = S.live && S.live.winner ? 20000 : started || !isOpen() ? 2500 : 4000;
    pollT = setTimeout(poll, wait);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && code && S.room) poll(); });
  setInterval(() => {
    if (!S.room) return;
    const was = $('#lotAdd').dataset.state;
    paintRule();
    if (was !== 'off' && !isOpen()) { paintAdd(); paintList(); }
  }, 1000);

  async function addLot(payload, btn) {
    if (S.busy) return;
    S.busy = true;
    if (btn) btn.disabled = true;
    lotMsg('');
    try {
      const d = await api(`/lots/${encodeURIComponent(code)}`, 'POST', payload);
      S.lots = d.lots;
      S.room = d.room;
      S.results = [];
      const q = $('#lotQ');
      if (q) q.value = '';
      paintAll();
    } catch (e) {
      lotMsg(e.message);
      if (btn) btn.disabled = false;
      poll();
    } finally { S.busy = false; }
  }
  function addFree() {
    const q = $('#lotQ');
    if (q && q.value.trim()) addLot({ name: q.value.trim() });
  }
  let searchT = 0, searchSeq = 0;
  view.addEventListener('input', (e) => {
    if (e.target.id !== 'lotQ') return;
    clearTimeout(searchT);
    const v = e.target.value.trim();
    lotMsg('');
    const kind = S.room.kind;
    if (kind === 'any') return;
    const link = kind === 'game' && /store\.steampowered\.com\/(?:agecheck\/)?app\/(\d{1,10})/.exec(v);
    if (link) { searchSeq++; addLot({ appId: +link[1] }); return; }
    if (v.length < 2) { searchSeq++; S.results = []; paintResults(); return; }
    searchT = setTimeout(async () => {
      const seq = ++searchSeq;
      try {
        const d = await api(kind === 'game' ? '/steam/search?q=' + encodeURIComponent(v) : `/covers?kind=${kind}&q=${encodeURIComponent(v)}`);
        if (seq !== searchSeq) return;
        // у игр свой поиск Steam, у остальных общий поиск по каталогам сайта
        S.results = (d.items || []).map((x) => (kind === 'game'
          ? { name: x.name, img: x.img, payload: { appId: x.appId } }
          : { name: x.artist ? x.artist + ' — ' + x.title : x.title, img: x.thumb || x.art, sub: [x.sub, x.year].filter(Boolean).join(' · '), payload: { title: x.title, artist: x.artist || '' } }));
        paintResults();
        if (!S.results.length) lotMsg('Такого не нашлось. Попробуй написать иначе.');
      } catch (er) { if (seq === searchSeq) lotMsg(er.message); }
    }, 380);
  });
  view.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'lotQ' && S.room.kind === 'any') { e.preventDefault(); addFree(); }
  });
  view.addEventListener('click', async (e) => {
    if (e.target.closest('#lotFree')) { addFree(); return; }
    const opt = e.target.closest('[data-pick]');
    if (opt && S.results[+opt.dataset.pick]) { addLot(S.results[+opt.dataset.pick].payload, opt); return; }
    const del = e.target.closest('[data-del]');
    if (del) {
      del.disabled = true;
      try {
        const d = await api(`/lots/${encodeURIComponent(code)}/${encodeURIComponent(del.dataset.del)}`, 'DELETE');
        S.lots = d.lots;
        S.room = d.room;
        paintAll();
      } catch (er) { del.disabled = false; lotMsg(er.message); }
    }
  });
  // карточка закрылась — песня победы замолкает, возвращается фон
  const closeWinner = () => { if ($('#winner').hidden) return; $('#winner').hidden = true; if (CH.win.active) stopChannel('win'); syncBg(); };
  $('#wClose').addEventListener('click', closeWinner);
  $('#winner').addEventListener('click', (e) => { if (e.target === $('#winner')) closeWinner(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeWinner(); });

  // ---------- тема: одна на весь сайт ----------
  const THEMES = window.CasualThemes.list, THEME_IDS = THEMES.map((t) => t.id);
  function readThemePref() {
    const p = read(PREFS_KEY);
    return p && THEME_IDS.includes(p.theme) ? p.theme : 'auto';
  }
  function writeThemePref(t) {
    try {
      let p = read(PREFS_KEY);
      if (!p || typeof p !== 'object' || Array.isArray(p)) p = {};
      p.theme = t;
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch (e) {}
  }
  function applyTheme(t, fromUser) {
    const theme = THEME_IDS.includes(t) ? t : 'auto';
    if (theme === 'auto') { if (fromUser) document.documentElement.removeAttribute('data-theme'); }
    else document.documentElement.setAttribute('data-theme', theme);
    const th = THEMES.find((x) => x.id === theme);
    $('#themeBtn').innerHTML = `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6.4"/><path d="M8 1.6a6.4 6.4 0 0 0 0 12.8z" fill="currentColor"/></svg><span>Тема: ${th.name}</span>`;
    $('#themeBtn').setAttribute('aria-label', `Тема: ${th.name}`);
    $('#themeMenu').classList.add('tm-grid');
    $('#themeMenu').innerHTML = window.CasualThemes.menuHTML(theme);
    if (fromUser) writeThemePref(theme);
  }
  $('#themeMenu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-id]');
    if (!b) return;
    const swap = () => applyTheme(b.dataset.themeId, true);
    if (document.startViewTransition && !reduced) {
      const r = b.getBoundingClientRect();
      document.documentElement.style.setProperty('--tx', `${r.left + r.width / 2}px`);
      document.documentElement.style.setProperty('--ty', `${r.top + r.height / 2}px`);
      document.documentElement.classList.add('theme-swap');
      let done = false;
      const go = () => { if (!done) { done = true; swap(); } };
      const vt = document.startViewTransition(go);
      vt.ready.catch(() => {});
      if (vt.updateCallbackDone) vt.updateCallbackDone.catch(() => {});
      vt.finished.catch(() => {}).finally(() => document.documentElement.classList.remove('theme-swap'));
      setTimeout(go, 400); // если переход не начался (вкладка в фоне), тема всё равно сменится
    } else swap();
    $('#themePick').open = false;
    $('#themeBtn').focus();
  });
  document.addEventListener('click', (e) => { const p = $('#themePick'); if (p.open && !p.contains(e.target)) p.open = false; });
  applyTheme(readThemePref(), false);

  canvas = $('#wheel');
  ctx = canvas.getContext('2d');
  readTheme();
  resize();
  new MutationObserver(() => { readTheme(); restSig = ''; shown = []; wheel(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readTheme(); restSig = ''; shown = []; wheel(); });
  addEventListener('resize', () => { resize(); restSig = ''; shown = []; wheel(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { restSig = ''; shown = []; wheel(); });
  paint([], 0);
  paintSound();
  paintPlaying();
  if (/^[A-Za-z0-9]{12}$/.test(code)) poll();
  else paintGone('В ссылке нет кода сбора. Попроси ведущего прислать её ещё раз.');
})();
