// Казуал Хаб: профиль по ссылке /profile/?id=<id>. Страница та же, в предпросмотре имя хозяина.
import { pageWithMeta } from '../_lib/page-meta.js';

const ID_RE = /^[0-9a-f]{24}$/;

export async function onRequest({ request, env, next }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return next();
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!ID_RE.test(id)) return next();
  return pageWithMeta(request, env, '/profile/', async () => {
    const user = await env.DB.prepare('SELECT username, uname, banned FROM users WHERE id = ?').bind(id).first();
    if (!user || user.banned) return null;
    const u = new URL(request.url);
    return { title: `${user.username} · Казуал Хаб`, description: `Профиль ${user.username} (@${user.uname}): оценки, ачивки и любимое в Казуал Хабе.`, image: '', url: u.origin + '/profile/?id=' + id };
  });
}
