/* GET /api/products
 *
 * Public, read-only catalog endpoint. Returns every product row from
 * Supabase as JSON. Shop, homepage and product-detail pages call this
 * so admin edits show up live without redeploying.
 *
 * Response shape:
 *   [ {id, name, slug, category, price, image, variants, badge, stock, description, long_desc}, ... ]
 *
 * The browser keeps a localStorage copy as an offline cache and as a
 * baseline so the page renders instantly while the fresh fetch lands.
 *
 * Env vars:
 *   SUPABASE_URL              https://....supabase.co
 *   SUPABASE_SERVICE_ROLE     used here to bypass RLS (the table is
 *                             world-readable anyway, but service_role
 *                             gives consistent server behaviour)
 */

export const onRequestGet = async ({env}) => {
  if(!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE){
    return json({error:'Supabase not configured'},500);
  }
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/products?select=id,name,slug,category,price,old_price,weight,image,variants,description,long_desc,badge,stock&order=id`,
    { headers: sbHeaders(env) }
  );
  if(!res.ok){
    const txt = await res.text();
    return json({error:'Catalog fetch failed', detail:txt}, 502);
  }
  const rows = await res.json();
  /* Map DB shape → app shape (description → desc, long_desc → long) */
  const products = rows.map(r => ({
    id:        r.id,
    name:      r.name,
    slug:      r.slug,
    category:  r.category,
    price:     +r.price,
    oldPrice:  r.old_price != null ? +r.old_price : undefined,
    weight:    r.weight || '',
    image:     r.image || '',
    variants:  Array.isArray(r.variants) ? r.variants : [],
    desc:      r.description || '',
    long:      r.long_desc || '',
    badge:     r.badge || null,
    stock:     +r.stock
  }));
  /* Tell Cloudflare to cache for 60s at the edge — repeated visits are
     instant. Bumped by admin writes via X-Purge-Cache header (TODO). */
  return new Response(JSON.stringify(products), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60, s-maxage=60'
    }
  });
};

function sbHeaders(env){
  return {
    'apikey':        env.SUPABASE_SERVICE_ROLE,
    'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE
  };
}
function json(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status, headers:{'Content-Type':'application/json'}
  });
}
