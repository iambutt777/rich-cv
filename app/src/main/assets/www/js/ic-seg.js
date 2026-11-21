/* (v4.71) Keep the icons in the Edit boxes when the phone fills a box in (saved email, address, name...).
   Android / Chrome paints a filled-in box with its own colour and removes the box's background picture, which is
   where the icon and its little side panel are drawn. A copy of that side panel is laid over the box while it is
   filled in by the phone, so the icon never disappears. */
(function () {
  'use strict';
  const IDS = ['fullName', 'title', 'phone', 'email', 'address', 'nationality', 'passport', 'dob', 'licence', 'linkedin', 'website'];
  const items = [];
  const key = () => (document.documentElement.dataset.theme || '') + '|' + (document.documentElement.dataset.accent || '');
  const filled = el => { try { return el.matches(':-webkit-autofill') || el.matches(':autofill'); } catch (e) { return false; } };

  // read the box's own icon + side panel (only while it is not filled in by the phone, when the picture is still there)
  function readLook(it) {
    if (filled(it.el)) return;
    const cs = getComputedStyle(it.el);
    if (!cs.backgroundImage || cs.backgroundImage === 'none') return;
    it.look = { k: key(), img: cs.backgroundImage, pos: cs.backgroundPosition, size: cs.backgroundSize, rep: cs.backgroundRepeat };
    const s = it.seg.style;
    s.backgroundImage = it.look.img; s.backgroundPosition = it.look.pos; s.backgroundSize = it.look.size; s.backgroundRepeat = it.look.rep;
  }
  function place(it) {
    const el = it.el;
    if (!it.look || it.look.k !== key()) readLook(it);
    const on = filled(el) && !!it.look && el.offsetParent !== null;
    it.seg.hidden = !on;
    if (!on) return;
    const cs = getComputedStyle(el);
    const bl = parseFloat(cs.borderLeftWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0;
    const r = Math.max(0, (parseFloat(cs.borderTopLeftRadius) || 0) - bl);
    const s = it.seg.style;
    s.left = (el.offsetLeft + bl) + 'px';
    s.top = (el.offsetTop + bt) + 'px';
    s.height = Math.max(0, el.offsetHeight - bt - bb) + 'px';
    s.borderRadius = r + 'px 0 0 ' + r + 'px';
  }
  const all = () => items.forEach(place);

  function init() {
    IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el || !el.closest('#cvForm')) return;
      const p = el.parentElement;
      if (getComputedStyle(p).position === 'static') p.style.position = 'relative';
      const seg = document.createElement('span');
      seg.className = 'ic-seg'; seg.hidden = true; seg.setAttribute('aria-hidden', 'true');
      el.insertAdjacentElement('afterend', seg);
      const it = { el, seg, look: null };
      items.push(it);
      readLook(it);
      ['input', 'change', 'focus', 'blur', 'animationstart'].forEach(t => el.addEventListener(t, () => place(it)));
    });
    // the phone can fill boxes in without telling the page: check a few times after loading and now and then
    [300, 1000, 2500, 5000].forEach(t => setTimeout(all, t));
    setInterval(all, 2000);
    window.addEventListener('resize', all);
    // the app colours changed (light / dark, accent): read the boxes' look again
    new MutationObserver(() => setTimeout(() => { items.forEach(it => { it.look = null; }); all(); }, 50))
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
