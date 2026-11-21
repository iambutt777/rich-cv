/* Drag and drop to reorder (v4.24): hold the grip and move a row up or down; the others slide out of the way.
   RichDrag.attach(container, { item: '.row', handle: '.drag-h', onDrop: (from, to) => {} })
   Works with a finger or a mouse. The page scrolls by itself when the row is held near the top or bottom. */
(function () {
  'use strict';
  function attach(box, opt) {
    if (!box || box._richDrag) return;
    box._richDrag = true;
    let d = null;

    const items = () => Array.from(box.querySelectorAll(':scope > ' + opt.item));
    function start(e) {
      const h = e.target.closest(opt.handle);
      if (!h || !box.contains(h) || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const el = h.closest(opt.item);
      if (!el || el.parentElement !== box) return;
      const list = items();
      if (list.length < 2) return;
      e.preventDefault();
      try { h.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      const rects = list.map(x => x.getBoundingClientRect());
      const from = list.indexOf(el);
      const gap = list.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 0;
      d = { h, el, list, rects, from, to: from, y0: e.clientY, sy0: window.scrollY, dy: 0, step: rects[from].height + gap, id: e.pointerId, raf: 0, lastY: e.clientY };
      el.classList.add('is-dragging');
      box.classList.add('drag-on');
      list.forEach(x => { if (x !== el) x.style.transition = 'transform .18s cubic-bezier(.2,.8,.2,1)'; });
      try { if (window.AndroidBridge && AndroidBridge.haptic) AndroidBridge.haptic(); else if (navigator.vibrate) navigator.vibrate(8); } catch (x) { /* ignore */ }
      loop();
    }
    function place() {
      const dy = d.lastY - d.y0 + (window.scrollY - d.sy0);
      d.dy = dy;
      d.el.style.transform = 'translate3d(0,' + dy.toFixed(1) + 'px,0) scale(1.02)';
      // which slot the middle of the held row is over
      const mid = d.rects[d.from].top + d.rects[d.from].height / 2 + dy;
      let to = d.from;
      d.rects.forEach((r, i) => {
        const m = r.top + r.height / 2;
        if (i > d.from && mid > m) to = Math.max(to, i);
        if (i < d.from && mid < m) to = Math.min(to, i);
      });
      if (to !== d.to) {
        d.to = to;
        try { if (navigator.vibrate) navigator.vibrate(4); } catch (x) { /* ignore */ }
      }
      d.list.forEach((x, i) => {
        if (x === d.el) return;
        let s = 0;
        if (d.from < d.to && i > d.from && i <= d.to) s = -d.step;
        if (d.from > d.to && i < d.from && i >= d.to) s = d.step;
        x.style.transform = s ? 'translate3d(0,' + s + 'px,0)' : '';
      });
    }
    // keep the page moving while the row is held near the top or bottom edge of the screen
    function loop() {
      if (!d) return;
      const top = (document.querySelector('.topbar') || { getBoundingClientRect: () => ({ bottom: 0 }) }).getBoundingClientRect().bottom;
      const H = window.innerHeight, edge = 70;
      let v = 0;
      if (d.lastY < top + edge) v = -Math.min(14, (top + edge - d.lastY) / 4);
      else if (d.lastY > H - edge - 60) v = Math.min(14, (d.lastY - (H - edge - 60)) / 4);
      if (v) window.scrollBy(0, v);
      place();
      d.raf = requestAnimationFrame(loop);
    }
    function move(e) {
      if (!d || e.pointerId !== d.id) return;
      e.preventDefault();
      d.lastY = e.clientY;
    }
    function end(e) {
      if (!d || (e && e.pointerId !== d.id)) return;
      const { el, list, from, to } = d;
      cancelAnimationFrame(d.raf);
      d = null;
      box.classList.remove('drag-on');
      el.classList.remove('is-dragging');
      list.forEach(x => { x.style.transform = ''; x.style.transition = ''; });
      if (to !== from) opt.onDrop(from, to);
    }
    box.addEventListener('pointerdown', start);
    box.addEventListener('pointermove', move, { passive: false });
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    box.addEventListener('lostpointercapture', end);
    // no long-press menu or text selection on the grip
    box.addEventListener('contextmenu', e => { if (e.target.closest(opt.handle)) e.preventDefault(); });
  }
  // the grip: six dots
  const GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>';
  window.RichDrag = { attach, GRIP };
})();
