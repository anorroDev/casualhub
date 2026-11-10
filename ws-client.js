/* Казуал Хаб: WebSocket к комнатам Worker'а casualhub-rt с переподключением. Пока сокета нет, страницы спрашивают сервер
   как раньше — это и есть запасной путь, поэтому подключаются только если сервер ответил rt: true.

   CasualRT.open(path, { protocols(), onMessage(msg), onOpen(), onStatus(open), onGone() }) — общий сокет:
     path — адрес на этом сайте; protocols — подпротоколы (функция: токен мог поменяться к следующему подключению);
     сообщение комнаты "gone" или закрытие с кодом 4404 — комнаты больше нет, переподключения не будет.
   CasualRT.lots(code, { token, onState(msg, clock), onGone(), onStatus(open) }) — комната лотов (lots/app.js,
     lots-follow.js); clock — {t0, t1}, если это ответ на hello: по нему страница сверяет часы с сервером.
   Каждый вызов возвращает { live(), send(obj), close() }; у лотов ещё hello().
   Переподключение: 1, 2, 4… до 30 секунд с разбросом, сразу — когда сеть вернулась или вкладку снова открыли.
   Попытка не открылась за 10 секунд — следующая. Раз в 25 секунд "ping": без ответа больше минуты — переподключение. */
(() => {
  if (window.CasualRT) return;
  const PING_MS = 25000, STALE_MS = 60000, MAX_WAIT = 30000, OPEN_MS = 10000;
  function open(path, o) {
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + path;
    let ws = null, closed = false, tries = 0, timer = 0, pingT = 0, lastMsg = 0, isOpen = false;
    const status = (v) => { if (isOpen === v) return; isOpen = v; if (o.onStatus) o.onStatus(v); };
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
      try { me = new WebSocket(url, o.protocols ? o.protocols() : ['casualhub']); } catch (e) { retry(); return; }
      ws = me;
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
        if (o.onOpen) o.onOpen();
      };
      me.onmessage = (e) => {
        if (ws !== me) return;
        lastMsg = Date.now();
        if (e.data === 'pong') return;
        let m = null;
        try { m = JSON.parse(e.data); } catch (er) { return; }
        if (!m) return;
        if (m.t === 'gone') { close(); if (o.onGone) o.onGone(); return; }
        // комната просит переподключиться (например, закрыли сеанс): сразу, уже с тем токеном, что есть сейчас
        if (m.t === 'reconnect') { tries = 0; drop(me, 4002); return; }
        if (o.onMessage) o.onMessage(m);
      };
      me.onclose = (e) => {
        clearTimeout(openT);
        if (ws !== me) return;
        ws = null;
        clearInterval(pingT);
        status(false);
        if (e.code === 4404) { closed = true; if (o.onGone) o.onGone(); return; }
        if (!closed) retry();
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
    return {
      live: () => isOpen && !!ws && ws.readyState === 1,
      send: (obj) => { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); return true; } catch (e) {} } return false; },
      close,
    };
  }
  function lots(code, o) {
    let helloId = 0, helloAt = 0;
    const c = open('/api/lots/' + encodeURIComponent(code) + '/ws', {
      protocols: () => (o.token ? ['casualhub', 'bearer.' + o.token] : ['casualhub']),
      onOpen: () => hello(),
      onStatus: o.onStatus,
      onGone: o.onGone,
      onMessage(m) {
        if (m.t === 'state') {
          // ответ комнаты на hello помечен его номером: время туда и обратно даёт поправку часов
          const clock = m.re && m.re === helloId && helloAt ? { t0: helloAt, t1: Date.now() } : null;
          if (clock) helloAt = 0;
          if (o.onState) o.onState(m, clock);
        } else if (m.t === 'error' && o.onError) o.onError(m);
      },
    });
    function hello() {
      helloId = (helloId % 1e6) + 1;
      helloAt = Date.now();
      if (!c.send({ t: 'hello', id: helloId })) helloAt = 0;
    }
    return { live: c.live, send: c.send, hello, close: c.close };
  }
  window.CasualRT = { open, lots };
})();
