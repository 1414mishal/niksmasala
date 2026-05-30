/* POST /api/admin/ship
 *
 * One-click "ship this order" for the admin. Reads the order from
 * Supabase, validates + claims it, then runs the entire Shiprocket flow
 * (create order → assign AWB → schedule pickup → generate label) in a
 * waitUntil BACKGROUND task. Responds to the browser in <1 second.
 *
 * Body: { order_id: "NM26-XXXXXXXXXX" }
 * Auth: Authorization: Bearer <ADMIN_TOKEN>
 *
 * Response shape:
 *   200 + {ok:true, queued:true, ...}        — shipping started in background
 *   200 + {ok:true, already:true, awb, ...}  — order was already shipped (idempotent)
 *   400/401/404 + {error}                    — validation/auth/lookup failure
 *
 * Why background? Shiprocket's create-order + assign-AWB calls together
 * routinely take 8-15 seconds, which pushes the synchronous response past
 * Cloudflare Pages Functions' wall-time + CPU limits. That kills the
 * function externally with a bare 502 the try/catch can never reach.
 * Moving everything except the order-claim into waitUntil cuts the
 * response-path to a single fast Supabase query, so a 502 becomes
 * structurally impossible — the response is already on the wire.
 *
 * The admin sees the AWB on the NEXT refresh of /admin (background task
 * patches the row). On failure, tracking_notes is set to the error and
 * status flips to 'ShipError' so it's visible without log-diving.
 *
 * Rate-limited upstream by functions/_middleware.js (30/min/IP).
 */

const SR_BASE = 'https://apiv2.shiprocket.in/v1/external';
let _srToken = null, _srExp = 0;

/* Build marker — confirm WHICH version is live via GET /api/admin/ship. */
const SHIP_BUILD = 'ship-2026-bg-v6';

/* Hard per-request timeout on every outbound fetch. AbortSignal.timeout()
   is missing on older Workers compat dates, so we use an explicit
   AbortController + setTimeout to be portable. */
const FETCH_TIMEOUT_MS = 9000;
function tfetch(url, init){
  const ctrl = new AbortController();
  const timer = setTimeout(() => { try { ctrl.abort(); } catch(_){} }, FETCH_TIMEOUT_MS);
  const opts = {...(init || {}), signal: ctrl.signal};
  return fetch(url, opts).finally(() => clearTimeout(timer));
}

/* GET /api/admin/ship — unauthenticated health check (booleans only, no
   secret values). Visit https://niksmasala.com/api/admin/ship to confirm
   which build is live and which env vars are populated. */
export async function onRequestGet({request, env}){
  const url = new URL(request.url);
  const test = url.searchParams.get('test');

  if(test === 'auth'){
    const t0 = Date.now();
    try {
      const tok = await srToken(env);
      return json({ok:true, step:'auth', tookMs: Date.now()-t0,
        tokenPreview: String(tok||'').slice(0,10)+'…', build: SHIP_BUILD});
    } catch(e){
      return json({ok:false, step:'auth', tookMs: Date.now()-t0,
        error: String(e && e.message ? e.message : e), build: SHIP_BUILD}, 200);
    }
  }

  if(test === 'ping'){
    const t0 = Date.now();
    try {
      const r = await tfetch(SR_BASE + '/auth/login', {method:'POST',
        headers:{'Content-Type':'application/json'}, body: JSON.stringify({email:'x',password:'x'})});
      return json({ok:true, step:'ping', tookMs: Date.now()-t0, status: r.status, build: SHIP_BUILD});
    } catch(e){
      return json({ok:false, step:'ping', tookMs: Date.now()-t0,
        error: String(e && e.message ? e.message : e), build: SHIP_BUILD}, 200);
    }
  }

  return json({
    ok: true,
    build: SHIP_BUILD,
    message: 'ship endpoint alive',
    hasAdminToken:        !!(env.ADMIN_TOKEN && env.ADMIN_TOKEN.trim()),
    hasShiprocketEmail:   !!env.SHIPROCKET_EMAIL,
    hasShiprocketPassword:!!env.SHIPROCKET_PASSWORD,
    pickupLocation:       env.SHIPROCKET_PICKUP_LOCATION || 'Primary'
  });
}

