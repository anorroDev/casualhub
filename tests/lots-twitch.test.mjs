// Лоты из чата Twitch: какие ники и названия годятся, сколько лотов уже у каждого ника. node --test tests/lots-twitch.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTwitchLots, twitchCounts } from '../functions/_lib/lots-twitch.js';

test('пачка из чата: ник — латиница Twitch, название 1–60 знаков, не больше 25 за раз', () => {
  assert.deepEqual(cleanTwitchLots([
    { login: 'Streamer_Fan', display: 'Streamer_Fan', name: '  Hollow   Knight ' },
    { login: 'bad nick', name: 'Hades' },
    { login: 'ok', name: '   ' },
    { login: 'noname', display: '', name: 'x'.repeat(80) },
    { login: 'zw', display: 'Зе‮ро', name: 'Doom​' },
    null, 'str',
  ]), [
    { login: 'streamer_fan', display: 'Streamer_Fan', name: 'Hollow Knight' },
    { login: 'noname', display: 'noname', name: 'x'.repeat(60) },
    { login: 'zw', display: 'Зеро', name: 'Doom' },
  ]);
  assert.deepEqual(cleanTwitchLots({}), []);
  assert.equal(cleanTwitchLots(Array.from({ length: 40 }, (_, i) => ({ login: 'u' + i, name: 'G' + i }))).length, 25);
});

test('сколько лотов у каждого ника в сборе — по строкам via', () => {
  assert.deepEqual(twitchCounts([{ via: 'tw:a' }, { via: 'tw:a' }, { via: null }, { via: 'tw:b' }, {}]), { 'tw:a': 2, 'tw:b': 1 });
});
