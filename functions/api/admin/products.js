/* POST /api/admin/products     → upsert a product (create or update by id)
 * DELETE /api/admin/products    → remove product (body: { id })
 *
 * Auth
 *   Authorization: Bearer <ADMIN_TOKEN>
 *   ADMIN_TOKEN is set in Cloudflare Pages → Settings → Environment variables.
 *   Use a long random string: `openssl rand -hex 32`.
 *   Never commit it. Never put it in client code. Admin panel asks for it
 *   once after login and stores it in sessionStorage.
 *
 * Why a token instead of using the admin password directly:
 *   The admin password is hashed (PBKDF2) and stored client-side. We don't
 *   want to send the raw password on every API call. A separate server-side
 *   token is simpler, easier to rotate, and lets you grant API access to
 *   external tools (postman / scripts) without exposing the UI password.
 *
 * Env vars:
 *   ADMIN_TOKEN              long random string (used by Authorization header)
 *   SUPABASE_URL             https://....supabase.co
 *   SUPABASE_SERVICE_ROLE    bypasses RLS for writes
 */

/* ---------- shared helpers ---------- */

function json(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status, headers:{'Content-Type':'application/json'}
  });
}
function sbHeaders(env){
  return {
    'apikey':        env.SUPABASE_SERVICE_ROLE,
    'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE,
    'Content-Type':  'application/json',
    /* Tell PostgREST to return the row(s) so we can echo the saved version back */
    'Prefer':        'return=representation,resolution=merge-duplicates'
  };
}
/* Constant-time string compare — prevents timing attacks on token */
function safeEq(a, b){
  if(typeof a !== 'string' || typeof b !== 'string') return false;
  if(a.length !== b.length) return false;
  let diff = 0;
  for(let i=0;i<a.length;i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function authorised(request, env){
  if(!env.ADMIN_TOKEN) return false;            // misconfigured → deny
  const header = request.headers.get('Authorization') || '';
  if(!header.startsWith('Bearer ')) return false;
  const token = header.slice(7).trim();
  return safeEq(token, env.ADMIN_TOKEN);
}

/* App-shape product → Supabase row shape */
function toRow(p){
  if(!p || typeof p !== 'object') return null;
  if(typeof p.id !== 'string' || !p.id.match(/^[A-Za-z0-9_-]{1,32}$/)) return null;
  if(typeof p.name !== 'string' || !p.name.trim()) return null;
  return {
    id:           p.id,
    name:         String(p.name).slice(0, 200),
    slug:         (p.slug || p.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')).slice(0, 200),
    category:     String(p.category || '').slice(0, 100) || null,
    price:        Number(p.price) || 0,
    old_price:    p.oldPrice != null ? Number(p.oldPrice) : null,
    weight:       String(p.weight || '').slice(0, 50),
    image:        String(p.image || '').slice(0, 500),
    variants:     Array.isArray(p.variants) ? p.variants.slice(0, 12) : [],
    description:  String(p.desc || '').slice(0, 1000),
    long_desc:    String(p.long || '').slice(0, 4000),
    badge:        p.badge ? String(p.badge).slice(0, 50) : null,
    stock:        Math.max(0, Math.min(99999, parseInt(p.stock, 10) || 0))
  };
}

/* ---------- POST: upsert one or many products ---------- */

export const onRequestPost = async ({request, env}) => {
  if(!authorised(request, env)) return json({error:'Unauthorized'}, 401);
  if(!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE){
    return json({error:'Supabase not configured'}, 500);
  }

  let body;
  try{ body = await request.json(); }
  catch{ return json({error:'Invalid JSON'}, 400); }

  /* Accept either a single product or an array */
  const incoming = Array.isArray(body) ? body : [body];
  if(incoming.length === 0) return json({error:'No products supplied'}, 400);
  if(incoming.length > 100) return json({error:'Too many products at once (max 100)'}, 400);

  const rows = [];
  for(const p of incoming){
    const r = toRow(p);
    if(!r) return json({error:'Invalid product shape', sample:p}, 400);
    rows.push(r);
  }

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/products`, {
    method: 'POST',
    headers: sbHeaders(env),
    body: JSON.stringify(rows)
  });
  if(!res.ok){
    const detail = await res.text();
    return json({error:'Supabase write failed', detail}, 502);
  }
  const saved = await res.json();
  return json({ok:true, count:saved.length, products:saved});
};

/* ---------- DELETE: remove a product by id ---------- */

export const onRequestDelete = async ({request, env}) => {
  if(!authorised(request, env)) return json({error:'Unauthorized'}, 401);
  if(!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE){
    return json({error:'Supabase not configured'}, 500);
  }

  let id;
  try{
    const body = await request.json();
    id = body.id;
  }catch{
    /* Allow ?id=... as a fallback for plain DELETE requests */
    const url = new URL(request.url);
    id = url.searchParams.get('id');
  }
  if(typeof id !== 'string' || !id.match(/^[A-Za-z0-9_-]{1,32}$/)){
    return json({error:'Missing or invalid id'}, 400);
  }

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: sbHeaders(env) }
  );
  if(!res.ok){
    const detail = await res.text();
    return json({error:'Supabase delete failed', detail}, 502);
  }
  return json({ok:true, deleted:id});
};

/* GET — handy for admin panel to verify the token works */
export const onRequestGet = async ({request, env}) => {
  if(!authorised(request, env)) return json({error:'Unauthorized'}, 401);
  return json({ok:true, message:'Admin token valid'});
};
