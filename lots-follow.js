/* Казуал Хаб: музыка чужого аука не обрывается, когда зритель уходит с /lots/ на другую страницу сайта.
   Страница зрителя (lots/app.js) помнит сбор в casualhub.lots.follow.v1; header-menu.js подгружает этот файл на остальных страницах.
   Мини-плеер раз в пару секунд спрашивает сбор и играет то, что выбрал ведущий: фон по кругу, на победе трек победы, потом снова фон.
   Браузер может не пустить звук без нажатия на новой странице (айфоны строже всего): тогда в плашке появится «Включить музыку». */
(() => {
  const FOLLOW_KEY = 'casualhub.lots.follow.v1', SOUND_KEY = 'casualhub.lots.sound.v1';
  const MAX_AGE = 6 * 3600 * 1000;
  const rd = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  if (window.__lotsFollow || /^\/(lots|wheel)(\/|$)/.test(location.pathname)) return; // на Колесе своя музыка
  let rec = rd(FOLLOW_KEY);
  if (!rec || !/^[A-Za-z0-9]{12}$/.test(rec.code || '') || !rec.heard || Date.now() - (+rec.at || 0) > MAX_AGE) return;
  window.__lotsFollow = true;
  const code = rec.code;
  const en = document.documentElement.lang === 'en';
  const T = en
    ? { now: 'Host’s music', on: 'Turn on the music', stop: 'Stop following this auction', open: 'Open the auction' }
    : { now: 'Музыка ведущего', on: 'Включить музыку', stop: 'Не следить за этим аукционом', open: 'Открыть аукцион' };
  // те же треки, что в Колесе и на странице зрителя
  const PRESETS = [
    { id: 'vika', key: 'SXe1aTEJU2w', start: 0.6 },
    { id: 'mk', key: 'kWO2AuJT67w', start: 0.4 },
    { id: 'serious', key: '0IVRoqDWwIk', start: 5.5 },
    { id: 'chopin', key: 'SUT_0c2QVzo', start: 5 },
    { id: 'eva', key: '7dVDG6IqtV8', alt: ['ELcLRK8LZ-o'], start: 0 },
  ];
  const presetOf = (id) => PRESETS.find((p) => p.id === id) || null;
  const snd = () => Object.assign({ on: true, vol: 80 }, rd(SOUND_KEY) || {});
  const vol = (ch) => { const s = snd(); return s.on ? Math.round(Math.max(0, Math.min(100, +s.vol)) * (ch === 'bg' ? 0.6 : 1)) : 0; };

  let box = null, yt = null, ytReady = null, want = null, cur = null, blocked = false, stopped = false, ver = '', offset = 0, seenWin = '', timer = 0, title = rec.title || '';
  const css = document.createElement('style');
  css.textContent = `.lf-bar{position:fixed;left:12px;bottom:12px;z-index:70;display:flex;align-items:center;gap:8px;max-width:calc(100vw - 24px);padding:6px 8px 6px 12px;border-radius:999px;background:var(--panel,#1b1d27);color:var(--ink,#f4f5f8);border:1px solid var(--line,#3a3d4d);box-shadow:0 6px 22px rgba(0,0,0,.28);font:600 13px/1.2 var(--font,system-ui,sans-serif)}
.lf-bar[hidden]{display:none}
.lf-bar a{color:inherit;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.lf-bar button{flex:none;height:30px;padding:0 10px;border-radius:999px;border:1px solid var(--line,#3a3d4d);background:var(--panel-2,transparent);color:inherit;font:inherit;cursor:pointer}
.lf-bar .lf-on{background:var(--accent,#7c5cff);border-color:transparent;color:#fff}
.lf-bar .lf-x{width:30px;padding:0}
.lf-vid{position:absolute;width:2px;height:2px;overflow:hidden;opacity:.02;pointer-events:none;left:0;top:0}`;
  document.head.appendChild(css);

  function paint() {
    if (stopped) return;
    if (!box) {
      box = document.createElement('div');
      box.className = 'lf-bar';
      box.hidden = true;
      box.innerHTML = '<div class="lf-vid"><div id="lf-yt"></div></div><a href="/lots/' + code + '" title="' + T.open + '"></a><button type="button" class="lf-on" hidden></button><button type="button" class="lf-x" aria-label="' + T.stop + '" title="' + T.stop + '">✕</button>';
      document.body.appendChild(box);
      box.querySelector('.lf-on').textContent = T.on;
      box.querySelector('.lf-on').addEventListener('click', () => { blocked = false; retry(); paint(); });
      box.querySelector('.lf-x').addEventListener('click', () => end(true));
    }
    const link = box.querySelector('a');
    link.textContent = T.now + (title ? ' · ' + title : '');
    box.querySelector('.lf-on').hidden = !blocked;
    box.hidden = !(cur || blocked);
  }

  function api() {
    if (ytReady) return ytReady;
    ytReady = new Promise((res, rej) => {
      const make = () => {
        paint();
        yt = new YT.Player('lf-yt', {
          width: 192, height: 108, playerVars: { playsinline: 1, rel: 0 },
          events: {
            onReady: () => res(yt),
            onStateChange: (e) => { if (e.data === 0) ended(); },
            onError: () => {
              if (cur && cur.p.alt && cur.p.alt.length) { yt.loadVideoById({ videoId: cur.p.alt.shift(), startSeconds: 0 }); return; }
              // трек фона не играет на чужом сайте: пропускаем его, дальше следующий
              if (cur && cur.ch === 'bg') { bgNext(true); return; }
              cur = null; paint();
            },
          },
        });
      };
      if (window.YT && window.YT.Player) { make(); return; }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) { try { prev(); } catch (e) {} } make(); };
      const sc = document.createElement('script');
      sc.src = 'https://www.youtube.com/iframe_api'; sc.async = true; sc.onerror = rej;
      document.head.appendChild(sc);
      setTimeout(() => rej(new Error('timeout')), 15000);
    });
    ytReady.catch(() => { ytReady = null; });
    return ytReady;
  }

  // что должно играть сейчас: {ch, p, loop} или null
  function play(next, startAt) {
    if (cur && next && cur.ch === next.ch && cur.p.id === next.p.id) return;
    cur = next;
    blocked = false;
    paint();
    if (!next) { try { if (yt && yt.pauseVideo) yt.pauseVideo(); } catch (e) {} return; }
    api().then((y) => {
      if (cur !== next) return;
      try {
        y.setVolume(vol(next.ch));
        y.loadVideoById({ videoId: next.p.key, startSeconds: startAt != null ? startAt : next.p.start || 0 });
        y.playVideo();
      } catch (e) {}
      // без нажатия браузер может не пустить звук: тогда плашка просит нажать
      setTimeout(() => {
        if (cur !== next) return;
        let st = -1;
        try { st = y.getPlayerState(); } catch (e) {}
        if (st !== 1 && st !== 3) { blocked = true; paint(); }
      }, 4000);
    }).catch(() => { cur = null; paint(); });
  }
  function retry() {
    if (!cur || !yt) return;
    try { yt.setVolume(vol(cur.ch)); yt.playVideo(); } catch (e) {}
    setTimeout(() => {
      let st = -1;
      try { st = yt.getPlayerState(); } catch (e) {}
      if (cur && st !== 1 && st !== 3) { blocked = true; paint(); }
    }, 2500);
  }
  // фон идёт подряд: с трека ведущего дальше по списку и по кругу (VI KA — только на победе)
  const BG_LIST = PRESETS.filter((p) => p.id !== 'vika');
  const BG = { chosen: null, cur: '', bad: new Set() };
  function bgNext(failed) {
    if (failed && BG.cur) BG.bad.add(BG.cur);
    const i = BG_LIST.findIndex((p) => p.id === BG.cur);
    let next = '';
    for (let k = 1; k <= BG_LIST.length; k++) { const p = BG_LIST[(i + k + BG_LIST.length) % BG_LIST.length]; if (!BG.bad.has(p.id)) { next = p.id; break; } }
    BG.cur = next;
    cur = null;
    decide(lastLive);
  }
  function ended() {
    if (!cur) return;
    if (cur.ch === 'bg') { bgNext(false); return; }
    cur = null; // трек победы доиграл: дальше снова фон
    decide(lastLive);
  }

  let lastLive = null;
  // по ответу сбора выбираем, что играть: свежая победа — её трек, иначе фон ведущего
  function decide(live) {
    lastLive = live;
    const m = (live && live.music) || {};
    const win = live && live.winner;
    const winKey = win ? win.n + '|' + win.at : '';
    const fresh = win && Date.now() + offset - (+win.at || 0) < 30000;
    if (winKey && winKey !== seenWin && fresh && presetOf(m.win)) { seenWin = winKey; play({ ch: 'win', p: presetOf(m.win) }); return; }
    if (!win) seenWin = '';
    if (cur && cur.ch === 'win' && win) return; // победа ещё играет
    const chosen = m.bg && m.bg !== 'vika' && presetOf(m.bg) ? m.bg : '';
    const r = rd(FOLLOW_KEY);
    if (chosen !== BG.chosen) {
      // первый раз продолжаем тот трек списка, что играл на странице сбора
      const was = BG.chosen === null && r && r.bg && BG_LIST.some((p) => p.id === r.bg.id) ? r.bg.id : '';
      BG.chosen = chosen; BG.cur = chosen ? was || chosen : ''; BG.bad.clear();
    }
    const bg = presetOf(BG.cur);
    if (!bg) { play(null); return; }
    // с того места, где оборвалась музыка на прошлой странице
    const keep = r && r.bg && r.bg.id === bg.id && Date.now() - r.bg.at < 90000 ? r.bg.pos + (Date.now() - r.bg.at) / 1000 : null;
    if (!cur && keep != null) { if (r) { r.bg = null; wr(FOLLOW_KEY, r); } play({ ch: 'bg', p: bg }, keep); } else play({ ch: 'bg', p: bg });
  }

  function end(drop) {
    stopped = true;
    clearTimeout(timer);
    try { if (yt && yt.destroy) yt.destroy(); } catch (e) {}
    if (box) box.remove();
    css.remove();
    if (drop) { const r = rd(FOLLOW_KEY); if (r && r.code === code) { try { localStorage.removeItem(FOLLOW_KEY); } catch (e) {} } }
  }

  async function tick() {
    clearTimeout(timer);
    if (stopped) return;
    const r = rd(FOLLOW_KEY);
    if (!r || r.code !== code || Date.now() - (+r.at || 0) > MAX_AGE) { end(false); return; }
    title = r.title || title;
    const s = snd();
    // страница зрителя открыта в другой вкладке и играет сама, или звук выключили
    const viewerOpen = r.on && Date.now() - (+r.at || 0) < 20000;
    if (viewerOpen || !s.on || !r.heard) { if (cur) play(null); timer = setTimeout(tick, 4000); return; }
    try {
      const res = await fetch('/api/lots/' + code + (ver ? '?v=' + ver : ''), { cache: 'no-store' });
      if (res.status === 404) { end(true); return; }
      const d = await res.json();
      if (stopped) return;
      ver = d.room ? d.room.ver : ver;
      offset = d.now ? d.now - Date.now() : offset;
      title = (d.room && d.room.title) || title;
      // сбор закончился и победа давно позади: следить больше не за чем
      const over = d.room && (d.room.closed || (d.room.endsAt && d.room.endsAt <= Date.now() + offset));
      const winAge = d.live && d.live.winner ? Date.now() + offset - (+d.live.winner.at || 0) : -1;
      if (over && winAge > 600000) { end(true); return; }
      decide(d.live);
      if (cur) { try { yt && yt.setVolume && yt.setVolume(vol(cur.ch)); } catch (e) {} }
      paint();
    } catch (e) {}
    timer = setTimeout(tick, document.hidden ? 10000 : 3000);
  }

  // уходим со страницы: место в треке запоминается, на следующей музыка продолжится отсюда
  addEventListener('pagehide', () => {
    if (stopped) return;
    const r = rd(FOLLOW_KEY);
    if (!r || r.code !== code) return;
    let pos = null;
    try { if (cur && cur.ch === 'bg' && yt && yt.getCurrentTime) pos = +yt.getCurrentTime() || 0; } catch (e) {}
    r.bg = cur && cur.ch === 'bg' && pos != null ? { id: cur.p.id, pos, at: Date.now() } : null;
    wr(FOLLOW_KEY, r);
  });
  // первое нажатие на странице снимает запрет браузера на звук
  const unlock = () => { removeEventListener('pointerdown', unlock, true); removeEventListener('keydown', unlock, true); if (blocked || (cur && yt)) retry(); };
  addEventListener('pointerdown', unlock, true);
  addEventListener('keydown', unlock, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  tick();
})();
