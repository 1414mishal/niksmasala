/* ========= NIKS MASALA — SHARED APP JS =========
 * Demo build. Issues that MUST be addressed before going live are
 * flagged with "TODO(backend):" — these require a server (Cloudflare
 * Worker / Vercel function / Supabase Edge Function) and CANNOT be
 * fixed in a static-site context. Do not accept real money until
 * those TODOs are closed.
 */

const LOGO = 'nikslogomain.jpg';

/* ---------- Safety helpers ---------- */
/* HTML-escape any string before it goes into innerHTML. Prevents stored XSS
   from admin-supplied product names, order notes, customer addresses, etc. */
function esc(s){
  if(s==null) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
/* attribute-context escape — same set, useful where context is an attr */
const attr = esc;
/* URL-encode for href/src */
function uri(s){ return encodeURIComponent(s==null?'':String(s)); }

/* SHA-256 hash for passwords (band-aid — a real backend with bcrypt is still required).
   Used so passwords are not stored in plaintext in localStorage or Supabase. */
async function hashPw(pw, salt){
  const data = new TextEncoder().encode((salt||'niks')+':'+(pw||''));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

/* Cryptographically random order ID — replaces predictable Date.now() */
function newOrderId(){
  const r = new Uint8Array(5); crypto.getRandomValues(r);
  const hex = Array.from(r).map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
  const yy = new Date().getFullYear().toString().slice(-2);
  return 'NM' + yy + '-' + hex;
}

/* ---------- Product image lookup ---------- */
const IMG = {
  turmeric:   'assets/products/turmeric.png',
  redchilli:  'assets/products/red-chilli.png',
  coriander:  'assets/products/coriander.png',
  jeera:      'assets/products/jeera.png',
  pepper:     'assets/products/pepper.png',
  kashmiri:   'assets/products/kashmiri.png',
  kitchenking:'assets/products/kitchen-king.png',
  sambar:     'assets/products/sambar.png',
  rasam:      'assets/products/rasam.png',
  puliyogare: 'assets/products/puliyogare.png',
  pulav:      'assets/products/pulav.png',
  chhole:     'assets/products/chhole.png',
  pavbhaji:   'assets/products/pav-bhaji.png',
  jaljeera:   'assets/products/jaljeera.jpg',
  kundapura:  'assets/products/kundapura.png',
  chicken:    'assets/products/chicken-masala.png',
  tandoori:   'assets/products/tandoori.png',
  tikka:      'assets/products/tikka.png',
  gheeRoast:  'assets/products/ghee-roast.png',
  mutton:     'assets/products/mutton.png',
  fish:       'assets/products/fish-masala.png',
  garam:      'assets/products/garam-masala.png',
  soya:       'assets/products/soya.png',
  methi:      'assets/products/kasuri-methi.jpg',
  sabji:      'assets/products/sabji-masala.jpg'
};
const FALLBACK_IMG = 'assets/products/garam-masala.png';

function _pick(name){
  const n=(name||'').toLowerCase();
  if(n.includes('turmeric'))                        return IMG.turmeric;
  if(n.includes('kashmiri'))                        return IMG.kashmiri;
  if(n.includes('red chilli')||n.includes('red chili')) return IMG.redchilli;
  if(n.includes('coriander'))                       return IMG.coriander;
  if(n.includes('jeera')||n.includes('cumin'))      return IMG.jeera;
  if(n.includes('black pepper'))                    return IMG.pepper;
  if(n.includes('sabji'))                           return IMG.sabji;
  if(n.includes('puliyogare'))                      return IMG.puliyogare;
  if(n.includes('pulav')||n.includes('pulao'))      return IMG.pulav;
  if(n.includes('chhole'))                          return IMG.chhole;
  if(n.includes('pav bhaji'))                       return IMG.pavbhaji;
  if(n.includes('jajeera')||n.includes('jaljeera')) return IMG.jaljeera;
  if(n.includes('chaat'))                           return IMG.jaljeera;
  if(n.includes('sambar'))                          return IMG.sambar;
  if(n.includes('rasam'))                           return IMG.rasam;
  if(n.includes('ghee roast'))                      return IMG.gheeRoast;
  if(n.includes('kundapura'))                       return IMG.kundapura;
  if(n.includes('tandoori'))                        return IMG.tandoori;
  if(n.includes('tikka'))                           return IMG.tikka;
  if(n.includes('biriyani')||n.includes('biryani')) return IMG.chicken;
  if(n.includes('kabab')||n.includes('65'))         return IMG.tandoori;
  if(n.includes('sukka')||n.includes('pulimunchi')) return IMG.chicken;
  if(n.includes('chicken'))                         return IMG.chicken;
  if(n.includes('fish'))                            return IMG.fish;
  if(n.includes('mutton')||n.includes('meat')||n.includes('bafath')||n.includes('egg')) return IMG.mutton;
  if(n.includes('kitchen king'))                    return IMG.kitchenking;
  if(n.includes('garam'))                           return IMG.garam;
  if(n.includes('soya'))                            return IMG.soya;
  if(n.includes('methi'))                           return IMG.methi;
  return FALLBACK_IMG;
}

function _cat(name){
  const n=(name||'').toLowerCase();
  if(n==='turmeric powder'||n==='red chilli powder'||n==='coriander powder'||
     n==='kashmiri chilli powder'||n==='jeera powder'||n==='black pepper powder')
    return 'Direct Grinding';
  if(n.includes('chicken')||n.includes('fish')||n.includes('mutton')||
     n.includes('meat')||n.includes('egg')||n.includes('bafath'))
    return 'Non-Veg Specialities';
  if(n.includes('papad')||n.includes('kasuri')||n.includes('soya')||
     n.includes('ginger')||n.includes('garlic')||n.includes('asafoetida'))
    return 'Ready-Mix Products';
  return 'Veg Specialities';
}

function _slug(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}

/* ---- Grouped catalog: one entry per product, variants = size/pack options ----
   SINGLE SOURCE OF TRUTH. admin.html now imports from this file. */
const _RAW = [
  {name:'Turmeric Powder', variants:[
    {pack:'50gm Pouch',grams:50,price:25},{pack:'100gm Pouch',grams:100,price:45},
    {pack:'200gm Pouch',grams:200,price:85},{pack:'500gm Pouch',grams:500,price:250},
    {pack:'50gm Box',grams:50,price:30},{pack:'100gm Box',grams:100,price:55}]},
  {name:'Red Chilli Powder', variants:[
    {pack:'50gm Pouch',grams:50,price:35},{pack:'100gm Pouch',grams:100,price:60},
    {pack:'200gm Pouch',grams:200,price:120},{pack:'500gm Pouch',grams:500,price:300},
    {pack:'100gm Box',grams:100,price:60}]},
  {name:'Coriander Powder', variants:[
    {pack:'50gm Pouch',grams:50,price:22},{pack:'100gm Pouch',grams:100,price:45},
    {pack:'200gm Pouch',grams:200,price:85},{pack:'500gm Pouch',grams:500,price:250},
    {pack:'100gm Box',grams:100,price:50}]},
  {name:'Kashmiri Chilli Powder', variants:[
    {pack:'100gm Box',grams:100,price:80},{pack:'500gm Pouch',grams:500,price:350}]},
  {name:'Jeera Powder', variants:[
    {pack:'50gm Pouch',grams:50,price:55},{pack:'50gm Box',grams:50,price:60},
    {pack:'100gm Box',grams:100,price:80},{pack:'500gm Pouch',grams:500,price:400}]},
  {name:'Black Pepper Powder', variants:[
    {pack:'50gm Box',grams:50,price:80},{pack:'100gm Box',grams:100,price:160},
    {pack:'500gm Pouch',grams:500,price:600}]},
  {name:'Garam Masala', variants:[
    {pack:'50gm Box',grams:50,price:40},{pack:'100gm Pouch',grams:100,price:70},
    {pack:'100gm Box',grams:100,price:80},{pack:'500gm Pouch',grams:500,price:350}]},
  {name:'Super Garam Masala', variants:[
    {pack:'50gm Pouch',grams:50,price:35},{pack:'100gm Pouch',grams:100,price:60},
    {pack:'200gm Pouch',grams:200,price:110},{pack:'500gm Pouch',grams:500,price:240}]},
  {name:'Udupi Sambar Masala', variants:[
    {pack:'100gm Box',grams:100,price:80},{pack:'500gm Pouch',grams:500,price:350}]},
  {name:'Super Sambar Masala', variants:[
    {pack:'500gm Pouch',grams:500,price:350}]},
  {name:'Udupi Rasam Masala', variants:[
    {pack:'100gm Box',grams:100,price:80},{pack:'500gm Pouch',grams:500,price:350}]},
  {name:'Vegetable Pulav Masala', variants:[
    {pack:'100gm Box',grams:100,price:80},{pack:'500gm Pouch',grams:500,price:350}]},
  {name:'Chaat Masala', variants:[
    {pack:'100gm Box',grams:100,price:80},{pack:'500gm Pouch',grams:500,price:300}]},
  {name:'Chhole Masala', variants:[
    {pack:'100gm Box',grams:100,price:80},{pack:'500gm Pouch',grams:500,price:350}]},
  {name:'Jajeera Powder', variants:[
    {pack:'100gm Box',grams:100,price:80},{pack:'500gm Pouch',grams:500,price:350}]},
  {name:'Pav Bhaji Masala', variants:[
    {pack:'100gm Box',grams:100,price:80},{pack:'500gm Pouch',grams:500,price:350}]},
  {name:'Sabji Masala', variants:[
    {pack:'50gm Box',grams:50,price:40},{pack:'100gm Pouch',grams:100,price:70},
    {pack:'500gm Pouch',grams:500,price:350}]},
  {name:'Puliyogare Powder', variants:[
    {pack:'100gm Box',grams:100,price:80},{pack:'500gm Pouch',grams:500,price:350}]},
  {name:'Chicken Ghee Roast Masala', badge:'BESTSELLER', variants:[
    {pack:'100gm Box',grams:100,price:80},{pack:'500gm Pouch',grams:500,price:450}]},
  {name:'Chicken Kundapura Masala', variants:[
    {pack:'100gm Pouch',grams:100,price:70},{pack:'100gm Box',grams:100,price:80},
    {pack:'200gm Jar',grams:200,price:160},{pack:'500gm Pouch',grams:500,price:350}]},
  {name:'Chicken Sukka Masala (Mangalore No.1)', badge:'BESTSELLER', variants:[
    {pack:'100gm Pouch',grams:100,price:70},{pack:'500gm Pouch',grams:500,price:350}]},
  {name:'Chicken Masala', variants:[
    {pack:'50gm Box',grams:50,price:40},{pack:'100gm Pouch',grams:100,price:70},
    {pack:'100gm Box',grams:100,price:80},{pack:'500gm Pouch',grams:500,price:350}]},
  {name:'Super Chicken Masala', variants:[
    {pack:'200gm Pouch',grams:200,price:135}]},
  {name:'Chicken Pulimunchi Masala', variants:[
    {pack:'500gm Pouch',grams:500,price:350}]},
  {name:'Chicken Kabab / Chicken 65 Masala', variants:[
    {pack:'100gm Pouch',grams:100,price:40},{pack:'200gm Pouch',grams:200,price:75},
    {pack:'500gm Pouch',grams:500,price:250}]},
  {name:'Chicken Biriyani Masala', variants:[
    {pack:'500gm Pouch',grams:500,price:400}]},
  {name:'Chicken Tandoori Masala', variants:[
    {pack:'100gm Box',grams:100,price:80},{pack:'500gm Pouch',grams:500,price:350}]},
  {name:'Chicken Tikka Masala', variants:[
    {pack:'100gm Box',grams:100,price:80},{pack:'500gm Pouch',grams:500,price:350}]},
  {name:'Fish Curry Masala', variants:[
    {pack:'100gm Pouch',grams:100,price:60},{pack:'100gm Box',grams:100,price:80},
    {pack:'500gm Pouch',grams:500,price:350}]},
  {name:'Fish Pulimunchi Masala', variants:[
    {pack:'100gm Pouch',grams:100,price:60},{pack:'500gm Pouch',grams:500,price:350}]},
  {name:'Fish Fry Masala', badge:'BESTSELLER', variants:[
    {pack:'100gm Pouch',grams:100,price:40},{pack:'500gm Pouch',grams:500,price:250}]},
  {name:'Mutton / Meat Masala', variants:[
    {pack:'50gm Box',grams:50,price:40},{pack:'100gm Box',grams:100,price:80},
    {pack:'500gm Pouch',grams:500,price:400}]},
  {name:'Bafath Masala', variants:[
    {pack:'100gm Pouch',grams:100,price:70},{pack:'500gm Pouch',grams:500,price:400}]},
  {name:'Egg Curry Masala', variants:[
    {pack:'500gm Pouch',grams:500,price:250}]},
  {name:'Kitchen King Masala', variants:[
    {pack:'100gm Pouch',grams:100,price:80},{pack:'500gm Pouch',grams:500,price:370}]},
  {name:'Compounded Asafoetida Powder', variants:[
    {pack:'25gm Jar',grams:25,price:55},{pack:'50gm Jar',grams:50,price:100}]},
  {name:'Ginger-Garlic Paste', variants:[
    {pack:'200gm Jar',grams:200,price:60}]},
  {name:'Niks Papad', variants:[
    {pack:'80gm Pouch',grams:80,price:25}]},
  {name:'Kasuri Methi', variants:[
    {pack:'25gm Box',grams:25,price:38}]},
  {name:'Soya Chunks', variants:[
    {pack:'200gm Box',grams:200,price:60},{pack:'1 KG Pouch',grams:1000,price:300}]}
];

const _DESCRIPTIONS = {
  'Chicken Ghee Roast Masala':'A Mangalorean masterpiece — roasted spices, red chillies & pure ghee aroma. Bold, buttery and bursting with coastal flavour.',
  'Chicken Kundapura Masala':'Fiery and flavourful — the authentic taste of Mangalore\'s famous kitchens, crafted with handpicked coastal spices.',
  'Chicken Sukka Masala (Mangalore No.1)':'The iconic dry Mangalorean chicken preparation. Robust, fragrant and deeply traditional.',
  'Chicken Kabab / Chicken 65 Masala':'Juicy, crispy and bursting with bold spices — restaurant-style kabab & chicken 65 made easy.',
  'Fish Fry Masala':'Coastal fish-fry blend — authentic colour, aroma and that unforgettable crispy-outside, juicy-inside finish.',
  'Chicken Masala':'Slow-cooked perfection in a packet — aromatic spices that blend into a rich, thick, flavourful gravy.',
  'Udupi Rasam Masala':'A bowl of warmth rooted in tradition — light, aromatic and deeply comforting rasam blend.',
  'Udupi Sambar Masala':'Classic Udupi-style sambar masala with hand-roasted lentils, coriander and fenugreek.',
  'Garam Masala':'The soul of Indian kitchens — a warm, balanced blend of hand-roasted whole spices.',
  'Turmeric Powder':'Stone-ground farm-fresh turmeric with high curcumin content. Pure and vibrant.',
  'Red Chilli Powder':'Bold, bright red chilli powder — sun-dried and traditionally ground.',
  'Kashmiri Chilli Powder':'Vibrant red colour with mild heat. Sourced from premium Kashmiri chillies.',
  'Coriander Powder':'Freshly ground coriander — earthy, fragrant and kitchen-essential.'
};

/* Ratings & review counts removed — we don't have real customer reviews yet.
   Showing fabricated numbers is a violation of the Consumer Protection
   (E-Commerce) Rules 2020 and ASCI guidelines. */
const DEFAULT_PRODUCTS = _RAW.map((r,i)=>{
  const desc = _DESCRIPTIONS[r.name] || 'Authentic Mangalorean spice blend — traditionally crafted, export-quality.';
  const minPrice = Math.min(...r.variants.map(v=>v.price));
  return {
    id: 'p'+(i+1),
    name: r.name,
    slug: _slug(r.name),
    category: _cat(r.name),
    image: _pick(r.name),
    variants: r.variants,
    price: minPrice,
    desc,
    long: desc + ' Packed at our FSSAI-certified, 11,000 sq.ft. facility in Yeyyadi, Mangalore.',
    badge: r.badge || null,
    stock: 50
  };
});

const DEFAULT_SETTINGS = {
  brand:'Niks Masala',
  phone:'+91 73385 19975',
  email:'hello@niksmasala.com',
  address:'Plot no. L-6, 5-50, Yeyyadi Industrial Area, Mangaluru, Dakshina Kannada, Karnataka 575015',
  gstin:'29AAFCI2793E1ZD',
  company:'Iniha Exports Pvt Ltd',
  currency:'₹',
  shippingFree:799,
  shippingFee:60,
  shippingFeeHeavy:120,
  instagram:'https://www.instagram.com/niks.masala/',
  /* TODO(backend): move this to a server env var and pass an `order_id`
     issued by your Razorpay server-side `orders.create` call. Never trust
     `amount` computed in the browser. */
  razorpayKey:'rzp_test_SgFzfBVh4i57d2'
};

function getProducts(){try{const s=localStorage.getItem('niks_products');const p=s?JSON.parse(s):null;return (p&&p.length)?p:DEFAULT_PRODUCTS}catch(e){return DEFAULT_PRODUCTS}}
function getSettings(){try{return{...DEFAULT_SETTINGS,...(JSON.parse(localStorage.getItem('niks_settings'))||{})}}catch(e){return DEFAULT_SETTINGS}}
function getCart(){try{return JSON.parse(localStorage.getItem('niks_cart'))||[]}catch(e){return[]}}
function setCart(c){localStorage.setItem('niks_cart',JSON.stringify(c));updateCartBadge()}
function cartCount(){return getCart().reduce((s,i)=>s+i.qty,0)}
function cartSubtotal(){return getCart().reduce((s,i)=>s+i.price*i.qty,0)}
function cartWeight(){
  return getCart().reduce((s,i)=>s+(i.grams||100)*i.qty, 0);
}
function computeShipping(){
  const s=getSettings();
  const sub=cartSubtotal();
  if(!sub) return 0;
  if(sub>=s.shippingFree) return 0;
  const w=cartWeight();
  return w>=1000 ? s.shippingFeeHeavy : s.shippingFee;
}

const _selectedVariant = {};

function addToCart(id, qty=1){
  const p=getProducts().find(x=>x.id===id); if(!p) return;
  const vi = _selectedVariant[id] || 0;
  const v = p.variants[vi] || p.variants[0]; if(!v) return;
  const cartKey = id+'-v'+vi;
  const cart=getCart();
  const ex=cart.find(x=>x.cartKey===cartKey);
  if(ex) ex.qty+=qty;
  else cart.push({cartKey,id,name:p.name,pack:v.pack,grams:v.grams,price:v.price,image:p.image,qty});
  setCart(cart);
  openCartDrawer();
}
function updateCartItem(cartKey,qty){
  const cart=getCart();const i=cart.find(x=>x.cartKey===cartKey);if(!i)return;
  i.qty=Math.max(1,qty);setCart(cart);
}
function removeFromCart(cartKey){setCart(getCart().filter(x=>x.cartKey!==cartKey))}

function selectVariant(id, idx){
  _selectedVariant[id]=idx;
  const p=getProducts().find(x=>x.id===id); if(!p) return;
  const v=p.variants[idx]; if(!v) return;
  const priceEl=document.getElementById('vprice-'+id);
  if(priceEl) priceEl.textContent=money(v.price);
  const packEl=document.getElementById('vpack-'+id);
  if(packEl) packEl.textContent=v.pack;
  document.querySelectorAll('#vpills-'+id+' .variant-pill')
    .forEach((el,i)=>el.classList.toggle('active',i===idx));
}

function updateCartBadge(){
  const c=cartCount();
  document.querySelectorAll('[data-cart-count]').forEach(el=>el.textContent=c);
  const m=document.getElementById('mobileCartCount');
  if(m) m.textContent=c;
  const btn=document.getElementById('mobileCartBtn');
  if(btn) btn.style.display=c>0?'flex':'none';
  const cdCount=document.getElementById('cdCount');
  if(cdCount) cdCount.textContent=c;
}

function money(n){return getSettings().currency+Number(n).toLocaleString('en-IN')}

function toast(msg,type){
  let t=document.getElementById('globalToast');
  if(!t){t=document.createElement('div');t.id='globalToast';t.className='toast';document.body.appendChild(t)}
  t.textContent=msg;t.className='toast show'+(type?' '+type:'');
  clearTimeout(window._tt);window._tt=setTimeout(()=>t.className='toast',2500);
}

function qs(n){return new URLSearchParams(location.search).get(n)}

/* ====== HEADER + FOOTER INJECTION ====== */
function buildHeader(activePage){
  const s=getSettings();
  const logoHTML=`<a href="index.html" class="brand" aria-label="Niks Masala home">
    <img src="${attr(LOGO)}" alt="Niks Masala" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
    <div class="brand-fallback" style="display:none" aria-hidden="true">N</div>
  </a>`;
  const links=[
    {href:'index.html',label:'Home',key:'home'},
    {href:'shop.html',label:'Shop',key:'shop'},
    {href:'shop.html?cat=Direct%20Grinding',label:'Ground Spices',key:'ground'},
    {href:'shop.html?cat=Veg%20Specialities',label:'Veg Masalas',key:'veg'},
    {href:'shop.html?cat=Non-Veg%20Specialities',label:'Non-Veg Masalas',key:'nonveg'},
    {href:'index.html#recipes',label:'Recipes',key:'recipes'},
    {href:'about.html',label:'About',key:'about'},
    {href:'contact.html',label:'Contact',key:'contact'}
  ];
  return `
  <div class="topbar">🚚 <strong>FREE SHIPPING</strong> on orders above ${money(s.shippingFree)} · 100% Pure · Traditionally Handcrafted in Mangalore</div>
  <header class="site-header">
    <div class="container">
      <div class="header-main">
        ${logoHTML}
        <form class="search-form" onsubmit="searchShop(event)" role="search">
          <input type="text" name="q" placeholder="Search for spices, masalas, blends..." aria-label="Search products">
          <button type="submit">🔍 <span>Search</span></button>
        </form>
        <div class="header-actions">
          <a href="${attr(s.instagram)}" target="_blank" rel="noopener" class="icon-link ig-link" title="Instagram" aria-label="Instagram @niks.masala">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>
            <span class="label"><span>Follow</span><strong>@niks.masala</strong></span>
          </a>
          <a href="account.html" class="icon-link" title="Account" aria-label="My account">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
            <span class="label"><span>Hello</span><strong>Account</strong></span>
          </a>
          <a href="cart.html" class="icon-link" title="Cart" aria-label="Open shopping cart" onclick="event.preventDefault();openCartDrawer()">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            <span class="cart-badge" data-cart-count>0</span>
            <span class="label"><span>Your</span><strong>Cart</strong></span>
          </a>
        </div>
      </div>
    </div>
    <nav class="main-nav" aria-label="Main">
      <div class="container main-nav-inner">
        <button class="menu-toggle" onclick="document.getElementById('mainMenu').classList.toggle('open')" aria-label="Toggle menu" aria-expanded="false">☰ Menu</button>
        <ul id="mainMenu">
          ${links.map(l=>`<li><a href="${attr(l.href)}" ${l.key===activePage?'class="active" aria-current="page"':''}>${esc(l.label)}</a></li>`).join('')}
        </ul>
        <div class="main-nav-right">📞 <strong>${esc(s.phone)}</strong></div>
      </div>
    </nav>
  </header>
  <div class="green-strip">
    <div class="container green-strip-inner">
      <span>🌿 Authentic Mangalorean Flavours</span>
      <span>✦ FSSAI-Certified Production</span>
      <span>🚚 Pan-India Delivery</span>
      <span>💚 Traditionally Handcrafted</span>
    </div>
  </div>`;
}

function buildFooter(){
  const s=getSettings();
  return `
  <section class="newsletter">
    <h2>Join the Niks Family</h2>
    <p>Subscribe for exclusive recipes, early access to new blends &amp; 10% off your first order.</p>
    <form class="news-form" onsubmit="handleNewsletter(event)">
      <input type="email" name="email" placeholder="Your email address" required aria-label="Your email address">
      <button type="submit">Subscribe</button>
    </form>
  </section>
  <footer class="site-footer">
    <div class="footer-grid">
      <div class="footer-col">
        <a href="index.html" class="brand" style="margin-bottom:14px" aria-label="Niks Masala home">
          <img src="${attr(LOGO)}" alt="Niks Masala" style="height:56px;background:#fff;padding:4px;border-radius:6px" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
          <div class="brand-fallback" style="display:none;background:radial-gradient(circle at 30% 30%,var(--gold),var(--red))" aria-hidden="true">N</div>
        </a>
        <p>The Taste of Mangalorean Tradition. Premium, handcrafted Indian masalas &amp; spices — delivered fresh from our Mangalore facility to your kitchen.</p>
        <div class="socials">
          <a href="${attr(s.instagram)}" target="_blank" rel="noopener" aria-label="Instagram" title="Instagram">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>
          </a>
          <a href="https://wa.me/${attr(s.phone.replace(/\D/g,''))}" target="_blank" rel="noopener" aria-label="WhatsApp">💬</a>
          <a href="mailto:${attr(s.email)}" aria-label="Email">✉</a>
          <a href="tel:${attr(s.phone.replace(/\s/g,''))}" aria-label="Call">📞</a>
        </div>
      </div>
      <div class="footer-col"><h5>Shop</h5><ul>
        <li><a href="shop.html">All Products</a></li>
        <li><a href="shop.html?cat=Direct%20Grinding">Ground Spices</a></li>
        <li><a href="shop.html?cat=Veg%20Specialities">Veg Masalas</a></li>
        <li><a href="shop.html?cat=Non-Veg%20Specialities">Non-Veg Masalas</a></li>
        <li><a href="shop.html?cat=Ready-Mix%20Products">Ready-Mix</a></li>
      </ul></div>
      <div class="footer-col"><h5>Company</h5><ul>
        <li><a href="about.html">About Us</a></li>
        <li><a href="index.html#recipes">Recipes</a></li>
        <li><a href="contact.html">Contact</a></li>
        <li><a href="track.html">Track Order</a></li>
      </ul></div>
      <div class="footer-col"><h5>Policies</h5><ul>
        <li><a href="shipping.html">Shipping Policy</a></li>
        <li><a href="returns.html">Returns &amp; Refunds</a></li>
        <li><a href="privacy.html">Privacy Policy</a></li>
        <li><a href="terms.html">Terms &amp; Conditions</a></li>
      </ul></div>
      <div class="footer-col"><h5>Get in Touch</h5>
        <p style="font-size:13.5px;margin-bottom:10px"><strong>${esc(s.company)}</strong><br>${esc(s.address)}</p>
        <p style="font-size:13px;margin-bottom:6px">📞 <a href="tel:${attr(s.phone.replace(/\s/g,''))}">${esc(s.phone)}</a></p>
        <p style="font-size:13px;margin-bottom:6px">✉ <a href="mailto:${attr(s.email)}">${esc(s.email)}</a></p>
        <p style="font-size:12px;color:#c9b999;margin-top:8px">GSTIN: ${esc(s.gstin)} · FSSAI Lic. (display in production)</p>
      </div>
    </div>
    <div class="footer-bot">
      <div>© ${new Date().getFullYear()} <strong style="color:#fff">Niks Masala</strong> · ${esc(s.company)}. All rights reserved.</div>
      <div>Made with ❤️ in Mangalore · Pure · Aromatic · Traditional</div>
    </div>
  </footer>`;
}

function searchShop(e){
  e.preventDefault();
  const q=e.target.elements.q.value.trim();
  if(q) location.href=`shop.html?q=${uri(q)}`;
}

/* Newsletter handler — POSTs to the Cloudflare Pages Function which
   inserts via the SERVICE_ROLE key. Falls back to localStorage during
   local development so the form still appears to work. */
async function handleNewsletter(e){
  e.preventDefault();
  const email=(e.target.elements.email.value||'').trim().toLowerCase();
  if(!email) return;
  try{
    const r=await fetch('/api/newsletter',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({email})
    });
    if(!r.ok) throw new Error('api');
  }catch(_){
    const list=JSON.parse(localStorage.getItem('niks_newsletter')||'[]');
    if(!list.includes(email)){list.push(email);localStorage.setItem('niks_newsletter',JSON.stringify(list))}
  }
  toast('Welcome aboard! 🌶️','ok');
  e.target.reset();
}

/* ====== PRODUCT CARD TEMPLATE (XSS-safe, no fake ratings) ====== */
function productCardHTML(p){
  const variants = p.variants || [{pack:p.weight||'',grams:p.grams||100,price:p.price}];
  const first = variants[0];
  const hasMany = variants.length > 1;
  const badgeHtml = p.badge==='NEW'      ? `<span class="new-badge">NEW</span>`
                  : p.badge==='BESTSELLER'? `<span class="new-badge bestseller-badge">BESTSELLER</span>`
                  : p.badge              ? `<span class="new-badge">${esc(p.badge)}</span>`
                                         : '';
  return `
  <article class="product-card">
    <div class="product-card-img">
      ${badgeHtml}
      <a href="product.html?id=${attr(p.id)}" aria-label="View ${attr(p.name)}">
        <img src="${attr(p.image||FALLBACK_IMG)}" alt="${attr(p.name)}" loading="lazy" onerror="this.src='${FALLBACK_IMG}'">
      </a>
    </div>
    <div class="product-card-body">
      <h3><a href="product.html?id=${attr(p.id)}">${esc(p.name)}</a></h3>
      ${hasMany?`
      <div class="variant-pills" id="vpills-${attr(p.id)}">
        ${variants.map((v,i)=>`<button type="button" class="variant-pill${i===0?' active':''}" onclick="selectVariant('${attr(p.id)}',${i})">${esc(v.pack)}</button>`).join('')}
      </div>`:`<div class="single-pack-tag">${esc(first.pack)}</div>`}
      <div class="price-row">
        ${hasMany?`<span class="from-label">from</span>`:''}
        <span class="price" id="vprice-${attr(p.id)}">${money(first.price)}</span>
      </div>
      <button class="add-cart-btn" onclick="addToCart('${attr(p.id)}')">ADD TO CART</button>
    </div>
  </article>`;
}

/* ====== INIT HELPERS ====== */
function mountHeaderFooter(activeKey){
  const h=document.getElementById('siteHeader'); if(h) h.innerHTML=buildHeader(activeKey);
  const f=document.getElementById('siteFooter'); if(f) f.innerHTML=buildFooter();
  if(!document.getElementById('cartDrawer')){
    const ov=document.createElement('div');
    ov.id='cartDrawerOverlay'; ov.className='cart-drawer-overlay';
    ov.addEventListener('click',closeCartDrawer);
    document.body.appendChild(ov);
    const dr=document.createElement('div');
    dr.id='cartDrawer'; dr.className='cart-drawer';
    dr.setAttribute('role','dialog');
    dr.setAttribute('aria-label','Shopping cart');
    dr.innerHTML=`
      <div class="cart-drawer-head">
        <div style="display:flex;align-items:center;gap:10px">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          <h3>Your Cart</h3><span class="cd-count-badge" id="cdCount">0</span>
        </div>
        <button class="cd-close" onclick="closeCartDrawer()" aria-label="Close cart">✕</button>
      </div>
      <div class="cart-drawer-body" id="cdBody"></div>
      <div class="cart-drawer-foot" id="cdFoot"></div>`;
    document.body.appendChild(dr);
  }
  /* Mobile floating cart button — hidden on cart and checkout pages to avoid
     duplicate UI; only shown when cart has items. */
  const path=(location.pathname||'').toLowerCase();
  const suppressMobileFab = /cart\.html$|checkout\.html$/.test(path);
  if(!document.getElementById('mobileCartBtn') && !suppressMobileFab){
    const btn=document.createElement('a');
    btn.id='mobileCartBtn'; btn.href='cart.html'; btn.className='mobile-cart-btn';
    btn.setAttribute('aria-label','View cart');
    btn.innerHTML=`🛒 <span>Cart</span> <span class="mobile-cart-count" id="mobileCartCount">${cartCount()}</span>`;
    document.body.appendChild(btn);
  }
  /* WhatsApp click-to-chat — free alternative to a paid SMS gateway. Clicking
     opens the user's WhatsApp with a pre-filled message. Suppressed on
     checkout to avoid distracting from purchase flow. */
  const suppressWA = /checkout\.html$/.test(path);
  if(!document.getElementById('waFab') && !suppressWA){
    const s=getSettings();
    const wa=document.createElement('a');
    wa.id='waFab';
    wa.href=`https://wa.me/${s.phone.replace(/\D/g,'')}?text=${encodeURIComponent('Hi Niks Masala — I have a question.')}`;
    wa.target='_blank'; wa.rel='noopener';
    wa.setAttribute('aria-label','Chat with us on WhatsApp');
    wa.title='Chat on WhatsApp';
    wa.style.cssText='position:fixed;bottom:18px;left:18px;width:54px;height:54px;border-radius:50%;background:#25D366;color:#fff;display:grid;place-items:center;font-size:28px;box-shadow:0 6px 20px rgba(0,0,0,.25);z-index:300;text-decoration:none;transition:transform .2s';
    wa.onmouseover=()=>wa.style.transform='scale(1.08)';
    wa.onmouseout=()=>wa.style.transform='scale(1)';
    wa.innerHTML=`<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>`;
    document.body.appendChild(wa);
  }
  updateCartBadge();
}

/* ====== CART DRAWER (XSS-safe) ====== */
function openCartDrawer(){
  renderCartDrawer();
  document.getElementById('cartDrawer').classList.add('open');
  document.getElementById('cartDrawerOverlay').classList.add('open');
  document.body.classList.add('drawer-open');
}
function closeCartDrawer(){
  document.getElementById('cartDrawer').classList.remove('open');
  document.getElementById('cartDrawerOverlay').classList.remove('open');
  document.body.classList.remove('drawer-open');
}
function renderCartDrawer(){
  const cart=getCart();
  const body=document.getElementById('cdBody');
  const foot=document.getElementById('cdFoot');
  const countEl=document.getElementById('cdCount');
  if(!body) return;
  const c=cartCount();
  if(countEl) countEl.textContent=c;
  if(cart.length===0){
    body.innerHTML=`<div class="cd-empty"><div class="cd-empty-icon">🛒</div><p>Your cart is empty</p><a href="shop.html" class="btn btn-primary btn-sm" onclick="closeCartDrawer()">Start Shopping</a></div>`;
    if(foot) foot.innerHTML='';
    return;
  }
  body.innerHTML=cart.map(i=>`
    <div class="cd-item">
      <img src="${attr(i.image||FALLBACK_IMG)}" alt="${attr(i.name)}" onerror="this.src='${FALLBACK_IMG}'">
      <div class="cd-item-info">
        <div class="cd-item-name">${esc(i.name)}</div>
        <div class="cd-item-pack">${esc(i.pack||'')}</div>
        <div class="cd-item-row">
          <div class="cd-qty">
            <button onclick="updateCartItem('${attr(i.cartKey)}',${i.qty-1});renderCartDrawer()" aria-label="Decrease quantity">−</button>
            <span>${i.qty}</span>
            <button onclick="updateCartItem('${attr(i.cartKey)}',${i.qty+1});renderCartDrawer()" aria-label="Increase quantity">+</button>
          </div>
          <span class="cd-item-price">${money(i.price*i.qty)}</span>
        </div>
      </div>
      <button class="cd-remove" onclick="removeFromCart('${attr(i.cartKey)}');renderCartDrawer()" title="Remove" aria-label="Remove ${attr(i.name)}">✕</button>
    </div>`).join('');
  const sub=cartSubtotal();
  const ship=computeShipping();
  const s=getSettings();
  const total=sub+ship;
  foot.innerHTML=`
    <div class="cd-totals">
      <div class="cd-total-row"><span>Subtotal</span><strong>${money(sub)}</strong></div>
      <div class="cd-total-row"><span>Shipping</span><strong>${ship===0?'<span style="color:var(--ok)">FREE</span>':money(ship)}</strong></div>
      ${ship>0?`<div class="cd-freeship-note">Add ${money(s.shippingFree-sub)} more for FREE shipping!</div>`:''}
      <div class="cd-total-row cd-grand"><span>Total</span><strong>${money(total)}</strong></div>
    </div>
    <a href="checkout.html" class="btn btn-primary cd-checkout-btn">CHECKOUT →</a>
    <a href="cart.html" class="cd-viewcart-link">View Full Cart</a>`;
}

window.addEventListener('storage',e=>{
  if(e.key==='niks_cart'){updateCartBadge();renderCartDrawer();}
});

/* ====== SUPABASE CLOUD SYNC ======
 * NOTE: the anon key is intentionally public — that is how Supabase is
 * designed. Security lives in Row Level Security (see supabase-schema.sql).
 * Until RLS is correctly configured, treat *everything* in Supabase as
 * publicly readable. Do NOT put production PII in this database. */
const _SB_URL='https://cmyiggiakgimygznlkuo.supabase.co';
const _SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNteWlnZ2lha2dpbXlnem5sa3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NzE0OTMsImV4cCI6MjA5NDQ0NzQ5M30.f9E_TXN5p_sN9kRo4JEpDrSz3KeWnRiqtSmbs61iIIQ';
let _sbClient=null;

async function getSB(){
  if(_sbClient) return _sbClient;
  if(!window.supabase){
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.onload=res; s.onerror=rej; document.head.appendChild(s);
    });
  }
  _sbClient=window.supabase.createClient(_SB_URL,_SB_KEY);
  return _sbClient;
}