export async function onRequestPost(ctx){
  /* Catch-all wrapper. Plain function declaration, no module-load
     gotchas. If the synchronous path ever throws, the user gets readable
     JSON instead of a bare 502. */
  try { return await handleShip(ctx); }
  catch (e) {
    console.log('ship: SYNC PATH THREW', e && e.stack || e);
    return json({error: 'Ship handler error: ' + (e && e.message ? e.message : String(e)), build: SHIP_BUILD}, 500);
  }
}

async function handleShip(ctx){
  const {request, env} = ctx;
  const t0 = Date.now();

  /* Bearer auth — trim both sides; the stored token loses trailing
     whitespace on its way through login/products/orders, while the env
     var pasted into Cloudflare may still carry one. Without trimming,
     a token that works for every OTHER admin endpoint would 401 here. */
  const authHdr = request.headers.get('Authorization') || '';
  const tok = authHdr.replace(/^Bearer\s+/i, '').trim();
  const expected = (env.ADMIN_TOKEN || '').trim();
  if(!expected || !timingSafeEq(tok, expected)){
    return json({error: 'Unauthorized'}, 401);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({error: 'Invalid JSON'}, 400); }
  const order_id = String(body.order_id || '').trim();
  if(!/^[A-Za-z0-9_-]{1,40}$/.test(order_id)){
    return json({error: 'Missing or invalid order_id'}, 400);
  }

  console.log('ship:', order_id, 'start');

  const sb = {
    'apikey': env.SUPABASE_SERVICE_ROLE,
    'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE
  };

  /* 1. Load the order — fast (~200ms) */
  const oRes = await tfetch(
    `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(order_id)}&select=*`,
    {headers: sb}
  );
  if(!oRes.ok) return json({error: 'Order lookup failed'}, 502);
  const rows = await oRes.json();
  if(!rows.length) return json({error: 'Order not found'}, 404);
  const o = rows[0];

  /* 2. Idempotent short-circuit. If AWB exists, return it immediately —
     never double-create in Shiprocket on a rage-click. */
  if(o.awb){
    console.log('ship:', order_id, 'already shipped, awb=', o.awb);
    return json({
      ok: true, already: true,
      awb: o.awb, courier: o.courier || '', label_url: o.label_url || ''
    });
  }

  /* 3. Refuse to ship un-paid prepaid orders. */
  if(o.payment !== 'COD' && !o.payment_id){
    return json({error: 'Order is not paid yet — cannot ship.'}, 400);
  }

  /* 4. Claim the order — flip status to 'Shipping' so a second click
     while the background is running sees something is in flight. The
     idempotency check above (o.awb) is what actually prevents
     double-create; this status flip is for the UI. */
  await patchOrder(env, sb, o.id, {
    status: 'Shipping',
    tracking_notes: 'Shipping in progress…'
  });

  /* 5. Fire-and-forget the Shiprocket flow. waitUntil() keeps the
     function alive AFTER the response is sent so the background work
     can finish; failures here cannot affect the response that's already
     on the wire. */
  const bg = runShiprocketFlow(env, sb, o).catch(err => {
    console.log('ship:', order_id, 'BG UNCAUGHT', err && err.stack || err);
  });
  if(ctx && typeof ctx.waitUntil === 'function'){ ctx.waitUntil(bg); }

  console.log('ship:', order_id, 'response sent in', Date.now()-t0, 'ms (bg running)');

  return json({
    ok: true,
    queued: true,
    build: SHIP_BUILD,
    message: 'Shipping started — AWB will appear in ~20-30 seconds. Click Refresh to see it.'
  });
}

/* The actual Shiprocket flow, all in background via waitUntil. Each step
   logs its outcome + timing so failures are diagnosable from Cloudflare
   Real-time logs. Final outcome is patched back to the orders row so the
   admin sees the result on next refresh — success populates awb/courier,
   failure populates tracking_notes with the error reason. */
