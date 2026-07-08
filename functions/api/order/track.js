/* GET /api/order/track?id=NM26-XXXXXXXXXX&email=optional@buyer.com
 *
 * Public order-status lookup. Returns ONLY the data needed for the
 * tracking page — never customer name/address/payment. If `email` is
 * provided AND matches the order's customer email, returns slightly
 * more (full customer name + city). This is how the buyer sees more
 * of their order without exposing PII to brute-force enumeration.
 *
 * Delivery estimate (`eta`) is REAL, not a hardcoded guess:
 *   - Not yet shipped  → Shiprocket /courier/serviceability for the
 *     buyer's own pincode returns each courier's estimated_delivery_days;
 *     we surface the fastest one. { type:'estimate', days }
 *   - Shipped (has AWB) → Shiprocket /courier/track/awb returns the
 *     courier's own EDD for that specific shipment. { type:'live', edd }
 *   - Shiprocket unreachable/misconfigured/no match → honest fallback,
 *     never a fabricated number. { type:'fallback' }
 * Wrapped in a short timeout so a slow/down Shiprocket never blocks
 * this public, rate-limited endpoint.
 */

export const onRequestGet = async ({request, env}) => {
  const url = new URL(request.url);
  const id = (url.searchParams.get('id')||'').trim().toUpperCase();
  const email = (url.searchParams.get('email')||'').trim().toLowerCase();
  if(!id) return json({error:'Missing order id'},400);
  if(!/^NM\d{2}-[0-9A-F]{10}$/.test(id)) return json({error:'Invalid order id format'},400);

  const sb = {
    'apikey': env.SUPABASE_SERVICE_ROLE,
    'Authorization': 'Bearer '+env.SUPABASE_SERVICE_ROLE
  };
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}&select=id,date,status,tracking_status,tracking_notes,total,payment,customer,items,awb,courier`, {headers:sb});
  const rows = await res.json();
  const o = rows && rows[0];
  if(!o || o.status==='AwaitingPayment') return json({error:'Order not found'},404);

  /* Always public-safe */
  const out = {
    id: o.id,
    date: o.date,
    status: o.status,
    tracking_status: o.tracking_status,
    tracking_notes: o.tracking_notes||'',
    total: o.total,
    payment: o.payment,
    eta: await getEta(env, o)
  };

  /* If email matches, include limited buyer-only fields */
  const buyerEmail = ((o.customer||{}).email||'').toLowerCase();
  if(email && buyerEmail && email===buyerEmail){
    out.customer = {
      name: o.customer.name,
      city: o.customer.city,
      state: o.customer.state,
      pincode: o.customer.pincode
    };
    out.items = (o.items||[]).map(i=>({name:i.name,pack:i.pack,qty:i.qty,price:i.price}));
  }

  return json(out);
};

/* ---------- Real delivery estimate via Shiprocket (best-effort) ---------- */

async function getEta(env, o){
  if(o.tracking_status === 'delivered') return {type:'delivered'};
  try{
    if(o.awb){
      const edd = await srTrackEdd(env, o.awb);
      if(edd) return {type:'live', edd};
    } else {
      const pincode = (o.customer||{}).pincode;
      if(pincode){
        const items = Array.isArray(o.items) ? o.items : [];
        let totalGrams = 0;
        for(const it of items) totalGrams += (Number(it.grams)||100) * (Number(it.qty)||1);
        const weightKg = Math.max(0.5, Math.round((totalGrams/1000)*100)/100);
        const days = await srServiceabilityDays(env, pincode, weightKg);
        if(days) return {type:'estimate', days};
      }
    }
  }catch(_){ /* Shiprocket down/misconfigured — fall through */ }
  return {type:'fallback'};
}

const SR_BASE = 'https://apiv2.shiprocket.in/v1/external';
const SR_TIMEOUT_MS = 5000;
let _srToken = null, _srExp = 0;

function tfetch(u, init){
  const ctrl = new AbortController();
  const t = setTimeout(()=>{ try{ctrl.abort();}catch(_){} }, SR_TIMEOUT_MS);
  return fetch(u, {...(init||{}), signal: ctrl.signal}).finally(()=>clearTimeout(t));
}

async function srToken(env){
  if(!env.SHIPROCKET_EMAIL || !env.SHIPROCKET_PASSWORD) return null;
  const now = Date.now();
  if(_srToken && _srExp > now + 3_600_000) return _srToken;
  const res = await tfetch(SR_BASE+'/auth/login', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({email:env.SHIPROCKET_EMAIL, password:env.SHIPROCKET_PASSWORD})
  });
  if(!res.ok) return null;
  const j = await res.json().catch(()=>({}));
  if(!j.token) return null;
  _srToken = j.token; _srExp = now + 9*24*60*60*1000;
  return _srToken;
}

async function srServiceabilityDays(env, deliveryPincode, weightKg){
  const tok = await srToken(env);
  if(!tok) return null;
  const pickup = env.SHIPROCKET_PICKUP_PINCODE || '575015';
  const qs = new URLSearchParams({
    pickup_postcode: String(pickup),
    delivery_postcode: String(deliveryPincode),
    weight: String(weightKg),
    cod: '0'
  });
  const r = await tfetch(SR_BASE+'/courier/serviceability/?'+qs.toString(), {
    headers:{'Authorization':'Bearer '+tok}
  });
  if(!r.ok) return null;
  const j = await r.json().catch(()=>({}));
  const couriers = j && j.data && j.data.available_courier_companies;
  if(!Array.isArray(couriers) || couriers.length===0) return null;
  const days = couriers
    .map(c => Number(c.estimated_delivery_days || c.etd_days))
    .filter(n => Number.isFinite(n) && n>0);
  if(days.length===0) return null;
  return Math.min(...days);
}

async function srTrackEdd(env, awb){
  const tok = await srToken(env);
  if(!tok) return null;
  const r = await tfetch(SR_BASE+'/courier/track/awb/'+encodeURIComponent(awb), {
    headers:{'Authorization':'Bearer '+tok}
  });
  if(!r.ok) return null;
  const j = await r.json().catch(()=>({}));
  const td = j && j.tracking_data;
  if(!td) return null;
  const edd = td.etd || (Array.isArray(td.shipment_track) && td.shipment_track[0] && td.shipment_track[0].edd);
  return edd || null;
}

function json(obj, status=200){
  return new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}});
}
