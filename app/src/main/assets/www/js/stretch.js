/* Stretch at the top and bottom ends of a page, like Android's own overscroll stretch.
   Only the page content stretches: the app header (and the bar of a settings page) stays still.
   Android's built-in stretch is turned off in the app, because it stretches the whole screen, header included. */
(function () {
  'use strict';
  if (!('ontouchstart' in window)) return;                 // phones and tablets only
  const MAX = 0.11, K = 380;                               // most stretch (11 %), how fast it builds up
  const BACK_MS = 420, PULSE_MS = 380;
  // screens on top of the page: no stretch under them
  const COVERED = '.overlay:not([hidden]), .fullview:not([hidden]), .sheet-overlay:not([hidden]), .intro, .lang-first, .lang-restart, .ad-inter, .ld-ov:not([hidden]), .dp-ov:not([hidden])';
  const NO_DRAG = 'input[type=range], .crop-frame, .cc-stage, .drag-h';

  let g = null;           // the finger on the screen
  let run = null;         // the content springing back
  let lastFling = 0;      // when a finger last let go after dragging the page

  const isScroller = el => {
    const o = getComputedStyle(el).overflowY;
    return (o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + 2;
  };
  const atTop = sc => sc.scrollTop <= 0;
  const atBottom = sc => sc.scrollTop >= sc.scrollHeight - sc.clientHeight - 1;

  // which page the finger is on: the scrolling part and the content that stretches
  function pageOf(t) {
    if (!t || t.nodeType !== 1 || t.closest(NO_DRAG)) return null;
    if (document.body.classList.contains('no-scroll')) return null;
    if (document.documentElement.classList.contains('home-fit')) return null;      // (v4.86) Home fits the screen: nothing to drag
    let sc, content;
    const sp = t.closest('.settings-page');
    if (sp) { sc = sp; content = sp.querySelector(':scope > .sp-body'); }
    else {
      if (!t.closest('main, .topbar, .ad-bar') || document.querySelector(COVERED)) return null;
      if (document.body.classList.contains('settings-open') || document.body.classList.contains('auth-open')) return null;
      sc = document.scrollingElement || document.documentElement; content = document.querySelector('main');
    }
    for (let p = t; p && p !== sc && p !== document.body; p = p.parentElement) if (isScroller(p)) return null;   // a box that scrolls by itself
    return content ? { sc, content } : null;
  }

  // ---- the Home / PDF Tools rectangle ad is an Android view over the page: move it with the content ----
  const bridge = () => { try { return window.AndroidBridge && typeof window.AndroidBridge.shiftMrec === 'function' ? window.AndroidBridge : null; } catch (e) { return null; } };
  function adSpot(content) {
    if (!bridge()) return null;
    const slot = Array.from(content.querySelectorAll('.ad-slot.ad-native:not([hidden])')).find(x => x.getClientRects().length);   // the one on this screen
    if (!slot) return null;
    const f = innerWidth / (document.documentElement.getBoundingClientRect().width || innerWidth);
    const c = content.getBoundingClientRect(), s = slot.getBoundingClientRect();
    return { y: s.top - c.top, h: c.height, f, last: 0 };
  }
  function moveAd(p, s, edge) {
    if (!p.ad) return;
    const a = p.ad;
    const dy = (edge === 'top' ? a.y : -(a.h - a.y)) * (s - 1) * a.f;
    if (Math.abs(dy - a.last) < 0.4 && !(s === 1 && a.last)) return;
    a.last = s === 1 ? 0 : dy;
    try { bridge().shiftMrec(s === 1 ? 0 : dy); } catch (e) { /* ignore */ }
  }

  function draw(p, s, edge) {
    const c = p.content;
    if (s <= 1.0004) {
      c.style.transform = ''; c.style.transformOrigin = ''; c.style.willChange = '';
      moveAd(p, 1, edge);
      return;
    }
    c.style.willChange = 'transform';
    c.style.transformOrigin = edge === 'top' ? '50% 0' : '50% 100%';
    c.style.transform = 'scaleY(' + s.toFixed(4) + ')';
    moveAd(p, s, edge);
  }
  const amount = pull => 1 + MAX * (1 - Math.exp(-pull / K));

  function stopRun() { if (run) { cancelAnimationFrame(run.raf); draw(run.p, 1, run.edge); run = null; } }
  // ease the content back from stretch s0 (or, for a fling, out to s0 and back)
  function springBack(p, s0, edge, pulse) {
    stopRun();
    const t0 = performance.now(), dur = pulse ? PULSE_MS : BACK_MS;
    const r = run = { p, edge, raf: 0 };
    const step = now => {
      if (run !== r) return;
      const x = Math.min(1, (now - t0) / dur);
      let k;
      if (pulse) k = x < 0.3 ? 1 - Math.pow(1 - x / 0.3, 2) : Math.pow(1 - (x - 0.3) / 0.7, 3);   // quick out, slow back
      else k = Math.pow(1 - x, 3);
      draw(p, 1 + (s0 - 1) * k, edge);
      if (x < 1) r.raf = requestAnimationFrame(step); else { draw(p, 1, edge); run = null; }
    };
    r.raf = requestAnimationFrame(step);
  }

  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { end(); return; }
    const t = e.touches[0];
    const p = pageOf(e.target);
    if (!p) { g = null; return; }
    if (run && run.p.content === p.content) {          // caught while springing back: hold it where it is
      const s = parseFloat((/scaleY\(([\d.]+)\)/.exec(p.content.style.transform) || [])[1]) || 1;
      const edge = run.edge; cancelAnimationFrame(run.raf); run = null;
      g = Object.assign(p, { x0: t.clientX, y0: t.clientY, last: t.clientY, dir: null, own: false, edge: s > 1 ? edge : null,
        pull: s > 1 ? -K * Math.log(1 - Math.min(0.999, (s - 1) / MAX)) : 0, ad: adSpot(p.content) });
      return;
    }
    stopRun();
    g = Object.assign(p, { x0: t.clientX, y0: t.clientY, last: t.clientY, dir: null, own: false, edge: null, pull: 0, ad: null });
  }, { passive: true, capture: true });

  document.addEventListener('touchmove', e => {
    if (!g) return;
    if (e.touches.length !== 1) { end(); return; }
    const t = e.touches[0];
    if (!g.dir) {
      const dx = t.clientX - g.x0, dy = t.clientY - g.y0;
      if (Math.abs(dx) < 7 && Math.abs(dy) < 7) return;
      if (Math.abs(dx) > Math.abs(dy)) { end(); return; }     // sideways: not ours
      g.dir = 'v';
      // the very first move already pulls past an end: the page cannot scroll that way, so this drag is ours
      g.own = e.cancelable && ((dy > 0 && atTop(g.sc)) || (dy < 0 && atBottom(g.sc)));
    }
    if (g.own && e.cancelable) e.preventDefault();
    const delta = t.clientY - g.last;
    g.last = t.clientY;
    // (v4.16) a drag that started as an ordinary scroll belongs to the browser: never stretch on top of it
    // (a shaky finger at the very end made the page stretch and scroll at the same time: it jumped up and down)
    if (!g.own) return;
    if (!g.edge) {
      if (delta > 0 && atTop(g.sc)) g.edge = 'top';
      else if (delta < 0 && atBottom(g.sc)) g.edge = 'bottom';
      else { if (g.own) g.sc.scrollTop -= delta; return; }     // our drag going back into the page: scroll it by hand
      g.pull = 0; g.ad = adSpot(g.content);
    }
    g.pull += g.edge === 'top' ? delta : -delta;
    if (g.pull <= 0) {
      const extra = g.pull; g.pull = 0;
      draw(g, 1, g.edge); g.edge = null;
      if (g.own && extra) g.sc.scrollTop += delta < 0 ? -extra : extra;   // past the start again: scroll the rest
      return;
    }
    draw(g, amount(g.pull), g.edge);
  }, { passive: false, capture: true });

  function end() {
    if (!g) return;
    const p = g; g = null;
    if (p.dir === 'v') lastFling = performance.now();
    if (p.edge && p.pull > 0) springBack(p, amount(p.pull), p.edge, false);
    else draw(p, 1, p.edge || 'top');
  }
  document.addEventListener('touchend', e => { if (!e.touches.length) end(); }, { passive: true, capture: true });
  document.addEventListener('touchcancel', end, { passive: true, capture: true });

  // ---- a fling that runs into an end gives a short stretch too ----
  const speed = new WeakMap();      // scroller -> { top, t, v }
  function onScroll(sc) {
    const now = performance.now(), top = sc.scrollTop, s = speed.get(sc);
    speed.set(sc, { top, t: now, v: s && now - s.t < 100 ? (top - s.top) / Math.max(1, now - s.t) : 0 });
    if (!s || g || run || now - lastFling > 3000) return;    // only after the finger let go (not when the app scrolls by itself)
    const v = s.v;
    let edge = null;
    if (v < -0.6 && atTop(sc)) edge = 'top';
    else if (v > 0.6 && atBottom(sc) && sc.scrollHeight > sc.clientHeight + 40) edge = 'bottom';
    if (!edge) return;
    const content = sc.classList && sc.classList.contains('settings-page') ? sc.querySelector(':scope > .sp-body') : document.querySelector('main');
    if (!content || (!sc.classList.contains('settings-page') && document.querySelector(COVERED))) return;
    const p = { sc, content };
    p.ad = adSpot(content);
    springBack(p, 1 + Math.min(0.05, Math.abs(v) * 0.012), edge, true);
  }
  window.addEventListener('scroll', () => onScroll(document.scrollingElement || document.documentElement), { passive: true });
  document.addEventListener('scroll', e => { const sc = e.target; if (sc && sc.classList && sc.classList.contains('settings-page')) onScroll(sc); }, { passive: true, capture: true });
})();
