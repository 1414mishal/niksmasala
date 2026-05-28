/* ==========================================================
   NIKS MASALA PREMIUM — App overrides
   Replaces buildHeader / buildFooter / productCardHTML with the
   warm-spice premium design. Loaded AFTER app.js — reassigns
   those three functions. All cart/Supabase/Razorpay logic is
   inherited unchanged.
   ========================================================== */

buildHeader = function (activePage) {
  const s = getSettings();
  const links = [
    { href: 'index.html', label: 'Home',     key: 'home' },
    { href: 'shop.html',  label: 'Shop',     key: 'shop' },
    { href: 'about.html', label: 'Heritage', key: 'about' },
    { href: 'recipes.html', label: 'Recipes', key: 'recipes' },
    { href: 'contact.html', label: 'Contact', key: 'contact' }
  ];
  /* Mobile menu drawer + hamburger toggle:
     - .nav-burger is hidden on >=901px (CSS), visible below.
     - Clicking the burger toggles body.mobile-menu-open which
       drives the .mobile-menu visibility + the burger's X animation.
     - The overlay also closes on link tap and on backdrop click. */
  const closeMenu = "document.body.classList.remove('mobile-menu-open');document.querySelector('.nav-burger').setAttribute('aria-expanded','false');";
  return `
  <header data-sticky-nav>
    <div style="max-width:1280px;margin:0 auto;padding:10px 28px;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:nowrap;transition:padding .4s cubic-bezier(0.25,1,0.5,1)">
      <a href="index.html" aria-label="Niks Masala home" style="display:flex;align-items:center;gap:14px;text-decoration:none;flex-shrink:0">
        <img src="${attr(LOGO)}" alt="Niks Masala" style="height:88px;width:auto;object-fit:contain;display:block;transition:height .4s cubic-bezier(0.25,1,0.5,1)" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
        <div style="display:none;width:48px;height:48px;border-radius:10px;background:radial-gradient(circle at 30% 30%,#fed7aa,#b8451a);align-items:center;justify-content:center;color:#fff;font:700 24px/1 'Source Serif 4',serif">N</div>
      </a>
      <nav class="primary-nav" style="display:flex;align-items:center;gap:36px">
        ${links.map(l => `<a href="${attr(l.href)}" class="nav-link ${l.key === activePage ? 'active' : ''}" style="font:500 13px/1 'Manrope';letter-spacing:.08em;color:${l.key === activePage ? '#2e1a16' : '#4a3a2e'};text-decoration:none;transition:color .25s">${esc(l.label)}</a>`).join('')}
      </nav>
      <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
        <a href="${attr(s.instagram)}" target="_blank" rel="noopener" aria-label="Instagram" title="Instagram" style="width:40px;height:40px;display:grid;place-items:center;border-radius:50%;color:#4a3a2e;border:1px solid transparent;transition:all .25s" onmouseover="this.style.background='rgba(46,26,22,0.06)';this.style.color='#2e1a16'" onmouseout="this.style.background='transparent';this.style.color='#4a3a2e'">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>
        </a>
        <a href="account.html" aria-label="Account" title="Account" style="width:40px;height:40px;display:grid;place-items:center;border-radius:50%;color:#4a3a2e;transition:all .25s" onmouseover="this.style.background='rgba(46,26,22,0.06)';this.style.color='#2e1a16'" onmouseout="this.style.background='transparent';this.style.color='#4a3a2e'">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
        </a>
        <a href="cart.html" aria-label="Cart" title="Cart" onclick="event.preventDefault();openCartDrawer()" style="position:relative;width:40px;height:40px;display:grid;place-items:center;border-radius:50%;color:#4a3a2e;transition:all .25s" onmouseover="this.style.background='rgba(46,26,22,0.06)';this.style.color='#2e1a16'" onmouseout="this.style.background='transparent';this.style.color='#4a3a2e'">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          <span data-cart-count style="position:absolute;top:0;right:0;background:#c86a36;color:#fff;font:700 10px/1 'Manrope';min-width:18px;height:18px;border-radius:9px;display:grid;place-items:center;padding:0 5px">0</span>
        </a>
        <a href="contact.html" class="header-bulk-cta" style="background:#2e1a16;color:#fdfbf7;padding:13px 22px;border-radius:999px;font:600 11px/1 'Manrope';letter-spacing:.18em;text-transform:uppercase;text-decoration:none;transition:all .4s cubic-bezier(0.25,1,0.5,1)" onmouseover="this.style.background='#c86a36';this.style.transform='translateY(-2px)'" onmouseout="this.style.background='#2e1a16';this.style.transform='translateY(0)'">
          Bulk Order
        </a>
        <button type="button" class="nav-burger" aria-label="Open menu" aria-expanded="false" aria-controls="mobileMenu"
          onclick="var open=this.getAttribute('aria-expanded')!=='true';this.setAttribute('aria-expanded',open);document.body.classList.toggle('mobile-menu-open',open);">
          <span class="nav-burger__icon"><span></span><span></span><span></span></span>
        </button>
      </div>
    </div>
  </header>
  <div class="mobile-menu" id="mobileMenu" role="dialog" aria-modal="true" aria-label="Main menu"
       onclick="if(event.target===this){${closeMenu}}">
    <div class="mobile-menu__panel">
      <div class="mobile-menu__links">
        ${links.map(l => `<a class="mobile-menu__link ${l.key === activePage ? 'active' : ''}" href="${attr(l.href)}" onclick="${closeMenu}">${esc(l.label)}</a>`).join('')}
      </div>
      <a class="mobile-menu__cta" href="contact.html" onclick="${closeMenu}">Bulk Order →</a>
      <div class="mobile-menu__meta">
        <a href="account.html" onclick="${closeMenu}">Account</a>
        <span>·</span>
        <a href="track.html" onclick="${closeMenu}">Track Order</a>
        <span>·</span>
        <a href="${attr(s.instagram)}" target="_blank" rel="noopener">Instagram</a>
      </div>
    </div>
  </div>`;
};

