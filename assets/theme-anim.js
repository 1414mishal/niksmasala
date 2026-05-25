/* ==========================================================
   NIKS MASALA PREMIUM — Animation engine
   (lifted from the dranjum design system, refactored)
   ========================================================== */
(function () {
  'use strict';

  // ===== Year =====
  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

  // ===== Scroll progress bar =====
  const progressBar = document.getElementById('scrollProgress');
  function updateProgress() {
    if (!progressBar) return;
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;
    progressBar.style.transform = 'scaleX(' + ratio + ')';
  }
  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();

  // ===== Reveal-on-scroll via IntersectionObserver =====
  function bindReveal(root) {
    root = root || document;
    const revealEls = root.querySelectorAll('[data-reveal]:not(.is-bound)');
    const revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          const delay = parseInt(entry.target.dataset.delay || '0', 10);
          if (delay > 0) {
            setTimeout(function () { entry.target.classList.add('is-visible'); }, delay);
          } else {
            entry.target.classList.add('is-visible');
          }
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    revealEls.forEach(function (el) { el.classList.add('is-bound'); revealObserver.observe(el); });

    // Stagger
    const staggerEls = root.querySelectorAll('[data-stagger]:not(.is-bound)');
    const staggerObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          const baseDelay = parseInt(entry.target.dataset.stagger || '100', 10);
          const kids = Array.from(entry.target.children);
          kids.forEach(function (child, i) { child.style.transitionDelay = (i * baseDelay) + 'ms'; });
          entry.target.classList.add('is-visible');
          staggerObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    staggerEls.forEach(function (el) { el.classList.add('is-bound'); staggerObserver.observe(el); });

    // Magnetic buttons
    root.querySelectorAll('.btn-fancy:not(.is-magnetic)').forEach(function (btn) {
      btn.classList.add('is-magnetic');
      btn.addEventListener('mousemove', function (e) {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        btn.style.setProperty('--mx', (x * 0.15) + 'px');
        btn.style.setProperty('--my', (y * 0.15) + 'px');
      });
      btn.addEventListener('mouseleave', function () {
        btn.style.setProperty('--mx', '0px');
        btn.style.setProperty('--my', '0px');
      });
    });
  }
  bindReveal();
  // Expose so dynamically-added cards can be re-scanned
  window.__bindReveal = bindReveal;

  // ===== Count-up =====
  function animateCounter(el, target, duration) {
    duration = duration || 1800;
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.floor(target * eased);
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = target;
    }
    requestAnimationFrame(tick);
  }
  const counterEls = document.querySelectorAll('[data-count]');
  const counterObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        const target = parseInt(entry.target.dataset.count, 10);
        animateCounter(entry.target, target);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.4 });
  counterEls.forEach(function (el) { el.textContent = '0'; counterObserver.observe(el); });

  // ===== Timeline =====
  const timelineLines = document.querySelectorAll('.timeline-line');
  const lineObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        lineObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  timelineLines.forEach(function (el) { lineObserver.observe(el); });

  const timelineDots = document.querySelectorAll('.timeline-dot');
  const dotObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        setTimeout(function () { entry.target.classList.add('is-visible'); }, 200);
        dotObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.4 });
  timelineDots.forEach(function (el) { dotObserver.observe(el); });

  // ===== Hero parallax (Ken Burns + translate) =====
  const heroBg = document.getElementById('heroBg');
  if (heroBg) {
    let ticking = false;
    function updateParallax() {
      const y = window.scrollY;
      if (y < window.innerHeight * 1.2) {
        heroBg.style.transform = 'translate3d(0, ' + (y * 0.35) + 'px, 0) scale(' + (1 + y * 0.0005) + ')';
      }
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { requestAnimationFrame(updateParallax); ticking = true; }
    }, { passive: true });
  }

  // ===== Rotating headline word =====
  const rotatingItems = document.querySelectorAll('.rotating-item');
  if (rotatingItems.length > 0) {
    let currentIdx = 0;
    function showRotating(newIdx) {
      rotatingItems.forEach(function (item) {
        const i = parseInt(item.dataset.idx, 10);
        item.classList.remove('is-active', 'is-past');
        if (i === newIdx) item.classList.add('is-active');
        else if (i < newIdx) item.classList.add('is-past');
      });
    }
    showRotating(0);
    setInterval(function () {
      currentIdx = (currentIdx + 1) % rotatingItems.length;
      showRotating(currentIdx);
    }, 2400);
  }

  // ===== Anchor flash =====
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function () {
      const id = a.getAttribute('href');
      if (id.length > 1) {
        const target = document.querySelector(id);
        if (target) {
          target.classList.add('flash-target');
          setTimeout(function () { target.classList.remove('flash-target'); }, 1200);
        }
      }
    });
  });

  // ===== Sticky nav: transparent → blurred morph at 50px =====
  // The header is injected dynamically by mountHeaderFooter(). Bind a single
  // scroll listener globally — it always re-queries the current header — so
  // we don't depend on the header being present at any specific moment.
  // Safety net: only allow the "transparent + light text" state while the
  // dark hero is still in viewport. Past the hero, the nav must morph to
  // its solid state regardless of scrollY, or text would be unreadable on
  // the cream sections below.
  function syncStickyNav() {
    const stickyNav = document.querySelector('header[data-sticky-nav]');
    if (!stickyNav) return;
    // Find a dark hero on the page (home page only)
    const darkHero = document.querySelector('body.home-nav-light section[style*="min-height:88vh"]');
    let solid = window.scrollY > 50;
    if (darkHero) {
      const rect = darkHero.getBoundingClientRect();
      // If hero bottom is above the nav (i.e. user scrolled past hero), always solid.
      if (rect.bottom < 120) solid = true;
    }
    if (solid) stickyNav.classList.add('is-scrolled');
    else stickyNav.classList.remove('is-scrolled');
  }
  window.addEventListener('scroll', syncStickyNav, { passive: true });
  window.addEventListener('load', syncStickyNav);
  // Run a few times on init in case the header arrives slightly after this script
  syncStickyNav();
  setTimeout(syncStickyNav, 50);
  setTimeout(syncStickyNav, 250);
  setTimeout(syncStickyNav, 800);

  // ===== Video carousel — horizontal scroll w/ snap, nav arrows =====
  window.__bindVideoCarousel = function () {
    const carousel = document.querySelector('[data-video-carousel]');
    if (!carousel || carousel.dataset.bound) return;
    carousel.dataset.bound = '1';
    const track = carousel.querySelector('.video-carousel__track');
    const prev = carousel.querySelector('[data-vc-prev]');
    const next = carousel.querySelector('[data-vc-next]');
    if (!track) return;

    function scrollBy(dir) {
      const card = track.querySelector('.video-carousel__card');
      const step = (card ? card.getBoundingClientRect().width : 320) + 20;
      track.scrollBy({ left: step * dir, behavior: 'smooth' });
    }
    function syncArrows() {
      if (!prev || !next) return;
      const maxScroll = track.scrollWidth - track.clientWidth - 4;
      prev.disabled = track.scrollLeft <= 4;
      next.disabled = track.scrollLeft >= maxScroll;
    }
    if (prev) prev.addEventListener('click', function () { scrollBy(-1); });
    if (next) next.addEventListener('click', function () { scrollBy(1); });
    track.addEventListener('scroll', syncArrows, { passive: true });
    window.addEventListener('resize', syncArrows);
    syncArrows();
  };
  window.__bindVideoCarousel();
})();
