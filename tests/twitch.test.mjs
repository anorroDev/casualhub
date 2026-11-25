// Чат Twitch на странице ведущего (twitch-chat.js): разбор строк IRC с тегами, команды «!лот» и «!1»/«!2», ник канала.
// node --test tests/twitch.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../twitch-chat.js', import.meta.url), 'utf8'), ctx);
const T = ctx.window.CasualTwitch;

test('строка IRC: ник, имя в чате, текст и значки', () => {
  const m = T.parseLine('@badge-info=subscriber/12;badges=subscriber/12,premium/1;color=#FF0000;display-name=Ваня_Стрим;mod=0;room-id=1 :vanya_strim!vanya_strim@vanya_strim.tmi.twitch.tv PRIVMSG #casual :!лот Hollow Knight');
  assert.deepEqual({ ...m }, { login: 'vanya_strim', name: 'Ваня_Стрим', channel: 'casual', text: '!лот Hollow Knight', sub: true, vip: false, mod: false, broadcaster: false });
  const v = T.parseLine('@badges=vip/1;display-name=Kira;mod=1 :kira!kira@kira.tmi.twitch.tv PRIVMSG #casual :!2');
  assert.deepEqual([v.vip, v.mod, v.sub], [true, true, false]);
  assert.equal(T.parseLine('PING :tmi.twitch.tv'), null);
  assert.equal(T.parseLine(':tmi.twitch.tv 001 justinfan123 :Welcome, GLHF!'), null);
  // без тегов (тоже бывает): имя — ник
  assert.equal(T.parseLine(':abc!abc@abc.tmi.twitch.tv PRIVMSG #casual :привет').name, 'abc');
});

test('команды: «!лот название», «!1» и «!2»', () => {
  assert.deepEqual({ ...T.command('!лот  Hollow   Knight ') }, { cmd: 'lot', name: 'Hollow Knight' });
  assert.deepEqual({ ...T.command('!LOT Hades') }, { cmd: 'lot', name: 'Hades' });
  assert.deepEqual({ ...T.command('!1') }, { cmd: 'vote', pick: 'a' });
  assert.deepEqual({ ...T.command('!2 за второго') }, { cmd: 'vote', pick: 'b' });
  assert.equal(T.command('!12'), null);
  assert.equal(T.command('!лот'), null);
  assert.equal(T.command('привет !1'), null);
});

test('канал — из ника или ссылки', () => {
  assert.equal(T.channelOf('https://www.twitch.tv/Some_Streamer/videos'), 'some_streamer');
  assert.equal(T.channelOf('#casual_hub'), 'casual_hub');
  assert.equal(T.channelOf('@Casual'), 'casual');
  assert.equal(T.channelOf('ab'), '', 'слишком коротко');
  assert.equal(T.channelOf('не ник'), '');
});
