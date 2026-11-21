/* =========================================================================
   App language: English, Hindi, Urdu, Farsi, Russian, German, French, Arabic.
   The app is written in English. This file swaps the words on screen for the
   chosen language: text, placeholders, tooltips and screen-reader labels,
   including messages that appear later (toasts, dialogs, lists).
   The CV itself and its PDF stay in English: the PDF fonts print only Latin letters.
   Words come from js/i18n-data.js (made by tools/i18n/build_i18n.py).
   ========================================================================= */
(function () {
  const DATA = window.RICH_I18N || { langs: [], dict: {}, patterns: [] };
  const LANGS = [['en', 'English'], ['hi', 'हिन्दी'], ['ur', 'اردو'], ['fa', 'فارسی'], ['ru', 'Русский'], ['de', 'Deutsch'], ['fr', 'Français'], ['ar', 'العربية']];
  const RTL = { ur: 1, fa: 1, ar: 1 };
  const KEY = 'richLang';
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  // places that hold the user's own CV content or names that stay in English
  const SKIP = 'script,style,textarea,svg,[contenteditable],[data-no-i18n],#pages,.chips,.combo-list,#appLang,.r-name,.dl-name';
  const SKIP_ATTR = SKIP.replace('textarea,', '');      // a textarea's placeholder is translated, its text is not
  const PATS = DATA.patterns.map(p => [new RegExp(p[0]), p[1]]);
  const isLang = l => LANGS.some(x => x[0] === l);

  function detect() {
    try { const s = localStorage.getItem(KEY); if (s && isLang(s)) return s; } catch (e) { /* ignore */ }
    const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']);
    for (const l of list) { const c = String(l || '').toLowerCase().split('-')[0]; if (isLang(c)) return c; }
    return 'en';
  }
  let lang = detect();
  let col = DATA.langs.indexOf(lang);

  // ---------------- translate one string ----------------
  function lookup(s) {
    if (col < 0) return null;
    const row = DATA.dict[s] || DATA.dict[s.charAt(0).toUpperCase() + s.slice(1)];
    return row ? row[col] : null;
  }
  function t(src) {
    if (col < 0 || src == null) return src;
    const s = String(src).replace(/\s+/g, ' ').trim();
    if (!s || !/[A-Za-z]/.test(s)) return src;
    const d = lookup(s);
    if (d) return d;
    for (const [re, outs] of PATS) {
      const m = s.match(re);
      if (!m) continue;
      return outs[col]
        .replace(/%(\d)/g, (_, k) => { const g = m[+k] || ''; return lookup(g) || g; })
        .replace(/\$(\d)/g, (_, k) => m[+k] || '');
    }
    return src;
  }

  // ---------------- translate the page ----------------
  const texts = new WeakMap();          // text node -> { en, out }
  const skipped = el => !!(el && el.closest && el.closest(SKIP));

  function doText(n) {
    const p = n.parentElement;
    if (!p || skipped(p)) return;
    const v = n.nodeValue;
    let rec = texts.get(n);
    if (rec && v === rec.out && rec.l === lang) return;    // already done for this language
    if (!rec || v !== rec.out) { rec = { en: v, out: v }; texts.set(n, rec); }
    rec.l = lang;
    if (!/[A-Za-z]/.test(v)) return;
    const core = v.trim();
    const tr = t(core);
    const out = tr === core ? rec.en : v.replace(core, tr);
    if (p.tagName === 'OPTION' && !p.hasAttribute('value')) p.setAttribute('value', p.value);   // keep the saved value in English
    rec.out = out;
    if (n.nodeValue !== out) n.nodeValue = out;
  }
  function doAttrs(el) {
    if (el.closest(SKIP_ATTR)) return;
    const store = el.__i18n || (el.__i18n = {});
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const v = el.getAttribute(a);
      let rec = store[a];
      if (rec && v === rec.out && rec.l === lang) continue;
      if (!rec || v !== rec.out) rec = store[a] = { en: v, out: v };
      rec.l = lang;
      const tr = t(v);
      rec.out = tr == null ? v : tr;
      if (rec.out !== v) el.setAttribute(a, rec.out);
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1) return;
    doAttrs(root);
    if (skipped(root)) return;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        if (n.nodeType !== 1 || !n.matches(SKIP)) return NodeFilter.FILTER_ACCEPT;
        if (n.tagName === 'TEXTAREA') doAttrs(n);
        return NodeFilter.FILTER_REJECT;
      }
    });
    let n;
    while ((n = tw.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  // back to the English source, then translate again (used when the language changes)
  function resetAll() {
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) { const r = texts.get(n); if (r && n.nodeValue === r.out) { n.nodeValue = r.en; r.out = r.en; } }
      else if (n.__i18n) {
        for (const a in n.__i18n) { const r = n.__i18n[a]; if (n.getAttribute(a) === r.out) n.setAttribute(a, r.en); r.out = r.en; }
      }
    }
  }

  let obs = null;
  function observe() {
    if (obs) return;
    obs = new MutationObserver(list => {
      if (col < 0) return;
      for (const m of list) {
        if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doAttrs(m.target);
        else m.addedNodes.forEach(walk);
      }
    });
    obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  function setDir() {
    const h = document.documentElement;
    h.lang = lang; h.dir = RTL[lang] ? 'rtl' : 'ltr';
    h.classList.toggle('is-rtl', !!RTL[lang]);
    h.classList.toggle('not-en', lang !== 'en');
  }

  function setLang(l) {
    if (!isLang(l) || l === lang) return;
    obs && obs.disconnect(); obs = null;
    resetAll();
    lang = l; col = DATA.langs.indexOf(l);
    try { localStorage.setItem(KEY, l); } catch (e) { /* ignore */ }
    setDir();
    if (col >= 0) { walk(document.body); observe(); }
    syncPicker();
    document.dispatchEvent(new CustomEvent('richlang', { detail: l }));
  }

  // ---------------- language picker in Settings ----------------
  function syncPicker() {
    const sel = document.getElementById('appLang');
    if (sel && sel.value !== lang) sel.value = lang;
  }
  // Choosing a language restarts the app, so every screen is drawn fresh in the new language.
  const REOPEN = 'richReopenSettings';
  async function restartIn(l) {
    const sel = document.getElementById('appLang');
    if (!isLang(l) || l === lang) return;
    const A = window.RichApp;
    if (A && A.isDirty && A.isDirty() && A.confirm) {
      const ok = await A.confirm(t('Restart in the new language?'), t('The open CV has changes that are not saved. They will be lost when the app restarts.'), t('Restart'), t('Cancel'));
      if (!ok) { if (sel) sel.value = lang; return; }
    }
    try { localStorage.setItem(KEY, l); sessionStorage.setItem(REOPEN, '1'); } catch (e) { setLang(l); return; }
    const cover = document.createElement('div');
    cover.className = 'lang-restart';
    cover.innerHTML = '<span class="lang-spin" aria-hidden="true"></span><span>' + t('Restarting…').replace(/[<>&]/g, '') + '</span>';
    document.body.appendChild(cover);
    setTimeout(() => { try { location.reload(); } catch (e) { setLang(l); cover.remove(); } }, 250);
  }
  function buildPicker() {
    const sel = document.getElementById('appLang');
    if (!sel || sel.__wired) return;
    sel.__wired = true;
    sel.value = lang;
    sel.addEventListener('change', () => restartIn(sel.value));
  }
  // after a language restart, come back to Settings
  function reopenSettings() {
    let flag = false;
    try { flag = sessionStorage.getItem(REOPEN) === '1'; sessionStorage.removeItem(REOPEN); } catch (e) { /* ignore */ }
    if (!flag) return;
    let tries = 0;
    const tick = () => {
      const sp = document.getElementById('splash'), btn = document.getElementById('openSettings');
      if (btn && (!sp || sp.classList.contains('out') || sp.hidden)) { btn.click(); return; }
      if (++tries < 60) setTimeout(tick, 100);
    };
    setTimeout(tick, 300);
  }

  // ---------------- first start: choose the language before the welcome slides ----------------
  const CHOSEN = 'richLangChosen';
  const chosen = () => { try { return localStorage.getItem(CHOSEN) === '1' || localStorage.getItem('richIntroSeen') === '1'; } catch (e) { return true; } };
  const tIn = (l, s) => { const k = DATA.langs.indexOf(l); const row = DATA.dict[s]; return k >= 0 && row ? row[k] : s; };
  const ENGLISH = { en: 'English', hi: 'Hindi', ur: 'Urdu', fa: 'Farsi', ru: 'Russian', de: 'German', fr: 'French', ar: 'Arabic' };
  let picker = null;
  function firstRunPicker() {
    if (chosen() || picker) return;
    let pick = lang;
    picker = document.createElement('div');
    picker.className = 'lang-first'; picker.setAttribute('role', 'dialog'); picker.setAttribute('aria-modal', 'true'); picker.setAttribute('data-no-i18n', '');
    const logo = window.RICH_LOGO ? '<img class="lf-logo" alt="" src="' + window.RICH_LOGO + '">' : '';
    picker.innerHTML =
      '<div class="lf-box">' +
        '<div class="lf-head">' + logo + '<h1 class="lf-title"></h1><p class="lf-sub">Choose your language</p></div>' +
        '<div class="lf-list" role="radiogroup" dir="ltr">' +
          LANGS.map(([c, n]) => '<button type="button" role="radio" class="lf-opt" data-lang="' + c + '"><span class="lf-n">' + n + '</span>' +
            (c === 'en' ? '' : '<span class="lf-e">' + ENGLISH[c] + '</span>') + '<span class="lf-tick" aria-hidden="true"></span></button>').join('') +
        '</div>' +
        '<button type="button" class="lf-go"></button>' +
        '<p class="lf-note"></p>' +
      '</div>';
    document.body.appendChild(picker);
    // the list never moves: the top part keeps the room for the second line, so when it shows
    // the logo and title glide up a little and the line fades in (see anim.js)
    const head = picker.querySelector('.lf-head'), ttl = picker.querySelector('.lf-title');
    let tall = 0;
    LANGS.forEach(([c]) => { ttl.textContent = tIn(c, 'Choose your language'); tall = Math.max(tall, head.offsetHeight); });
    head.style.minHeight = tall + 'px';
    ttl.textContent = '';
    const swap = (el, text) => {                     // a new word fades in instead of just changing
      if (el.textContent === text) return;
      el.textContent = text;
      if (el.animate && el.isConnected) el.animate([{ opacity: 0, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,0,0,1)' });
    };
    const paint = () => {
      picker.querySelectorAll('.lf-opt').forEach(b => b.setAttribute('aria-checked', String(b.dataset.lang === pick)));
      const d = RTL[pick] ? 'rtl' : 'ltr';
      head.dir = d; picker.querySelector('.lf-go').dir = d; picker.querySelector('.lf-note').dir = d;
      swap(picker.querySelector('.lf-title'), tIn(pick, 'Choose your language'));
      picker.querySelector('.lf-sub').hidden = pick === 'en';
      swap(picker.querySelector('.lf-go'), tIn(pick, 'Next'));
      swap(picker.querySelector('.lf-note'), tIn(pick, 'You can change it later in Settings.'));
    };
    paint();
    picker.addEventListener('click', e => {
      const o = e.target.closest('.lf-opt');
      if (o) { pick = o.dataset.lang; paint(); return; }
      if (!e.target.closest('.lf-go')) return;
      try { localStorage.setItem(CHOSEN, '1'); localStorage.setItem(KEY, pick); } catch (x) { /* ignore */ }
      if (pick !== lang) setLang(pick);                        // first start: switch straight away, no restart (only Settings restarts)
      picker.classList.add('out');
      const p = picker; picker = null; window.scrollTo(0, 0);
      setTimeout(() => p.remove(), 300);
      if (window.RichIntro) window.RichIntro.show();
    });
  }

  window.RichI18n = { t, get lang() { return lang; }, isRtl: () => !!RTL[lang], setLang, languages: LANGS.slice(),
    needsChoice: () => !chosen(), pickerOpen: () => !!picker };

  setDir();
  const start = () => {
    buildPicker();
    if (col >= 0) { walk(document.body); observe(); }
    reopenSettings();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', firstRunPicker); else firstRunPicker();
  };
  // this script loads at the end of <body>, so the page is already there: translate it before it is shown
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
