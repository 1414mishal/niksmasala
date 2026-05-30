/* POST /api/order/webhook  — Razorpay server-to-server callback.
 *
 * THE SAFETY NET. /api/order/verify only runs if the customer's
 * BROWSER calls it after payment. If the browser drops out (tab
 * closed, dead network, crash, slow redirect) the order would be
 * stranded in AwaitingPayment even though the money was captured —
 * exactly the launch-day failure we just hit.
 *
 * This webhook fires from Razorpay's servers directly, independent of
 * the browser, so a captured payment ALWAYS marks the order Processing.
 *
 * ── Setup (one time) ─────────────────────────────────────────────
 * 1. Razorpay Dashboard → Settings → Webhooks → + Add New Webhook
 *      URL:    https://niksmasala.com/api/order/webhook
 *              (or https://niksmasala.pages.dev/api/order/webhook until DNS)
 *      Secret: pick a strong random string
 *      Active events: payment.captured   (that's the only one we need)
 * 2. Cloudflare → Pages → niksmasala → Settings → Variables and Secrets
 *      Add  RAZORPAY_WEBHOOK_SECRET = <the same secret>  (Encrypted)
 * 3. Retry deployment.
 *
 * ── Why it can't double-charge or double-fulfil ──────────────────
 * Both /verify and this webhook flip status with an UPDATE gated on
 * `status = AwaitingPayment`. Postgres makes that atomic, so only ONE
 * of them ever matches the row and runs the stock/coupon/email side
 * effects. The loser just returns {ok, already:true}.
 *
 * Signature: header `X-Razorpay-Signature` = HMAC_SHA256(secret, RAW body).
 * We verify against the raw bytes BEFORE parsing JSON.
 */

export const onRequestPost = async ({request, env}) => {
  const raw = await request.text();
  const sig = request.headers.get('X-Razorpay-Signature') || '';

  if(!env.RAZORPAY_WEBHOOK_SECRET){
    /* Not configured yet — 200 so Razorpay doesn't hammer retries,
       but flag it so it shows up in Cloudflare logs. */
    return json({ok:false, error:'RAZORPAY_WEBHOOK_SECRET not set'}, 200);
  }

  const expected = await hmacSha256Hex(env.RAZORPAY_WEBHOOK_SECRET, raw);
  if(!timingSafeEqual(expected, sig.toLowerCase())){
    return json({error:'Invalid signature'}, 400);
  }

  let evt;
  try { evt = JSON.parse(raw); } catch { return json({error:'Bad JSON'}, 400); }

  /* Ack everything we don't act on so Razorpay stops retrying it. */
  if(evt.event !== 'payment.captured'){
    return json({ok:true, ignored: evt.event || 'unknown'});
  }

  const payment = evt.payload && evt.payload.payment && evt.payload.payment.entity;
  if(!payment || !payment.order_id){
    return json({ok:true, ignored:'no order_id in payload'});
  }

  const sb = {
    'apikey': env.SUPABASE_SERVICE_ROLE,
    'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE
  };

  /* Find our order by the Razorpay order id we stored at create time. */
  const fr = await fetch(
    `${env.SUPABASE_URL}/rest/v1/orders?rzp_order_id=eq.${encodeURIComponent(payment.order_id)}&select=*`,
    {headers: sb}
  );
  if(!fr.ok) return json({ok:false, error:'order lookup failed'}, 200);
  const rows = await fr.json();
  const order = rows && rows[0];
  if(!order){
    /* Ack — no matching order. Visible in CF logs if it ever matters. */
    return json({ok:true, ignored:'order not found for '+payment.order_id});
  }
  if(['Processing','Shipped','Delivered'].includes(order.status)){
    return json({ok:true, already:true});
  }

  /* Atomic flip — same gate as /verify so the two paths can't both
     run the side-effects. */
  const upd = await fetch(
    `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(order.id)}&status=eq.AwaitingPayment`,
    {
      method:'PATCH',
      headers:{...sb,'Content-Type':'application/json','Prefer':'return=representation'},
      body: JSON.stringify({
        status:'Processing',
        payment_id: payment.id,
        paid_at: new Date().toISOString()
      })
    }
  );
  const updated = await upd.json().catch(()=>[]);
  if(!Array.isArray(updated) || updated.length === 0){
    return json({ok:true, already:true});   // /verify (or a prior webhook) won the flip
  }

  /* Side-effects — winner only. All best-effort; none can fail the ack. */
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
    fetch('https://api.resend.com/emails', {
      method:'POST',
      headers:{'Authorization':'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
      body: JSON.stringify({
        from: env.RESEND_FROM || 'Niks Masala <orders@niksmasala.com>',
        to: [c.email],
        subject: `Order ${order.id} confirmed — Niks Masala`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222">
          <h2 style="color:#b8321a">Thank you for your order!</h2>
          <p>Hi ${escapeHtml(c.name||'')}, we've received order <strong>${escapeHtml(order.id)}</strong> and it's being prepared at our Mangalore facility.</p>
          <p>${items}</p>
          <p style="font-size:18px"><strong>Total: ₹${order.total}</strong></p>
          <p>Shipping to:<br>${escapeHtml(c.address||'')}, ${escapeHtml(c.city||'')}, ${escapeHtml(c.state||'')} ${escapeHtml(c.pincode||'')}<br>📞 ${escapeHtml(c.phone||'')}</p>
          <p>Track: <a href="https://niksmasala.com/track.html?id=${encodeURIComponent(order.id)}">niksmasala.com/track.html?id=${encodeURIComponent(order.id)}</a></p>
          <p style="font-size:12px;color:#888;margin-top:32px">Iniha Exports Pvt Ltd · GSTIN 29AAFCI2793E1ZD · Yeyyadi, Mangaluru 575015</p>
        </div>`
      })
    }).catch(()=>{});
  }

  return json({ok:true, fulfilled: order.id});
};

/* ---------- helpers (self-contained; verify.js untouched) ---------- */
async function hmacSha256Hex(secret, message){
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret),
    {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(s)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function timingSafeEqual(a, b){
  if(typeof a!=='string' || typeof b!=='string' || a.length!==b.length) return false;
  let r=0; for(let i=0;i<a.length;i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r===0;
}
function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function json(obj, status=200){
  return new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}});
}