buildFooter = function () {
  const s = getSettings();
  return `
  <footer style="background:#3d1f0e;color:#fed7aa;padding:80px 24px 32px;margin-top:80px;border-top:1px solid rgba(254,215,170,.1)">
    <div style="max-width:1280px;margin:0 auto;display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:48px" class="footer-grid-premium">
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
          <img src="${attr(LOGO)}" alt="Niks Masala" style="height:48px;width:48px;border-radius:10px;background:#fff;padding:2px" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
          <div style="display:none;width:48px;height:48px;border-radius:10px;background:#fed7aa;align-items:center;justify-content:center;color:#3d1f0e;font:700 24px/1 'Source Serif 4',serif">N</div>
          <span class="font-serif" style="font-size:24px;font-weight:600;color:#fff">Niks Masala</span>
        </div>
        <p style="color:rgba(254,215,170,.7);font:400 14px/1.7 'Manrope';margin:0 0 18px;max-width:340px">
          Authentic Mangalorean masalas &amp; spices, handcrafted at our FSSAI-certified facility in Yeyyadi, Mangalore — delivered fresh to your kitchen.
        </p>
        <p style="color:rgba(254,215,170,.5);font:500 11px/1.4 'Manrope';letter-spacing:.15em;text-transform:uppercase">
          ${esc(s.company)} · GSTIN ${esc(s.gstin)}
        </p>
        <div style="display:flex;gap:10px;margin-top:22px">
          <a href="${attr(s.instagram)}" target="_blank" rel="noopener" aria-label="Instagram" style="width:40px;height:40px;border:1px solid rgba(254,215,170,.2);border-radius:50%;display:grid;place-items:center;color:#fed7aa;transition:all .25s" onmouseover="this.style.background='#fed7aa';this.style.color='#3d1f0e'" onmouseout="this.style.background='transparent';this.style.color='#fed7aa'">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>
          </a>
          <a href="https://wa.me/${attr(s.phone.replace(/\D/g,''))}" target="_blank" rel="noopener" aria-label="WhatsApp" style="width:40px;height:40px;border:1px solid rgba(254,215,170,.2);border-radius:50%;display:grid;place-items:center;color:#fed7aa;transition:all .25s" onmouseover="this.style.background='#fed7aa';this.style.color='#3d1f0e'" onmouseout="this.style.background='transparent';this.style.color='#fed7aa'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
          </a>
          <a href="mailto:${attr(s.email)}" aria-label="Email" style="width:40px;height:40px;border:1px solid rgba(254,215,170,.2);border-radius:50%;display:grid;place-items:center;color:#fed7aa;transition:all .25s" onmouseover="this.style.background='#fed7aa';this.style.color='#3d1f0e'" onmouseout="this.style.background='transparent';this.style.color='#fed7aa'">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
          </a>
        </div>
      </div>

      <div>
        <h5 style="font:600 11px/1 'Manrope';letter-spacing:.18em;text-transform:uppercase;color:#fed7aa;margin:0 0 18px">Shop</h5>
        <ul style="list-style:none;padding:0;margin:0;display:grid;gap:12px">
          <li><a href="shop.html" style="color:rgba(254,215,170,.8);font:500 14px/1 'Manrope';text-decoration:none;transition:color .25s" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(254,215,170,.8)'">All Products</a></li>
          <li><a href="shop.html?cat=Direct%20Grinding" style="color:rgba(254,215,170,.8);font:500 14px/1 'Manrope';text-decoration:none;transition:color .25s" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(254,215,170,.8)'">Ground Spices</a></li>
          <li><a href="shop.html?cat=Veg%20Specialities" style="color:rgba(254,215,170,.8);font:500 14px/1 'Manrope';text-decoration:none;transition:color .25s" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(254,215,170,.8)'">Veg Masalas</a></li>
          <li><a href="shop.html?cat=Non-Veg%20Specialities" style="color:rgba(254,215,170,.8);font:500 14px/1 'Manrope';text-decoration:none;transition:color .25s" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(254,215,170,.8)'">Non-Veg Masalas</a></li>
          <li><a href="shop.html?cat=Ready-Mix%20Products" style="color:rgba(254,215,170,.8);font:500 14px/1 'Manrope';text-decoration:none;transition:color .25s" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(254,215,170,.8)'">Ready-Mix</a></li>
        </ul>
      </div>

      <div>
        <h5 style="font:600 11px/1 'Manrope';letter-spacing:.18em;text-transform:uppercase;color:#fed7aa;margin:0 0 18px">Heritage</h5>
        <ul style="list-style:none;padding:0;margin:0;display:grid;gap:12px">
          <li><a href="about.html" style="color:rgba(254,215,170,.8);font:500 14px/1 'Manrope';text-decoration:none;transition:color .25s" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(254,215,170,.8)'">Our Story</a></li>
          <li><a href="recipes.html" style="color:rgba(254,215,170,.8);font:500 14px/1 'Manrope';text-decoration:none;transition:color .25s" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(254,215,170,.8)'">Recipes</a></li>
          <li><a href="contact.html" style="color:rgba(254,215,170,.8);font:500 14px/1 'Manrope';text-decoration:none;transition:color .25s" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(254,215,170,.8)'">Contact</a></li>
          <li><a href="track.html" style="color:rgba(254,215,170,.8);font:500 14px/1 'Manrope';text-decoration:none;transition:color .25s" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(254,215,170,.8)'">Track Order</a></li>
          <li><a href="shipping.html" style="color:rgba(254,215,170,.8);font:500 14px/1 'Manrope';text-decoration:none;transition:color .25s" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(254,215,170,.8)'">Shipping &amp; Returns</a></li>
        </ul>
      </div>

      <div>
        <h5 style="font:600 11px/1 'Manrope';letter-spacing:.18em;text-transform:uppercase;color:#fed7aa;margin:0 0 18px">Visit Us</h5>
        <p style="color:rgba(254,215,170,.7);font:400 13px/1.7 'Manrope';margin:0 0 14px">${esc(s.address)}</p>
        <a href="tel:${attr(s.phone.replace(/\s/g,''))}" style="color:#fed7aa;font:600 14px/1.4 'Manrope';text-decoration:none;display:block;margin-bottom:6px">${esc(s.phone)}</a>
        <a href="mailto:${attr(s.email)}" style="color:rgba(254,215,170,.8);font:400 13px/1 'Manrope';text-decoration:none">${esc(s.email)}</a>
      </div>
    </div>

    <div style="max-width:1280px;margin:48px auto 0;padding-top:24px;border-top:1px solid rgba(254,215,170,.12);display:flex;justify-content:flex-start;flex-wrap:wrap;gap:12px">
      <p style="color:rgba(254,215,170,.5);font:400 12px/1 'Manrope';margin:0">© <span data-year>2026</span> Niks Masala · ${esc(s.company)}. All rights reserved.</p>
    </div>
  </footer>
  <style>
    @media (max-width:900px) {
      .footer-grid-premium { grid-template-columns: 1fr 1fr !important; gap: 32px !important; }
    }
    @media (max-width:520px) {
      .footer-grid-premium { grid-template-columns: 1fr !important; }
    }
  </style>`;
};

