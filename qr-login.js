/* Казуал Хаб: вход по QR-коду (сервер — functions/_lib/qr-login.js). Окно — то же, что у входа в Мнении (#authModal,
   вкладка 'qr': renderAuthModal в opinion/app.js зовёт paint).
   Компьютер: «Войти по QR-коду» в окне входа — QR со ссылкой /opinion/#qr=<id>. Каждые 2,5 с спрашиваем сервер. На
   телефоне нажали «Войти» — спрашиваем здесь «Войти как @…?» (QR мог отсканировать не хозяин, например зритель стрима),
   и только по «Да» берём сессию и входим (friends.js → loginWithSession). Код живёт 3 минуты, потом новый — до трёх раз
   подряд, дальше кнопкой «Новый код». Пока вкладка скрыта, сервер не спрашиваем; опрос всегда один.
   Телефон: ссылка из QR открывает Мнение (reveal.js → ask): какое устройство просит войти и где оно — «Войти» или
   «Это не я». Без входа на телефоне — сначала войти здесь: вошёл — вопрос откроется сам. */
(() => {
  const esc = window.CasualUtil.esc;
  const api = () => window.casualApi;
  const POLL = 2500, RENEW = 3, LOGIN_WAIT = 3 * 60e3;
  // компьютер: code — { id, key }; phase — load, wait, seen, retry, confirm, taking, late, denied, stopped, error;
  // who — чей аккаунт разрешили на телефоне; inflight — номер кода (seq), чей опрос уже идёт: второй для него не
  // запускаем, а опрос старого кода, застрявший в медленной сети, новому коду не мешает
  let mode = '', code = null, phase = '', renews = 0, timer = 0, seq = 0, errText = '', inflight = 0, who = null, takeErr = '';
  // телефон: askId — код из ссылки; info — ответ /qr/see; answer — ok или no; loginAt — когда показали «войди здесь»
  let askId = '', info = null, answer = '', loginAt = 0, busy = false;

  const modalOpen = () => { const m = document.getElementById('authModal'); return !!m && !m.hidden; };
  const repaint = () => { if (modalOpen() && mode) paint(document.getElementById('authBody'), document.getElementById('authTitle')); };
  const loadQR = () => window.CasualUtil.script('/qr.js', () => window.CasualQR);
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const country = (cc) => {
    if (!/^[A-Z]{2}$/.test(cc || '')) return '';
    try { return new Intl.DisplayNames([(window.CasualLang && window.CasualLang.lang) || 'ru'], { type: 'region' }).of(cc) || cc; } catch (e) { return cc; }
  };

  // ---------- компьютер: QR-код и ожидание телефона ----------
  function show() {
    stop();
    mode = 'show'; renews = 0;
    fresh();
    window.openAuthModal('qr');
  }
  async function fresh() {
    const my = ++seq;
    clearTimeout(timer); timer = 0;
    code = null; who = null; takeErr = ''; phase = 'load';
    repaint();
    let r;
    try { [r] = await Promise.all([api().post('/qr/new'), loadQR()]); }
    catch (e) { if (my === seq) { phase = 'error'; errText = (e && e.message) || ''; repaint(); } return; }
    if (my !== seq) return;
    code = { id: String(r.id || ''), key: String(r.key || '') };
    phase = 'wait';
    repaint();
    timer = setTimeout(poll, POLL);
  }
  // срок кода знает сервер: устарел — ответит gone (так не теряется «Войти», нажатое в последние секунды)
  async function poll() {
    timer = 0;
    if (inflight === seq || mode !== 'show' || !code || !['wait', 'seen', 'retry'].includes(phase)) return;
    // вкладка скрыта — не спрашиваем; вернулись — сразу проверим (visibilitychange ниже)
    if (document.hidden) { timer = setTimeout(poll, POLL); return; }
    const my = seq;
    inflight = my;
    let r = null;
    try { r = await api().post('/qr/poll', { id: code.id, key: code.key }); } catch (e) { r = null; }
    if (inflight === my) inflight = 0;
    if (my !== seq || mode !== 'show' || !code) return;
    if (!r) { phase = 'retry'; repaint(); timer = setTimeout(poll, POLL * 2); return; }
    if (r.state === 'confirm' && r.user) { phase = 'confirm'; who = r.user; repaint(); return; } // ждём «Да» здесь
    if (r.state === 'denied') { phase = 'denied'; repaint(); return; }
    if (r.state === 'gone') { renew(); return; }
    const was = phase;
    phase = r.state === 'seen' ? 'seen' : 'wait';
    if (phase !== was) repaint();
    timer = setTimeout(poll, POLL);
  }
  function renew() {
    if (renews++ < RENEW) { fresh(); return; }
    stop(); phase = 'stopped'; repaint();
  }
  // «Да, войти»: сессию сервер выдаёт только сейчас. Пришла — входим, даже если окно успели закрыть: «Да» уже нажато
  async function take() {
    if (!code || phase !== 'confirm') return;
    const my = seq, c = code;
    phase = 'taking'; takeErr = '';
    repaint();
    let r = null;
    try { r = await api().post('/qr/poll', { id: c.id, key: c.key, take: true }); } catch (e) { takeErr = (e && e.message) || 'Сервер не отвечает, попробуй ещё раз'; }
    if (r && r.state === 'ok') {
      stop();
      const ok = window.loginWithSession ? await window.loginWithSession(r) : false;
      if (!ok && mode === 'show') { phase = 'error'; errText = 'Не получилось войти, попробуй ещё раз'; repaint(); }
      return;
    }
    if (my !== seq) return;
    phase = r && r.state === 'denied' ? 'denied' : r ? 'late' : 'confirm';
    repaint();
  }
  // ожидание телефона — стоп (окно закрыли, вернулись к паролю, новый код)
  function stop() { seq++; clearTimeout(timer); timer = 0; code = null; who = null; }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && mode === 'show' && code && inflight !== seq && ['wait', 'seen', 'retry'].includes(phase)) { clearTimeout(timer); poll(); }
  });

  const STEP = {
    load: 'Получаю код…', wait: 'Жду телефон…', seen: 'Телефон открыл ссылку: подтверди вход на нём',
    retry: 'Сервер не отвечает, пробую ещё раз…', denied: 'На телефоне отказали', stopped: 'Код больше не обновляется',
    late: 'Код устарел: нужен новый',
  };
  function paintShow(body, title) {
    title.textContent = 'Вход по QR-коду';
    if (phase === 'confirm' || phase === 'taking') {
      body.innerHTML = `<div class="qr-login">
        <p class="qr-login-step">${esc(`Войти как ${who ? `${who.name} (@${who.handle})` : ''}?`)}</p>
        <p class="auth-help">На телефоне нажали «Войти». Если аккаунт не твой, значит, QR-код видел кто-то другой: нажми «Нет» и возьми новый код</p>
        <p class="qr-login-status${takeErr ? ' bad' : ''}" role="status">${esc(phase === 'taking' ? 'Вхожу…' : takeErr)}</p>
        <div class="qr-login-acts"><button type="button" class="btn primary" data-qr="take"${phase === 'taking' ? ' disabled' : ''}>Да, войти</button><button type="button" class="btn ghost" data-qr="again"${phase === 'taking' ? ' disabled' : ''}>Нет, новый код</button></div>
        <div class="qr-login-acts"><button type="button" class="btn text small" data-qr="back">← Войти по паролю</button></div>
      </div>`;
      return;
    }
    const qr = code && window.CasualQR ? window.CasualQR.svg(`${location.origin}/opinion/#qr=${code.id}`, 184) : '';
    const again = ['seen', 'denied', 'stopped', 'late', 'error'].includes(phase);
    const bad = phase === 'denied' || phase === 'error' || phase === 'late';
    body.innerHTML = `<div class="qr-login">
      <div class="qr-login-code${phase === 'seen' ? ' seen' : ''}${qr ? '' : ' empty'}">${qr}</div>
      <p class="qr-login-step">Наведи камеру телефона на код</p>
      <p class="auth-help">На телефоне, где выполнен вход в Казуал Хаб, откроется страница — нажми на ней «Войти» и подожди пару секунд</p>
      <p class="qr-login-status${bad ? ' bad' : ''}" role="status">${esc(phase === 'error' ? errText || 'Сервер не отвечает, попробуй ещё раз' : STEP[phase] || '')}</p>
      <div class="qr-login-acts">${again ? '<button type="button" class="btn primary small" data-qr="again">Новый код</button>' : ''}<button type="button" class="btn text small" data-qr="back">← Войти по паролю</button></div>
    </div>`;
  }

  // ---------- телефон: «пустить то устройство?» ----------
  const hasToken = () => { try { return Object.values(JSON.parse(localStorage.getItem('casualhub.tokens.v1') || '{}') || {}).some(Boolean); } catch (e) { return false; } };
  async function ask(id) {
    stop();
    mode = 'ask'; askId = id; info = null; answer = ''; loginAt = 0;
    window.openAuthModal('qr');
    // ждём, пока станет ясно, вошёл ли человек: friends.js ещё проверяет сессию на сервере, или он входит здесь после
    // «Войти здесь». До 3 минут (дольше код не живёт): вошёл — вопрос открывается сам, даже если вход закрыл окно
    const t0 = Date.now();
    while (mode === 'ask' && askId === id && Date.now() - t0 < LOGIN_WAIT) {
      if (api() && api().online()) { if (!modalOpen()) window.openAuthModal('qr'); see(); return; }
      if (!loginAt && (!hasToken() || Date.now() - t0 > 6000)) { loginAt = Date.now(); repaint(); }
      await pause(300);
    }
  }
  async function see() {
    const id = askId;
    info = null; answer = ''; loginAt = 0;
    repaint();
    let r;
    try { r = await api().post('/qr/see', { id }); } catch (e) { r = { state: 'error', error: (e && e.message) || '' }; }
    if (mode !== 'ask' || askId !== id) return;
    info = r;
    repaint();
  }
  async function reply(ok) {
    if (busy) return;
    busy = true;
    repaint();
    try { await api().post('/qr/answer', { id: askId, ok }); answer = ok ? 'ok' : 'no'; }
    catch (e) { info = { state: 'error', error: (e && e.message) || '' }; }
    busy = false;
    repaint();
  }
  const note = (text, bad) => `<div class="qr-login"><p class="qr-login-step${bad ? ' bad' : ''}">${esc(text)}</p>
      <div class="qr-login-acts"><button type="button" class="btn small" data-qr="close">Закрыть</button></div></div>`;
  function paintAsk(body, title) {
    title.textContent = 'Вход на другом устройстве';
    if (loginAt) {
      body.innerHTML = `<div class="qr-login"><p class="qr-login-step">Чтобы войти на другом устройстве по QR-коду, на этом телефоне нужно быть в аккаунте</p>
        <div class="qr-login-acts"><button type="button" class="btn primary" data-qr="login">Войти здесь</button></div></div>`;
      return;
    }
    if (answer === 'ok') { body.innerHTML = note('Готово: вход разрешён. Осталось подтвердить вход на том устройстве'); return; }
    if (answer === 'no') { body.innerHTML = note('Вход отменён'); return; }
    if (!info) { body.innerHTML = '<div class="qr-login"><p class="qr-login-status" role="status">Проверяю код…</p></div>'; return; }
    if (info.state === 'done') { body.innerHTML = note('По этому коду уже вошли'); return; }
    if (info.state === 'gone') { body.innerHTML = note('Код устарел: обнови его на компьютере и отсканируй снова', true); return; }
    if (info.state !== 'ask' || !info.user) { body.innerHTML = note(info.error || 'Сервер не отвечает, попробуй ещё раз', true); return; }
    const where = [info.city, country(info.country)].filter(Boolean).join(', ');
    body.innerHTML = `<div class="qr-login qr-login-ask">
      <p class="qr-login-step">${esc(`Войти в аккаунт @${info.user.handle} на другом устройстве?`)}</p>
      <dl class="qr-login-dev"><dt>Устройство</dt><dd>${esc(info.device || 'Неизвестное устройство')}</dd>${where ? `<dt>Где</dt><dd>${esc(where)}</dd>` : ''}</dl>
      <p class="auth-help qr-login-warn">Нажимай «Войти», только если сам сейчас входишь на том устройстве. Если код прислали или показали другие, нажми «Это не я»: иначе они войдут в твой аккаунт</p>
      <div class="qr-login-acts"><button type="button" class="btn primary" data-qr="yes"${busy ? ' disabled' : ''}>Войти</button><button type="button" class="btn ghost" data-qr="no"${busy ? ' disabled' : ''}>Это не я</button></div>
    </div>`;
  }

  function paint(body, title) {
    if (!body || !title) return;
    if (mode === 'ask') paintAsk(body, title); else paintShow(body, title);
  }
  // кнопки окна (обработчики — отсюда: в разметке onclick CSP не пропустит)
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#authBody [data-qr]');
    if (!b || b.disabled) return;
    const what = b.dataset.qr;
    if (what === 'again') { renews = 0; fresh(); }
    else if (what === 'take') take();
    else if (what === 'back') { stop(); mode = ''; window.openAuthModal('login'); }
    else if (what === 'yes' || what === 'no') reply(what === 'yes');
    else if (what === 'login') window.openAuthModal('login');
    else if (what === 'close') { mode = ''; window.closeAuthModal(); }
  });

  window.CasualQrLogin = { show, ask, paint, stop };
})();
