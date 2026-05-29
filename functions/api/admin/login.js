/* POST /api/admin/login
 *
 * Body: { password }
 *
 * Validates the admin password against env.ADMIN_PASSWORD (timing-safe
 * compare). On success returns the admin bearer token and an expiry
 * hint so the admin panel can stash both in localStorage.
 *
 *   200 → { token, expiresAt }   // expiresAt = ISO date 30 days out
 *   401 → { error: 'Incorrect password' }
 *   400 → bad body
 *   500 → env not configured
 *
 * Rate limit is enforced upstream by functions/_middleware.js
 * (5 attempts / 10 min per IP). That's the same shield used on contact
 * and newsletter — brute force across a single IP is infeasible.
 *
 * Env vars (set in Cloudflare Pages → Settings → Environment variables):
 *   ADMIN_PASSWORD   the human-memorable password the merchant types
 *                    in the login form. Keep it long & unique.
 *   ADMIN_TOKEN      the long random bearer string used by
 *                    /api/admin/products write endpoints. Returned to
 *                    the browser only after successful login.
 *
 * Why both?
 *   The password is the "thing you remember"; the token is the
 *   "thing the API checks". Splitting them lets you rotate one
 *   without the other, and limits the blast radius if either ever
 *   leaks separately.
 */

export const onRequestPost = async ({request, env}) => {
  if(!env.ADMIN_PASSWORD || !env.ADMIN_TOKEN){
    return json({error:'Admin not configured. Set ADMIN_PASSWORD + ADMIN_TOKEN in Cloudflare env vars.'}, 500);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({error:'Invalid JSON'}, 400); }

  const password = typeof body.password === 'string' ? body.password : '';
  if(!password) return json({error:'Password required'}, 400);

  /* Constant-time compare — never short-circuit on first-byte mismatch.
     Prevents timing oracles that leak password length / partial match. */
  if(!safeEq(password.trim(), (env.ADMIN_PASSWORD || '').trim())){
    /* Burn a tiny amount of CPU so failure responses don't return
       instantly — adds a few ms latency and discourages serial brute. */
    await new Promise(r => setTimeout(r, 80));
    return json({error:'Incorrect password'}, 401);
  }

  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return json({
    token:     (env.ADMIN_TOKEN || '').trim(),
    expiresAt: new Date(Date.now() + thirtyDays).toISOString()
  });
};

function safeEq(a, b){
  if(typeof a !== 'string' || typeof b !== 'string') return false;
  if(a.length !== b.length) return false;
  let diff = 0;
  for(let i=0;i<a.length;i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function json(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status, headers:{'Content-Type':'application/json'}
  });
}
