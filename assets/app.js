/* ========= NIKS MASALA — SHARED APP JS ========= */
/* Handles: product catalog, cart, checkout, header/footer injection, utilities */

const LOGO = 'nikslogomain.jpg';

/* Local product images — stored in assets/products/ */
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
  sabji:      'assets/products/sabji-masala.jpg',
  /* fallback Unsplash for products without a local image */
  paste:      'https://images.unsplash.com/photo-1599639668273-cc4318f7dff9?w=700&q=80',
  papad:      'https://images.unsplash.com/photo-1589301773859-bb024586d6be?w=700&q=80',
  asafoetida: 'https://images.unsplash.com/photo-1599639957043-f3aa5c986398?w=700&q=80'
};

function _pick(name){
  const n=name.toLowerCase();
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
  if(n.includes('asafoetida'))                      return IMG.asafoetida;
  if(n.includes('ginger')||n.includes('garlic'))    return IMG.paste;
  if(n.includes('papad'))                           return IMG.papad;
  return IMG.garam;
}

function _cat(name){
  const n=name.toLowerCase();
  // Direct Grinding — pure single ground spices
  if(n==='turmeric powder'||n==='red chilli powder'||n==='coriander powder'||
     n==='kashmiri chilli powder'||n==='jeera powder'||n==='black pepper powder')
    return 'Direct Grinding';
  // Non-Veg Specialities — all meat/fish/chicken/egg
  if(n.includes('chicken')||n.includes('fish')||n.includes('mutton')||
     n.includes('meat')||n.includes('egg')||n.includes('bafath'))
    return 'Non-Veg Specialities';
  // Ready-Mix Products — pastes, convenience items, whole extras
  if(n.includes('papad')||n.includes('kasuri')||n.includes('soya')||
     n.includes('ginger')||n.includes('garlic')||n.includes('asafoetida'))
    return 'Ready-Mix Products';
  // Veg Specialities — all remaining masala blends (sambar, rasam, garam, etc.)
  return 'Veg Specialities';
}

function _slug(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}

/* ---- Grouped catalog: one entry per product, variants = size/pack options ---- */
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
    {pack:'200gm Box',grams:200,price:60},{pack:'1 KG Pouch',grams:1000,price:300}]},
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
    price: minPrice,          // lowest variant price — used for sorting/filtering
    rating: 4.6 + (i%4)*0.1,
    reviews: 20 + (i*7)%180,
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
  razorpayKey:'rzp_test_SgFzfBVh4i57d2'
};

