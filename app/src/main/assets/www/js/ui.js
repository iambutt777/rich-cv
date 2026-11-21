/* =========================================================================
   Small Google-style touches: ripple on press, and a tinted top bar
   once the page is scrolled.
   ========================================================================= */
(function () {
  const SEL = '.btn, .icon-btn, .view-tab, .home-card, .tool, .seg button, .cat-chip, .design-opt, .swatch, .font-opt, .combo-btn, .combo-opt, .sheet-opt, .home-continue, .icon-x, .icon-mv, .chip button';
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest(SEL);
    if (!el || el.disabled) return;
    const r = el.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.width = dot.style.height = size + 'px';
    dot.style.left = (e.clientX - r.left - size / 2) + 'px';
    dot.style.top = (e.clientY - r.top - size / 2) + 'px';
    el.appendChild(dot);
    setTimeout(() => dot.remove(), 600);
  }, { passive: true });
  const onScroll = () => document.body.classList.toggle('scrolled', window.scrollY > 4);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
