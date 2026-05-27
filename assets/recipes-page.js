/* ==========================================================
   recipes.html — page bootstrap
   Mounts header + footer, renders the 10-video grid, wires
   the YouTube lightbox. Same lightbox markup + behaviour as
   index.html (the modal element is declared on the page).
   ========================================================== */
(function(){
  /* 1. Mount the shared header + footer from theme-app.js */
  const hdr = document.getElementById('siteHeader');
  const ftr = document.getElementById('siteFooter');
  if (hdr) hdr.insertAdjacentHTML('beforeend', buildHeader('recipes'));
  if (ftr) ftr.insertAdjacentHTML('beforeend', buildFooter());

  /* 2. Render the recipe video grid.
     Same 10 IDs as the homepage carousel — when the merchant
     uploads new recipes, edit this list (one source of truth
     would be ideal; left as a follow-up). */
  const RECIPE_VIDEOS = [
    'BoByWhIz5kY', 'bNBAGO8UFjE', 'ibxDEoZSN6Q', 'Dty_DSV39dM', 'qG4vf2ZPYHY',
    'LuVUt7aBPGM', 'mmOqxhsM11w', '24ll6JK39PU', 'e40Qnbf9djg', 'Yx8K5TpYmus'
  ];

  const grid = document.getElementById('recipeVidGrid');
  if (grid) {
    const html = RECIPE_VIDEOS.map(function(id, i){
      const idx = String(i + 1).padStart(2, '0');
      return ''
        + '<button type="button" class="recipe-vid-card" data-yt="' + id + '" '
        + 'onclick="openYt(\'' + id + '\')" aria-label="Play recipe video ' + (i + 1) + '">'
        +   '<div class="recipe-vid-thumb">'
        +     '<img loading="lazy" '
        +          'src="https://i.ytimg.com/vi/' + id + '/hqdefault.jpg" '
        +          'srcset="https://i.ytimg.com/vi/' + id + '/mqdefault.jpg 320w, '
        +                  'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg 480w, '
        +                  'https://i.ytimg.com/vi/' + id + '/sddefault.jpg 640w" '
        +          'sizes="(max-width: 440px) 100vw, (max-width: 820px) 50vw, (max-width: 1180px) 33vw, 25vw" '
        +          'alt="" '
        +          'onerror="this.onerror=null;this.src=\'https://i.ytimg.com/vi/' + id + '/0.jpg\'"/>'
        +     '<span class="recipe-vid-badge">YouTube</span>'
        +     '<div class="recipe-vid-overlay"><div class="recipe-vid-play"></div></div>'
        +   '</div>'
        +   '<div class="recipe-vid-meta">'
        +     '<p class="recipe-vid-eyebrow">Recipe ' + idx + '</p>'
        +     '<h3 class="recipe-vid-title" data-fallback="Niks Masala Recipe">Niks Masala Recipe</h3>'
        +   '</div>'
        + '</button>';
    }).join('');
    grid.insertAdjacentHTML('beforeend', html);

    /* Re-scan reveal targets now that the cards are in the DOM */
    if (window.__bindReveal) window.__bindReveal();

    /* Fetch real titles via YouTube's public oEmbed (no API key needed) */
    RECIPE_VIDEOS.forEach(function(id){
      const card = grid.querySelector('.recipe-vid-card[data-yt="' + id + '"]');
      if (!card) return;
      fetch('https://www.youtube.com/oembed?format=json&url=' +
            encodeURIComponent('https://www.youtube.com/watch?v=' + id))
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(j){
          if (!j || !j.title) return;
          const titleEl = card.querySelector('.recipe-vid-title');
          if (titleEl) titleEl.textContent = j.title;
          const img = card.querySelector('img');
          if (img) img.alt = j.title;
        })
        .catch(function(){ /* keep fallback title */ });
    });
  }

  /* 3. YouTube lightbox (DOM-built iframe — no innerHTML on attacker-influenced data) */
  window.openYt = function(id){
    const lb = document.getElementById('ytLightbox');
    const frame = document.getElementById('ytFrame');
    if (!lb || !frame) return;
    /* Clear any previous iframe */
    while (frame.firstChild) frame.removeChild(frame.firstChild);
    const ifr = document.createElement('iframe');
    /* IDs only ever come from our static RECIPE_VIDEOS list, but encode anyway */
    ifr.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id)
            + '?autoplay=1&rel=0&modestbranding=1&playsinline=1';
    ifr.title = 'Niks Masala recipe video';
    ifr.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
    ifr.setAttribute('allowfullscreen', '');
    ifr.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    frame.appendChild(ifr);
    lb.classList.add('open');
    document.body.classList.add('yt-open');
  };
  window.closeYt = function(){
    const lb = document.getElementById('ytLightbox');
    const frame = document.getElementById('ytFrame');
    if (!lb || !frame) return;
    while (frame.firstChild) frame.removeChild(frame.firstChild);
    lb.classList.remove('open');
    document.body.classList.remove('yt-open');
  };
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') {
      const lb = document.getElementById('ytLightbox');
      if (lb && lb.classList.contains('open')) window.closeYt();
    }
  });
})();