function getProducts(){try{const s=localStorage.getItem('niks_products');const p=s?JSON.parse(s):null;return (p&&p.length)?p:DEFAULT_PRODUCTS}catch(e){return DEFAULT_PRODUCTS}}
function getSettings(){try{return{...DEFAULT_SETTINGS,...(JSON.parse(localStorage.getItem('niks_settings'))||{})}}catch(e){return DEFAULT_SETTINGS}}
function getCart(){try{return JSON.parse(localStorage.getItem('niks_cart'))||[]}catch(e){return[]}}
function setCart(c){localStorage.setItem('niks_cart',JSON.stringify(c));updateCartBadge()}
function cartCount(){return getCart().reduce((s,i)=>s+i.qty,0)}
function cartSubtotal(){return getCart().reduce((s,i)=>s+i.price*i.qty,0)}
function cartWeight(){
  // Each cart item now carries its own grams value
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

/* Track which variant is selected per product card (variantIdx) */
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

/* Called by variant pill buttons to switch selected size */
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
  const logoHTML=`<a href="index.html" class="brand">
    <img src="${LOGO}" alt="Niks Masala" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
    <div class="brand-fallback" style="display:none">N</div>
  </a>`;
  const links=[
    {href:'index.html',label:'Home',key:'home'},
    {href:'shop.html',label:'Shop',key:'shop'},
    {href:'shop.html?cat=Masala%20Blends',label:'Masala Blends',key:'masala'},
    {href:'shop.html?cat=Non-Veg%20Masalas',label:'Non-Veg Masalas',key:'nonveg'},
    {href:'shop.html?cat=Ground%20Spices',label:'Ground Spices',key:'ground'},
    {href:'shop.html?cat=Specialty',label:'Specialty',key:'special'},
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
        <form class="search-form" onsubmit="searchShop(event)">
          <input type="text" name="q" placeholder="Search for spices, masalas, blends..." aria-label="Search">
          <button type="submit">🔍 <span>Search</span></button>
        </form>
        <div class="header-actions">
          <a href="${s.instagram}" target="_blank" rel="noopener" class="icon-link ig-link" title="Instagram">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>
            <span class="label"><span>Follow</span><strong>@niks.masala</strong></span>
          </a>
          <a href="account.html" class="icon-link" title="Account">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
            <span class="label"><span>Hello</span><strong>Account</strong></span>
          </a>
          <a href="cart.html" class="icon-link" title="Cart" onclick="event.preventDefault();openCartDrawer()">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            <span class="cart-badge" data-cart-count>0</span>
            <span class="label"><span>Your</span><strong>Cart</strong></span>
          </a>
        </div>
      </div>
    </div>
    <nav class="main-nav">
      <div class="container main-nav-inner">
        <button class="menu-toggle" onclick="document.getElementById('mainMenu').classList.toggle('open')" aria-label="Menu">☰ Menu</button>
        <ul id="mainMenu">
          ${links.map(l=>`<li><a href="${l.href}" ${l.key===activePage?'class="active"':''}>${l.label}</a></li>`).join('')}
        </ul>
        <div class="main-nav-right">📞 <strong>${s.phone}</strong></div>
      </div>
    </nav>
  </header>
  <!-- Green brand strip -->
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
    <p>Subscribe for exclusive recipes, early access to new blends & 10% off your first order.</p>
    <form class="news-form" onsubmit="event.preventDefault();toast('Welcome aboard! 🌶️','ok');this.reset()">
      <input type="email" placeholder="Your email address" required>
      <button type="submit">Subscribe</button>
    </form>
  </section>
  <footer class="site-footer">
    <div class="footer-grid">
      <div class="footer-col">
        <a href="index.html" class="brand" style="margin-bottom:14px">
          <img src="${LOGO}" alt="Niks Masala" style="height:56px;background:#fff;padding:4px;border-radius:6px" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
          <div class="brand-fallback" style="display:none;background:radial-gradient(circle at 30% 30%,var(--gold),var(--red))">N</div>
        </a>
        <p>The Taste of Mangalorean Tradition. Premium, handcrafted Indian masalas & spices — delivered fresh from our Mangalore facility to your kitchen.</p>
        <div class="socials">
          <a href="${s.instagram}" target="_blank" rel="noopener" aria-label="Instagram" title="Instagram">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>
          </a>
          <a href="https://wa.me/${s.phone.replace(/\D/g,'')}" target="_blank" rel="noopener" aria-label="WhatsApp">💬</a>
          <a href="mailto:${s.email}" aria-label="Email">✉</a>
          <a href="tel:${s.phone.replace(/\s/g,'')}" aria-label="Call">📞</a>
        </div>
      </div>
      <div class="footer-col"><h5>Shop</h5><ul>
        <li><a href="shop.html">All Products</a></li>
        <li><a href="shop.html?cat=Masala%20Blends">Masala Blends</a></li>
        <li><a href="shop.html?cat=Non-Veg%20Masalas">Non-Veg Masalas</a></li>
        <li><a href="shop.html?cat=Ground%20Spices">Ground Spices</a></li>
        <li><a href="shop.html?cat=Specialty">Specialty</a></li>
      </ul></div>
      <div class="footer-col"><h5>Company</h5><ul>
        <li><a href="about.html">About Us</a></li>
        <li><a href="index.html#recipes">Recipes</a></li>
        <li><a href="contact.html">Contact</a></li>
        <li><a href="contact.html#shipping">Shipping Info</a></li>
        <li><a href="admin.html">Admin Login</a></li>
      </ul></div>
      <div class="footer-col"><h5>Get in Touch</h5>
        <p style="font-size:13.5px;margin-bottom:10px"><strong>${s.company}</strong><br>${s.address}</p>
        <p style="font-size:13px;margin-bottom:6px">📞 <a href="tel:${s.phone.replace(/\s/g,'')}">${s.phone}</a></p>
        <p style="font-size:13px;margin-bottom:6px">✉ <a href="mailto:${s.email}">${s.email}</a></p>
        <p style="font-size:12px;color:#c9b999;margin-top:8px">GSTIN: ${s.gstin}</p>
      </div>
    </div>
    <div class="footer-bot">
      <div>© ${new Date().getFullYear()} <strong style="color:#fff">Niks Masala</strong> · ${s.company}. All rights reserved.</div>
      <div>Made with ❤️ in Mangalore · Pure · Aromatic · Traditional</div>
    </div>
  </footer>`;
}

function searchShop(e){
  e.preventDefault();
  const q=e.target.elements.q.value.trim();
  if(q) location.href=`shop.html?q=${encodeURIComponent(q)}`;
}

/* ====== PRODUCT CARD TEMPLATE (variant-aware) ====== */
function productCardHTML(p){
  const stars = '★'.repeat(Math.round(p.rating||4.5)) + '☆'.repeat(5-Math.round(p.rating||4.5));
  const variants = p.variants || [{pack:p.weight||'',grams:p.grams||100,price:p.price}];
  const first = variants[0];
  const hasMany = variants.length > 1;
  return `
  <article class="product-card">
    <div class="product-card-img">
      ${p.badge==='NEW'?`<span class="new-badge">NEW</span>`:''}
      ${p.badge==='BESTSELLER'?`<span class="new-badge bestseller-badge">BESTSELLER</span>`:''}
      <a href="product.html?id=${p.id}">
        <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.src='assets/products/garam-masala.png'">
      </a>
    </div>
    <div class="product-card-body">
      <h3><a href="product.html?id=${p.id}">${p.name}</a></h3>
      <div class="stars">${stars} <span>(${p.reviews||0})</span></div>
      ${hasMany?`
      <div class="variant-pills" id="vpills-${p.id}">
        ${variants.map((v,i)=>`<button class="variant-pill${i===0?' active':''}" onclick="selectVariant('${p.id}',${i})">${v.pack}</button>`).join('')}
      </div>`:`<div class="single-pack-tag">${first.pack}</div>`}
      <div class="price-row">
        ${hasMany?`<span class="from-label">from</span>`:''}
        <span class="price" id="vprice-${p.id}">${money(first.price)}</span>
      </div>
      <button class="add-cart-btn" onclick="addToCart('${p.id}')">ADD TO CART</button>
    </div>
  </article>`;
}

/* ====== INIT HELPERS ====== */
function mountHeaderFooter(activeKey){
  const h=document.getElementById('siteHeader'); if(h) h.innerHTML=buildHeader(activeKey);
  const f=document.getElementById('siteFooter'); if(f) f.innerHTML=buildFooter();
  // Cart drawer
  if(!document.getElementById('cartDrawer')){
    const ov=document.createElement('div');
    ov.id='cartDrawerOverlay'; ov.className='cart-drawer-overlay';
    ov.addEventListener('click',closeCartDrawer);
    document.body.appendChild(ov);
    const dr=document.createElement('div');
    dr.id='cartDrawer'; dr.className='cart-drawer';
    dr.innerHTML=`
      <div class="cart-drawer-head">
        <div style="display:flex;align-items:center;gap:10px">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          <h3>Your Cart</h3><span class="cd-count-badge" id="cdCount">0</span>
        </div>
        <button class="cd-close" onclick="closeCartDrawer()" aria-label="Close">✕</button>
      </div>
      <div class="cart-drawer-body" id="cdBody"></div>
      <div class="cart-drawer-foot" id="cdFoot"></div>`;
    document.body.appendChild(dr);
  }
  // Mobile floating cart button
  if(!document.getElementById('mobileCartBtn')){
    const btn=document.createElement('a');
    btn.id='mobileCartBtn'; btn.href='cart.html'; btn.className='mobile-cart-btn';
    btn.innerHTML=`🛒 <span>Cart</span> <span class="mobile-cart-count" id="mobileCartCount">${cartCount()}</span>`;
    document.body.appendChild(btn);
  }
  updateCartBadge();
}

/* ====== CART DRAWER ====== */
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
      <img src="${i.image}" alt="${i.name}" onerror="this.src='assets/products/garam-masala.png'">
      <div class="cd-item-info">
        <div class="cd-item-name">${i.name}</div>
        <div class="cd-item-pack">${i.pack||''}</div>
        <div class="cd-item-row">
          <div class="cd-qty">
            <button onclick="updateCartItem('${i.cartKey}',${i.qty-1});renderCartDrawer()">−</button>
            <span>${i.qty}</span>
            <button onclick="updateCartItem('${i.cartKey}',${i.qty+1});renderCartDrawer()">+</button>
          </div>
          <span class="cd-item-price">${money(i.price*i.qty)}</span>
        </div>
      </div>
      <button class="cd-remove" onclick="removeFromCart('${i.cartKey}');renderCartDrawer()" title="Remove">✕</button>
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
    <a href="cart.html" class="cd-viewcart-link" onclick="closeCartDrawer()">View Full Cart</a>`;
}

window.addEventListener('storage',e=>{
  if(e.key==='niks_cart'){updateCartBadge();renderCartDrawer();}
});

/* ====== SUPABASE CLOUD SYNC ====== */
const _SB_URL='https://jvjjqbzwqrnvrpiihbnt.supabase.co';
const _SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2ampxYnp3cXJudnJwaWloYm50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3ODU0NTksImV4cCI6MjA5MjM2MTQ1OX0.35q6KQU0yAV0IQn__1t2sVkRpgxiswG_ne50C87sFps';
let _sbClient=null;

async function getSB(){
  if(_sbClient) return _sbClient;
  if(!window.supabase){
    await new Promise(r=>{
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.onload=r; document.head.appendChild(s);
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

/* Force-clear stale catalog from localStorage */
try{
  if(localStorage.getItem('niks_products_version')!=='v6-cats'){
    localStorage.removeItem('niks_products');
    localStorage.removeItem('niks_cart'); // clear old cart — variant structure changed
    localStorage.setItem('niks_products_version','v6-cats');
  }
}catch(e){}