async function saveOrderToCloud(order){
  try{
    const db=await getSB();
    await db.from('orders').upsert({
      id:order.id, date:order.date, customer:order.customer,
      notes:order.notes||'', items:order.items,
      subtotal:order.subtotal, shipping:order.shipping,
      discount:order.discount, total:order.total,
      payment:order.payment, payment_id:order.payment_id||null,
      status:order.status
    });
  }catch(e){console.warn('Cloud order save failed',e)}
}

async function getOrdersFromCloud(){
  try{
    const db=await getSB();
    const{data}=await db.from('orders').select('*').order('created_at',{ascending:false});
    return data||[];
  }catch(e){return[]}
}

async function saveUserToCloud(u){
  /* `u.pw` should already be SHA-256 hashed before reaching this function. */
  try{
    const db=await getSB();
    await db.from('users').upsert({
      email:u.email, name:u.name, phone:u.phone||'',
      pw:u.pw, question:u.question||'', answer:u.answer||''
    },{onConflict:'email'});
  }catch(e){console.warn('Cloud user save failed',e)}
}

async function getUserFromCloud(email){
  try{
    const db=await getSB();
    const{data}=await db.from('users').select('*').eq('email',email).maybeSingle();
    return data||null;
  }catch(e){return null}
}

/* ====== Cloudflare Web Analytics ======
 * Free, no cookies, GDPR-friendly. Replace TOKEN below with the value
 * from Cloudflare Dashboard → Web Analytics → Add a site → "JS snippet".
 * The token is a public string and safe to commit. If unset, the snippet
 * is a no-op — analytics simply doesn't run. */
(function(){
  const TOKEN = window.CF_ANALYTICS_TOKEN || ''; // set this once you have a Cloudflare account
  if(!TOKEN) return;
  if(document.querySelector('script[data-cf-beacon]')) return;
  const s = document.createElement('script');
  s.defer = true;
  s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  s.setAttribute('data-cf-beacon', JSON.stringify({token: TOKEN}));
  document.head.appendChild(s);
})();

/* Force-clear stale catalog from localStorage on version bump.
   We keep the cart this time — previous behaviour wiped customer carts on every
   deploy which is awful UX. If the cart schema actually changes, bump
   niks_cart_version too. */
try{
  if(localStorage.getItem('niks_products_version')!=='v7-clean'){
    localStorage.removeItem('niks_products');
    localStorage.setItem('niks_products_version','v7-clean');
  }
  if(localStorage.getItem('niks_cart_version')!=='v2-variants'){
    localStorage.removeItem('niks_cart');
    localStorage.setItem('niks_cart_version','v2-variants');
  }
}catch(e){}
