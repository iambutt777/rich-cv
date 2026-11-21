/* Smooth layout: when the user does something that makes things appear, disappear or change size,
   the things around glide to their new place instead of jumping, and new things fade in.
   Only changes that come right after the user's own tap, click or typing are animated, measured from
   where everything was at that moment. Anything else (a page opening, content loading) just appears,
   so nothing ever slides from an old, wrong place.
   (Same idea as "FLIP": remember where things were, let the page change, then animate from old to new.) */
(function () {
  'use strict';
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !Element.prototype.animate) { window.RichAnim = { flip: (els, fn) => fn() }; return; }

  // boxes whose children glide (a box inside another box is fine: each moves its own children)
  const BOXES = [
    '#cvForm', '#cvForm > fieldset', '#cvForm .block', '#cvForm .field', '#cvForm .entries', '#cvForm .entry', '#cvForm .chips',
    '#cvForm .writer-row', '#cvForm .photo-row', '#cvForm .actions',
    '.sp-body', '.sp-body > section', '.sp-card', '#cloudBody', '.au-card', '.au-form', '.au-verify',
    '#cvList', '#dlList', '.pt-list', '#ptoolPanel',
    '.lf-head', '.dialog', '.sv-box'
  ].join(',');
  const NEVER = '.pages,.fullpages,.cc,.intro,.splash,.combo-list,.dp-sheet,.toast,.design-picker,.font-list,.cat-row,.topbar,canvas,svg';
  const DUR = 260, EASE = 'cubic-bezier(.2,0,0,1)', FRESH_MS = 900;

  const boxes = new Set();
  const snaps = new Map();          // box -> { at: time, pos: Map(child -> {x,y}) }

  const kidsOf = box => [...box.children].filter(k => {
    if (k.hidden || !k.getClientRects().length || k.matches('.ad-slot')) return false;   // ads are placed by Android: never moved by us
    const p = getComputedStyle(k).position;
    return p !== 'absolute' && p !== 'fixed' && p !== 'sticky';
  });
  const visible = el => el.isConnected && !!el.getClientRects().length;
  function measure(box) {
    const b = box.getBoundingClientRect(), m = new Map();
    for (const k of kidsOf(box)) {
      const r = k.getBoundingClientRect();
      m.set(k, { x: r.left - b.left + box.scrollLeft, y: r.top - b.top + box.scrollTop });
    }
    return m;
  }

  // the user is about to do something: remember where everything is right now (as drawn)
  function snapshot(list) {
    const t = performance.now();
    for (const box of list) if (visible(box)) snaps.set(box, { at: t, pos: measure(box) });
  }
  const boxesAround = el => { const out = []; for (let p = el; p && p !== document; p = p.parentElement) if (boxes.has(p)) out.push(p); return out; };
  const visibleBoxes = () => [...boxes].filter(b => b.isConnected);
  ['pointerdown', 'click', 'change'].forEach(type => document.addEventListener(type, () => snapshot(visibleBoxes()), true));
  ['keydown', 'input'].forEach(type => document.addEventListener(type, e => {
    if (!e.target || e.target.nodeType !== 1) return;
    snapshot(e.key === 'Enter' ? visibleBoxes() : boxesAround(e.target));   // typing: only the boxes around (fast)
  }, true));

  function pass(box) {
    const s = snaps.get(box);
    if (!s || performance.now() - s.at > FRESH_MS || !visible(box)) return;   // not caused by the user just now: no animation
    const from = s.pos;
    for (const k of from.keys()) if (k.getAnimations) k.getAnimations().forEach(a => { if (a.id === 'rich-glide') a.cancel(); });
    const now = measure(box);
    snaps.set(box, { at: s.at, pos: now });                    // a second change in the same moment starts from here
    const kept = [...now.keys()].filter(k => from.has(k));
    const fresh = [...now.keys()].filter(k => !from.has(k));
    if (from.size && !kept.length) return;                     // everything was replaced (new content): no animation
    for (const k of kept) {
      const a = from.get(k), b = now.get(k), dx = a.x - b.x, dy = a.y - b.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      k.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: DUR, easing: EASE }).id = 'rich-glide';
    }
    fresh.forEach((k, i) => {
      if (k.closest(NEVER)) return;
      k.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
        { duration: 240, delay: Math.min(i, 6) * 30, easing: EASE, fill: 'backwards' }).id = 'rich-glide';
    });
  }

  let pending = new Set(), queued = false;
  const mo = new MutationObserver(list => {
    for (const m of list) {
      for (let el = m.target.nodeType === 1 ? m.target : m.target.parentElement; el; el = el.parentElement) if (boxes.has(el)) pending.add(el);
      if (m.type === 'childList') m.addedNodes.forEach(n => { if (n.nodeType === 1) watchAll(n); });
    }
    if (!queued) { queued = true; queueMicrotask(flush); }
  });
  function flush() { queued = false; const list = [...pending]; pending = new Set(); list.forEach(pass); }

  function watchAll(root) {
    const add = b => { if (!boxes.has(b) && !b.closest(NEVER)) boxes.add(b); };
    if (root.matches && root.matches(BOXES)) add(root);
    if (root.querySelectorAll) root.querySelectorAll(BOXES).forEach(add);
  }
  // forget boxes that left the page (now and then)
  setInterval(() => { for (const b of boxes) if (!b.isConnected) { boxes.delete(b); snaps.delete(b); } }, 5000);

  function start() {
    watchAll(document.body);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.RichAnim = {
    // animate a change by hand (for code that changes things without a tap, e.g. the language page)
    flip(els, change) {
      const before = new Map([...els].map(e => [e, e.getBoundingClientRect()]));
      change();
      before.forEach((a, e) => {
        const b = e.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
        if (Math.abs(dx) + Math.abs(dy) > 1) e.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: DUR, easing: EASE });
      });
    }
  };
})();
