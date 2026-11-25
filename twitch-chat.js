/* Казуал Хаб: чат Twitch на странице ведущего — лоты (lots/app.js) и «Царь Горы» (king/app.js). Подгружается по кнопке
   через CasualUtil.script. Читает чат канала без входа в Twitch — как зритель без аккаунта (IRC через WebSocket, ник
   justinfanNNNNN), писать в чат не умеет и ничего у человека не спрашивает. Команды: «!лот название» (и «!lot») — лот в сбор,
   «!1» / «!2» — голос за левого или правого в бою «Царя Горы». Обрыв — переподключается сам: через 2, 4, 8… до 30 секунд.
   CasualTwitch.connect(канал, { onMsg, onState }) → { channel, close() }; onMsg({ login, name, text, sub, vip, mod, broadcaster }),
   onState('connecting' | 'on' | 'retry' | 'off'). CSP: wss://irc-ws.chat.twitch.tv — в _headers и functions/_lib/page-meta.js */
(() => {
  if (window.CasualTwitch) return;
  const IRC = 'wss://irc-ws.chat.twitch.tv:443';
  const CHANNEL_RE = /^[a-z0-9_]{3,25}$/;
  // канал — из ника, «#ника», «@ника» или ссылки twitch.tv/<ник>
  const channelOf = (s) => {
    const v = String(s || '').trim().toLowerCase().replace(/^https?:\/\/(www\.|m\.)?twitch\.tv\//, '').replace(/^[#@]/, '').split(/[/?#\s]/)[0];
    return CHANNEL_RE.test(v) ? v : '';
  };
  const unTag = (v) => String(v || '').replace(/\\s/g, ' ').replace(/\\:/g, ';').replace(/\\\\/g, '\\');
  // одна строка IRC (с тегами twitch.tv/tags или без) → сообщение чата или null
  function parseLine(line) {
    let rest = String(line || '').replace(/\r$/, '');
    const tags = {};
    if (rest[0] === '@') {
      const sp = rest.indexOf(' ');
      if (sp < 0) return null;
      rest.slice(1, sp).split(';').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) tags[kv.slice(0, i)] = unTag(kv.slice(i + 1)); });
      rest = rest.slice(sp + 1);
    }
    const m = /^:([^!\s]+)![^\s]+ PRIVMSG #([^\s]+) :([\s\S]*)$/.exec(rest);
    if (!m) return null;
    const badges = String(tags.badges || '');
    return {
      login: m[1].toLowerCase(), name: tags['display-name'] || m[1], channel: m[2], text: m[3].trim(),
      sub: /(^|,)(subscriber|founder)\//.test(badges), vip: /(^|,)vip\//.test(badges),
      mod: tags.mod === '1' || /(^|,)moderator\//.test(badges), broadcaster: /(^|,)broadcaster\//.test(badges),
    };
  }
  // команда из текста сообщения: { cmd: 'lot', name } | { cmd: 'vote', pick: 'a' | 'b' } | null
  function command(text) {
    const t = String(text || '').trim();
    let m = /^!(?:лот|lot)\s+(\S[\s\S]{0,99})$/iu.exec(t);
    if (m) return { cmd: 'lot', name: m[1].replace(/\s+/g, ' ').trim() };
    m = /^!([12])(?=\s|$)/.exec(t);
    if (m) return { cmd: 'vote', pick: m[1] === '1' ? 'a' : 'b' };
    return null;
  }
  function connect(channel, { onMsg, onState } = {}) {
    const ch = channelOf(channel);
    if (!ch) throw new Error('Нужен ник канала на Twitch');
    let ws = null, closed = false, wait = 2000, timer = 0;
    const state = (s) => { try { if (onState) onState(s, ch); } catch (e) {} };
    const open = () => {
      if (closed) return;
      state('connecting');
      try { ws = new WebSocket(IRC); } catch (e) { state('retry'); timer = setTimeout(open, wait); wait = Math.min(30000, wait * 2); return; }
      ws.onopen = () => {
        ws.send('CAP REQ :twitch.tv/tags');
        ws.send('PASS SCHMOOPIIE');
        ws.send('NICK justinfan' + (10000 + Math.floor(Math.random() * 89999)));
        ws.send('JOIN #' + ch);
      };
      ws.onmessage = (e) => {
        String(e.data).split('\r\n').forEach((line) => {
          if (!line) return;
          if (line.startsWith('PING')) { try { ws.send('PONG' + line.slice(4)); } catch (er) {} return; }
          if (/^:\S+ 366 /.test(line)) { wait = 2000; state('on'); return; } // конец списка зрителей: вошли в канал
          const msg = parseLine(line);
          if (msg && onMsg) { try { onMsg(msg); } catch (er) {} }
        });
      };
      ws.onclose = () => { if (closed) return; state('retry'); timer = setTimeout(open, wait); wait = Math.min(30000, wait * 2); };
      ws.onerror = () => { try { ws.close(); } catch (e) {} };
    };
    open();
    return { channel: ch, close() { closed = true; clearTimeout(timer); try { if (ws) ws.close(); } catch (e) {} state('off'); } };
  }
  window.CasualTwitch = Object.freeze({ connect, parseLine, command, channelOf });
})();
