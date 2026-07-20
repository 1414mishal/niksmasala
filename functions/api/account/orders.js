/* GET /api/account/orders — the signed-in customer's own orders.
 *
 * WHY: account.html used to query the orders table directly with the
 * user's Supabase session, relying on the RLS policy
 * `auth.uid() = user_id`. But /api/order/create never stamped user_id
 * on the row (always NULL), so every customer's "My Orders" was empty
 * forever — accounts looked pointless.
 *
 * This endpoint takes the user's Supabase ACCESS TOKEN, validates it
 * against Supabase Auth server-side, then uses the service role to
 * return orders matching EITHER:
 *   - user_id = the authenticated user's id   (new orders, stamped at
 *     checkout when the buyer is signed in), OR
 *   - customer->>'email' = the user's email   (retroactive: all past
 *     orders + guest orders placed with the same email)
 *
 * Email matching is safe because Supabase "Confirm email" is ON — a
 * user cannot authenticate with an email they don't control.
 *
 * Auth: Authorization: Bearer <supabase session access_token>
 * Rate-limited in functions/_middleware.js.
 */

export const onRequestGet = async ({request, env}) => {
  const authHdr = request.headers.get('Authorization') || '';
  const token = authHdr.replace(/^Bearer\s+/i, '').trim();
  if(!token) return json({error:'Not signed in'}, 401);

  /* Validate the session token with Supabase Auth. */
  const uRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE,
      'Authorization': 'Bearer ' + token
    }
  });
  if(!uRes.ok) return json({error:'Session expired — please sign in again'}, 401);
  const user = await uRes.json();
  const uid = user && user.id;
  const email = ((user && user.email) || '').trim().toLowerCase();
  if(!uid || !email) return json({error:'Could not resolve account'}, 400);

  /* Escape ilike wildcards so an email like a_b@x.com matches literally. */
  const emailPattern = email.replace(/([%_\\])/g, '\\$1');

  const sb = {
    'apikey': env.SUPABASE_SERVICE_ROLE,
    'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE
  };
  const or = `(user_id.eq.${uid},customer->>email.ilike.${emailPattern})`;
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/orders?or=${encodeURIComponent(or)}` +
    `&order=created_at.desc&limit=100` +
    `&select=id,date,created_at,status,tracking_status,tracking_notes,items,subtotal,shipping,discount,total,payment,awb,courier`,
    {headers: sb}
  );
  if(!r.ok){
    const t = await r.text();
    return json({error:'Orders lookup failed', detail:t.slice(0,150)}, 502);
  }
  const orders = await r.json();
  return json({ok:true, orders});
};

function json(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status, headers:{'Content-Type':'application/json'}
  });
}
