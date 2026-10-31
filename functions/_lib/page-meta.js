// Казуал Хаб: обычная страница сайта с предпросмотром под конкретную ссылку.
// Мессенджеры не запускают скрипты страницы, поэтому заголовок и описание подставляются здесь, на сервере.
// Если данных нет или база не ответила, уходит та же страница с общим предпросмотром.

// то же, что блок /* в _headers: на ответы Functions он сам не действует
const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Permitted-Cross-Domain-Policies": "none",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com https://open.spotify.com https://*.spotifycdn.com https://*.scdn.co; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' data: blob:; connect-src 'self' https://itunes.apple.com https://*.mzstatic.com https://images.genius.com https://assets.genius.com https://t2.genius.com https://images.rapgenius.com https://cdn-images.dzcdn.net https://e-cdns-images.dzcdn.net; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://open.spotify.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; worker-src 'none'; manifest-src 'self'; upgrade-insecure-requests"
};

const HITS = new Map();
function tooFast(ip) {
  const now = Date.now();
  let h = HITS.get(ip);
  if (!h || h.reset <= now) { h = { n: 0, reset: now + 60e3 }; HITS.set(ip, h); }
  if (HITS.size > 20000) for (const [k, v] of HITS) if (v.reset <= now) HITS.delete(k);
  return ++h.n > 120;
}

const setContent = (value) => ({ element(el) { el.setAttribute('content', value); } });

export async function pageWithMeta(request, env, assetPath, load) {
  const asset = await env.ASSETS.fetch(new URL(assetPath, request.url));
  if (!asset.ok) return asset;
  let meta = null;
  if (env.DB && !tooFast(request.headers.get('CF-Connecting-IP') || 'local')) {
    try { meta = await load(); } catch (e) {}
  }
  let page = asset;
  if (meta) {
    const rw = new HTMLRewriter()
      .on('title', { element(el) { el.setInnerContent(meta.title); } })
      .on('meta[name="description"]', setContent(meta.description))
      .on('meta[property="og:title"]', setContent(meta.title))
      .on('meta[property="og:description"]', setContent(meta.description))
      .on('meta[property="og:url"]', setContent(new URL(request.url).origin + new URL(request.url).pathname));
    if (meta.image) {
      rw.on('meta[property="og:image"]', setContent(meta.image))
        .on('meta[property="og:image:width"]', { element(el) { el.remove(); } })
        .on('meta[property="og:image:height"]', { element(el) { el.remove(); } });
    }
    page = rw.transform(asset);
  }
  const out = new Response(request.method === 'HEAD' ? null : page.body, page);
  out.headers.delete('etag');
  out.headers.delete('content-length');
  for (const [k, v] of Object.entries(SECURITY)) if (!out.headers.has(k)) out.headers.set(k, v);
  return out;
}
