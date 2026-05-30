/* /api/admin/orders
 *
 * GET   → list ALL orders (newest first)
 * PATCH → update one order's status / tracking fields
 *
 * Auth: Authorization: Bearer <ADMIN_TOKEN>   (same as /api/admin/products + ship)
 *
 * WHY THIS EXISTS (important):
 *   The `orders` table has Row Level Security. The public anon key
 *   used by the browser is DENIED all reads/writes on orders — by
 *   design, so a customer can't read another customer's order through
 *   the client SDK. But that also means admin.html (which used the
 *   anon key) silently got ZERO orders back and every status update
 *   silently failed to persist. The order pipeline was fine — the
 *   order WAS in the DB — the admin panel just couldn't see it.
 *
 *   The correct fix: admin reads/writes go through THIS endpoint,
 *   authenticated with ADMIN_TOKEN, using the SERVICE ROLE key
 *   server-side (which legitimately bypasses RLS). The anon key never
 *   touches orders again.
 *
 * Rate-limited upstream in functions/_middleware.js.
 */

export const onRequestGet = async ({request, env}) => {
  const auth = checkAuth(request, env);
  if(auth) return auth;

  const sb = sbHeaders(env);
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/orders?select=*&order=created_at.desc`,
    { headers: sb }
  );
  if(!res.ok){
    const t = await res.text();
    return json({error: 'Orders lookup failed', detail: t.slice(0,200)}, 502);
  }
  const orders = await res.json();
  return json({ ok: true, orders });
};

export const onRequestPatch = async ({request, env}) => {
  const auth = checkAuth(request, env);
  if(auth) return auth;

  let body;
  try { body = await request.json(); }
  catch { return json({error: 'Invalid JSON'}, 400); }

  const id = String(body.id || '').trim();
  if(!/^[A-Za-z0-9_-]{1,40}$/.test(id)){
    return json({error: 'Missing or invalid order id'}, 400);
  }

  /* Whitelist the fields an admin may patch. Anything else is ignored
     so a crafted request can't overwrite customer/items/total/etc. */
  const allowed = ['status', 'tracking_status', 'tracking_notes', 'payment_id', 'paid_at'];
  const patch = {};
  for(const k of allowed){
    if(body[k] !== undefined) patch[k] = body[k];
  }
  if(Object.keys(patch).length === 0){
    return json({error: 'No updatable fields supplied'}, 400);
  }

  const sb = sbHeaders(env);
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: {...sb, 'Content-Type': 'application/json', 'Prefer': 'return=representation'},
      body: JSON.stringify(patch)
    }
  );
  if(!res.ok){
    const t = await res.text();
    return json({error: 'Update failed', detail: t.slice(0,200)}, 502);
  }
  const rows = await res.json();
  if(!Array.isArray(rows) || rows.length === 0){
    return json({error: 'Order not found'}, 404);
  }
  return json({ ok: true, order: rows[0] });
};

export const onRequestDelete = async ({request, env}) => {
  const auth = checkAuth(request, env);
  if(auth) return auth;

  const url = new URL(request.url);
  const id = (url.searchParams.get('id') || '').trim();
  if(!/^[A-Za-z0-9_-]{1,40}$/.test(id)){
    return json({error: 'Missing or invalid order id'}, 400);
  }

  const sb = sbHeaders(env);
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: {...sb, 'Prefer': 'return=representation'} }
  );
  if(!res.ok){
    const t = await res.text();
    return json({error: 'Delete failed', detail: t.slice(0,200)}, 502);
  }
  const rows = await res.json().catch(()=>[]);
  if(!Array.isArray(rows) || rows.length === 0){
    return json({error: 'Order not found'}, 404);
  }
  return json({ ok: true, deleted: id });
};

/* ---- helpers ---- */
function checkAuth(request, env){
  const authHdr = request.headers.get('Authorization') || '';
  const tok = authHdr.replace(/^Bearer\s+/i, '').trim();
  const expected = (env.ADMIN_TOKEN || '').trim();
  if(!expected || !timingSafeEq(tok, expected)){
    return json({error: 'Unauthorized'}, 401);
  }
  return null;
}
function sbHeaders(env){
  return {
    'apikey': env.SUPABASE_SERVICE_ROLE,
    'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE
  };
}
function timingSafeEq(a, b){
  if(typeof a !== 'string' || typeof b !== 'string') return false;
  if(a.length !== b.length) return false;
  let diff = 0;
  for(let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function json(obj, status = 200){
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json'}
  });
}
