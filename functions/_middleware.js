/* Cloudflare Pages Function middleware.
 * Applies to every /api/* request. Adds CORS, rate limiting, and security
 * headers (CSP, XFO, Referrer-Policy, Permissions-Policy). For tougher
 * protection configure Cloudflare WAF rules — also free.
 */

/* CORS — same-origin in production, wildcard in dev. Override via env if
 * the frontend ever runs on a different domain. */
function originAllowed(req, env){
  const allow = (env && env.ALLOWED_ORIGINS) ||
                'https://niksmasala.com,https://www.niksmasala.com';
  const o = req.headers.get('Origin') || '';
  // Treat same-origin (no Origin header set on same-origin GETs/POSTs) as allowed.
  if(!o) return '*';
  const list = allow.split(',').map(s=>s.trim()).filter(Boolean);
  return list.includes(o) ? o : list[0] || '*';
}

/* Tiny rolling-window rate limiter using KV-free worker memory.
   Survives a single worker instance; on cold-start the counter resets,
   which is fine for a basic spam shield. */
const buckets = new Map();
function rateLimit(ip, route, limit, windowMs){
  const key = ip+':'+route;
  const now = Date.now();
  const arr = (buckets.get(key)||[]).filter(t=>t>now-windowMs);
  if(arr.length>=limit) return false;
  arr.push(now);
  buckets.set(key,arr);
  return true;
}

/* CSP allows: own origin + Razorpay (payment widget) + YouTube (recipe embeds)
 * + Supabase (client SDK) + Google Fonts + Unsplash (until owned photos land).
 * Tighten as you replace external dependencies. */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://www.youtube.com https://www.youtube-nocookie.com https://static.cloudflareinsights.com",
  "style-src  'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src   'self' https://fonts.gstatic.com data:",
  "img-src    'self' data: https: blob:",
  "media-src  'self' blob:",
  "frame-src  https://checkout.razorpay.com https://www.youtube.com https://www.youtube-nocookie.com https://api.razorpay.com",
  "connect-src 'self' https://api.razorpay.com https://*.supabase.co https://www.youtube.com https://www.youtube-nocookie.com https://cloudflareinsights.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests"
].join('; ');

function applySecurityHeaders(resp, originAllow){
  // CORS (only for /api/* — but harmless on others)
  resp.headers.set('Access-Control-Allow-Origin', originAllow);
  resp.headers.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  resp.headers.set('Access-Control-Allow-Headers','Content-Type,Authorization');
  resp.headers.set('Access-Control-Max-Age','86400');
  resp.headers.set('Vary','Origin');

  // Security
  resp.headers.set('X-Content-Type-Options','nosniff');
  resp.headers.set('X-Frame-Options','DENY');
  resp.headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  resp.headers.set('Permissions-Policy',
    'accelerometer=(),camera=(),geolocation=(),gyroscope=(),magnetometer=(),microphone=(),payment=(self "https://checkout.razorpay.com"),usb=()');
  resp.headers.set('Strict-Transport-Security','max-age=31536000; includeSubDomains; preload');
  resp.headers.set('Cross-Origin-Opener-Policy','same-origin-allow-popups');

  // CSP only applied to HTML responses — JSON APIs don't need it (and breaks tooling).
  const ct = (resp.headers.get('Content-Type')||'').toLowerCase();
  if(ct.includes('text/html')) resp.headers.set('Content-Security-Policy', CSP);

  return resp;
}

export const onRequest = async (ctx) => {
  const {request, next, env} = ctx;
  const url = new URL(request.url);
  const originAllow = originAllowed(request, env);

  if(request.method==='OPTIONS'){
    return applySecurityHeaders(new Response(null,{status:204}), originAllow);
  }

  const ip = request.headers.get('CF-Connecting-IP')||'0.0.0.0';

  /* Route-specific rate limits (per IP, sliding window).
   * Admin write endpoints are tightly limited — if someone is brute-forcing
   * ADMIN_TOKEN, 30/min/IP is plenty for a real admin but useless to an
   * attacker (HMAC tokens have ~10^77 possibilities). */
  const limits = {
    '/api/order/create':       {limit:10,  windowMs:60_000},   // 10/min
    '/api/order/verify':       {limit:20,  windowMs:60_000},
    '/api/order/track':        {limit:60,  windowMs:60_000},
    '/api/contact':            {limit:5,   windowMs:600_000},  // 5 per 10 min
    '/api/newsletter':         {limit:3,   windowMs:600_000},
    '/api/products':           {limit:120, windowMs:60_000},   // GET — read-heavy
    '/api/admin/products':     {limit:30,  windowMs:60_000},   // admin write
    '/api/admin/login':        {limit:5,   windowMs:600_000},  // 5 attempts / 10 min per IP — brute-force shield
    '/api/admin/ship':         {limit:30,  windowMs:60_000}    // Shiprocket dispatch (one click = one shipment)
  };
  const rule = limits[url.pathname];
  if(rule && !rateLimit(ip, url.pathname, rule.limit, rule.windowMs)){
    const r = new Response(JSON.stringify({error:'Too many requests'}),{
      status:429,
      headers:{'Content-Type':'application/json','Retry-After':'60'}
    });
    return applySecurityHeaders(r, originAllow);
  }

  const resp = await next();
  return applySecurityHeaders(resp, originAllow);
};