async function runShiprocketFlow(env, sb, o){
  const id = o.id;
  const t0 = Date.now();
  console.log('ship:', id, 'BG start');

  /* Total package weight in kg, floored at 0.5 kg — Shiprocket bills a
     0.5 kg minimum regardless, and declaring less than the actual packed
     weight risks a weight-discrepancy penalty when the courier weighs
     the parcel. */
  const items = Array.isArray(o.items) ? o.items : [];
  let totalGrams = 0;
  for(const it of items) totalGrams += (Number(it.grams) || 100) * (Number(it.qty) || 1);
  const weightKg = Math.max(0.5, Math.round((totalGrams / 1000) * 100) / 100);

  const cust = o.customer || {};
  const nameParts = String(cust.name || '').trim().split(/\s+/);
  const billing_customer_name = nameParts[0] || (cust.name || 'Customer');
  const billing_last_name = nameParts.slice(1).join(' ') || '.';   // SR requires non-empty

  const PICKUP = env.SHIPROCKET_PICKUP_LOCATION || 'Primary';
  const orderDate = (o.date || o.created_at || new Date().toISOString());

  const payload = {
    order_id: o.id,
    order_date: String(orderDate).slice(0, 19).replace('T', ' '),
    pickup_location: PICKUP,
    channel_id: '',
    comment: '',
    billing_customer_name,
    billing_last_name,
    billing_address: String(cust.address || ''),
    billing_city: String(cust.city || ''),
    billing_pincode: String(cust.pincode || cust.pin || ''),
    billing_state: String(cust.state || ''),
    billing_country: 'India',
    billing_email: String(cust.email || ''),
    billing_phone: String(cust.phone || ''),
    shipping_is_billing: true,
    order_items: items.map(it => ({
      name: String(it.name || it.pack || 'Spice').slice(0, 100),
      sku: (String(it.id || 'sku') + '-' + String(it.pack || '').replace(/\s+/g,'-')).slice(0, 50),
      units: Math.max(1, Number(it.qty) || 1),
      selling_price: Number(it.price) || 0,
      discount: 0,
      tax: 0,
      hsn: 0
    })),
    payment_method: (o.payment === 'COD') ? 'COD' : 'Prepaid',
    sub_total: Number(o.subtotal) || Number(o.total) || 0,
    length: +env.SHIPROCKET_DIM_L || 15,
    breadth: +env.SHIPROCKET_DIM_B || 10,
    height: +env.SHIPROCKET_DIM_H || 8,
    weight: weightKg
  };

  /* 1. Create the order in Shiprocket */
  let created;
  try {
    const t1 = Date.now();
    created = await srCreateOrder(env, payload);
    console.log('ship:', id, 'BG createOrder ok in', Date.now()-t1, 'ms shipment_id=', created.shipment_id);
  } catch (e) {
    console.log('ship:', id, 'BG createOrder FAILED:', e.message);
    await markFailure(env, sb, id, 'Shiprocket order create failed: ' + e.message);
    return;
  }

  const shipment_id = created.shipment_id;
  const sr_order_id = created.order_id;
  if(!shipment_id){
    console.log('ship:', id, 'BG no shipment_id returned:', JSON.stringify(created).slice(0,200));
    await markFailure(env, sb, id, 'Shiprocket did not return shipment_id');
    return;
  }

  /* Persist the SR IDs now — even if AWB fails, the order EXISTS in
     Shiprocket and the admin can finish the assignment from there. */
  await patchOrder(env, sb, id, {
    shiprocket_order_id:    String(sr_order_id || ''),
    shiprocket_shipment_id: String(shipment_id)
  });

  /* 2. Assign AWB */
  let awb;
  try {
    const t2 = Date.now();
    awb = await srAssignAWB(env, shipment_id);
    console.log('ship:', id, 'BG assignAWB ok in', Date.now()-t2, 'ms awb=', awb.awb_code, 'courier=', awb.courier_name);
  } catch (e) {
    console.log('ship:', id, 'BG assignAWB FAILED:', e.message);
    await markFailure(env, sb, id, 'AWB assign failed (order exists in SR, assign manually): ' + e.message);
    return;
  }

  const courierName = awb.courier_name || '';
  const awbCode     = awb.awb_code || '';
  await patchOrder(env, sb, id, {
    awb:                    awbCode,
    courier:                courierName,
    tracking_status:        'shipped',
    status:                 'Shipped',
    tracking_notes: (courierName || 'Courier') + ' ' + awbCode
  });
  console.log('ship:', id, 'BG awb persisted, total so far', Date.now()-t0, 'ms');

  /* 3. Schedule pickup + 4. Generate label — slowest SR calls, last on
     purpose so the AWB is already live in the UI before these complete. */
  try {
    const t3 = Date.now();
    await srGeneratePickup(env, shipment_id);
    console.log('ship:', id, 'BG pickup ok in', Date.now()-t3, 'ms');
  } catch(e){
    console.log('ship:', id, 'BG pickup failed (non-fatal):', e.message);
  }

  try {
    const t4 = Date.now();
    const lab = await srGenerateLabel(env, shipment_id);
    const labelUrl = (lab && lab.label_url) || '';
    console.log('ship:', id, 'BG label ok in', Date.now()-t4, 'ms url=', labelUrl ? 'yes' : 'no');
    if(labelUrl) await patchOrder(env, sb, id, {label_url: labelUrl});
  } catch(e){
    console.log('ship:', id, 'BG label failed (non-fatal):', e.message);
  }

  console.log('ship:', id, 'BG complete in', Date.now()-t0, 'ms');
}

