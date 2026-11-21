/* =========================================================================
   Settings as a menu. Every item is one row:
     Appearance, Account, Upgrade to Pro, Backup CVs,
     Google Drive backup, Share app, Rate us, Contact us (and Ads check for you).
   A row opens its section on its own (Back returns to the menu), or does its
   action straight away (Account page, Pro sheet, share, rate, email).
   The sections themselves live in app.js, cloud.js, premium.js and ads.js.
   ========================================================================= */
(function () {
  const $ = s => document.querySelector(s);
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const B = window.AndroidBridge;
  const can = name => { try { return !!(B && typeof B[name] === 'function'); } catch (e) { return false; } };
  const CFG = new Proxy({}, { get: (t, k) => (((window.RICH_CONFIG || {}).contact || {})[k] || '') });   // read when used
  const toast = (m, bad) => { if (window.RichApp) window.RichApp.toast(m, bad); };
  const isPro = () => document.documentElement.classList.contains('is-pro');
  const cloudSt = () => { try { return JSON.parse(B.cloudStatus() || '{}'); } catch (e) { return {}; } };

  const IC = {
    appearance: '<path fill="currentColor" d="M12 3a9 9 0 0 0 0 18c.8 0 1.5-.7 1.5-1.5 0-.4-.1-.7-.4-1-.2-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>',
    account: '<path fill="currentColor" d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z"/>',
    pro: '<path fill="currentColor" d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5zm2 13h14v2H5z"/>',
    noads: '<path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 0 1 6.3 12.9L7.1 5.7A8 8 0 0 1 12 4zM5.7 7.1l11.2 11.2A8 8 0 0 1 5.7 7.1z"/>',
    backup: '<path fill="currentColor" d="M5 20h14v-2H5zm7-17-6 6h4v6h4V9h4z"/>',
    cloud: '<path fill="currentColor" d="M19.4 10A7.5 7.5 0 0 0 5.4 8 6 6 0 0 0 6 20h13a5 5 0 0 0 .4-10z"/>',
    share: '<path fill="currentColor" d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7l-6.7 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1z"/>',
    rate: '<path fill="currentColor" d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z"/>',
    contact: '<path fill="currentColor" d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9 7.2L4.4 7H4v.6l8 5.4 8-5.4V7h-.4z"/>',
    privacy: '<path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.9-4.9 1.4 1.4z"/>',
    consent: '<path fill="currentColor" d="M3 6h11v2H3zm0 5h7v2H3zm0 5h7v2H3zM17 4h2v3h2v2h-2v11h-2V9h-2V7h2zm-4 8h2v2h-2z"/>',
    autosave: '<path fill="currentColor" d="M5 3h11l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 2v4h8V5zm5 7.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/>',
    battery: '<path fill="currentColor" d="M9 2h6v2h2a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h2zm4 6l-4 6h3v4l4-6h-3z"/>',
    ads: '<path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3.5 4L5 16h2l.5-1.5h3L11 16h2l-2.5-8zm.6 4.8L9 10l.9 2.8zM14 8v8h2.5a4 4 0 0 0 0-8z"/>'
  };
  const shareText = () => { const t = 'Make a professional CV in minutes with Rich CV Maker: ' + (CFG.playUrl || location.href); return window.RichI18n ? window.RichI18n.t(t) : t; };

  const ITEMS = [
    { id: 'appearance', group: 'general', card: 'appearanceCard', title: 'Appearance', sub: () => 'Language, theme and display size' },
    { id: 'account', group: 'general', card: 'accountCard', title: 'Account',
      sub: () => { const s = window.RichAuth ? window.RichAuth.status() : {}; return s.signedIn ? (s.email || s.name || '') : 'Log in with email or Google'; },
      show: () => !!(window.RichAuth && window.RichAuth.available),
      run: () => { const s = window.RichAuth.status(); window.RichAuth.open(s.signedIn ? null : 'login'); return true; } },   // only the Account page, no second page behind it
    { id: 'pro', group: 'general', card: 'premiumCard', title: () => isPro() ? 'Pro is active' : 'Upgrade to Pro', sub: () => isPro() ? 'Thank you for your support' : 'No ads and all Premium templates',
      show: () => !!(window.RichPremium && window.RichPremium.available),
      run: () => { if (window.RichPremium.openPage) { window.RichPremium.openPage(); return true; } if (!isPro()) window.RichPremium.offer('pro'); return !isPro(); } },
    { id: 'autosave', group: 'cvs', card: 'autosaveCard', title: 'Auto-save', sub: () => {
        let p = {}; try { p = JSON.parse(localStorage.getItem('richAutoSave') || '{}') || {}; } catch (e) { p = {}; }
        if (!document.documentElement.classList.contains('is-pro')) return 'Pro feature';
        if (p.on === false) return 'Off';
        const n = +p.every || 30;
        return 'On, every ' + (n < 60 ? n + ' seconds' : (n === 60 ? '1 minute' : n / 60 + ' minutes'));
      } },
    // (v4.97) Android's battery saver may close the app soon after it goes to the background.
    // This row shows whether the app is limited and opens Android's own battery page for it.
    { id: 'battery', group: 'general', title: 'Battery',
      sub: () => { try { return B.batteryFree() ? 'Not limited' : 'Limited · tap to keep the app open'; } catch (e) { return ''; } },
      show: () => can('batteryFree') && can('openBatterySettings'),
      run: () => { B.openBatterySettings(); return true; } },
    { id: 'backup', group: 'cvs', card: 'backupCard', title: 'Backup CVs', sub: () => 'Save or load a backup file' },
    { id: 'cloud', group: 'cvs', card: 'cloudCard', title: 'Google Drive backup', sub: () => !document.documentElement.classList.contains('is-pro') ? 'Pro feature' : (cloudSt().signedIn ? 'On' : 'Off'), show: () => { const c = $('#cloudCard'); return !!c && !c.hidden; } },
    { id: 'share', group: 'support', title: 'Share app', sub: () => 'Tell your friends about Rich CV Maker',
      run: () => {
        const text = shareText();
        if (can('shareText')) B.shareText(text);
        else if (navigator.share) navigator.share({ text }).catch(() => {});
        else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('Link copied.'), () => {});
        return true;
      } },
    { id: 'rate', group: 'support', title: 'Rate us', sub: () => 'Your stars help other job seekers find us',
      show: () => can('rateApp') || !!CFG.playUrl,
      run: () => { if (can('rateApp')) B.rateApp(); else window.open(CFG.playUrl, '_blank'); return true; } },
    { id: 'contact', group: 'support', title: 'Contact us', sub: () => CFG.email, show: () => !!CFG.email,
      run: () => {
        const subject = 'Rich CV Maker', body = '';
        if (can('emailUs')) B.emailUs(CFG.email, subject, body); else location.href = 'mailto:' + CFG.email + '?subject=' + encodeURIComponent(subject);
        return true;
      } },
    { id: 'privacy', group: 'privacy', card: 'privacyCard', title: 'Privacy policy', sub: () => 'How the app uses your information' },
    // (v4.94) Europe / UK: change the ad consent given at the first start (Google's own form)
    { id: 'consent', group: 'privacy', title: 'Privacy choices', sub: () => 'Change your ad consent',
      show: () => { try { return can('privacyOptionsRequired') && !isPro() && !!B.privacyOptionsRequired(); } catch (e) { return false; } },
      run: () => { B.showPrivacyOptions(); return true; } },
    { id: 'ads', group: 'dev', card: 'adsCard', title: 'Ads check', sub: () => 'What AdMob answered for each ad', show: () => { const c = $('#adsCard'); return !!c && !c.hidden; } }
  ];
  const text = v => (typeof v === 'function' ? v() : v);

  let page, body, menu, title, current = null;

  // (v4.97) the menu in groups, each in its own card with a small heading
  const GROUPS = [['general', 'General'], ['cvs', 'Your CVs'], ['support', 'Share & support'], ['privacy', 'Privacy'], ['dev', 'Developer']];
  function rows() {
    if (!menu) return;
    let out = '';
    for (const [gid, gname] of GROUPS) {
    let h = '';
    for (const it of ITEMS) {
      if (it.group !== gid) continue;
      if (it.show ? !it.show() : (it.card && !document.getElementById(it.card))) continue;
      const sub = text(it.sub);
      h += '<button type="button" class="sm-row" data-sm="' + it.id + '">' +
        '<span class="sm-ic sm-' + it.id + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + IC[it.id] + '</svg></span>' +
        '<span class="sm-t"><b>' + esc(text(it.title)) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' +
        '<span class="sm-go" aria-hidden="true">›</span></button>';
    }
    if (h) out += '<div class="sm-group sm-g-' + gid + '"><h4 class="sm-gh">' + esc(tr(gname)) + '</h4><div class="sm-list">' + h + '</div></div>';
    }
    menu.innerHTML = out;
  }
  const tr = t => (window.RichI18n && window.RichI18n.t ? window.RichI18n.t(t) : t);

  function openItem(id) {
    const it = ITEMS.find(x => x.id === id); if (!it) return;
    if (it.run && it.run()) return;                         // an action (share, rate, Pro sheet, Account page ...)
    const card = it.card && document.getElementById(it.card); if (!card) return;
    current = it;
    page.classList.add('sub-open');
    card.classList.add('sub-on');
    title.textContent = text(it.title);
    page.scrollTop = 0;
  }
  function closeSub() {
    if (!current) return false;
    const c = document.getElementById(current.card); if (c) c.classList.remove('sub-on');
    current = null;
    page.classList.remove('sub-open');
    title.textContent = 'Settings';
    rows();
    return true;
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(rows, 300); });   // richBatteryRows: back from Android's battery page
  function init() {
    page = $('#settings'); if (!page) return;
    body = page.querySelector('.sp-body'); title = $('#settingsTitle');
    menu = document.createElement('section');
    menu.className = 'sp-card sp-menu'; menu.id = 'settingsMenu';
    body.insertBefore(menu, body.firstChild);
    menu.addEventListener('click', e => { const r = e.target.closest('[data-sm]'); if (r) openItem(r.dataset.sm); });
    // Back (top-left) inside a section returns to the menu first
    $('#closeSettings').addEventListener('click', e => { if (closeSub()) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    const back = window.RichAndroidBack;
    if (typeof back === 'function') window.RichAndroidBack = function () {
      if (window.RichAuth && window.RichAuth.isOpen && window.RichAuth.isOpen()) return back();
      if (document.querySelector('.pm-overlay')) return back();
      if (!page.hidden && closeSub()) return true;
      return back();
    };
    // keep the rows up to date (sign-in, backup on/off, Pro bought, cards that appear later)
    const refresh = () => { if (!current) rows(); };
    const watch = new MutationObserver(refresh);
    ['accountCard', 'cloudCard', 'premiumCard', 'adsCard'].forEach(id => { const c = document.getElementById(id); if (c) watch.observe(c, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true }); });
    new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(() => { if (page.hidden) closeSub(); else rows(); }).observe(page, { attributes: true, attributeFilter: ['hidden'] });
    rows();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
