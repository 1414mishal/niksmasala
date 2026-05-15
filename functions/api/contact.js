/* POST /api/contact
 * Stores a contact-form message + sends a notification email to ops.
 */
export const onRequestPost = async ({request, env}) => {
  let body; try { body = await request.json(); } catch { return json({error:'Invalid JSON'},400); }
  const {name='', email='', phone='', subject='', msg=''} = body;
  if(!name.trim() || !email.trim() || !msg.trim()) return json({error:'Missing required fields'},400);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({error:'Invalid email'},400);
  if(msg.length>5000) return json({error:'Message too long'},400);

  const sb = {
    'apikey': env.SUPABASE_SERVICE_ROLE,
    'Authorization': 'Bearer '+env.SUPABASE_SERVICE_ROLE,
    'Content-Type':'application/json',
    'Prefer':'return=minimal'
  };
  const ins = await fetch(`${env.SUPABASE_URL}/rest/v1/messages`,{
    method:'POST', headers:sb,
    body: JSON.stringify({name,email:email.toLowerCase(),phone,subject,msg})
  });
  if(!ins.ok) return json({error:'Save failed'},500);

  /* Best-effort notification email to ops */
  if(env.RESEND_API_KEY && env.OPS_EMAIL){
    fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{'Authorization':'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
      body: JSON.stringify({
        from: env.RESEND_FROM || 'Niks Masala <noreply@niksmasala.com>',
        to:[env.OPS_EMAIL],
        reply_to: email,
        subject:`[Niks] ${subject||'Contact form'} — ${name}`,
        html:`<p><strong>From:</strong> ${esc(name)} &lt;${esc(email)}&gt;<br><strong>Phone:</strong> ${esc(phone)}<br><strong>Subject:</strong> ${esc(subject)}</p><pre style="white-space:pre-wrap;font-family:inherit">${esc(msg)}</pre>`
      })
    }).catch(()=>{});
  }

  return json({ok:true});
};
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function json(o,s=200){return new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}})}
