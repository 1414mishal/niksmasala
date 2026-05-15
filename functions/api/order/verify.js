/* POST /api/order/verify
 *
 * Razorpay sends `razorpay_signature = HMAC_SHA256(key_secret, order_id + '|' + payment_id)`.
 * We must verify it before marking the order paid. If anyone can call this
 * endpoint and skip verification, the entire payment flow is meaningless.
 *
 * Body: { order_id, rzp_order_id, rzp_payment_id, rzp_signature }
 *
 * On success:
 *   - flips order status from AwaitingPayment → Processing
 *   - records payment_id
 *   - decrements stock atomically
 *   - increments coupon redemption count
 *   - calls /api/_email/order-confirmation internally (best-effort)
 */

export const onRequestPost = async ({request, env}) => {
  let body;
  try { body = await request.json(); } catch { return json({error:'Invalid JSON'},400); }
  const {order_id, rzp_order_id, rzp_payment_id, rzp_signature} = body;
  if(!order_id||!rzp_order_id||!rzp_payment_id||!rzp_signature){
    return json({error:'Missing fields'},400);
  }

  /* 1. Verify HMAC */
  const expected = await hmacSha256Hex(env.RAZORPAY_KEY_SECRET, rzp_order_id+'|'+rzp_payment_id);
  if(!timingSafeEqual(expected, rzp_signature.toLowerCase())){
    return json({error:'Signature mismatch'},400);
  }

  const sb = {
    'apikey': env.SUPABASE_SERVICE_ROLE,
    'Authorization': 'Bearer '+env.SUPABASE_SERVICE_ROLE
  };

  /* 2. Fetch order, sanity-check the rzp_order_id matches what we stored */
  const fetchRes = await fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(order_id)}&select=*`, {headers:sb});
  const rows = await fetchRes.json();
  const order = rows && rows[0];
  if(!order) return json({error:'Order not found'},404);
  if(order.rzp_order_id !== rzp_order_id) return json({error:'Order/payment mismatch'},400);
  if(order.status === 'Processing' || order.status === 'Shipped' || order.status === 'Delivered'){
    /* Idempotent: signature was valid AND already processed — just return ok. */
    return json({ok:true, already:true});
  }

  /* 3. Mark paid + decrement stock + increment coupon */
  const updRes = await fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(order_id)}`,{
    method:'PATCH',
    headers:{...sb,'Content-Type':'application/json','Prefer':'return=minimal'},
    body: JSON.stringify({
      status:'Processing',
      payment_id: rzp_payment_id,
      paid_at: new Date().toISOString()
    })
  });
  if(!updRes.ok){
    const txt=await updRes.text();
    return json({error:'Failed to update order', detail:txt},500);
  }

  /* Decrement stock — best-effort per-item; non-fatal if it fails. */
  for(const it of (order.items||[])){
    await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/decrement_stock`, {
      method:'POST',
      headers:{...sb,'Content-Type':'application/json'},
      body: JSON.stringify({p_id: it.id, p_qty: it.qty})
    }).catch(()=>{});
  }
  if(order.coupon){
    await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/increment_coupon`,{
      method:'POST',
      headers:{...sb,'Content-Type':'application/json'},
      body: JSON.stringify({p_code: order.coupon})
    }).catch(()=>{});
  }

  /* 4. Fire order-confirmation email (best-effort). Resend's free tier
   *    is 100/day and 3000/month — plenty for early traffic. */
  if(env.RESEND_API_KEY && order.customer && order.customer.email){
    const html = renderConfirmationHtml(order);
    fetch('https://api.resend.com/emails', {
      method:'POST',
      headers:{
        'Authorization':'Bearer '+env.RESEND_API_KEY,
        'Content-Type':'application/json'
      },
      body: JSON.stringify({
        from: env.RESEND_FROM || 'Niks Masala <orders@niksmasala.com>',
        to: [order.customer.email],
        subject: `Order ${order.id} confirmed — Niks Masala`,
        html
      })
    }).catch(()=>{});
  }

  return json({ok:true});
};

/* ---------- Crypto helpers ---------- */
async function hmacSha256Hex(secret, message){
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret),
    {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function timingSafeEqual(a,b){
  if(a.length!==b.length) return false;
  let r=0; for(let i=0;i<a.length;i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r===0;
}

function renderConfirmationHtml(o){
  const c = o.customer || {};
  const rows = (o.items||[]).map(i=>`
    <tr>
      <td style="padding:8px 4px;border-bottom:1px solid #eee">${escapeHtml(i.name)} <small style="color:#888">(${escapeHtml(i.pack||'')})</small></td>
      <td style="padding:8px 4px;border-bottom:1px solid #eee;text-align:center">${i.qty}</td>
      <td style="padding:8px 4px;border-bottom:1px solid #eee;text-align:right">₹${i.price*i.qty}</td>
    </tr>`).join('');
  return `<!doctype html>
  <html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222">
    <h2 style="color:#b8321a">Thank you for your order!</h2>
    <p>Hi ${escapeHtml(c.name||'')}, we've received order <strong>${escapeHtml(o.id)}</strong> and it's being prepared at our Mangalore facility.</p>
    <table style="width:100%;border-collapse:collapse;margin:18px 0">
      <thead><tr style="background:#fff6e4;color:#222"><th style="text-align:left;padding:8px">Item</th><th style="padding:8px">Qty</th><th style="padding:8px;text-align:right">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p>Subtotal: ₹${o.subtotal}<br>Shipping: ${o.shipping?'₹'+o.shipping:'FREE'}${o.discount?'<br>Discount: -₹'+o.discount:''}</p>
    <p style="font-size:18px"><strong>Total: ₹${o.total}</strong></p>
    <p>Shipping to:<br>${escapeHtml(c.address||'')}, ${escapeHtml(c.city||'')}, ${escapeHtml(c.state||'')} ${escapeHtml(c.pincode||'')}<br>📞 ${escapeHtml(c.phone||'')}</p>
    <p>Track your order: <a href="https://niksmasala.com/track.html?id=${encodeURIComponent(o.id)}" style="color:#b8321a">https://niksmasala.com/track.html?id=${encodeURIComponent(o.id)}</a></p>
    <p style="font-size:12px;color:#888;margin-top:32px">Iniha Exports Pvt Ltd · GSTIN 29AAFCI2793E1ZD · Yeyyadi, Mangaluru 575015</p>
  </body></html>`;
}
function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function json(obj, status=200){
  return new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}});
}
