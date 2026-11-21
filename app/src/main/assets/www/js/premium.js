/* =========================================================================
   Premium: a one-time "Unlock Premium" purchase through Google Play (Android app).
   Which templates are Premium is set in js/config.js -> RICH_CONFIG.premium.
   Locked templates can be tried in the preview; a PDF (download, print, share)
   opens the unlock sheet. The purchase itself is handled by Billing.java and is
   restored automatically after reinstalling (it belongs to the Google account).
   ========================================================================= */
(function () {
  const B = window.AndroidBridge;
  const has = (() => { try { return !!(B && typeof B.premiumStatus === 'function'); } catch (e) { return false; } })();
  const CFG = Object.assign({ productId: 'premium_unlock', lockedCategories: [], lockedTemplates: [], freeColours: [] }, (window.RICH_CONFIG || {}).premium || {});
  let st = { premium: false, price: '', ready: false, pending: false, error: '' };

  const read = () => { if (!has) return; try { st = Object.assign(st, JSON.parse(B.premiumStatus() || '{}')); } catch (e) { /* keep last */ } };
  const anyLocked = () => CFG.lockedCategories.length > 0 || CFG.lockedTemplates.length > 0;

  // (v4.43) every colour other than the template's own is Pro too
  function isThemeLocked(theme) {
    if (st.premium || !theme) return false;
    // (v4.67) a template or colour unlocked for this CV with a rewarded ad
    if (isLocked(theme.design) && !unlockOk(theme, 'd:' + theme.design)) return true;
    const ds = window.RichApp && window.RichApp.designs().find(d => d.id === theme.design);
    return !colourFree(theme.color, ds) && !unlockOk(theme, 'c:' + theme.color);          // (a colour half-way in a swipe is not marked)
  }
  // (v4.96i) an ad unlock is not permanent: it lasts 6 hours for that one CV ("d:<template>@<time>").
  // Old marks without a time (from earlier versions) count as expired.
  const UNLOCK_MS = 6 * 60 * 60 * 1000;
  function unlockOk(theme, key) {
    const U = theme && Array.isArray(theme.unlocks) ? theme.unlocks : [], now = Date.now();
    return U.some(k => { const at = String(k).lastIndexOf('@'); if (at < 0 || String(k).slice(0, at) !== key) return false;
      const t = +String(k).slice(at + 1); return t > 0 && t <= now + 60000 && now - t < UNLOCK_MS; });
  }
  // (v4.96) a template unlocked in the template picker with an ad: only ONE at a time, and only for one new CV.
  // Unlocking another template replaces it; making a CV with it uses it up. (Kept on this phone as { templateId: time of the ad }.)
  const TPL_KEY = 'richTplUnlocks';
  function tplUnlocks() { try { return JSON.parse(localStorage.getItem(TPL_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function tplUnlockAt(id) { const t = +tplUnlocks()[id] || 0, now = Date.now(); return t > 0 && t <= now + 60000 && now - t < UNLOCK_MS ? t : 0; }
  function tplUnlock(id) {
    const now = Date.now();
    try { localStorage.setItem(TPL_KEY, JSON.stringify({ [id]: now })); } catch (e) { /* private mode */ }
    return now;
  }
  function tplConsume(id) {
    const all = tplUnlocks(); if (!(id in all)) return;
    delete all[id];
    try { localStorage.setItem(TPL_KEY, JSON.stringify(all)); } catch (e) { /* private mode */ }
  }
  // the CV's unlock list with this key (re)started now; other expired marks are dropped
  function stampUnlock(theme, key) {
    const U = theme && Array.isArray(theme.unlocks) ? theme.unlocks : [];
    return U.filter(k => { const b = String(k).split('@')[0]; return b !== key && unlockOk(theme, b); }).concat(key + '@' + Date.now());
  }
  // ask for one rewarded ad: resolves true when the whole ad was watched, false when the window was closed
  function rewardGate(why) {
    return new Promise(resolve => {
      if (st.premium) { resolve(true); return; }
      offer(why || 'template', { onReward: () => { resolve(true); return 'quiet'; }, onClose: () => resolve(false) });
      if (!sheet) resolve(false);          // another window was already open
    });
  }
  // (v4.97) Edit on a Pro-template CV: the rewarded ad straight away (no Pro window). Resolves true when the whole ad
  // was watched. Where no rewarded ad can be shown (no ads in this app), the Pro window opens instead.
  function directAd(why) {
    if (st.premium) return Promise.resolve(true);
    if (reward) return Promise.resolve(false);           // an ad is already opening
    if (!canReward() || sheet) return rewardGate(why);
    return new Promise(resolve => {
      reward = { fn: () => { resolve(true); return 'quiet'; }, why: why || 'template', direct: true, fail: () => resolve(false) };
      watchAd();
    });
  }
  function colourFree(id, ds) {
    if (CFG.allColoursFree) return true;          // (v4.70) colours are free
    if (st.premium) return true;
    if (!id) return true;
    if (CFG.freeColours.indexOf(id) >= 0) return true;
    return !!(ds && ds.color === id);
  }
  function proCount() {
    try { const was = st.premium; st.premium = false; const n = window.RichApp.designs().filter(d => isLocked(d.id)).length; st.premium = was; return n; } catch (e) { return 0; }
  }
  function isLocked(designId) {
    if (st.premium || !anyLocked() || !designId) return false;
    const ds = window.RichApp && window.RichApp.designs().find(d => d.id === designId);
    if (CFG.lockedTemplates.indexOf(designId) >= 0 || (ds && CFG.lockedTemplates.indexOf('@' + ds.name) >= 0)) return true;
    return !!(ds && CFG.lockedCategories.indexOf(ds.category) >= 0);
  }

  // ---------------- the unlock sheet ----------------
  const CROWN = '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="pmG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE27A"/><stop offset="1" stop-color="#F0A500"/></linearGradient></defs><path fill="url(#pmG)" stroke="#B87400" stroke-width="1.5" d="M8 22l12 10 12-18 12 18 12-10-5 26H13z"/><rect x="13" y="50" width="38" height="6" rx="3" fill="url(#pmG)" stroke="#B87400" stroke-width="1.5"/><circle cx="8" cy="20" r="4" fill="#FFD54A"/><circle cx="32" cy="12" r="4" fill="#FFD54A"/><circle cx="56" cy="20" r="4" fill="#FFD54A"/></svg>';
  // (v4.92) shared pieces of the Pro card and the thank-you card
  const LOGO = '<span class="pm-logo">Rich <span class="bn-cv">CV</span> Maker</span>';
  const SPARK = (x, y, s) => '<svg class="pm-spark" style="left:' + x + '%;top:' + y + 'px;width:' + s + 'px;height:' + s + 'px" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0c.7 6.6 4.8 10.7 12 12-7.2 1.3-11.3 5.4-12 12-.7-6.6-4.8-10.7-12-12C7.2 10.7 11.3 6.6 12 0z"/></svg>';
  const HERO_DECO = SPARK(13, 34, 16) + SPARK(82, 26, 12) + SPARK(70, 10, 9) + SPARK(26, 12, 8) +
    '<svg class="pm-wave" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true"><path d="M0 60V38C70 22 140 50 210 36S330 6 400 18V60z"/></svg>';
  const CHEV = '<svg class="pm-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  const BTN_CROWN = '<svg class="pm-bcrown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-2 10H5z"/><rect x="5" y="19" width="14" height="2.4" rx="1.2"/></svg>';
  let sheet = null;
  // why: 'template' (a locked template was used), 'ads' (Remove ads) or anything else (Upgrade to Pro)
  // (v4.67) "Watch an ad to unlock": only in the Android app, with real ads, for a template or a colour
  const canReward = () => { try { return !st.premium && !!(B && B.hasRewarded && B.hasRewarded() && B.showRewarded); } catch (e) { return false; } };
  let reward = null, rewardSeq = 0, closeCb = null;
  // opts.onReward: what to unlock after a fully watched ad (offered for 'template' and 'colour')
  function offer(why, opts) {
    read();
    if (sheet) return;
    reward = opts && typeof opts.onReward === 'function' && (why === 'template' || why === 'colour') && canReward() ? { fn: opts.onReward, why } : null;
    closeCb = opts && typeof opts.onClose === 'function' ? opts.onClose : null;
    sheet = document.createElement('div');
    sheet.className = 'overlay pm-overlay pm-light';
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Upgrade to Pro');
    const price = st.price ? ' · ' + st.price : '';
    const lead = why === 'template' ? 'This template is part of Pro. Upgrade once and it is yours for good.'
      : why === 'colour' ? 'This colour is part of Pro. Upgrade once and every colour is yours for good.'
      : why === 'autosave' ? 'Auto-save is part of Pro. Your CV then saves itself while you edit.'
      : why === 'photobg' ? 'Clean photo backgrounds are part of Pro. Get a neat, passport-style photo in one tap.'
      : why === 'drive' ? 'Google Drive backup is part of Pro. Keep a safe copy of your CVs online.'
      : why === 'ads' ? 'Remove all ads for good with a one-time Pro upgrade.'
      : 'One payment, and Pro is yours for good.';
    // (v4.49) a richer sheet: a gold header, what Pro gives in small cards, a price card and a clear button
    const FEAT = [
      ['ads', 'No ads', 'Work without breaks', '<path d="M4 4l16 16M9.5 5H19a1 1 0 0 1 1 1v9M18 19H5a1 1 0 0 1-1-1V6"/>'],
      ['tpl', (proCount() || 28) + ' Pro templates', 'Premium and Luxury designs', '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'],
      // (v4.95) the photo background cleaner is free now; its place in Pro: supporting the app
      ['col', 'No Unlock Ads', 'Use Pro templates without ads', '<path d="M8 5l11 7-11 7z"/><path d="M3 3l18 18"/>'],
      ['save', 'Auto-save', 'Never lose your work', '<path d="M5 3h11l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M8 3v5h7"/>'],
      ['drive', 'Drive backup', 'Your CVs safe online', '<path d="M7 18a4 4 0 0 1-.5-8 6 6 0 0 1 11.6 1.5A3.3 3.3 0 0 1 17.5 18z"/>'],
      ['clean', 'Clean Previews', 'No "PRO PREVIEW" mark', '<path d="M5 12l4 4 10-10"/>']
    ];
    sheet.innerHTML =
      '<div class="pm-sheet" role="document">' +
        '<div class="pm-scroll">' +
        '<div class="pm-hero pm-hero2"><i class="pm-grab" aria-hidden="true"></i>' + ppLogoArt() +
          '<div class="pm-htx"><h2 class="pm-h">Unlock with <b class="pm-pro">Pro</b></h2>' +
          '<p class="pm-lead"><span>' + lead + '</span></p></div>' +
        '</div>' +
        '<div class="pm-body">' +
          // (v4.69) the free choice first, big and easy to see
          (reward ? '<button type="button" class="btn pm-reward" id="pmReward"><span class="pm-rw-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg></span>' +
              '<span class="pm-rw-t"><b>' + (reward.why === 'colour' ? 'Use this colour free' : 'Use this template free') + '</b><small>Watch 1 short ad · for this CV</small></span>' +
              '<em class="pm-rw-free">FREE</em></button>' +
            '<div class="pm-or"><span>or get everything with Pro</span></div>' : '') +
          '<ul class="pm-feats">' + FEAT.map(f => '<li class="pm-f-' + f[0] + '"><span class="pm-fi">' + PP_ICONS[{ ads: 'noads', col: 'fast', drive: 'cloud' }[f[0]] || f[0]] + '</span>' +
            '<span class="pm-ft"><b>' + f[1] + '</b><small>' + f[2] + '</small></span></li>').join('') + '</ul>' +
          (has
            ? '<div class="pm-price"><span class="pm-tag">One-time payment</span>' +
                '<div class="pm-pmain">' + PP_CROWN.replace('pp-pcrown', 'pm-gem') + '' +
                '<span><b>Lifetime access</b>' + (st.price ? '<em class="pm-amount">' + st.price + '</em>' : '') + '</span></div>' +
                '<small>No subscription · Yours for good · Restored on a new phone</small></div>' +
              '<button type="button" class="btn pm-buy" id="pmBuy">' + PP_ICONS.cart + '<span>' + (st.pending ? 'Payment is pending…' : 'Upgrade to Pro') + '</span>' + CHEV + '</button>' +
              '<div class="pm-or2"><span>or</span></div>' +
              '<button type="button" class="btn pm-restore" id="pmRestore">' + PP_ICONS.restore + '<span>Already bought? Restore purchase</span></button>'
            : '<p class="pm-web">Pro can be bought in the Rich CV Maker app on Android (Google Play).</p>') +
          '<button type="button" class="link pm-close" id="pmClose">Not now</button>' +
        '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(sheet);
    fitSheet(); setTimeout(fitSheet, 250); try { document.fonts.ready.then(fitSheet); } catch (e) { /* old WebView */ }
    // (v4.49) the page behind stays still: no scrolling, stretching or tapping through the sheet
    document.documentElement.classList.add('no-scroll'); document.body.classList.add('no-scroll');
    const inner = sheet.querySelector('.pm-sheet'), scr = sheet.querySelector('.pm-scroll');
    const stop = e => { if (!scr.contains(e.target) || scr.scrollHeight <= scr.clientHeight + 1) e.preventDefault(); };
    sheet.addEventListener('touchmove', stop, { passive: false });
    sheet.addEventListener('wheel', stop, { passive: false });
    ['touchstart', 'pointerdown', 'touchend'].forEach(t => sheet.addEventListener(t, e => e.stopPropagation()));
    // (v4.86) drag the blue top part down to close the card
    (() => {
      const hero = inner.querySelector('.pm-hero'); if (!hero) return;
      let d = null;
      hero.addEventListener('touchstart', e => { if (e.touches.length === 1) d = { y0: e.touches[0].clientY, t0: Date.now(), dy: 0, on: false }; }, { passive: true });
      hero.addEventListener('touchmove', e => {
        if (!d) return;
        const dy = e.touches[0].clientY - d.y0;
        if (!d.on) { if (dy < 8) return; d.on = true; inner.style.transition = 'none'; inner.style.animation = 'none'; }
        d.dy = Math.max(0, dy);
        inner.style.transform = 'translateY(' + d.dy + 'px)';
        sheet.style.opacity = String(Math.max(0.35, 1 - d.dy / (inner.offsetHeight * 1.4)));
        e.preventDefault();
      }, { passive: false });
      const end = () => {
        if (!d) return; const w = d; d = null; if (!w.on) return;
        const fast = w.dy / Math.max(1, Date.now() - w.t0) > 0.6;
        inner.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';
        if (w.dy > Math.min(140, inner.offsetHeight * 0.25) || (fast && w.dy > 40)) {
          inner.style.transform = 'translateY(110%)'; setTimeout(close, 200);
        } else { inner.style.transform = ''; sheet.style.opacity = ''; }
      };
      hero.addEventListener('touchend', end); hero.addEventListener('touchcancel', end);
    })();
    sheet.addEventListener('click', e => {
      if (e.target === sheet || e.target.closest('#pmClose')) close();
      else if (e.target.closest('#pmBuy')) { if (!st.pending) { buying = true; B.buyPremium(); } }
      else if (e.target.closest('#pmRestore')) restore();
      else if (e.target.closest('#pmReward')) watchAd();
    });
  }
  // (v4.96n) the Pro window on one screen too: shrink its content evenly on short phones (scrolls only below 72%)
  function fitSheet() {
    const sc = sheet && sheet.querySelector('.pm-scroll'); if (!sc) return;
    sc.style.zoom = ''; sc.style.maxHeight = '';
    const avail = sc.clientHeight, need = sc.scrollHeight;
    if (avail > 0 && need > avail + 1) { const z = Math.max(0.72, Math.floor(avail / need * 1000) / 1000); sc.style.zoom = String(z); sc.style.maxHeight = (avail / z) + 'px'; }
  }
  function watchAd() {
    if (!reward) return;
    const b = document.getElementById('pmReward');
    if (b) { b.disabled = true; const t = b.querySelector('.pm-rw-t small'); if (t) t.textContent = 'Opening the ad…'; }
    reward.id = 'rw' + (++rewardSeq);
    try { B.showRewarded(reward.id); } catch (e) { rewardDone(reward.id, 'failed'); }
  }
  function rewardDone(id, result) {
    if (!reward || reward.id !== id) return;
    const r = reward;
    if (result === 'earned') {
      reward = null; closeCb = null;
      close();
      if (window.RichAds && window.RichAds.justShown) try { window.RichAds.justShown(); } catch (e) { /* ignore */ }   // no full-screen ad right after it
      let said; try { said = r.fn(); } catch (e) { console.error(e); }
      if (said !== 'quiet') toast(r.why === 'colour' ? 'Colour unlocked for this CV for 6 hours.' : 'Template unlocked for this CV for 6 hours.');
      return;
    }
    if (r.direct) { reward = null; try { r.fail(); } catch (e) { /* ignore */ } }   // (v4.97) the ad shown without the Pro window
    const b = document.getElementById('pmReward');
    if (b) { b.disabled = false; const t = b.querySelector('.pm-rw-t small'); if (t) t.textContent = 'Watch 1 short ad · for this CV'; }
    toast(result === 'closed' ? (r.direct ? 'Watch the whole ad to edit this CV.' : 'Watch the whole ad to unlock it.')
      : result === 'notready' ? 'No ad is ready right now. Check your internet and try again in a minute.'
      : 'The ad could not be shown. Try again in a minute.', true);
  }
  function close() {
    if (!sheet) return;
    sheet.remove(); sheet = null; reward = null;
    const cb = closeCb; closeCb = null; if (cb) setTimeout(cb, 0);
    if (!document.querySelector('.overlay:not([hidden]):not(.pm-overlay), .tp-overlay:not([hidden])')) { document.documentElement.classList.remove('no-scroll'); document.body.classList.remove('no-scroll'); }
  }
  const toast = (m, bad) => { if (window.RichApp) window.RichApp.toast(m, bad); };

  // ---------------- (v4.64) thank-you window after buying Pro ----------------
  let buying = false, ty = null;
  // (v4.97) the thank-you after buying Pro is a window (not a full page): it opens over the screen the user bought from,
  // only when Google Play confirms a purchase (also a payment that was pending), never for a restore or at start-up
  function thanks() {
    if (ty) return;
    const A = window.RichAuth, C = window.RichCloud;
    const canCloud = !!(A && A.available && C && C.available);
    // (v4.97) signed in to the app with Google = connected; Drive backup is on when Drive is linked and automatic backup is on
    const signed = canCloud && !!(A.status && A.status().signedIn);
    // (v4.97) Drive backup: connect a Google account first, or switch backup on, or show that it is on
    const bk = !canCloud ? '' : !signed ? 'connect' : (C.signedIn() && C.autoOn()) ? 'on' : 'turnon';
    if (page) closePage(true);
    const tt = document.getElementById('toast'); if (tt) tt.classList.remove('show');
        ty = document.createElement('div');
    ty.className = 'ty-ov ty-v2';
    ty.setAttribute('role', 'dialog'); ty.setAttribute('aria-modal', 'true'); ty.setAttribute('aria-labelledby', 'tyTitle');
    const lg = ppLogo();
    ty.innerHTML =
      '<div class="ty-box">' +
        '<div class="ty-art" aria-hidden="true">' +
          '<i class="ty-d ty-d1"></i><i class="ty-d ty-d2"></i><i class="ty-d ty-d3"></i><i class="ty-d ty-d4"></i><i class="ty-d ty-d5"></i><i class="ty-d ty-d6"></i><i class="ty-d ty-d7"></i>' +
          '<i class="ty-cloud ty-c1"></i><i class="ty-cloud ty-c2"></i><i class="ty-halo"></i>' +
          '<span class="ty-check">' + PP_ICONS.check + '</span>' +
          '<span class="ty-logo">' + (lg ? '<img src="' + ppEsc(lg) + '" alt="">' : '') + '<i class="ty-lcrown">' + PP_ICONS.crown + '</i></span>' +
        '</div>' +
        '<h2 id="tyTitle" class="ty-title">Thank You!</h2>' +
        '<p class="ty-sub">Your purchase was successful</p>' +
        '<p class="ty-text">Enjoy the premium features and make the most of Rich CV Maker!</p>' +
        '<div class="ty-act"><span class="ty-aic">' + PP_ICONS.crown + '</span><span class="ty-at"><b>Premium Activated</b><small>Lifetime Access</small></span><span class="ty-aok">' + PP_ICONS.check + '</span></div>' +
        '<button type="button" class="ty-go" id="tyGo"><span>Continue</span>' + PP_ARR + '</button>' +
        '<p class="ty-note">Pro is saved to your Google Play account and comes back after reinstalling.</p>' +
      '</div><i class="ty-wave ty-w1" aria-hidden="true"></i><i class="ty-wave ty-w2" aria-hidden="true"></i>';
    document.body.appendChild(ty);
    document.body.classList.add('pp-open');
    document.documentElement.classList.add('no-scroll'); document.body.classList.add('no-scroll');
    requestAnimationFrame(() => ty && ty.classList.add('in'));
    ty.addEventListener('click', e => {
      if (e.target.closest('#tyGo')) { closeThanks(); askBackup(bk); }
    });
    try { if (navigator.vibrate) navigator.vibrate([10, 60, 10]); } catch (e) { /* ignore */ }
    setTimeout(() => { const b = document.getElementById('tyGo'); if (b) b.focus({ preventScroll: true }); }, 60);
  }
  // (v4.97) after the thank-you page: a small box suggesting Google Drive backup (connect Google first when needed)
  // (v4.97) the user chose Connect: once the Google sign-in has finished, ask (in a second small box) to turn on Drive backup.
  // Skipping the Connect box shows nothing more.
  let signT = 0;
  function afterSignIn() {
    clearInterval(signT);
    const t0 = Date.now();
    signT = setInterval(() => {
      const A = window.RichAuth, C = window.RichCloud;
      if (!A || !C || Date.now() - t0 > 15 * 60000) { clearInterval(signT); return; }
      if (A.status && A.status().signedIn && !(A.isOpen && A.isOpen())) {
        clearInterval(signT);
        if (!(C.signedIn() && C.autoOn())) askBackup('turnon');
      }
    }, 1200);
  }
  function askBackup(bk) {
    const C = window.RichCloud;
    if (!bk || bk === 'on' || !C) return;
    const connect = bk === 'connect';
    const G = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8.1z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.7H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.7 14a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 9.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.1 7l3.6 2.8C6.6 7.3 9.1 5.4 12 5.4z"/></svg>';
    const DRIVE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#0F9D58" d="M8.2 3h7.6l6.2 10.8-3.8 6.6z"/><path fill="#FFC107" d="M8.2 3L2 13.8 5.8 20.4 12 9.6z"/><path fill="#4285F4" d="M5.8 20.4h12.4L22 13.8H9.6z"/></svg>';
    setTimeout(() => {
      const ov = document.createElement('div');
      ov.className = 'bk-ov';
      ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'bkTitle');
      ov.innerHTML = '<div class="bk-box">' +
        '<div class="bk-icons" aria-hidden="true"><span class="bk-ic">' + G + '</span><i class="bk-link"></i><span class="bk-ic">' + DRIVE + '</span></div>' +
        '<h2 id="bkTitle" class="bk-t">' + (connect ? 'Back up your CVs' : 'Turn on Drive backup') + '</h2>' +
        '<p class="bk-p">' + (connect ? 'Connect your Google account to keep your CVs safe in Google Drive. They come back on any phone.'
                                      : 'Keep your CVs safe in your Google Drive. They come back on any phone.') + '</p>' +
        '<div class="bk-btns"><button type="button" class="bk-no">Not now</button>' +
        '<button type="button" class="bk-yes">' + (connect ? G : DRIVE) + '<span>' + (connect ? 'Connect' : 'Turn on') + '</span></button></div></div>';
      document.body.appendChild(ov);
      requestAnimationFrame(() => ov.classList.add('in'));
      const shut = () => { ov.classList.remove('in'); setTimeout(() => ov.remove(), 200); };
      ov.addEventListener('click', e => {
        if (e.target === ov || e.target.closest('.bk-no')) { shut(); return; }
        if (e.target.closest('.bk-yes')) {
          shut();
          try { if (connect) { window.RichAuth.open('login'); afterSignIn(); } else C.turnOn(); } catch (x) { /* ignore */ }
        }
      });
    }, 350);
  }
  function closeThanks() {
    if (!ty) return;
    const t = ty; ty = null;
    t.classList.remove('in'); t.classList.add('out'); setTimeout(() => t.remove(), 220);
    if (!page) document.body.classList.remove('pp-open');
    if (!page && !document.querySelector('.overlay:not([hidden]), .tp-overlay:not([hidden])')) { document.documentElement.classList.remove('no-scroll'); document.body.classList.remove('no-scroll'); }
  }

  // ---------------- (v4.96m) the full Upgrade to Pro page (Home "Go Pro" and Settings) ----------------
  // Same Google Play purchase as the sheet: B.buyPremium() / B.restorePremium(); Billing.java sends the result to onNative().
  // Only real Pro features are listed (photo backgrounds are free since v4.95, so they are not sold here).
  let page = null, pageBusy = false, pageBusyT = 0;
  const PP_ICONS = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    crown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-2 10H5z"/><rect x="5" y="19" width="14" height="2.4" rx="1.2"/></svg>',
    noads: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/><path d="M8.3 14.5l1.7-5 1.7 5M8.8 13h2.4M13.6 9.5v5h1.3a2.5 2.5 0 0 0 0-5z"/></svg>',
    tpl: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 9l4 3 4.5-6.5L16.5 12l4-3-2 10.5h-13z"/></svg>',
    fast: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 6.5l10 5.5-10 5.5z"/><path d="M4 4l16 16"/></svg>',
    save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9.5"/><path d="M12 19.5v-7M9 15l3-3 3 3"/></svg>',
    clean: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.4 1.8 3-.2.9 2.9 2.4 1.8-1 2.8 1 2.8-2.4 1.8-.9 2.9-3-.2L12 21l-2.4-1.8-3 .2-.9-2.9L3.3 14.7l1-2.8-1-2.8 2.4-1.8.9-2.9 3 .2z"/><path d="M8.6 12.2l2.3 2.3 4.6-4.8"/></svg>',
    cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2.2l2.3 10.5h10.2L20 7H6.4"/><circle cx="9.5" cy="18.8" r="1.6"/><circle cx="16.8" cy="18.8" r="1.6"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"/><path d="M8.5 12l2.4 2.4 4.6-4.8"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2.5L5 13.5h6l-1 8 8.5-11h-6z"/></svg>',
    restore: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5v4.2h4.2"/><path d="M12 8v4.3l3 1.8"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>',
    retry: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5v4.2h-4.2"/></svg>'
  };
  // the hero picture: a CV with a gold crown, gold light rings and a PRO shield
  const PP_ART = '<svg class="pp-art" viewBox="0 0 220 200" aria-hidden="true"><defs>' +
    '<radialGradient id="ppGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFD54A" stop-opacity=".55"/><stop offset=".55" stop-color="#FFB800" stop-opacity=".16"/><stop offset="1" stop-color="#FFB800" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="ppPaper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E3ECFB"/></linearGradient>' +
    '<linearGradient id="ppBand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3D8BFF"/><stop offset="1" stop-color="#1840C8"/></linearGradient>' +
    '<linearGradient id="ppGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE68F"/><stop offset=".55" stop-color="#FFC21A"/><stop offset="1" stop-color="#E39A00"/></linearGradient>' +
    '<linearGradient id="ppGoldD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7B500"/><stop offset="1" stop-color="#B86E00"/></linearGradient>' +
    '<radialGradient id="ppFace" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#FFD9BC"/><stop offset="1" stop-color="#E9B58E"/></radialGradient>' +
    '<clipPath id="ppAv"><circle r="15"/></clipPath><clipPath id="ppTop"><rect x="62" y="40" width="104" height="138" rx="11"/></clipPath></defs>' +
    '<circle cx="114" cy="108" r="92" fill="url(#ppGlow)"/>' +
    '<linearGradient id="ppRing" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFE68F" stop-opacity=".15"/><stop offset=".5" stop-color="#FFD23F"/><stop offset="1" stop-color="#FFB800" stop-opacity=".35"/></linearGradient>' +
    '<ellipse cx="114" cy="112" rx="100" ry="46" fill="none" stroke="url(#ppRing)" stroke-width="3.2" transform="rotate(-18 114 112)" opacity=".9"/>' +
    '<g transform="rotate(6 114 110)"><rect x="62" y="40" width="104" height="138" rx="11" fill="#061A5A" opacity=".4" transform="translate(4 7)"/>' +
    '<rect x="62" y="40" width="104" height="138" rx="11" fill="url(#ppPaper)"/>' +
    '<g clip-path="url(#ppTop)"><rect x="62" y="40" width="104" height="40" fill="url(#ppBand)"/></g>' +
    '<g transform="translate(86 62)"><circle r="17" fill="#fff"/><circle r="15" fill="#CFE6FF"/><g clip-path="url(#ppAv)"><path d="M-14 17c1.5-9 7-12.5 14-12.5S12.5 8 14 17z" fill="#16213F"/><path d="M-4 5l4 7 4-7z" fill="#fff"/><circle cy="-3" r="7.2" fill="url(#ppFace)"/><path d="M-7.6 -4.2c0-6 3.4-8.6 7.6-8.6s7.6 2.6 7.6 8c-2-2.7-4.6-3.3-7.6-3.3s-5.4.6-7.6 3.9z" fill="#2B1A12"/></g></g>' +
    '<rect x="109" y="53" width="46" height="7" rx="3.5" fill="#fff"/><rect x="109" y="65" width="32" height="4.5" rx="2.2" fill="#fff" opacity=".75"/>' +
    '<rect x="72" y="92" width="34" height="5" rx="2.5" fill="#1F55E0"/><rect x="72" y="103" width="80" height="4" rx="2" fill="#BCCDEA"/><rect x="72" y="112" width="70" height="4" rx="2" fill="#BCCDEA"/><rect x="72" y="121" width="76" height="4" rx="2" fill="#BCCDEA"/>' +
    '<rect x="72" y="134" width="28" height="5" rx="2.5" fill="#1F55E0"/><rect x="72" y="145" width="62" height="4.5" rx="2.2" fill="#DCE6F7"/><rect x="72" y="145" width="48" height="4.5" rx="2.2" fill="#3D8BFF"/><rect x="72" y="155" width="62" height="4.5" rx="2.2" fill="#DCE6F7"/><rect x="72" y="155" width="38" height="4.5" rx="2.2" fill="#3D8BFF"/></g>' +
    '<path d="M26 150 A100 46 -18 0 0 210 82" fill="none" stroke="url(#ppRing)" stroke-width="3.2" transform="rotate(0)" opacity=".95"/>' +
    // crown on top of the CV
    '<g transform="translate(80 4)"><path d="M6 30L2 10l14 10L32 0l16 20 14-10-4 20z" fill="url(#ppGold)" stroke="#B87400" stroke-width="1.4" stroke-linejoin="round"/><rect x="6" y="30" width="52" height="8" rx="4" fill="url(#ppGoldD)"/>' +
    '<circle cx="2" cy="9" r="3.6" fill="#FFE68F"/><circle cx="32" cy="1" r="3.6" fill="#FFE68F"/><circle cx="62" cy="9" r="3.6" fill="#FFE68F"/><circle cx="32" cy="22" r="3.4" fill="#E53950"/><circle cx="17" cy="24" r="2.4" fill="#2F7BFF"/><circle cx="47" cy="24" r="2.4" fill="#2F7BFF"/></g>' +
    // PRO shield
    '<g transform="translate(150 132)"><path d="M24 0l24 8v18c0 15-10 26-24 31C10 52 0 41 0 26V8z" fill="url(#ppGold)" stroke="#fff" stroke-width="2"/><path d="M24 6l18 6v14c0 11-7.4 19.6-18 23.6C13.4 45.6 6 37 6 26V12z" fill="#0B2479"/>' +
    '<text x="24" y="33" text-anchor="middle" font-family="Poppins, Arial, sans-serif" font-size="13" font-weight="800" fill="#FFD54A">PRO</text></g>' +
    '<path d="M28 40c.9 5.6 3.6 8.3 9 9.2-5.4.9-8.1 3.6-9 9.2-.9-5.6-3.6-8.3-9-9.2 5.4-.9 8.1-3.6 9-9.2z" fill="#FFE68F"/>' +
    '<path d="M200 30c.6 3.6 2.3 5.3 5.8 5.9-3.5.6-5.2 2.3-5.8 5.9-.6-3.6-2.3-5.3-5.8-5.9 3.5-.6 5.2-2.3 5.8-5.9z" fill="#fff"/>' +
    '<path d="M40 160c.5 3 1.9 4.4 4.8 4.9-2.9.5-4.3 1.9-4.8 4.9-.5-3-1.9-4.4-4.8-4.9 2.9-.5 4.3-1.9 4.8-4.9z" fill="#9FE6FF"/>' +
    '<circle cx="196" cy="92" r="2" fill="#FFE68F"/><circle cx="22" cy="112" r="1.6" fill="#fff" opacity=".8"/></svg>';
  // the big crown in the price card
  const PP_CROWN = '<svg class="pp-pcrown" viewBox="0 0 80 72" aria-hidden="true"><defs><linearGradient id="ppC1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE68F"/><stop offset=".55" stop-color="#FFC21A"/><stop offset="1" stop-color="#E39A00"/></linearGradient><linearGradient id="ppC2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7B500"/><stop offset="1" stop-color="#B86E00"/></linearGradient></defs>' +
    '<ellipse cx="40" cy="66" rx="30" ry="4.5" fill="#B87400" opacity=".18"/><path d="M12 50L6 18l18 14L40 6l16 26 18-14-6 32z" fill="url(#ppC1)" stroke="#B87400" stroke-width="1.6" stroke-linejoin="round"/><rect x="11" y="50" width="58" height="10" rx="5" fill="url(#ppC2)"/>' +
    '<circle cx="6" cy="16" r="4.6" fill="#FFE68F" stroke="#B87400"/><circle cx="40" cy="5" r="4.6" fill="#FFE68F" stroke="#B87400"/><circle cx="74" cy="16" r="4.6" fill="#FFE68F" stroke="#B87400"/>' +
    '<path d="M40 30l5 6-5 6-5-6z" fill="#E53950"/><circle cx="23" cy="40" r="3.2" fill="#2F7BFF"/><circle cx="57" cy="40" r="3.2" fill="#2F7BFF"/><path d="M20 26l3-3" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/></svg>';

  const PP_ARR = '<svg class="pp-arr" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  function ppEsc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
  const PP_CHEV = '<svg class="pp-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  function ppFeatures(owned) {
    const n = proCount() || 28;
    return [
      ['noads', 'No Ads', 'Enjoy an ad-free experience'],
      ['tpl', '<span class="pp-n">' + n + '</span> <span>Pro Templates</span>', 'Premium & luxury designs'],
      ['fast', 'No Unlock Ads', 'Use Pro templates without ads'],
      ['save', 'Auto-Save', 'Never lose your work'],
      ['cloud', 'Drive Backup', 'Your CVs safe online'],
      ['clean', 'Clean Previews', 'No "PRO PREVIEW" mark']
    ].map(([k, t, d]) => '<li class="pp-f pp-f-' + k + '"><span class="pp-fi">' + PP_ICONS[k] + '</span><span class="pp-ft"><b>' + t + '</b><small>' + d + '</small></span>' +
      (owned ? '<span class="pp-fok">' + PP_ICONS.check + '</span>' : PP_CHEV) + '</li>').join('');
  }
  // (v4.97) the hero picture is the app logo: a white card with the logo, a gold crown on top and a gold PRO shield
  function ppLogoArt() {
    const l = ppLogo();
    return '<div class="pp-lart" aria-hidden="true"><i class="pl-blob"></i><i class="pl-d pl-d1"></i><i class="pl-d pl-d2"></i><i class="pl-d pl-d3"></i><i class="pl-d pl-d4"></i>' +
      '<svg class="pl-crown" viewBox="0 0 80 60"><defs><linearGradient id="plG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE68F"/><stop offset=".55" stop-color="#FFC21A"/><stop offset="1" stop-color="#E39A00"/></linearGradient></defs>' +
        '<path d="M10 44L4 14l17 13L40 4l19 23 17-13-6 30z" fill="url(#plG)" stroke="#C98400" stroke-width="1.5" stroke-linejoin="round"/><rect x="10" y="44" width="60" height="10" rx="5" fill="#E9A400"/>' +
        '<circle cx="4" cy="13" r="4.5" fill="#FFD23F"/><circle cx="40" cy="4" r="4.5" fill="#FFD23F"/><circle cx="76" cy="13" r="4.5" fill="#FFD23F"/><path d="M40 24l5 7-5 7-5-7z" fill="#E08A00"/></svg>' +
      '<span class="pl-card">' + (l ? '<img src="' + ppEsc(l) + '" alt="">' : '') + '</span>' +
      '<svg class="pl-shield" viewBox="0 0 48 56"><defs><linearGradient id="plS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD54A"/><stop offset="1" stop-color="#F29A00"/></linearGradient></defs>' +
        '<path d="M24 2l21 7v16c0 14-9 24-21 29C12 49 3 39 3 25V9z" fill="url(#plS)" stroke="#fff" stroke-width="2.5"/>' +
        '<text x="24" y="33" text-anchor="middle" font-family="Poppins, Arial, sans-serif" font-size="13" font-weight="800" fill="#fff">PRO</text></svg></div>';
  }
  function ppLogo() { const l = document.getElementById('brandLogo'); return l && l.src ? l.src : ''; }
  const PP_TRUST = '<div class="pp-trust">' +
    '<div class="pp-t pp-t-shield">' + PP_ICONS.shield + '<span><b>Secure Payment</b><small>Paid through Google Play</small></span></div>' +
    '<div class="pp-t pp-t-bolt">' + PP_ICONS.bolt + '<span><b>Instant Access</b><small>Unlocks right after payment</small></span></div>' +
    '<div class="pp-t pp-t-restore">' + PP_ICONS.restore + '<span><b>Easy Restore</b><small>Same Google account</small></span></div></div>';
  const PP_RIBBON = t => '<span class="pp-ribbon">' + PP_ICONS.crown + '<span>' + t + '</span></span>';
  // the price card and its button for the current billing state
  function ppPriceCard() {
    if (st.premium) {
      return '<div class="pp-price pp-owned">' + PP_RIBBON('Lifetime Pro') +
        '<div class="pp-prow">' + PP_CROWN + '<div class="pp-pinfo"><span class="pp-life">Lifetime access</span><b class="pp-active">Pro is active</b><span class="pp-desc">Thank you! Every Pro feature is unlocked on this Google account.</span></div></div>' +
        '<button type="button" class="pp-buy" id="ppDone">' + PP_ICONS.check + '<span>Start creating</span>' + PP_ARR + '</button>' + PP_TRUST + '</div>';
    }
    let priceHtml, note = '', btn, extra = '';
    if (!has) {
      priceHtml = '<b class="pp-amount pp-na">Google Play</b>';
      note = '<p class="pp-msg">Pro can be bought in the Rich CV Maker app from Google Play.</p>';
      btn = '<button type="button" class="pp-buy" id="ppBuy">' + PP_ICONS.cart + '<span>Buy Now</span>' + PP_ARR + '</button>';
    } else if (st.pending) {
      priceHtml = st.price ? '<b class="pp-amount">' + ppEsc(st.price) + '</b>' : '';
      note = '<p class="pp-msg">Your payment is pending. Pro unlocks by itself as soon as Google Play confirms it.</p>';
      btn = '<button type="button" class="pp-buy" id="ppBuy" disabled><span class="pp-spin"></span><span>Payment is pending…</span></button>';
    } else if (!st.ready || !st.price) {
      priceHtml = '<b class="pp-amount pp-na">' + (st.error ? 'Not available right now' : 'Loading price…') + '</b>';
      if (st.error) {
        note = '<p class="pp-msg">Google Play could not load Pro right now. Check your internet connection and try again.</p>';
        extra = '<button type="button" class="pp-retry" id="ppRetry">' + PP_ICONS.retry + '<span>Try again</span></button>';
      }
      btn = '<button type="button" class="pp-buy is-wait" id="ppBuy" disabled>' + PP_ICONS.cart + '<span>Buy Now</span>' + PP_ARR + '</button>';
    } else {
      priceHtml = '<b class="pp-amount">' + ppEsc(st.price) + '</b>';
      btn = '<button type="button" class="pp-buy" id="ppBuy"' + (pageBusy ? ' disabled' : '') + '>' +
        (pageBusy ? '<span class="pp-spin"></span><span>Opening Google Play…</span>' : PP_ICONS.cart + '<span>Buy Now</span>' + PP_ARR) + '</button>';
    }
    return '<div class="pp-price">' + PP_RIBBON('One-Time Purchase') +
      '<div class="pp-prow">' + PP_CROWN + '<div class="pp-pinfo"><span class="pp-life">Lifetime access</span>' + priceHtml +
        '<span class="pp-desc">Pay once. Use forever.</span></div></div>' +
      note + extra + btn + PP_TRUST + '</div>';
  }
  // the whole page body: 'buy' (Upgrade to Pro), 'owned' (Pro is active) or 'thanks' (right after buying)
  function ppBody(mode, opts) {
    opts = opts || {};
    const owned = mode !== 'buy';
    const hero = mode === 'thanks'
      ? '<h1 class="pp-h1"><span class="pp-thx">Thank you!</span><span>You are now</span><span class="pp-h1b">Rich CV Maker <b class="pp-badge">Pro</b></span></h1>' +
        '<p class="pp-sub">Your support helps us keep making the app better for job seekers.</p>'
      : mode === 'owned'
      ? '<h1 class="pp-h1"><span>You are</span><span class="pp-h1b">Rich CV Maker <b class="pp-badge">Pro</b></span></h1>' +
        '<p class="pp-sub">Thank you for your support. Enjoy every premium feature.</p>'
      : '<h1 class="pp-h1"><span>Upgrade to</span><span class="pp-h1b">Rich CV Maker <b class="pp-badge">Pro</b></span></h1>' +
        '<p class="pp-sub">Unlock premium features and create the perfect CV effortlessly!</p>';
    const card = mode === 'thanks'
      ? '<div class="pp-price pp-owned">' + PP_RIBBON('Lifetime Pro') +
          '<div class="pp-prow">' + PP_CROWN + '<div class="pp-pinfo"><span class="pp-life">Lifetime access</span><b class="pp-active">Pro is yours</b>' +
          '<span class="pp-desc">Pro is saved to your Google Play account. It comes back by itself after reinstalling the app or on a new phone.</span></div></div>' +
          '<button type="button" class="pp-buy" id="tyGo">' + PP_ICONS.crown + '<span>Start using Pro</span>' + PP_ARR + '</button>' + PP_TRUST + '</div>'
      : ppPriceCard();
    const foot = mode === 'buy'
      ? '<button type="button" class="pp-restore" id="ppRestore">' + PP_ICONS.restore + '<span>Restore Purchase</span></button>'
      : mode === 'thanks' && opts.offerBackup
      ? '<button type="button" class="pp-restore" id="tyBackup">' + PP_ICONS.cloud + '<span>Sign in for Drive backup</span></button>'
      : '<p class="pp-footnote">' + PP_ICONS.check + '<span>Pro is linked to your Google account</span></p>';
    return '<section class="pp-hero">' + ppLogoArt() + '<div class="pp-htext">' + hero + '</div></section>' +
      '<section class="pp-sheet"><div class="pp-fhead"><span class="pp-fbadge"><i aria-hidden="true">★</i> ' + (owned ? 'Your Pro Features' : 'Premium Features') + '</span></div>' +
        '<ul class="pp-grid">' + ppFeatures(owned) + '</ul>' + card + '</section>' +
      '<footer class="pp-foot">' + foot + '</footer>';
  }
  function ppRender() {
    if (!page) return;
    read();
    page.classList.toggle('is-owned', !!st.premium);
    const body = page.querySelector('.pp-body');
    const scroll = page.querySelector('.pp-scroll'), keep = scroll ? scroll.scrollTop : 0;
    body.innerHTML = ppBody(st.premium ? 'owned' : 'buy');
    if (scroll) scroll.scrollTop = keep;
    ppFitAll(page);
  }
  // (v4.96n) the whole page on one screen: shrink it evenly when the phone is short (scrolls only below 72%)
  function ppFit(el) {
    el = el || page; if (!el) return;
    const scroll = el.querySelector('.pp-scroll'), body = el.querySelector('.pp-body');
    if (!scroll || !body) return;
    body.style.zoom = ''; body.style.minHeight = '';
    const avail = scroll.clientHeight, need = body.scrollHeight;
    if (avail > 0 && need > avail + 1) { const z = Math.max(0.72, Math.floor(avail / need * 1000) / 1000); body.style.zoom = String(z); body.style.minHeight = (avail / z) + 'px'; }
  }
  function ppFitAll(el) { ppFit(el); setTimeout(() => ppFit(el), 250); try { document.fonts.ready.then(() => ppFit(el)); } catch (e) { /* old WebView */ } }
  addEventListener('resize', () => { if (page) ppFit(page); if (ty && ty.classList) ppFit(ty); });
  function ppShell(cls, label) {
    const el = document.createElement('div');
    el.className = cls;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', label);
    const logo = ppLogo();
    el.innerHTML =
      '<header class="pp-top">' +
        '<button type="button" class="pp-back" id="ppBack" aria-label="Back">' + PP_ICONS.back + '</button>' +
        (logo ? '<img class="pp-logo" alt="" src="' + ppEsc(logo) + '">' : '') +
        '<span class="pp-brand"><b>Rich CV Maker</b><small>Resume Builder</small></span>' +
        '<span class="pp-topcrown" aria-hidden="true">' + PP_ICONS.crown + '</span>' +
      '</header>' +
      '<div class="pp-scroll"><div class="pp-body"></div></div>';
    document.body.appendChild(el);
    document.body.classList.add('pp-open');
    document.documentElement.classList.add('no-scroll'); document.body.classList.add('no-scroll');
    requestAnimationFrame(() => el.classList.add('in'));
    return el;
  }
  function openPage() {
    read();
    if (sheet) close();
    if (page) { ppRender(); return; }
    page = ppShell('pp-page pp-light', 'Upgrade to Rich CV Maker Pro');
    ppRender();
    page.addEventListener('click', e => {
      if (e.target.closest('#ppBack') || e.target.closest('#ppDone')) closePage();
      else if (e.target.closest('#ppBuy')) ppBuy();
      else if (e.target.closest('#ppRestore')) restore();
      else if (e.target.closest('#ppRetry')) ppRetry();
    });
  }
  function ppBuy() {
    read();
    if (!has) { toast('Pro can be bought in the Rich CV Maker app from Google Play.'); return; }
    if (!has || st.premium || st.pending || pageBusy) return;          // never a second purchase request
    if (!st.ready || !st.price) { ppRetry(); return; }
    pageBusy = true; buying = true; ppRender();
    clearTimeout(pageBusyT);
    pageBusyT = setTimeout(() => { pageBusy = false; ppRender(); }, 20000);   // Google Play never answered: let the user try again
    try { B.buyPremium(); } catch (e) { pageBusy = false; ppRender(); toast('Could not open Google Play. Try again.', true); }
  }
  function ppRetry() {
    toast('Connecting to Google Play…');
    try { if (typeof B.retryBilling === 'function') B.retryBilling(); else B.restorePremium(); } catch (e) { /* ignore */ }
    setTimeout(ppRender, 2500);
  }
  function closePage(keepScroll) {
    if (!page) return;
    const p = page; page = null; pageBusy = false; clearTimeout(pageBusyT);
    p.classList.remove('in'); p.classList.add('out');
    setTimeout(() => p.remove(), 220);
    if (!ty) document.body.classList.remove('pp-open');
    if (!ty && !document.querySelector('.overlay:not([hidden]), .tp-overlay:not([hidden])')) { document.documentElement.classList.remove('no-scroll'); document.body.classList.remove('no-scroll'); }
  }

  // ---------------- Settings card ----------------
  function render() {
    const card = document.getElementById('premiumCard'); if (!card) return;
    // nothing to sell yet (no Premium templates, or the product is not set up in Play Console): no card
    document.documentElement.classList.toggle('is-pro', !!st.premium);
    if (st.premium) { try { B.adsPro(true); } catch (e) { /* older app */ } }
    // the card only shows once Pro is bought; buying goes through the Upgrade to Pro sheet
    if (!has || !st.premium) { card.hidden = true; return; }
    card.hidden = false;
    const body = document.getElementById('premiumBody');
    body.innerHTML = st.premium
      ? '<div class="pm-owned">' + CROWN + '<span><b>Pro is active</b><small>Thank you! No ads, and all Premium templates are yours.</small></span></div>'
      : '<p class="sp-note">Unlock all Premium templates and future Premium features with a one-time payment.</p>' +
        '<div class="row"><button type="button" class="btn pm-buy" id="pmBuySet">' + (st.pending ? 'Payment is pending…' : 'Unlock Premium' + (st.price ? ' · ' + st.price : '')) + '</button>' +
        '<button type="button" class="btn btn-ghost" id="pmRestoreSet">Restore purchase</button></div>' +
        (st.error ? '<p class="sp-fine">' + st.error.replace(/[<>&]/g, '') + '</p>' : '');
  }

  // (v4.95) Restore purchase: always tell the user what was found (an older app version gives no answer: time out)
  let restoreTimer = 0;
  function restore() {
    toast('Checking your purchases…');
    try { B.restorePremium(); } catch (e) { toast('Could not reach Google Play. Check your internet and try again.', true); return; }
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => { restoreTimer = 0; if (!st.premium) toast('No Pro purchase was found on this Google account.', true); }, 9000);
  }

  window.RichPremium = {
    available: has,
    isPremium: () => st.premium,
    isLocked,
    unlockOk, stampUnlock, rewardGate, directAd, tplUnlockAt, tplUnlock, tplConsume,
    isThemeLocked,
    colourFree: (id, designId) => colourFree(id, window.RichApp && window.RichApp.designs().find(d => d.id === designId)),
    offer,
    openPage, closePage,
    thanks,
    onRewarded: (id, result) => rewardDone(id, result),
    // called by Billing.java with the latest state and an optional message
    onNative(state, message) {
      const was = st.premium, wasPending = !!st.pending;
      st = Object.assign(st, state || {});
      // (v4.64) bought now (or a pending payment went through): a thank-you window; found again after a reinstall: a short note
      if (message && message.indexOf('restore:') === 0) { clearTimeout(restoreTimer); restoreTimer = 0; }
      if (st.premium && !was) { close(); if (buying || wasPending) thanks(); else toast('Pro is restored. Welcome back!'); buying = false; }
      else if (message === 'restore:none') toast('No Pro purchase was found on this Google account. Check that the Play Store uses the account you bought Pro with.', true);
      else if (message === 'restore:offline') toast('Could not reach Google Play. Check your internet and try again.', true);
      else if (message && message !== 'cancelled') toast(message, true);
      render();
      pageBusy = false; clearTimeout(pageBusyT);
      if (page) ppRender();
      if (sheet && !st.premium) { const b = document.getElementById('pmBuy'); if (b) b.textContent = st.pending ? 'Payment is pending…' : 'Upgrade to Pro' + (st.price ? ' · ' + st.price : ''); }
      if (window.RichApp) window.RichApp.redrawTemplates();
      if (st.premium !== was) document.dispatchEvent(new CustomEvent('richpro', { detail: { pro: st.premium } }));
    }
  };

  const wireUp = () => {
    read(); render();
    document.addEventListener('click', e => {
      if (e.target.closest('#pmBuySet')) { if (!st.pending) { buying = true; B.buyPremium(); } }
      else if (e.target.closest('#pmRestoreSet')) restore();
    });
    // phone Back closes the sheet first
    const back = window.RichAndroidBack;
    if (typeof back === 'function') window.RichAndroidBack = function () { if (ty) { closeThanks(); return true; } if (sheet) { close(); return true; } if (page) { closePage(); return true; } return back(); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (ty) closeThanks(); else if (sheet) close(); else if (page) closePage(); } });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireUp); else wireUp();
})();