async function markFailure(env, sb, id, reason){
  try {
    await patchOrder(env, sb, id, {
      status: 'ShipError',
      tracking_notes: String(reason).slice(0, 400)
    });
  } catch(_) {}
}

async function patchOrder(env, sb, id, fields){
  return tfetch(
    `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: {...sb, 'Content-Type': 'application/json'},
      body: JSON.stringify(fields)
    }
  );
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

/* ===== Shiprocket REST client (inlined; was functions/_lib/shiprocket.js) ===== */
async function srToken(env){
  if(!env.SHIPROCKET_EMAIL || !env.SHIPROCKET_PASSWORD){
    throw new Error('Shiprocket not configured — set SHIPROCKET_EMAIL + SHIPROCKET_PASSWORD in Cloudflare env vars.');
  }
  const now = Date.now();
  if(_srToken && _srExp > now + 3_600_000) return _srToken;
  const res = await tfetch(SR_BASE + '/auth/login', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({email: env.SHIPROCKET_EMAIL, password: env.SHIPROCKET_PASSWORD})
  });
  if(!res.ok){
    throw new Error('Shiprocket login failed (check SHIPROCKET_EMAIL/PASSWORD): ' + (await res.text()).slice(0,180));
  }
  const j = await res.json();
  if(!j.token) throw new Error('Shiprocket login returned no token: ' + JSON.stringify(j).slice(0,180));
  _srToken = j.token; _srExp = now + 9*24*60*60*1000;
  return _srToken;
}
async function srFetch(env, path, init = {}){
  const tok = await srToken(env);
  const headers = {...(init.headers||{}), 'Content-Type':'application/json', 'Authorization':'Bearer '+tok};
  let res = await tfetch(SR_BASE + path, {...init, headers});
  if(res.status === 401){
    _srToken = null; _srExp = 0;
    const tok2 = await srToken(env);
    res = await tfetch(SR_BASE + path, {...init, headers:{...headers,'Authorization':'Bearer '+tok2}});
  }
  return res;
}
async function srCreateOrder(env, payload){
  const r = await srFetch(env, '/orders/create/adhoc', {method:'POST', body: JSON.stringify(payload)});
  const j = await r.json().catch(()=>({}));
  if(!r.ok){
    const msg = j.message || (j.errors && JSON.stringify(j.errors)) || JSON.stringify(j);
    throw new Error('Shiprocket order create failed: ' + String(msg).slice(0,220));
  }
  return j;
}
async function srAssignAWB(env, shipment_id, courier_id){
  const body = {shipment_id}; if(courier_id) body.courier_id = courier_id;
  const r = await srFetch(env, '/courier/assign/awb', {method:'POST', body: JSON.stringify(body)});
  const j = await r.json().catch(()=>({}));
  const data = j && j.response && j.response.data;
  if(!r.ok || !data || !data.awb_code){
    const msg = j.message || (data && data.message) || JSON.stringify(j);
    throw new Error('AWB assignment failed: ' + String(msg).slice(0,220));
  }
  return data;
}
async function srGeneratePickup(env, shipment_id){
  const r = await srFetch(env, '/courier/generate/pickup', {method:'POST', body: JSON.stringify({shipment_id: Array.isArray(shipment_id)?shipment_id:[shipment_id]})});
  return r.json().catch(()=>({}));
}
async function srGenerateLabel(env, shipment_id){
  const r = await srFetch(env, '/courier/generate/label', {method:'POST', body: JSON.stringify({shipment_id: Array.isArray(shipment_id)?shipment_id:[shipment_id]})});
  return r.json().catch(()=>({}));
}
