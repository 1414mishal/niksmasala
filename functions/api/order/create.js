/* POST /api/order/create
 *
 * Receives a cart from the browser and returns a Razorpay `order_id`.
 *
 * The browser MUST NOT be trusted with the amount. This function:
 *   1. Fetches the canonical price for each cart item from Supabase.
 *   2. Recomputes subtotal, shipping, discount, total.
 *   3. Validates the coupon against the `coupons` table (usage limits etc).
 *   4. Stores a Pending order row.
 *   5. Calls Razorpay `orders.create` with the SERVER total.
 *   6. Returns { order_id, amount, currency, key_id } to the browser.
 *
 * The browser then opens Razorpay with that `order_id`. After payment we
 * call /api/order/verify to HMAC-check the signature before marking it paid.
 *
 * Env vars (set in Cloudflare Pages → Settings → Environment variables):
 *   SUPABASE_URL              https://....supabase.co
 *   SUPABASE_SERVICE_ROLE     eyJhbGc...  (service_role, NOT anon)
 *   RAZORPAY_KEY_ID           rzp_test_... or rzp_live_...
 *   RAZORPAY_KEY_SECRET       (from Razorpay dashboard, server-side only)
 *   FREE_SHIPPING_THRESHOLD   799
 *   SHIPPING_FEE_LIGHT        60
 *   SHIPPING_FEE_HEAVY        120
 */

export const onRequestPost = async ({request, env}) => {
  let body;
  try { body = await request.json(); }
  catch { return json({error:'Invalid JSON'},400); }

  const {items=[], coupon='', customer={}, payment='UPI', notes=''} = body;
  if(!Array.isArray(items) || items.length===0) return json({error:'Cart is empty'},400);
  if(items.length>50) return json({error:'Cart too large'},400);

  /* 1. Look up canonical prices for each item */
  const ids = [...new Set(items.map(i=>i.id))];
  const sb = sbHeaders(env);
  const catalogRes = await fetch(`${env.SUPABASE_URL}/rest/v1/products?select=id,name,price,variants,stock&id=in.(${ids.map(encodeURIComponent).join(',')})`, {headers: sb});
  if(!catalogRes.ok) return json({error:'Catalog lookup failed'},502);
  const catalog = await catalogRes.json();
  const byId = Object.fromEntries(catalog.map(p=>[p.id,p]));

  let subtotal = 0;
  let totalWeight = 0;
  const lineItems = [];
  for(const it of items){
    const p = byId[it.id];
    if(!p) return json({error:`Unknown product ${it.id}`},400);
    /* Match variant by pack name (server-authoritative). */
    const variants = Array.isArray(p.variants)?p.variants:[];
    const v = variants.find(x=>x.pack===it.pack) || variants[0];
    if(!v) return json({error:`No variants for ${p.id}`},400);
    const qty = Math.max(1, Math.min(99, parseInt(it.qty,10)||1));
    if(p.stock!=null && p.stock < qty) return json({error:`${p.name}: only ${p.stock} in stock`},409);
    const price = Number(v.price);
    subtotal += price * qty;
    totalWeight += Number(v.grams||100) * qty;
    lineItems.push({
      id:p.id, name:p.name, pack:v.pack, grams:v.grams, price, qty
    });
  }

  /* 2. Shipping */
  const FREE_AT = +env.FREE_SHIPPING_THRESHOLD || 799;
  const FEE_LIGHT = +env.SHIPPING_FEE_LIGHT || 60;
  const FEE_HEAVY = +env.SHIPPING_FEE_HEAVY || 120;
  const shipping = subtotal >= FREE_AT ? 0 : (totalWeight >= 1000 ? FEE_HEAVY : FEE_LIGHT);

  /* 3. Coupon */
  let discount = 0;
  let couponRow = null;
  if(coupon){
    const cRes = await fetch(`${env.SUPABASE_URL}/rest/v1/coupons?code=eq.${encodeURIComponent(coupon.toUpperCase())}&select=*`,{headers:sb});
    const rows = await cRes.json();
    couponRow = rows && rows[0];
    if(!couponRow) return json({error:'Invalid coupon'},400);
    if(couponRow.expires_at && new Date(couponRow.expires_at) < new Date()) return json({error:'Coupon expired'},400);
    if(couponRow.max_redemptions!=null && couponRow.times_redeemed>=couponRow.max_redemptions) return json({error:'Coupon limit reached'},400);
    if(couponRow.min_subtotal && subtotal < couponRow.min_subtotal) return json({error:`Coupon requires ₹${couponRow.min_subtotal} minimum`},400);
    discount = couponRow.type==='percent'
      ? Math.round(subtotal * couponRow.value / 100)
      : Math.min(subtotal, couponRow.value);
  }

  const total = Math.max(1, subtotal + shipping - discount);

  /* 4. Validate customer minimally */
  const requiredCust = ['name','email','phone','address','city','state','pincode'];
  for(const f of requiredCust){
    if(!customer[f] || String(customer[f]).trim().length<2) return json({error:`Missing customer.${f}`},400);
  }
  if(!/^[1-9]\d{5}$/.test(customer.pincode)) return json({error:'Invalid pincode'},400);
  if(!/^[6-9]\d{9}$/.test(String(customer.phone).replace(/\D/g,'').slice(-10))) return json({error:'Invalid phone'},400);

  /* 5. Create internal order ID + Razorpay order */
  const orderId = makeOrderId();
  const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization':'Basic '+btoa(env.RAZORPAY_KEY_ID+':'+env.RAZORPAY_KEY_SECRET)
    },
    body: JSON.stringify({
      amount: total*100,   // paise
      currency:'INR',
      receipt: orderId,
      notes:{ internal_id: orderId }
    })
  });
  if(!rzpRes.ok){
    const text = await rzpRes.text();
    return json({error:'Razorpay error', detail:text},502);
  }
  const rzpOrder = await rzpRes.json();

  /* 6. Persist Pending order (server-of-truth totals) */
  const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/orders`, {
    method:'POST',
    headers:{...sb,'Content-Type':'application/json','Prefer':'return=minimal'},
    body: JSON.stringify({
      id: orderId,
      date: new Date().toISOString(),
      customer,
      notes,
      items: lineItems,
      subtotal, shipping, discount, total,
      payment,
      payment_id: null,
      status: 'AwaitingPayment',
      tracking_status: 'placed',
      rzp_order_id: rzpOrder.id,
      coupon: couponRow ? couponRow.code : null
    })
  });
  if(!insertRes.ok){
    const txt = await insertRes.text();
    return json({error:'Failed to save order', detail:txt},500);
  }

  return json({
    order_id: orderId,
    rzp_order_id: rzpOrder.id,
    amount: total*100,
    currency: 'INR',
    key_id: env.RAZORPAY_KEY_ID,
    /* Echo back for client to display — but the SERVER is the source of truth */
    breakdown:{ subtotal, shipping, discount, total }
  });
};

function sbHeaders(env){
  return {
    'apikey': env.SUPABASE_SERVICE_ROLE,
    'Authorization': 'Bearer '+env.SUPABASE_SERVICE_ROLE
  };
}

function makeOrderId(){
  const r = new Uint8Array(5); crypto.getRandomValues(r);
  const hex = Array.from(r).map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
  const yy = new Date().getFullYear().toString().slice(-2);
  return 'NM'+yy+'-'+hex;
}

function json(obj, status=200){
  return new Response(JSON.stringify(obj),{
    status, headers:{'Content-Type':'application/json'}
  });
}
