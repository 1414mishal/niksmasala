/* Cloudflare Pages Function middleware.
 * Applies to every /api/* request. Adds CORS (same-origin if frontend is on
 * the same Pages site, but enabled in case you split frontend off) and a
 * lightweight in-memory rate limit (per-IP, per-route). For tougher protection
 * configure Cloudflare WAF rules — also free.
 */

const ALLOWED_ORIGIN = '*'; // tighten to 'https://niksmasala.com' once you have the custom domain

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

function cors(resp){
  resp.headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  resp.headers.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  resp.headers.set('Access-Control-Allow-Headers','Content-Type,Authorization');
  resp.headers.set('Access-Control-Max-Age','86400');
  return resp;
}

export const onRequest = async (ctx) => {
  const {request, next} = ctx;
  if(request.method==='OPTIONS') return cors(new Response(null,{status:204}));

  const url=new URL(request.url);
  const ip = request.headers.get('CF-Connecting-IP')||'0.0.0.0';

  /* Route-specific rate limits (per IP, sliding window) */
  const limits = {
    '/api/order/create':   {limit:10, windowMs:60_000},   // 10/min
    '/api/order/verify':   {limit:20, windowMs:60_000},
    '/api/order/track':    {limit:60, windowMs:60_000},
    '/api/contact':        {limit:5,  windowMs:600_000},  // 5 per 10 min
    '/api/newsletter':     {limit:3,  windowMs:600_000}
  };
  const rule = limits[url.pathname];
  if(rule && !rateLimit(ip, url.pathname, rule.limit, rule.windowMs)){
    return cors(new Response(JSON.stringify({error:'Too many requests'}),{
      status:429, headers:{'Content-Type':'application/json'}
    }));
  }

  const resp = await next();
  return cors(resp);
};
