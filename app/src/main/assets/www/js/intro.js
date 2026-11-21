/* =========================================================================
   Intro slides, shown once: the first time the app is opened after installing.
   Pictures come from js/intro-images.js; the Back arrow, the dots and the
   Next / Get started button are real buttons drawn on top, in the empty
   space at the bottom of each picture. Swiping also changes slides.
   ========================================================================= */
(function () {
  const IMGS = window.RICH_INTRO_IMAGES || [];
  const N = IMGS.length;
  let root = null, frame = null, track = null, nextBtn = null, backBtn = null, dots = [], index = 0;
  const SEEN = 'richIntroSeen';
  const seen = () => { try { return localStorage.getItem(SEEN) === '1'; } catch (e) { return false; } };
  const markSeen = () => { try { localStorage.setItem(SEEN, '1'); } catch (e) { /* private mode: shows again next time */ } };

  // the English words drawn in each picture, and where they are (top / bottom, % of the picture height).
  // In other languages a panel with the translated words is laid over them.
  const WORDS = [
    { t: 'Create Your Resume', s: 'Build a professional resume in minutes with easy steps and beautiful designs.', top: 55.2, bottom: 78.5 },
    { t: 'Choose Your Perfect Template', s: 'Explore beautiful professional templates designed to make your resume stand out.', top: 59.6, bottom: 80 },
    { t: 'Download Your CV as PDF', s: 'Download your professional CV in PDF format and share it anytime, anywhere with ease.', top: 55.2, bottom: 80 }
  ];
  const I18N = window.RichI18n;
  const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function close() {
    if (!root) return;
    markSeen();
    root.classList.add('out');
    window.scrollTo(0, 0);                         // (v4.86) Home from its start
    const r = root; root = null;
    setTimeout(() => r.remove(), 380);
  }
  function go(i) {
    if (!root) return;
    index = Math.max(0, Math.min(N - 1, i));
    track.style.transform = 'translateX(' + (-100 * index / N) + '%)';
    root.style.background = IMGS[index].bg;
    const last = index === N - 1;
    root.classList.toggle('is-last', last);
    root.classList.toggle('is-first', index === 0);          // no Back arrow on the first picture
    if (backBtn) { backBtn.disabled = index === 0; backBtn.setAttribute('aria-hidden', String(index === 0)); }
    nextBtn.textContent = last ? 'GET STARTED' : 'NEXT';
    nextBtn.setAttribute('aria-label', last ? 'Get started' : 'Next');
    dots.forEach((d, k) => d.classList.toggle('on', k === index));
    root.querySelectorAll('.intro-slide').forEach((s, k) => s.setAttribute('aria-hidden', String(k !== index)));
  }
  // text and buttons scale with the picture width
  function fit() { if (frame) frame.style.fontSize = (frame.clientWidth / 768 * 30).toFixed(2) + 'px'; }

  function build() {
    root = document.createElement('div');
    root.className = 'intro'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Welcome to Rich CV Maker');
    frame = document.createElement('div'); frame.className = 'intro-frame';
    track = document.createElement('div'); track.className = 'intro-track';
    track.style.width = (N * 100) + '%';
    const tr = I18N && I18N.lang !== 'en';
    IMGS.forEach((im, k) => {
      const s = document.createElement('div'); s.className = 'intro-slide'; s.style.width = (100 / N) + '%';
      const img = document.createElement('img'); img.src = im.src; img.alt = ''; img.draggable = false;
      s.appendChild(img);
      const w = WORDS[k];
      if (tr && w) {
        const box = document.createElement('div');
        box.className = 'intro-words'; box.dir = I18N.isRtl() ? 'rtl' : 'ltr';
        box.style.top = w.top + '%'; box.style.height = (w.bottom - w.top) + '%';
        const h = document.createElement('h2'); h.textContent = I18N.t(w.t);
        const p = document.createElement('p'); p.textContent = I18N.t(w.s);
        box.append(h, p); s.appendChild(box);
      }
      track.appendChild(s);
    });
    frame.appendChild(track);

    const back = document.createElement('button');
    back.type = 'button'; back.className = 'intro-back'; back.setAttribute('aria-label', 'Back'); back.innerHTML = ARROW;
    back.addEventListener('click', () => go(index - 1));
    backBtn = back;
    const dotBox = document.createElement('div'); dotBox.className = 'intro-dots';
    dots = IMGS.map((_, k) => {
      const d = document.createElement('button'); d.type = 'button'; d.setAttribute('aria-label', 'Slide ' + (k + 1));
      d.addEventListener('click', () => go(k)); dotBox.appendChild(d); return d;
    });
    nextBtn = document.createElement('button'); nextBtn.type = 'button'; nextBtn.className = 'intro-next';
    nextBtn.addEventListener('click', () => (index === N - 1 ? close() : go(index + 1)));
    frame.append(back, dotBox, nextBtn);
    root.appendChild(frame);

    // swipe left / right
    let x0 = null, y0 = 0, dx = 0;
    track.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; track.style.transition = 'none'; }, { passive: true });
    track.addEventListener('touchmove', e => {
      if (x0 == null) return;
      dx = e.touches[0].clientX - x0;
      if (Math.abs(dx) < Math.abs(e.touches[0].clientY - y0)) return;
      track.style.transform = 'translateX(' + (-100 * index / N + dx / frame.clientWidth * 100 / N) + '%)';
    }, { passive: true });
    track.addEventListener('touchend', () => {
      track.style.transition = '';
      if (x0 != null && Math.abs(dx) > frame.clientWidth * 0.18) go(index + (dx < 0 ? 1 : -1)); else go(index);
      x0 = null;
    });
    document.body.appendChild(root);
    fit(); go(0);
  }
  window.addEventListener('resize', fit);
  document.addEventListener('keydown', e => {
    if (!root) return;
    if (e.key === 'ArrowRight') go(index + 1);
    else if (e.key === 'ArrowLeft') go(index - 1);
  });

  // only the first time after installing; on the very first start the language screen comes first and opens the slides
  if (N && !seen() && !(window.RichI18n && window.RichI18n.needsChoice())) build();                            // only the first time after installing

  document.addEventListener('click', e => { if (e.target.closest('#showIntro')) window.RichIntro.show(); });

  window.RichIntro = {
    isOpen: () => !!root,
    // phone Back button: previous slide; on the first slide let the app close
    back() { if (!root) return false; if (index > 0) { go(index - 1); return true; } return false; },
    show() { if (!root && N) build(); }
  };
})();
