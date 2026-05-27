/* POST /api/admin/ship
 *
 * One-click "ship this order" for the admin. Reads the order from
 * Supabase, pushes it to Shiprocket, gets an AWB + courier, schedules
 * pickup, generates the shipping label PDF, then writes everything
 * back into the same row.
 *
 * Body: { order_id: "NM26-XXXXXXXXXX" }
 * Auth: Authorization: Bearer <ADMIN_TOKEN>   (same model as /api/admin/products)
 *
 * Response on success (201):
 *   { ok:true, awb, courier, label_url, pickup_scheduled }
 * Response if order already shipped (200):
 *   { ok:true, already:true, awb, courier, label_url }
 * Response if Shiprocket can't find a courier (502):
 *   { error:"...", shiprocket_order_id, shiprocket_shipment_id }
 *   — the order EXISTS in Shiprocket; admin can manually assign AWB
 *     from the SR dashboard. We persist the IDs so it's recoverable.
 *
 * Idempotent: if order.awb is already set, returns the existing value
 * instead of double-creating in Shiprocket. The merchant never gets
 * billed twice for the same shipment even on rage-click.
 *
 * Rate-limited upstream by functions/_middleware.js (10/min/IP).
 */

import {
  srCreateOrder, srAssignAWB, srGeneratePickup, srGenerateLabel
} from '../../_lib/shiprocket.js';

export const onRequestPost = async ({request, env}) => {
  /* Bearer auth — same timing-safe compare used by /api/admin/products */
  const authHdr = request.headers.get('Authorization') || '';
  const tok = authHdr.replace(/^Bearer\s+/i, '');
  if(!env.ADMIN_TOKEN || !timingSafeEq(tok, env.ADMIN_TOKEN)){
    return json({error: 'Unauthorized'}, 401);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({error: 'Invalid JSON'}, 400); }
  const order_id = String(body.order_id || '').trim();
  if(!/^[A-Za-z0-9_-]{1,40}$/.test(order_id)){
    return json({error: 'Missing or invalid order_id'}, 400);
  }

  /* Load the order from Supabase */
  const sb = {
    'apikey': env.SUPABASE_SERVICE_ROLE,
    'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE
  };
  const oRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(order_id)}&select=*`,
    {headers: sb}
  );
  if(!oRes.ok) return json({error: 'Order lookup failed'}, 502);
  const rows = await oRes.json();
  if(!rows.length) return json({error: 'Order not found'}, 404);
  const o = rows[0];

  /* Idempotent short-circuit */
  if(o.awb){
    return json({
      ok: true, already: true,
      awb: o.awb, courier: o.courier || '', label_url: o.label_url || ''
    });
  }

  /* Refuse to ship un-paid prepaid orders (COD is allowed, even though
     we currently don't expose COD in the UI). */
  if(o.payment !== 'COD' && !o.payment_id){
    return json({error: 'Order is not paid yet — cannot ship.'}, 400);
  }

  /* Total package weight, kg, floor 0.1 (SR rejects 0) */
  const items = Array.isArray(o.items) ? o.items : [];
  let totalGrams = 0;
  for(const it of items) totalGrams += (Number(it.grams) || 100) * (Number(it.qty) || 1);
  const weightKg = Math.max(0.1, Math.round((totalGrams / 1000) * 100) / 100);

  /* Build the Shiprocket create-order payload */
  const cust = o.customer || {};
  const nameParts = String(cust.name || '').trim().split(/\s+/);
  const billing_customer_name = nameParts[0] || (cust.name || 'Customer');
  const billing_last_name = nameParts.slice(1).join(' ') || '.';   // SR insists on non-empty

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
  try { created = await srCreateOrder(env, payload); }
  catch (e) { return json({error: e.message}, 502); }

  const shipment_id = created.shipment_id;
  const sr_order_id = created.order_id;
  if(!shipment_id){
    return json({error: 'Shiprocket did not return shipment_id', detail: created}, 502);
  }

  /* 2. Assign AWB. If this step fails the SR order still exists, so
     we persist the IDs first then surface the failure — the merchant
     can finish the assignment manually in the SR dashboard and the
     idempotency check (above) will short-circuit future clicks. */
  let awb;
  try { awb = await srAssignAWB(env, shipment_id); }
  catch (e) {
    await patchOrder(env, sb, o.id, {
      shiprocket_order_id: String(sr_order_id || ''),
      shiprocket_shipment_id: String(shipment_id)
    });
    return json({
      error: 'Order created in Shiprocket but AWB assignment failed. Assign manually from your Shiprocket dashboard.',
      detail: e.message,
      shiprocket_order_id: sr_order_id,
      shiprocket_shipment_id: shipment_id
    }, 502);
  }

  /* 3. Schedule pickup + 4. Generate label.
     These can fail without blocking the response — the AWB exists,
     pickup can be scheduled later, label can be re-generated. */
  let pickupResp = null;
  let labelResp = null;
  try { pickupResp = await srGeneratePickup(env, shipment_id); } catch(_){}
  try { labelResp  = await srGenerateLabel(env, shipment_id); }  catch(_){}

  /* 5. Persist everything back */
  const courierName = awb.courier_name || '';
  const awbCode     = awb.awb_code || '';
  const labelUrl    = (labelResp && labelResp.label_url) || '';
  const updates = {
    shiprocket_order_id:    String(sr_order_id || ''),
    shiprocket_shipment_id: String(shipment_id),
    awb:                    awbCode,
    courier:                courierName,
    label_url:              labelUrl,
    tracking_status:        'shipped',
    status:                 'Shipped',
    /* Backwards-compat: keep the free-text AWB note that admin.html +
       track.html have rendered since day one. */
    tracking_notes: (courierName || 'Courier') + ' ' + awbCode
  };
  await patchOrder(env, sb, o.id, updates);

  return json({
    ok: true,
    awb: awbCode,
    courier: courierName,
    label_url: labelUrl,
    pickup_scheduled: !!(pickupResp && (
      pickupResp.pickup_status === 1 ||
      (pickupResp.response && pickupResp.response.pickup_scheduled_date)
    ))
  });
};

async function patchOrder(env, sb, id, fields){
  return fetch(
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
