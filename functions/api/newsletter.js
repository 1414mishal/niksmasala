/* POST /api/newsletter
 * Stores a newsletter signup. Idempotent (UPSERT on email).
 */
export const onRequestPost = async ({request, env}) => {
  let body; try { body = await request.json(); } catch { return json({error:'Invalid JSON'},400); }
  const email = String(body.email||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({error:'Invalid email'},400);

  const sb = {
    'apikey': env.SUPABASE_SERVICE_ROLE,
    'Authorization': 'Bearer '+env.SUPABASE_SERVICE_ROLE,
    'Content-Type':'application/json',
    'Prefer':'resolution=merge-duplicates,return=minimal'
  };
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/newsletter?on_conflict=email`,{
    method:'POST', headers:sb,
    body: JSON.stringify({email})
  });
  if(!res.ok) return json({error:'Save failed'},500);
  return json({ok:true});
};
function json(o,s=200){return new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}})}
