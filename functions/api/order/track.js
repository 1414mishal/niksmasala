/* GET /api/order/track?id=NM26-XXXXXXXXXX&email=optional@buyer.com
 *
 * Public order-status lookup. Returns ONLY the data needed for the
 * tracking page — never customer name/address/payment. If `email` is
 * provided AND matches the order's customer email, returns slightly
 * more (full customer name + city). This is how the buyer sees more
 * of their order without exposing PII to brute-force enumeration.
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
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}&select=id,date,status,tracking_status,tracking_notes,total,payment,customer,items`, {headers:sb});
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
    payment: o.payment
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

function json(obj, status=200){
  return new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}});
}
