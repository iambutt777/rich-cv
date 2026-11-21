/* (v4.86) Home fits the screen: everything on Home is shown at once, without scrolling or dragging.
   When the screen is short, Home's content is made a little smaller (never below 70 %) so it all fits
   between the header and the bottom banner. */
(function () {
  'use strict';
  const html = document.documentElement;
  let raf = 0;
  function fit() {
    raf = 0;
    const home = document.getElementById('view-home');
    const on = document.body && document.body.dataset.view === 'home' && home && !home.hidden;
    if (!on) { html.classList.remove('home-fit'); if (home) home.style.zoom = ''; return; }
    const sc = document.scrollingElement || html;
    const keep = sc.scrollTop;
    home.style.zoom = '';
    // room for Home: from its top (on the page) down to the bottom banner (or the screen's bottom)
    const bar = document.getElementById('adBar');
    const barH = bar && !bar.hidden && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().height : 0;
    const top = home.getBoundingClientRect().top + sc.scrollTop, need = home.getBoundingClientRect().height;
    const room = window.innerHeight - barH - top - 6;
    const k = need > 0 ? room / need : 1;
    if (k < 1) home.style.zoom = Math.max(0.7, k).toFixed(4);
    // (v4.94) a very small screen: even at 70 % it does not fit, so Home may scroll (nothing hides under the banner)
    const fits = k >= 0.7;
    html.classList.toggle('home-fit', fits);
    if (fits) { if (sc.scrollTop) window.scrollTo(0, 0); }
    else if (sc.scrollTop !== keep) window.scrollTo(0, keep);
  }
  const soon = () => { if (!raf) raf = requestAnimationFrame(fit); };
  function start() {
    soon(); setTimeout(soon, 300); setTimeout(soon, 1200);
    new MutationObserver(soon).observe(document.body, { attributes: true, attributeFilter: ['data-view', 'class'] });
    window.addEventListener('resize', soon);
    window.addEventListener('load', soon);
    document.addEventListener('richlang', () => setTimeout(soon, 60));
    // something tries to scroll Home (a stray drag, a focus): back to the top
    window.addEventListener('scroll', () => { if (html.classList.contains('home-fit') && (document.scrollingElement || html).scrollTop) window.scrollTo(0, 0); }, { passive: true });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
