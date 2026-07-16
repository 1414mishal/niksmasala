/* POST /api/admin/reconcile — ask Razorpay which stuck orders were paid.
 *
 * The admin panel can only see what got VERIFIED (browser verify call or
 * webhook). Orders placed before the webhook existed — or while it was
 * misconfigured — may be sitting at AwaitingPayment even though the money
 * was captured. This endpoint asks Razorpay's Orders API directly:
 *
 *   GET /v1/orders/{rzp_order_id}/payments
 *
 * and for every captured payment it runs the SAME fulfilment as the
 * webhook: atomic status flip (gated on AwaitingPayment), stock decrement,
 * coupon consumption, confirmation email. Idempotent by construction —
 * the atomic flip means a concurrent verify/webhook can't double-fulfil.
 *
 * Body: { id: "NM26-..." }  → reconcile one order
 *       { all: true }       → reconcile every AwaitingPayment order (max 25)
 *
 * Auth: Authorization: Bearer <ADMIN_TOKEN> (same as other admin routes).
 *
 * Response: { ok, results: [{id, outcome, payment_id?, detail?}] }
 *   outcome: captured | unpaid | failed | refunded | no-rzp-order | error
 */

export const onRequestPost = async (ctx) => {
  const {request, env} = ctx;
  const auth = checkAuth(request, env);
  if(auth) return auth;

  let body;
  try { body = await request.json(); }
  catch { return json({error:'Invalid JSON'}, 400); }

  const sb = sbHeaders(env);

  /* Collect candidates */
  let orders = [];
  if(body.id){
    const id = String(body.id).trim();
    if(!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return json({error:'Invalid order id'}, 400);
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}&select=*`, {headers: sb});
    if(!r.ok) return json({error:'Order lookup failed'}, 502);
    orders = await r.json();
    if(!orders.length) return json({error:'Order not found'}, 404);
  } else if(body.all){
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/orders?status=eq.AwaitingPayment&order=created_at.desc&limit=25&select=*`,
      {headers: sb}
    );
    if(!r.ok) return json({error:'Orders lookup failed'}, 502);
    orders = await r.json();
  } else {
    return json({error:'Pass {id} or {all:true}'}, 400);
  }

  const results = [];
  for(const o of orders){
    results.push(await reconcileOne(env, sb, o));
  }
  return json({ok:true, results});
};

async function reconcileOne(env, sb, o){
  const out = {id: o.id};
  try{
    if(o.status !== 'AwaitingPayment'){
      return {...out, outcome:'already', detail:'status is '+o.status};
    }
    if(o.payment === 'COD'){
      return {...out, outcome:'already', detail:'COD order'};
    }
    if(!o.rzp_order_id){
      return {...out, outcome:'no-rzp-order', detail:'no Razorpay order id stored'};
    }

    const r = await fetch(
      'https://api.razorpay.com/v1/orders/'+encodeURIComponent(o.rzp_order_id)+'/payments',
      {headers:{'Authorization':'Basic '+btoa(env.RAZORPAY_KEY_ID+':'+env.RAZORPAY_KEY_SECRET)}}
    );
    if(!r.ok){
      const t = await r.text();
      return {...out, outcome:'error', detail:'Razorpay API '+r.status+': '+t.slice(0,120)};
    }
    const j = await r.json();
    const payments = Array.isArray(j.items) ? j.items : [];

    const captured = payments.find(p => p.status === 'captured');
    if(captured){
      const flipped = await fulfil(env, sb, o, captured);
      return {...out, outcome:'captured', payment_id: captured.id,
        detail: flipped ? 'marked Processing + email sent' : 'already fulfilled by another path'};
    }
    if(payments.some(p => p.status === 'refunded')){
      return {...out, outcome:'refunded', detail:'payment was refunded'};
    }
    if(payments.length > 0){
      return {...out, outcome:'failed', detail:'attempts: '+payments.map(p=>p.status).join(', ')};
    }
    return {...out, outcome:'unpaid', detail:'no payment attempts on this order'};
  }catch(e){
    return {...out, outcome:'error', detail:String(e && e.message || e).slice(0,150)};
  }
}

/* Same fulfilment as the webhook: atomic flip gated on AwaitingPayment,
   then stock / coupon / email — winner only, all side-effects best-effort. */
async function fulfil(env, sb, order, payment){
  const upd = await fetch(
    `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(order.id)}&status=eq.AwaitingPayment`,
    {
      method:'PATCH',
      headers:{...sb,'Content-Type':'application/json','Prefer':'return=representation'},
      body: JSON.stringify({
        status:'Processing',
        payment_id: payment.id,
        paid_at: payment.created_at ? new Date(payment.created_at*1000).toISOString() : new Date().toISOString()
      })
    }
  );
  const updated = await upd.json().catch(()=>[]);
  if(!Array.isArray(updated) || updated.length === 0) return false;

  for(const it of (order.items||[])){
    await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/decrement_stock`, {
      method:'POST', headers:{...sb,'Content-Type':'application/json'},
      body: JSON.stringify({p_id: it.id, p_qty: it.qty})
    }).catch(()=>{});
  }
  if(order.coupon){
    await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/try_consume_coupon`, {
      method:'POST', headers:{...sb,'Content-Type':'application/json'},
      body: JSON.stringify({p_code: order.coupon})
    }).catch(()=>{});
  }
  if(env.RESEND_API_KEY && order.customer && order.customer.email){
    const c = order.customer;
    const items = (order.items||[]).map(i =>
      `${escapeHtml(i.name)} (${escapeHtml(i.pack||'')}) × ${i.qty} — ₹${i.price*i.qty}`).join('<br>');
    await fetch('https://api.resend.com/emails', {
      method:'POST',
      headers:{'Authorization':'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
      body: JSON.stringify({
        from: env.RESEND_FROM || 'Niks Masala <orders@niksmasala.com>',
        to: [c.email],
        subject: `Order ${order.id} confirmed — Niks Masala`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222">
          <h2 style="color:#b8321a">Thank you for your order!</h2>
          <p>Hi ${escapeHtml(c.name||'')}, your payment for order <strong>${escapeHtml(order.id)}</strong> is confirmed and it's being prepared at our Mangalore facility. Apologies for the delayed confirmation.</p>
          <p>${items}</p>
          <p style="font-size:18px"><strong>Total: ₹${order.total}</strong></p>
          <p>Shipping to:<br>${escapeHtml(c.address||'')}, ${escapeHtml(c.city||'')}, ${escapeHtml(c.state||'')} ${escapeHtml(c.pincode||'')}<br>📞 ${escapeHtml(c.phone||'')}</p>
          <p>Track: <a href="https://niksmasala.com/track.html?id=${encodeURIComponent(order.id)}">niksmasala.com/track.html?id=${encodeURIComponent(order.id)}</a></p>
          <p style="font-size:12px;color:#888;margin-top:32px">Iniha Exports Pvt Ltd · GSTIN 29AAFCI2793E1ZD · Yeyyadi, Mangaluru 575015</p>
        </div>`
      })
    }).catch(()=>{});
  }
  return true;
}

/* ---- helpers (same pattern as /api/admin/orders) ---- */
function checkAuth(request, env){
  const authHdr = request.headers.get('Authorization') || '';
  const tok = authHdr.replace(/^Bearer\s+/i, '').trim();
  const expected = (env.ADMIN_TOKEN || '').trim();
  if(!expected || !timingSafeEq(tok, expected)){
    return json({error:'Unauthorized'}, 401);
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
function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function json(obj, status = 200){
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type': 'application/json'}
  });
}
