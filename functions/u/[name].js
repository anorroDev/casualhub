// Казуал Хаб: короткая ссылка на профиль /u/<@юзернейм или ник>. Страница та же, в предпросмотре имя хозяина.
import { pageWithMeta } from '../_lib/page-meta.js';

export async function onRequest({ request, env, params, next }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return next();
  let raw = String(params.name || '');
  try { raw = decodeURIComponent(raw); } catch (e) {}
  raw = raw.trim().slice(0, 40);
  return pageWithMeta(request, env, '/profile/', async () => {
    const handle = raw.replace(/^@+/, '').toLowerCase();
    let user = await env.DB.prepare('SELECT username, uname, banned FROM users WHERE uname = ?').bind(handle).first();
    if (!user) {
      const { results } = await env.DB.prepare('SELECT username, uname, banned FROM users WHERE nkey = ? LIMIT 2').bind(raw.replace(/\s+/g, ' ').toLowerCase()).all();
      if (results.length === 1) user = results[0];
    }
    if (!user || user.banned) return null;
    return { title: `${user.username} · Казуал Хаб`, description: `Профиль ${user.username} (@${user.uname}): оценки, ачивки и любимое в Казуал Хабе.`, image: '' };
  });
}
