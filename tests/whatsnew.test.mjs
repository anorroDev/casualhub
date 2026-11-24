// «Что нового» (whatsnew.html, whatsnew-en.html, whatsnew-uk.html): английский и украинский журналы повторяют русский — те же дни, абзацы и смайлики;
// смайлик у абзаца свой — в одном дне и у соседних абзацев не повторяется, файл стикера на месте.
// node --test tests/whatsnew.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
// дни сверху вниз: дата и смайлики абзацев (у абзаца без смайлика — null)
const parse = (file) => readFileSync(new URL(file, ROOT), 'utf8').split('<section class="log-day">').slice(1).map((sec) => ({
  date: (sec.match(/class="log-date">([^<]+)</) || [])[1],
  emo: [...sec.matchAll(/<p>(.*?)<\/p>/gs)].map((m) => (m[1].match(/class="wn-emo" src="([^"]+)"/) || [])[1] || null),
}));
const ru = parse('whatsnew.html');
const en = parse('whatsnew-en.html');
const uk = parse('whatsnew-uk.html');

// подсказка в ошибке: стикеры, которых в журнале ещё нет, вперемешку из разных наборов
function free() {
  const used = new Set(ru.flatMap((d) => d.emo));
  const packs = ['arthas', 'twitch', 'papich', 'roflan'].map((p) => readdirSync(new URL(`wheel/hub/${p}/`, ROOT))
    .map((f) => `/wheel/hub/${p}/${f}`).filter((s) => /\.(webp|png|gif)$/.test(s) && !used.has(s)));
  const out = [];
  for (let i = 0; out.length < 9 && packs.some((l) => i < l.length); i++) for (const l of packs) if (l[i] && out.length < 9) out.push(l[i]);
  return out.join(', ');
}

test('английский и украинский журналы повторяют русский: те же дни, абзацы и смайлики', () => {
  assert.ok(ru.length > 0, 'дни в whatsnew.html не нашлись');
  for (const [file, list] of [['whatsnew-en.html', en], ['whatsnew-uk.html', uk]]) {
    assert.equal(list.length, ru.length, `число дней в ${file}`);
    ru.forEach((d, i) => assert.deepEqual(list[i].emo, d.emo, `${d.date}: абзацы или смайлики в ${file} не те, что в whatsnew.html`));
  }
});

test('смайлик у абзаца свой: в одном дне не повторяется, у соседних абзацев разный', () => {
  let prev = null;
  for (const d of ru) {
    const seen = new Set();
    for (const s of d.emo) {
      if (!s) { prev = null; continue; }
      assert.ok(existsSync(new URL('.' + s, ROOT)), `${d.date}: нет файла ${s}`);
      if (seen.has(s)) assert.fail(`${d.date}: ${s} уже есть в этом дне. Свободные: ${free()}`);
      if (s === prev) assert.fail(`${d.date}: ${s} — как у абзаца рядом. Свободные: ${free()}`);
      seen.add(s);
      prev = s;
    }
  }
});
