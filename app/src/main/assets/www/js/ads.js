/* =========================================================================
   Ad places.
   The page has ad slots (<div class="ad-slot" data-ad="..." data-size="...">)
   on Home, My CVs, Downloads, PDF Tools, the editor and the design screen,
   plus a banner fixed at the bottom of the screen and a full-screen ad
   (interstitial) shown after downloads.

   Settings live in js/config.js  ->  RICH_CONFIG.ads
     enabled       true when real ads are wired in (Android app + AdMob)
     placeholders  true shows dashed "Ad space" boxes so you can see the places
   Real ads: the Android app can provide AndroidBridge.showBanner(slot) /
   AndroidBridge.showInterstitial(reason); when those exist they are used.
   ========================================================================= */
window.RichAds = (function () {
  const CFG = Object.assign({
    enabled: false, placeholders: true, bottomBanner: true,
    interstitialEvery: 2,          // (not used since v4.96z: no ad after downloads)
    minSecondsBetween: 60,         // the break ads: never more often than once a minute
    timedEverySeconds: 120         // (v4.96z) a full-screen ad every 2 minutes of use, shown at the next screen change
  }, (window.RICH_CONFIG || {}).ads || {});
  const SIZE = { banner: '320 × 50', large: '320 × 100', mrec: '300 × 250' };
  // Android app with AdMob built in (v3.18+): real ads come from the app, the page shows no ad boxes
  const hasNative = (() => { try { return !!(window.AndroidBridge && window.AndroidBridge.hasAds && window.AndroidBridge.hasAds()); } catch (e) { return false; } })();
  const native = () => (window.AndroidBridge && (hasNative || CFG.enabled)) ? window.AndroidBridge : null;
  let count = 0, last = 0, timer = null;
  const pro = () => document.documentElement.classList.contains('is-pro');     // Pro bought: no ads anywhere

  function slots() {
    if (hasNative) {                       // the app shows the real banner under the page
      document.querySelectorAll('.ad-slot:not(.ad-native)').forEach(el => { el.hidden = true; });
      const bar = document.getElementById('adBar');
      if (bar) bar.hidden = true;
      document.body.classList.remove('has-ad-bar');
      return;
    }
    const show = CFG.enabled || CFG.placeholders;
    document.querySelectorAll('.ad-slot').forEach(el => {
      const inBar = !!el.closest('.ad-bar');
      el.hidden = !show || (inBar && !CFG.bottomBanner);
      if (el.hidden || el.dataset.ready) return;
      el.dataset.ready = '1';
      el.setAttribute('aria-label', 'Advertisement');
      const n = native();
      if (n && n.showBanner) { el.classList.add('ad-live'); try { n.showBanner(el.dataset.ad); } catch (e) { /* ignore */ } }
      el.innerHTML = '<span class="ad-tag">Ad</span><span class="ad-ph"><b>Ad space</b>' + (el.dataset.ad || '') + ' · ' + (SIZE[el.dataset.size] || SIZE.banner) + '</span>';
    });
    const bar = document.getElementById('adBar');
    if (bar) {
      const on = show && CFG.bottomBanner;
      bar.hidden = !on;
      document.body.classList.toggle('has-ad-bar', on);
    }
  }

  function showInterstitial(reason) {
    if (pro()) return;
    const n = native();
    if (n && n.showInterstitial) { try { n.showInterstitial(reason); } catch (e) { /* ignore */ } return; }
    if (!CFG.placeholders) return;
    const box = document.createElement('div');
    box.className = 'ad-inter'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Advertisement');
    box.innerHTML = '<div class="ad-inter-box"><span class="ad-tag">Ad</span>' +
      '<button type="button" class="btn btn-ghost btn-small ad-inter-close">Close ✕</button>' +
      '<span class="ad-ph"><b>Full-screen ad space</b>Shown after a download · ' + reason + '</span></div>';
    const close = () => box.remove();
    box.querySelector('.ad-inter-close').addEventListener('click', close);
    box.addEventListener('click', e => { if (e.target === box) close(); });
    document.body.appendChild(box);
  }

  // call after something finished (e.g. a download); several in a row count as one
  function after(reason) {
    if (!hasNative && !CFG.enabled && !CFG.placeholders) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      count++;
      const now = Date.now();
      if (count % Math.max(1, CFG.interstitialEvery) !== 0) return;
      if (now - last < CFG.minSecondsBetween * 1000) return;
      last = now;
      showInterstitial(reason);
    }, 1200);
  }

  // a natural break (e.g. "Go To Design Section"): full-screen ad, at most once every few minutes,
  // sharing the timer with the after-download ad so two never come close together
  function atBreak(reason, minSeconds) {
    if (!hasNative && !CFG.enabled && !CFG.placeholders) return;
    const now = Date.now();
    if (now - last < Math.max(CFG.minSecondsBetween, minSeconds || 180) * 1000) return;
    last = now;
    setTimeout(() => showInterstitial(reason), 350);   // after the Design screen has opened underneath
  }

  // (v4.96i) a rewarded ad was just watched: no full-screen ad right after it
  function justShown() { last = Date.now(); count = 0; clearTimeout(timer); }

  // ---- (v4.96z) a full-screen ad every 2 minutes of use ----
  // Google's rules forbid full-screen ads that pop up in the middle of what the user is doing, so the ad waits
  // until 2 minutes have passed and then shows at the next screen change (another page, tab, CV page or tool).
  // Time with the app in the background does not count. Shares the timer with the break ads above.
  (function timed() {
    if (!hasNative && !CFG.enabled && !CFG.placeholders) return;
    const EVERY = Math.max(60, CFG.timedEverySeconds || 120) * 1000;
    let hiddenAt = 0, sig = '', startAt = Date.now();   // the first one: 2 minutes after the app opens
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt) { const d = Date.now() - hiddenAt; startAt += d; if (last) last += d; hiddenAt = 0; }
    });
    const busy = () => {
      const b = document.body; if (!b) return true;
      return pro() || document.hidden || b.classList.contains('typing') || b.classList.contains('pp-open') || b.classList.contains('auth-open') ||
        !!document.querySelector('#splash:not([hidden]):not(.out), .intro, .lang-first, .lang-restart, .ad-inter, .overlay:not([hidden]), .tp-overlay:not([hidden]), .fullview:not([hidden]), .ld-ov:not([hidden]), #savedBox:not([hidden])');
    };
    const screenSig = () => {
      const b = document.body; if (!b) return '';
      let page = ''; try { if (window.RichWizard && b.dataset.view === 'edit') page = RichWizard.page(); } catch (e) { /* ignore */ }
      const tool = document.querySelector('#toolSwitch [aria-checked="true"]');
      const dtool = document.querySelector('#tools .tool.is-on');
      return [b.dataset.view || '', page, tool ? tool.dataset.ptool : '', dtool ? dtool.dataset.tool : ''].join('|');
    };
    setInterval(() => {
      const now = Date.now(), s = screenSig();
      const changed = sig && s !== sig; sig = s;
      if (!changed || busy() || now - Math.max(last, startAt) < EVERY) return;
      last = now;
      setTimeout(() => { if (!busy()) showInterstitial('timed'); }, 450);   // after the new screen has opened
    }, 500);
  })();

  const isOpen = () => !!document.querySelector('.ad-inter');
  function closeOpen() { const el = document.querySelector('.ad-inter'); if (el) { el.remove(); return true; } return false; }

  // while typing on a phone the keyboard pushes the bottom banner up over the form: hide it then
  document.addEventListener('focusin', e => { if (e.target.matches('input:not([type=range]):not([type=checkbox]):not([type=file]), textarea, select')) document.body.classList.add('typing'); });
  document.addEventListener('focusout', () => setTimeout(() => {
    const a = document.activeElement;
    if (!a || !a.matches('input, textarea, select')) { document.body.classList.remove('typing'); kbSeen = false; }
  }, 50));

  // (v4.97) the keyboard was closed (Back key / keyboard's hide button) while a box still has the cursor:
  // the user is no longer typing, so the cursor leaves the box and the banner comes back
  let fullH = window.innerHeight;
  // (v4.98) only treat the keyboard as "closed" after it was really seen open. Without this, the page growing when the
  // bottom banner hides (right after a tap) or an Android insets pass looked like "keyboard closed" and the box was
  // blurred before the keyboard appeared: the user had to tap several times.
  let kbSeen = false;
  function kbClosed() {
    kbSeen = false;
    const a = document.activeElement;
    if (a && a.matches && a.matches('input, textarea') && a.blur) a.blur();
    document.body.classList.remove('typing');
  }
  window.addEventListener('resize', () => {
    const h = window.innerHeight;
    if (h > fullH) fullH = h;
    if (h < fullH - 100) kbSeen = true;
    if (kbSeen && h >= fullH - 80 && document.body.classList.contains('typing')) setTimeout(() => { if (kbSeen && window.innerHeight >= fullH - 80) kbClosed(); }, 150);
  });
  window.addEventListener('orientationchange', () => { fullH = 0; setTimeout(() => { fullH = window.innerHeight; }, 400); });
  window.RichKbVisible = on => { if (on) { kbSeen = true; return; } if (kbSeen && document.body.classList.contains('typing')) kbClosed(); };   // told by the Android app

  const splashOn = () => { const sp = document.getElementById('splash'); return !!(sp && !sp.hidden && !sp.classList.contains('out')); };
  // the app's banner hides while typing and while the intro slides are open (v4.89: it stays at the bottom of Settings)
  if (hasNative && window.AndroidBridge.setBannerVisible) {
    let lastShown = null;
    const update = () => {
      const b = document.body; if (!b) return;
      // (v4.90) not on PDF Tools: the big ad is shown there instead
      // (v4.95) no ads on the loading screen
      // (v4.95) the banner shows on PDF Tools too (the big ad there is gone)
      const show = !pro() && !splashOn() && !b.classList.contains('typing') && !b.classList.contains('auth-open') && !b.classList.contains('pp-open') && !document.querySelector('.intro, .lang-first, .lang-restart');   // (v4.96v) no ad on the first language screen
      if (show !== lastShown) { lastShown = show; try { window.AndroidBridge.setBannerVisible(show); } catch (e) { /* ignore */ } }
    };
    const watch = () => {
      update();
      new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-view'], childList: true });
      new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });   // Pro bought
      const sp = document.getElementById('splash');
      if (sp) new MutationObserver(update).observe(sp, { attributes: true, attributeFilter: ['class', 'hidden'] });   // loading screen ends
    };
    if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch);
  }

  // ---- Home rectangle (300 x 250): the app lays a real AdMob ad exactly over this box ----
  const hasMrec = (() => { try { return hasNative && typeof window.AndroidBridge.placeMrec === 'function'; } catch (e) { return false; } })();
  if (hasMrec) {
    let mrecReady = false, raf = 0, lastKey = '', scrolling = false, scrollT = 0;
    // the same rectangle ad is shown on Home and on PDF Tools (never both on screen at once)
    // (v4.27) and under every page of the Edit tab
    const SPOTS = {};   // (v4.95) the big rectangle ad is removed everywhere (was: PDF Tools and the Edit pages)
    const boxes = () => Object.values(SPOTS).map(id => document.querySelector('.ad-slot[data-ad="' + id + '"]')).filter(Boolean);
    const box = () => { const id = SPOTS[document.body.dataset.view]; return id ? document.querySelector('.ad-slot[data-ad="' + id + '"]') : null; };
    const covered = () => {
      const b = document.body;
      return pro() || !SPOTS[b.dataset.view] || b.classList.contains('typing') || b.classList.contains('settings-open') || b.classList.contains('auth-open') ||
        splashOn() || !!document.querySelector('.intro, .ad-inter, .overlay:not([hidden]), .fullview:not([hidden]), .tp-overlay:not([hidden]), .lang-first, .settings-page:not([hidden])');
    };
    // (v4.85) the ad shows only where its box can really be seen: anything laid over the box (a window, a picker,
    // a menu) hides the ad, so it never floats over another screen
    const visibleBox = el => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.offsetParent === null) return false;
      const bar = document.querySelector('.topbar'), top = Math.max(0, bar ? bar.getBoundingClientRect().bottom : 0);
      const y0 = Math.max(r.top, top), y1 = Math.min(r.bottom, innerHeight);
      if (y1 - y0 < 4) return true;                  // scrolled out of sight: the app clips it anyway
      const pts = [[0.5, 0.5], [0.15, 0.2], [0.85, 0.2], [0.15, 0.8], [0.85, 0.8]];
      return pts.every(([fx, fy]) => {
        const x = r.left + r.width * fx, y = y0 + (y1 - y0) * fy;
        const hit = document.elementFromPoint(x, y);
        return !hit || hit === el || el.contains(hit);
      });
    };
    const fullyOnScreen = el => {
      const r = el.getBoundingClientRect();
      const bar = document.querySelector('.topbar'), top = bar ? bar.getBoundingClientRect().bottom : 0;
      return r.height > 0 && r.top >= top - 1 && r.bottom <= innerHeight + 1;
    };
    const hideNow = () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (lastKey.indexOf('false') === 0) return;
      lastKey = 'false';
      try { window.AndroidBridge.placeMrec(false, 0, 0, 0, 0, 0, innerWidth); } catch (e) { /* ignore */ }
    };
    const onScroll = () => {
      scrolling = true; hideNow();
      clearTimeout(scrollT);
      scrollT = setTimeout(() => { scrolling = false; lastKey = ''; soon(); }, 220);
    };
    const place = () => {
      raf = 0;
      const el = box();
      const zoom = parseFloat(document.documentElement.style.zoom) || 1;
      if (mrecReady) boxes().forEach(b => {     // room for the ad: 300 x 250 on screen at any Display size
        b.hidden = false; b.classList.add('ad-native'); b.innerHTML = '';
        b.style.width = (300 / zoom) + 'px'; b.style.height = (250 / zoom) + 'px';
      });
      let args = [false, 0, 0, 0, 0, 0, innerWidth];
      // (v4.95) the ad is only shown while the page stands still and its box is fully on screen.
      // The moment anything scrolls (the page or a box inside it) it hides, and it comes back on its box when
      // scrolling stops, so it can never sit over the form or drift across the screen.
      if (el && mrecReady && !scrolling && !covered() && fullyOnScreen(el) && visibleBox(el)) {
        // getBoundingClientRect may or may not include the page zoom (depends on the WebView version): measure it
        const f = innerWidth / (document.documentElement.getBoundingClientRect().width || innerWidth);
        const r = el.getBoundingClientRect();
        const bar = document.querySelector('.topbar');
        const head = bar ? bar.getBoundingClientRect().bottom * f : 0;
        args = [true, r.left * f, r.top * f, r.width * f, r.height * f, Math.max(0, head), innerWidth];   // screen place
      }
      const key = args.map(v => typeof v === 'number' ? v.toFixed(1) : v).join(',');
      if (key === lastKey) return; lastKey = key;
      try { window.AndroidBridge.placeMrec.apply(window.AndroidBridge, args); } catch (e) { /* ignore */ }
    };
    const soon = () => { if (!raf) raf = requestAnimationFrame(place); };
    window.RichAdsMrec = state => { mrecReady = state === 'loaded'; if (!mrecReady) boxes().forEach(b => { b.hidden = true; }); soon(); };
    const watchAll = () => {
      new MutationObserver(() => { soon(); setTimeout(soon, 450); })      // screen changes (after the slide-in)
        .observe(document.body, { attributes: true, attributeFilter: ['class', 'data-view'], childList: true, subtree: false });
      document.querySelectorAll('.overlay, .fullview').forEach(o => new MutationObserver(soon).observe(o, { attributes: true, attributeFilter: ['hidden'] }));
      // the Edit pages change height while typing and when a page changes: keep the ad on its box
      if ('ResizeObserver' in window) ['view-home', 'view-tools', 'cvForm'].forEach(id => { const h = document.getElementById(id); if (h) new ResizeObserver(soon).observe(h); });
      window.RichAdsMrecRefresh = () => { soon(); setTimeout(soon, 350); };
      addEventListener('resize', soon);
      document.addEventListener('scroll', onScroll, { capture: true, passive: true });   // the page or any box inside it
      addEventListener('scrollend', soon);
      // (v4.85) windows that open and close inside the page, and boxes that move without scrolling: check often
      // (cheap: the app is only told when something really changed)
      setInterval(soon, 300);
      document.addEventListener('transitionend', soon, true);
      document.addEventListener('animationend', soon, true);
      soon();
    };
    if (document.body) watchAll(); else document.addEventListener('DOMContentLoaded', watchAll);
  }

  // ---- Settings > Ads check (Android app only) ----
  if (hasNative && window.AndroidBridge.getAdStatus) {
    const LABELS = [['banner', 'Bottom banner'], ['fullscreen', 'Full-screen ad'], ['rewarded', 'Rewarded ad (Watch an ad to unlock)'], ['consent', 'Consent (Europe / UK)']];
    const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const render = () => {
      const card = document.getElementById('adsCard'); if (!card) return;
      let st = {};
      try { st = JSON.parse(window.AndroidBridge.getAdStatus() || '{}'); } catch (e) { st = {}; }
      // a tool for you, not for users: hidden until the "Settings" title is tapped 7 times
      let dev = false; try { dev = localStorage.getItem('richDevMode') === '1'; } catch (e) { /* ignore */ }
      card.hidden = !dev;
      if (!dev) return;
      const ok = v => /^(showing|ready|ok)/.test(v || '');
      document.getElementById('adsStatus').innerHTML = LABELS.map(([k, l]) =>
        '<div class="ads-row ' + (ok(st[k]) ? 'ok' : (/not loaded|failed|not given/.test(st[k] || '') ? 'bad' : 'wait')) + '"><b>' + l + '</b><span>' + esc(st[k] || 'waiting') + '</span></div>').join('') +
        '<div class="ads-meta">' + (st.test ? 'Using Google test ads' : 'Using your AdMob ad units') + (st.sdk ? ' · SDK ' + esc(st.sdk) : '') + '</div>';
      document.getElementById('adsTest').checked = !!st.test;
    };
    const wireCard = () => {
      const t = document.getElementById('adsTest'), r = document.getElementById('adsRefresh');
      if (t) t.addEventListener('change', () => { try { window.AndroidBridge.setTestAds(t.checked); } catch (e) { /* ignore */ } });
      if (r) r.addEventListener('click', render);
      const title = document.getElementById('settingsTitle');
      let taps = 0, tapTimer = 0;
      if (title) title.addEventListener('click', () => {
        clearTimeout(tapTimer); tapTimer = setTimeout(() => { taps = 0; }, 1500);
        if (++taps < 7) return;
        taps = 0;
        let on = false; try { on = localStorage.getItem('richDevMode') !== '1'; localStorage.setItem('richDevMode', on ? '1' : '0'); } catch (e) { /* ignore */ }
        if (window.RichApp) window.RichApp.toast(on ? 'Ads check is shown.' : 'Ads check is hidden.');
        render();
      });
      new MutationObserver(() => { if (document.body.classList.contains('settings-open')) render(); })
        .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireCard); else wireCard();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', slots); else slots();
  return { refresh: slots, after, atBreak, justShown, showInterstitial, isOpen, closeOpen, config: CFG, native: hasNative };
})();