/* Premium product card v2 — soft shadow, hover lift, refined pills (single product image only) */
productCardHTML = function (p) {
  const variants = p.variants || [{ pack: p.weight || '', grams: p.grams || 100, price: p.price }];
  const first = variants[0];
  const hasMany = variants.length > 1;
  const badgeHtml = p.badge === 'BESTSELLER'
    ? `<span class="product-card-v2__badge">Bestseller</span>`
    : p.badge
      ? `<span class="product-card-v2__badge is-new">${esc(p.badge)}</span>`
      : '';

  return `
  <article class="product-card-v2">
    <a href="product.html?id=${attr(p.id)}" class="product-card-v2__media" aria-label="${attr(p.name)}">
      ${badgeHtml}
      <img class="pc-pack" src="${attr(p.image || FALLBACK_IMG)}" alt="${attr(p.name)}" loading="lazy" onerror="this.src='${FALLBACK_IMG}'">
    </a>
    <div class="product-card-v2__body">
      <p class="product-card-v2__cat">${esc(p.category)}</p>
      <h3 class="product-card-v2__name"><a href="product.html?id=${attr(p.id)}">${esc(p.name)}</a></h3>
      ${hasMany ? `
      <div id="vpills-${attr(p.id)}" class="product-card-v2__pills">
        ${variants.slice(0, 4).map((v, i) => `<button type="button" class="product-card-v2__pill variant-pill${i === 0 ? ' is-active active' : ''}" onclick="selectVariant('${attr(p.id)}',${i})">${esc(v.pack)}</button>`).join('')}
      </div>` : `<p class="product-card-v2__single-pack">${esc(first.pack)}</p>`}
      <div class="product-card-v2__foot">
        <span class="product-card-v2__price">
          ${hasMany ? `<span class="from">from</span>` : ''}
          <span class="amount" id="vprice-${attr(p.id)}">${money(first.price)}</span>
        </span>
        <button class="product-card-v2__add" onclick="addToCart('${attr(p.id)}')" aria-label="Add ${attr(p.name)} to cart" title="Add to cart">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>
    </div>
  </article>`;
};

/* Override selectVariant to handle the new pill styling */
(function () {
  const original = selectVariant;
  selectVariant = function (id, idx) {
    _selectedVariant[id] = idx;
    const p = getProducts().find(x => x.id === id);
    if (!p) return;
    const v = p.variants[idx];
    if (!v) return;
    const priceEl = document.getElementById('vprice-' + id);
    if (priceEl) priceEl.textContent = money(v.price);
    document.querySelectorAll('#vpills-' + id + ' .variant-pill').forEach((el, i) => {
      const isActive = i === idx;
      el.classList.toggle('is-active', isActive);
      el.classList.toggle('active', isActive);
    });
  };
})();

/* Premium toast (replaces the inherited basic one) */
(function () {
  toast = function (msg, type) {
    let t = document.getElementById('globalToast');
    if (!t) { t = document.createElement('div'); t.id = 'globalToast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(window._tt);
    window._tt = setTimeout(() => t.className = 'toast', 2800);
  };
})();

/* Re-scan reveal targets once the header/footer markup has been injected */
window.addEventListener('DOMContentLoaded', () => {
  if (window.__bindReveal) window.__bindReveal();
});
