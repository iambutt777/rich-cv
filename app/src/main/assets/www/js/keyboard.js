/* Keeps the box you are typing in above the phone keyboard.
   When a box near the bottom is tapped, the keyboard opens over it. As soon as the screen gets smaller
   (keyboard open) the box is moved up into the free space, just under the header. */
(function () {
  'use strict';
  const EDIT = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=button]):not([readonly]), textarea, [contenteditable="true"]';
  let timers = [];

  function view() {
    const vv = window.visualViewport;
    return vv ? { top: vv.offsetTop, h: vv.height } : { top: 0, h: window.innerHeight };
  }
  // top edge that is free of the sticky header (or the settings / sheet header)
  function topLimit(el) {
    let lim = 0;
    const bars = [document.querySelector('.topbar')];
    const page = el.closest('.settings-page');
    if (page) bars.push(page.querySelector('.sp-bar'));
    bars.forEach(b => { if (b && b.offsetParent !== null) { const r = b.getBoundingClientRect(); if (r.bottom > lim && r.top < 40) lim = r.bottom; } });
    return lim;
  }
  function scroller(el) {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 4) return p;
    }
    return null;
  }

  function ensure(el) {
    if (!el || document.activeElement !== el || !el.isConnected) return;
    const r = el.getBoundingClientRect();
    if (!r.height) return;
    const v = view();
    const top = Math.max(topLimit(el), v.top) + 12;
    const bottom = v.top + v.h - 16;
    const boxH = Math.min(r.height, 140);                  // a tall text box: only its first lines need to show
    if (r.top >= top && r.top + boxH <= bottom) return;    // already in the free space
    // aim: the box a little under the header, so the label above it shows too
    const want = top + Math.min(56, Math.max(0, (bottom - top - boxH) * 0.25));
    const delta = r.top - want;
    const box = scroller(el);
    if (box) box.scrollBy({ top: delta, behavior: 'smooth' });
    else window.scrollBy({ top: delta, behavior: 'smooth' });
  }
  // (v4.97) web: the browser may have slid the visible part up to show the box; turn that into a normal page scroll
  function settle() {
    const vv = window.visualViewport;
    if (!vv || !(vv.offsetTop > 1)) return;
    const off = vv.offsetTop;
    window.scrollTo(0, window.scrollY + off);
  }

  function later(el) {
    timers.forEach(clearTimeout);
    timers = [60, 320, 650, 1000].map(ms => setTimeout(() => ensure(el), ms));
  }

  // Many phone keyboards (Samsung, Gboard) type whole words at once and skip the box's letter limit (maxlength):
  // cut the text back to the limit after every change
  const limit = e => {
    const el = e.target;
    if (!el || !(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') || !(el.maxLength > 0) || el.value.length <= el.maxLength) return;
    const end = Math.min(el.selectionEnd == null ? el.value.length : el.selectionEnd, el.maxLength);
    el.value = el.value.slice(0, el.maxLength);
    try { el.setSelectionRange(end, end); } catch (x) { /* some boxes have no cursor */ }
  };
  document.addEventListener('input', limit, true);
  document.addEventListener('compositionend', e => setTimeout(() => limit(e), 0), true);

  document.addEventListener('focusin', e => {
    const el = e.target;
    if (el && el.matches && el.matches(EDIT)) later(el);
  });
  // the keyboard opening makes the page (Android app) or the visible part (browser) smaller
  // (v4.37) compared with the full height (some phones shrink the screen in several small steps), and checked
  // again while the keyboard slides in
  let fullH = view().h, kbOpen = false;
  const onResize = () => {
    const h = view().h;
    const el = document.activeElement;
    if (h > fullH) fullH = h;
    const open = h < fullH - 100;
    if (open && el && el.matches && el.matches(EDIT)) { later(el); setTimeout(settle, 700); }
    if (!open && h >= fullH - 20) fullH = h;
    if (open) {
      kbH = Math.max(kbH, fullH - h); keepY = window.scrollY;
      // (v4.97) web browsers only shrink the visible part: give the page room at the end right away, so the box is moved up
      // by a real page scroll (which stays) and not by sliding the visible part (which slides back when the keyboard closes)
      const need = kbH + 40;
      if ((parseFloat(spacer.style.height) || 0) < need) spacer.style.height = need + 'px';
      if (!spacer.isConnected) document.body.appendChild(spacer);
    }
    // (v4.97) the keyboard closed: keep the page where it is. Without this, a box near the bottom of the page was
    // scrolled up for the keyboard and the page slid back down when the keyboard closed. A spacer at the end of the
    // page keeps the same position; it goes away by itself once the user scrolls back up past it.
    if (kbOpen && !open && kbH > 0) {
      const y = keepY + (window.visualViewport ? window.visualViewport.offsetTop || 0 : 0);
      if (!spacer.isConnected) document.body.appendChild(spacer);
      window.scrollTo(0, y);
      requestAnimationFrame(() => window.scrollTo(0, y));
      setTimeout(() => window.scrollTo(0, y), 250);
      kbH = 0;
    }
    kbOpen = open;
  };
  let kbH = 0, keepY = 0;
  const spacer = document.createElement('div');
  spacer.className = 'kb-spacer'; spacer.setAttribute('aria-hidden', 'true');
  window.addEventListener('scroll', () => {
    if (kbOpen) { keepY = window.scrollY; return; }
    if (!spacer.isConnected) return;
    if (spacer.getBoundingClientRect().top > window.innerHeight + 2) { spacer.remove(); spacer.style.height = '0px'; }
  }, { passive: true });
  // another page or tab: no spacer
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.wiz-nav, .view-tab, #goHome, [data-view]') && spacer.isConnected) { spacer.remove(); spacer.style.height = '0px'; } }, true);
  // tapping a box that already has the cursor opens the keyboard without a new focus: check again
  document.addEventListener('click', e => { const el = e.target; if (el && el.matches && el.matches(EDIT) && document.activeElement === el) later(el); }, true);
  // typing: the box never hides behind the keyboard
  document.addEventListener('input', e => { const el = e.target; if (el && el.matches && el.matches(EDIT)) ensure(el); }, true);
  window.addEventListener('resize', onResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
})();
/* (v4.97) Typing in a window (a dialog over the page, e.g. the Pro password, sign-in, rename): the keyboard opens OVER the
   page instead of making it shorter, so the page behind the window does not jump or squeeze. The window itself moves up
   above the keyboard (Android tells the height in --kb-h). */
(function () {
  const B = () => window.AndroidBridge;
  const isEdit = el => el && el.matches && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=button]), textarea');
  function fixedHost(el) {
    for (let n = el && el.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (n.matches('.settings-page, .view')) return null;       // full pages keep the normal keyboard behaviour
      if (cs.position === 'fixed' && n.offsetWidth >= innerWidth * 0.6) return n;
    }
    return null;
  }
  let host = null;
  function set(on, h) {
    try { const b = B(); if (b && b.setKbOverlay) b.setKbOverlay(!!on); } catch (e) {}
    if (host && host !== h) host.classList.remove('kb-lift');
    host = on ? h : null;
    if (host) host.classList.add('kb-lift');
  }
  document.addEventListener('focusin', e => { if (!isEdit(e.target)) return; const h = fixedHost(e.target); set(!!h, h); }, true);
  document.addEventListener('focusout', () => setTimeout(() => {
    const a = document.activeElement; const h = isEdit(a) ? fixedHost(a) : null; set(!!h, h);
  }, 60), true);
})();
/* (v4.97) The keyboard opens only for a tap INSIDE a text box. A tap on its title (label), in the gap next to it or on
   the page does not put the cursor in a box (phones "snap" such near-misses onto the closest box). Decided by WHAT was
   touched, not by screen positions (those differ with the app's display size on some phones). A tap on a button that
   opens a window with a text box still lets that box get the cursor. */
(function () {
  const EDIT = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=button]):not([type=submit]), textarea, [contenteditable="true"]';
  const OPENER = 'button, a, [role=button], [role=option], [role=menuitem], [role=tab], .dd, .chip, select';
  let last = null;
  document.addEventListener('touchstart', e => { last = { target: e.target, at: Date.now() }; }, { capture: true, passive: true });
  document.addEventListener('focusin', e => {
    const el = e.target;
    if (!last || Date.now() - last.at > 900 || !el.matches || !el.matches(EDIT)) return;
    const t = last.target; last = null;
    if (!t || t === el || el.contains(t) || (t.closest && t.closest(OPENER))) return;     // inside the box, or a button
    e.stopImmediatePropagation();                       // not typing: the bottom ad stays
    el.blur();
    setTimeout(() => { const a = document.activeElement; if (!a || !a.matches || !a.matches(EDIT)) document.body.classList.remove('typing'); }, 0);
  }, true);
})();
