// Казуал Хаб: профиль по нику — /profile/<юзернейм или ник>. Страница та же, в предпросмотре имя хозяина.
// Файлы самой страницы (app.js, head.js) лежат по соседству: их отдаём как есть.
import { pageWithMeta } from '../_lib/page-meta.js';

const FILE_RE = /\.(js|css|html|json|map|png|jpe?g|webp|gif|svg|ico|txt)$/i;

export async function onRequest({ request, env, params, next }) {
  let raw = String(params.name || '');
  if (request.method !== 'GET' && request.method !== 'HEAD') return next();
  if (FILE_RE.test(raw)) return next();
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
    const u = new URL(request.url);
    return { title: `${user.username} · Казуал Хаб`, description: `Профиль ${user.username} (@${user.uname}): оценки, ачивки и любимое в Казуал Хабе.`, image: '', url: u.origin + '/profile/' + user.uname };
  });
}
