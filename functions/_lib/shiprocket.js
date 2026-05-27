/* Shiprocket REST client for Cloudflare Pages Functions.
 *
 * Cached JWT lives in a module-level binding — survives across
 * requests on the same worker instance (Shiprocket tokens last 10
 * days). Cold start re-fetches; the auth call is ~150ms once per
 * ~9 days per instance so it's effectively free.
 *
 * Env vars consumed by callers (not validated here):
 *   SHIPROCKET_EMAIL              login email (signup creates this)
 *   SHIPROCKET_PASSWORD           login password
 *   SHIPROCKET_PICKUP_LOCATION    pickup-address NAME set in their
 *                                 dashboard. Default: "Primary"
 *   SHIPROCKET_DIM_L/B/H          default package cm. Default 15/10/8
 *
 * Why a single auth call every ~9 days instead of per-request:
 *   Shiprocket charges no API quota but their auth endpoint is the
 *   slowest call in their suite (~150ms cold). Caching the bearer
 *   token shaves that off every shipment dispatch.
 */

const BASE = 'https://apiv2.shiprocket.in/v1/external';

let _cachedToken     = null;
let _cachedExpiresAt = 0;   // ms epoch

export async function srToken(env){
  if(!env.SHIPROCKET_EMAIL || !env.SHIPROCKET_PASSWORD){
    throw new Error('Shiprocket not configured. Set SHIPROCKET_EMAIL + SHIPROCKET_PASSWORD in Cloudflare env.');
  }
  const now = Date.now();
  /* Re-fetch 1 hour before nominal expiry so a long-running burst
     never trips on a freshly-expired token. */
  if(_cachedToken && _cachedExpiresAt > now + 3_600_000) return _cachedToken;

  const res = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      email: env.SHIPROCKET_EMAIL,
      password: env.SHIPROCKET_PASSWORD
    })
  });
  if(!res.ok){
    const t = await res.text();
    throw new Error('Shiprocket auth failed: ' + t.slice(0, 200));
  }
  const j = await res.json();
  if(!j.token) throw new Error('Shiprocket auth returned no token: ' + JSON.stringify(j).slice(0, 200));
  _cachedToken = j.token;
  /* Their docs say 240h (10 days). Hold 9 days to be safe. */
  _cachedExpiresAt = now + 9 * 24 * 60 * 60 * 1000;
  return _cachedToken;
}

/* Wrapped fetch: injects bearer header, retries once on 401 with a
   fresh token (handles the edge case where SR rotated the token
   mid-cache). All other failures bubble up unchanged. */
export async function srFetch(env, path, init = {}){
  const tok = await srToken(env);
  const headers = {
    ...(init.headers || {}),
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + tok
  };
  let res = await fetch(BASE + path, {...init, headers});
  if(res.status === 401){
    _cachedToken = null; _cachedExpiresAt = 0;
    const tok2 = await srToken(env);
    res = await fetch(BASE + path, {
      ...init,
      headers: {...headers, 'Authorization': 'Bearer ' + tok2}
    });
  }
  return res;
}

/* ----- Convenience wrappers around the endpoints we actually use ----- */

export async function srServiceability(env, {pickup_postcode, delivery_postcode, weight_kg, cod}){
  const qs = new URLSearchParams({
    pickup_postcode: String(pickup_postcode),
    delivery_postcode: String(delivery_postcode),
    weight: String(weight_kg),
    cod: cod ? '1' : '0'
  });
  const r = await srFetch(env, '/courier/serviceability/?' + qs.toString());
  if(!r.ok){
    const t = await r.text();
    throw new Error('Serviceability failed: ' + t.slice(0, 200));
  }
  return r.json();
}

export async function srCreateOrder(env, payload){
  const r = await srFetch(env, '/orders/create/adhoc', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  const j = await r.json().catch(() => ({}));
  if(!r.ok){
    throw new Error('Shiprocket order create failed: ' + (j.message || JSON.stringify(j)).slice(0, 200));
  }
  return j;
}

/* Assign AWB. If courier_id omitted, Shiprocket picks the recommended
   courier based on its serviceability + price logic.
   Response shape: { response: { status: 1, data: { awb_code, courier_name, ... } } } */
export async function srAssignAWB(env, shipment_id, courier_id){
  const body = {shipment_id};
  if(courier_id) body.courier_id = courier_id;
  const r = await srFetch(env, '/courier/assign/awb', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  /* SR returns 200 even on partial failures — the truth is in response.status */
  const data = j && j.response && j.response.data;
  if(!r.ok || !data || !data.awb_code){
    throw new Error('AWB assignment failed: ' + (j.message || (j.response && j.response.data && j.response.data.message) || JSON.stringify(j)).slice(0, 200));
  }
  return data;
}

export async function srGeneratePickup(env, shipment_id){
  const r = await srFetch(env, '/courier/generate/pickup', {
    method: 'POST',
    body: JSON.stringify({shipment_id: Array.isArray(shipment_id) ? shipment_id : [shipment_id]})
  });
  return r.json().catch(() => ({}));
}

export async function srGenerateLabel(env, shipment_id){
  const r = await srFetch(env, '/courier/generate/label', {
    method: 'POST',
    body: JSON.stringify({shipment_id: Array.isArray(shipment_id) ? shipment_id : [shipment_id]})
  });
  return r.json().catch(() => ({}));
}

export async function srTrack(env, awb){
  const r = await srFetch(env, '/courier/track/awb/' + encodeURIComponent(awb));
  if(!r.ok) throw new Error('Tracking failed: ' + (await r.text()).slice(0, 200));
  return r.json();
}
