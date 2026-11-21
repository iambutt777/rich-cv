/* (v4.66) Photo background cleaner (Pro).
   The person in the CV photo stays; the background becomes white, light blue, light grey or blue, like a passport photo.
   - In the Android app: Google ML Kit Selfie Segmentation finds the person on the phone (offline, the model is inside the app).
   - Elsewhere (web): a simple colour cleaner for photos taken in front of a plain wall, with a strength slider.
   Nothing is sent to the internet. RichPhotoBg.open() · onNative(id, mask, error) */
(function () {
  'use strict';
  const tr = s => (window.RichI18n && window.RichI18n.t ? window.RichI18n.t(s) : s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const B = window.AndroidBridge;
  const native = () => { try { return !!(B && B.hasPhotoBg && B.hasPhotoBg()); } catch (e) { return false; } };
  const COLOURS = [
    { id: 'orig', name: 'Original' },
    { id: 'white', name: 'White', c: '#FFFFFF' },
    { id: 'lblue', name: 'Light blue', c: '#DDEAF7' },
    { id: 'lgrey', name: 'Light grey', c: '#E7E9ED' },
    { id: 'blue', name: 'Blue', c: '#9DBFE4' },
    { id: 'navy', name: 'Dark blue', c: '#24365C' },
    // (v4.91) soft studio backgrounds and your own colour
    { id: 'studio', name: 'Studio blue', g: ['#EAF2FC', '#9DBFE4'] },
    { id: 'sgrey', name: 'Studio grey', g: ['#F4F5F7', '#C3C8D1'] },
    { id: 'own', name: 'Your colour', own: true }
  ];
  let ownColour = '#F2E6D8', soft = 3, choke = 2;

  let peek = false, sheet = null, base = null, baseImg = null, mask = null, pick = 'white', strength = 30, lastResult = null, lastBase = null, reqId = 0, waiting = null;

  const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

  // ---------- web: colour cleaner (plain walls) ----------
  function colourMask(img, tol) {
    const W = img.naturalWidth, H = img.naturalHeight, s = Math.min(1, 360 / W), w = Math.max(8, Math.round(W * s)), h = Math.max(8, Math.round(H * s));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    const at = i => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]];
    const dist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 * 0.3 + (a[1] - b[1]) ** 2 * 0.59 + (a[2] - b[2]) ** 2 * 0.11) * 1.7;
    // the wall colour: the top and the upper sides (the bottom edge is usually the shoulders)
    const seeds = [];
    for (let i = 0; i < w; i++) seeds.push(i);
    for (let j = 0; j < Math.round(h * 0.7); j++) { seeds.push(j * w); seeds.push(j * w + w - 1); }
    const mean = [0, 0, 0]; seeds.forEach(i => { const p = at(i); mean[0] += p[0]; mean[1] += p[1]; mean[2] += p[2]; });
    mean[0] /= seeds.length; mean[1] /= seeds.length; mean[2] /= seeds.length;
    const bg = new Uint8Array(w * h), q = [];
    seeds.forEach(i => { if (!bg[i] && dist(at(i), mean) < tol * 2.4) { bg[i] = 1; q.push(i); } });
    while (q.length) {
      const i = q.pop(), p = at(i), xx = i % w, yy = (i / w) | 0;
      [[xx - 1, yy], [xx + 1, yy], [xx, yy - 1], [xx, yy + 1]].forEach(([a, b]) => {
        if (a < 0 || b < 0 || a >= w || b >= h) return;
        const k = b * w + a; if (bg[k]) return;
        const pk = at(k);
        if (dist(pk, p) < tol * 0.75 && dist(pk, mean) < tol * 2.4) { bg[k] = 1; q.push(k); }
      });
    }
    // (v4.91) keep only the person: the biggest piece that is not wall (small spots on the wall go too)
    const lab = new Int32Array(w * h).fill(-1); let best = -1, bestN = 0, id = 0;
    for (let i0 = 0; i0 < w * h; i0++) {
      if (bg[i0] || lab[i0] >= 0) continue;
      let n = 0; const st = [i0]; lab[i0] = id;
      while (st.length) {
        const i = st.pop(); n++;
        const xx = i % w, yy = (i / w) | 0;
        if (xx > 0 && !bg[i - 1] && lab[i - 1] < 0) { lab[i - 1] = id; st.push(i - 1); }
        if (xx < w - 1 && !bg[i + 1] && lab[i + 1] < 0) { lab[i + 1] = id; st.push(i + 1); }
        if (yy > 0 && !bg[i - w] && lab[i - w] < 0) { lab[i - w] = id; st.push(i - w); }
        if (yy < h - 1 && !bg[i + w] && lab[i + w] < 0) { lab[i + w] = id; st.push(i + w); }
      }
      if (n > bestN) { bestN = n; best = id; }
      id++;
    }
    for (let i = 0; i < w * h; i++) if (!bg[i] && lab[i] !== best) bg[i] = 1;
    // the mask: white where the person is, see-through where the wall was
    const m = document.createElement('canvas'); m.width = w; m.height = h;
    const mx = m.getContext('2d'), out = mx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = 255; out.data[i * 4 + 3] = bg[i] ? 0 : 255; }
    mx.putImageData(out, 0, 0);
    return m;
  }

  // ---------- (v4.91) a clean edge: the mask at the photo's size, softened, then tightened a little ----------
  let refined = null, refinedKey = '';
  function refinedMask() {
    const W = baseImg.naturalWidth, H = baseImg.naturalHeight, key = [mask && mask.src || mask, soft, choke, W, H, strength].join('|');
    if (refined && refinedKey === key) return refined;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingQuality = 'high';
    const blurPx = (soft + (native() ? 0.6 : 1.6)) * W / 420;
    x.filter = 'blur(' + blurPx.toFixed(2) + 'px)';
    x.drawImage(mask, 0, 0, W, H);
    x.filter = 'none';
    const d = x.getImageData(0, 0, W, H), a = d.data;
    // a soft but firm edge: the middle of the blur becomes the edge, moved inwards by "choke" (less halo of the old wall)
    const lo = 0.18 + choke * 0.06, hi = Math.min(0.98, lo + 0.34 + soft * 0.04);
    for (let k = 3; k < a.length; k += 4) {
      let t = (a[k] / 255 - lo) / (hi - lo); t = t < 0 ? 0 : t > 1 ? 1 : t;
      a[k] = Math.round(t * t * (3 - 2 * t) * 255);
      a[k - 3] = a[k - 2] = a[k - 1] = 255;
    }
    x.putImageData(d, 0, 0);
    refined = c; refinedKey = key;
    return c;
  }
  const choiceOf = id => COLOURS.find(x => x.id === id) || {};
  function paintBg(o, W, H, ch) {
    if (ch.g) { const g = o.createLinearGradient(0, 0, 0, H); g.addColorStop(0, ch.g[0]); g.addColorStop(1, ch.g[1]); o.fillStyle = g; }
    else o.fillStyle = ch.own ? ownColour : ch.c;
    o.fillRect(0, 0, W, H);
  }
  // ---------- put the person on the new colour ----------
  function compose(id) {
    const W = baseImg.naturalWidth, H = baseImg.naturalHeight, ch = choiceOf(id);
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const o = out.getContext('2d');
    if (id === 'orig' || !mask) { o.drawImage(baseImg, 0, 0); return out; }
    const p = document.createElement('canvas'); p.width = W; p.height = H;
    const px = p.getContext('2d');
    px.drawImage(baseImg, 0, 0);
    px.globalCompositeOperation = 'destination-in';
    px.drawImage(refinedMask(), 0, 0);
    paintBg(o, W, H, ch);
    o.drawImage(p, 0, 0);
    return out;
  }

  function draw() {
    if (!sheet) return;
    const c = sheet.querySelector('.pb-canvas');
    const r = compose(peek ? 'orig' : pick);
    c.width = r.width; c.height = r.height;
    c.getContext('2d').drawImage(r, 0, 0);
    sheet.querySelectorAll('[data-pbc]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.pbc === pick)));
  }

  function busy(on, text) {
    if (!sheet) return;
    sheet.classList.toggle('is-busy', !!on);
    const t = sheet.querySelector('.pb-busy span'); if (t && text) t.textContent = tr(text);
  }

  async function findPerson() {
    mask = null; refined = null;
    if (native()) {
      busy(true, 'Finding you in the photo…');
      const id = 'pb' + (++reqId);
      try {
        const m = await new Promise((res, rej) => {
          waiting = { id, res, rej };
          B.photoBg(id, base);
          setTimeout(() => { if (waiting && waiting.id === id) { waiting = null; rej(new Error('timeout')); } }, 20000);
        });
        mask = await loadImg(m);
      } catch (e) {
        toast(tr('The background could not be found. Try a clearer photo.'), true);
        mask = null;
      }
      busy(false);
    } else {
      mask = colourMask(baseImg, strength);
    }
    draw();
  }

  const toast = (m, bad) => { if (window.RichApp && window.RichApp.toast) window.RichApp.toast(m, bad); };

  async function open() {
    const A = window.RichApp;
    const ph = A && A.photo ? A.photo() : null;
    if (!ph) { toast(tr('Add a photo first.')); return; }
    // working again on a photo cleaned before: start from the photo as it was, so colours can be switched freely
    base = (lastResult && ph === lastResult && lastBase) ? lastBase : ph;
    baseImg = await loadImg(base);
    build();
    await findPerson();
  }

  function build() {
    if (sheet) sheet.remove();
    sheet = document.createElement('div');
    sheet.className = 'overlay pb-overlay';
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'pbTitle');
    const pro = window.RichPremium && window.RichPremium.isPremium && window.RichPremium.isPremium();
    sheet.innerHTML =
      '<div class="pb-sheet">' +
        '<div class="pb-head"><h2 id="pbTitle">' + esc(tr('Photo background')) + '</h2>' +
          '<button type="button" class="pb-x" aria-label="' + esc(tr('Close')) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
        '<p class="pb-sub">' + esc(tr(native() ? 'Your photo stays on this phone. Choose a clean background, like a passport photo.' : 'Works best with a photo taken in front of a plain wall. Choose a clean background.')) + '</p>' +
        '<div class="pb-stage"><canvas class="pb-canvas" aria-label="' + esc(tr('Photo preview')) + '"></canvas>' +
          '<div class="pb-busy"><i></i><span></span></div></div>' +
        '<div class="pb-colours" role="radiogroup" aria-label="' + esc(tr('Background')) + '">' + COLOURS.map(c =>
          '<button type="button" role="radio" data-pbc="' + c.id + '" aria-checked="false"><i' +
            (c.c ? ' style="background:' + c.c + '"' : c.g ? ' style="background:linear-gradient(180deg,' + c.g.join(',') + ')"' : c.own ? ' class="pb-own" style="--own:' + ownColour + '"' : ' class="pb-orig"') + '></i><span>' + esc(tr(c.name)) + '</span>' +
            (c.own ? '<input type="color" id="pbOwn" value="' + ownColour + '" aria-label="' + esc(tr('Your colour')) + '">' : '') + '</button>').join('') + '</div>' +
        '<p class="pb-peek">' + esc(tr('Touch and hold the photo to see the original.')) + '</p>' +
        (native() ? '' : '<label class="pb-str"><span>' + esc(tr('Cleaning strength')) + '</span><input type="range" min="8" max="70" step="1" value="' + strength + '" id="pbStrength"></label>') +
        '<label class="pb-str"><span>' + esc(tr('Edge softness')) + '</span><input type="range" min="0" max="8" step="1" value="' + soft + '" id="pbSoft"></label>' +
        '<label class="pb-str"><span>' + esc(tr('Edge tightness')) + '</span><input type="range" min="0" max="6" step="1" value="' + choke + '" id="pbChoke"></label>' +
        '<div class="pb-btns"><button type="button" class="btn btn-ghost" id="pbCancel">' + esc(tr('Cancel')) + '</button>' +
          '<button type="button" class="btn pb-use" id="pbUse">' + esc(tr('Use this photo')) + '</button></div>' +
      '</div>';
    document.body.appendChild(sheet);
    document.documentElement.classList.add('no-scroll'); document.body.classList.add('no-scroll');
    ['touchstart', 'pointerdown', 'touchend'].forEach(t => sheet.addEventListener(t, e => e.stopPropagation()));
    sheet.addEventListener('touchmove', e => { if (!e.target.closest('.pb-sheet')) e.preventDefault(); }, { passive: false });
    sheet.addEventListener('click', e => {
      const c = e.target.closest('[data-pbc]');
      if (c) {
        pick = c.dataset.pbc; draw();
        if (c.dataset.pbc === 'own' && e.target.id !== 'pbOwn') { const i = sheet.querySelector('#pbOwn'); if (i) i.click(); }
        return;
      }
      if (e.target === sheet || e.target.closest('.pb-x') || e.target.closest('#pbCancel')) { close(); return; }
      if (e.target.closest('#pbUse')) use();
    });
    // hold the photo: see the original
    const stage = sheet.querySelector('.pb-stage');
    const peekOn = e => { if (e.cancelable) e.preventDefault(); peek = true; draw(); }, peekOff = () => { if (peek) { peek = false; draw(); } };
    stage.addEventListener('pointerdown', peekOn); ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => stage.addEventListener(t, peekOff));
    const own = sheet.querySelector('#pbOwn');
    if (own) own.addEventListener('input', () => { ownColour = own.value; const i = sheet.querySelector('.pb-own'); if (i) i.style.setProperty('--own', ownColour); pick = 'own'; draw(); });
    [['#pbSoft', v => { soft = v; }], ['#pbChoke', v => { choke = v; }]].forEach(([q, set]) => {
      const el = sheet.querySelector(q); if (!el) return; let t = 0;
      el.addEventListener('input', () => { set(+el.value); clearTimeout(t); t = setTimeout(draw, 40); });
    });
    const sl = sheet.querySelector('#pbStrength');
    if (sl) {
      let t = 0;
      sl.addEventListener('input', () => { strength = +sl.value; clearTimeout(t); t = setTimeout(() => { mask = colourMask(baseImg, strength); refined = null; draw(); }, 60); });
    }
    draw();
  }

  function use() {
    const P = window.RichPremium;
    // (v4.95) the photo background cleaner is free for everyone
    if (pick !== 'orig' && !mask) { toast(tr('The background could not be found. Try a clearer photo.'), true); return; }
    const url = pick === 'orig' ? base : compose(pick).toDataURL('image/jpeg', 0.92);
    lastBase = base; lastResult = url;
    if (window.RichApp && window.RichApp.setCleanPhoto) window.RichApp.setCleanPhoto(url);
    close();
    toast(tr(pick === 'orig' ? 'The original background is back.' : 'New background added to your photo.'));
  }

  function close() {
    if (!sheet) return;
    sheet.remove(); sheet = null; waiting = null;
    if (!document.querySelector('.overlay:not([hidden]), .tp-overlay:not([hidden])')) { document.documentElement.classList.remove('no-scroll'); document.body.classList.remove('no-scroll'); }
  }
  const isOpen = () => !!sheet;

  window.RichPhotoBg = {
    open, close, isOpen, native,
    onNative(id, m, err) {
      if (!waiting || waiting.id !== id) return;
      const w = waiting; waiting = null;
      if (m) w.res(m); else w.rej(new Error(err || 'failed'));
    }
  };
  // phone Back closes the window
  setTimeout(() => {
    const back = window.RichAndroidBack;
    window.RichAndroidBack = function () { if (sheet && !document.querySelector('.pm-overlay')) { close(); return true; } return typeof back === 'function' ? back.apply(this, arguments) : false; };
  }, 0);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet && !document.querySelector('.pm-overlay')) close(); });
})();
