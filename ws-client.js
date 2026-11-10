/* Казуал Хаб: WebSocket к комнате лотов (Durable Object в Worker'е casualhub-rt) с переподключением.
   Подключают страница сбора (lots/app.js) и мини-плеер на других страницах (lots-follow.js), только если сервер
   ответил rt: true. Пока сокета нет, страницы опрашивают сервер как раньше — это и есть запасной путь.

   const rt = CasualRT.lots(code, { token, onState(msg, clock), onGone(), onStatus(open) });
   msg — {t: 'state', live, ver, now}; clock — {t0, t1}, если это ответ на hello: по нему страница сверяет часы.
   rt.live() — сокет открыт и жив; rt.close() — закрыть насовсем.
   Переподключение: 1, 2, 4… до 30 секунд с разбросом, сразу — когда сеть вернулась или вкладку открыли.
   Раз в 25 секунд "ping": без ответа больше минуты соединение считается мёртвым и переподключается. */
(() => {
  if (window.CasualRT) return;
  const PING_MS = 25000, STALE_MS = 60000, MAX_WAIT = 30000, OPEN_MS = 10000;
  function lots(code, o) {
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/lots/' + encodeURIComponent(code) + '/ws';
    let ws = null, closed = false, tries = 0, timer = 0, pingT = 0, lastMsg = 0, open = false, helloId = 0, helloAt = 0;
    const status = (v) => { if (open === v) return; open = v; if (o.onStatus) o.onStatus(v); };
    // бросить сокет и попробовать заново, не дожидаясь его закрытия: зависшее соединение может не закрыться никогда
    function drop(me, code) {
      if (ws !== me) return;
      ws = null;
      clearInterval(pingT);
      try { me.close(code, 'retry'); } catch (e) {}
      status(false);
      retry();
    }
    function connect() {
      clearTimeout(timer);
      if (closed || ws) return;
      let me;
      try { me = new WebSocket(url, o.token ? ['casualhub', 'bearer.' + o.token] : ['casualhub']); } catch (e) { retry(); return; }
      ws = me;
      // соединение не открылось за 10 секунд (например, комната недоступна): следующая попытка
      const openT = setTimeout(() => { if (me.readyState !== 1) drop(me, 4001); }, OPEN_MS);
      me.onopen = () => {
        clearTimeout(openT);
        if (ws !== me) return;
        tries = 0;
        lastMsg = Date.now();
        status(true);
        clearInterval(pingT);
        pingT = setInterval(() => {
          if (ws !== me || me.readyState !== 1) return;
          if (Date.now() - lastMsg > STALE_MS) { drop(me, 4000); return; }
          try { me.send('ping'); } catch (e) {}
        }, PING_MS);
        hello();
      };
      me.onmessage = (e) => {
        if (ws !== me) return;
        lastMsg = Date.now();
        if (e.data === 'pong') return;
        let m = null;
        try { m = JSON.parse(e.data); } catch (er) { return; }
        if (!m) return;
        if (m.t === 'state') {
          const clock = m.re && m.re === helloId && helloAt ? { t0: helloAt, t1: Date.now() } : null;
          if (clock) helloAt = 0;
          if (o.onState) o.onState(m, clock);
        } else if (m.t === 'gone') { close(); if (o.onGone) o.onGone(); }
        else if (m.t === 'error' && o.onError) o.onError(m);
      };
      me.onclose = (e) => {
        clearTimeout(openT);
        if (ws !== me) return;
        ws = null;
        clearInterval(pingT);
        status(false);
        if (!closed && e.code !== 4404) retry();
      };
      me.onerror = () => {};
    }
    function retry() {
      if (closed) return;
      tries++;
      const wait = Math.min(MAX_WAIT, 1000 * 2 ** Math.min(tries - 1, 5)) * (0.75 + Math.random() * 0.5);
      clearTimeout(timer);
      timer = setTimeout(connect, wait);
    }
    // ответ комнаты на hello помечен его номером: время туда и обратно даёт поправку часов
    function hello() {
      if (!ws || ws.readyState !== 1) return;
      helloId = (helloId % 1e6) + 1;
      helloAt = Date.now();
      try { ws.send(JSON.stringify({ t: 'hello', id: helloId })); } catch (e) {}
    }
    function close() {
      closed = true;
      clearTimeout(timer);
      clearInterval(pingT);
      removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', onVis);
      if (ws) { const w = ws; ws = null; try { w.close(1000, 'bye'); } catch (e) {} }
      status(false);
    }
    // сеть вернулась или вкладку снова открыли: не ждём паузы, подключаемся сразу
    function wake() { if (closed) return; if (!ws) { tries = 0; connect(); } }
    function onVis() { if (!document.hidden) wake(); }
    addEventListener('online', wake);
    document.addEventListener('visibilitychange', onVis);
    connect();
    return { live: () => open && !!ws && ws.readyState === 1, hello, close };
  }
  window.CasualRT = { lots };
})();
