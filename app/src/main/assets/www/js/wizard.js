/* Edit tab as pages (v4.17): one section (or a few, v4.22) per page, with Back, Skip and Next under it.
   Back is shown but greyed out on the first page. Next on the first page checks the name and job title;
   Skip moves on without checking. The last page leads on to the Design tab. */
(function () {
  'use strict';
  const form = document.getElementById('cvForm');
  if (!form) return;
  // (v4.22) a page can hold more than one section (data-page): page 3 is work experience, skills and summary
  const blocks = Array.from(form.querySelectorAll(':scope > fieldset.block'));
  const pages = [];
  blocks.forEach(b => {
    const k = b.dataset.page || String(pages.length + 1);
    const last = pages[pages.length - 1];
    if (last && last.key === k) last.list.push(b); else pages.push({ key: k, list: [b] });
  });
  if (pages.length < 2) return;
  const N = pages.length;
  const tr = s => (window.RichI18n && window.RichI18n.t ? window.RichI18n.t(s) : s);
  let at = 0;

  form.classList.add('wizard');
  const nav = document.createElement('div');
  nav.className = 'wiz-nav';
  nav.innerHTML =
    '<div class="wiz-prog" aria-hidden="true"><i></i></div>' +
    '<p class="wiz-step"></p>' +
    '<div class="wiz-btns">' +
      '<button type="button" class="btn wiz-back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg><span>Back</span></button>' +
      '<button type="button" class="btn wiz-skip"><span>Skip</span></button>' +
      '<button type="button" class="btn wiz-next"><span class="wiz-next-t">Next</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>' +
    '</div>';
  const $ = s => nav.querySelector(s);

  function stepText() {
    const names = pages[at].list.map(b => ((b.querySelector('legend') || {}).textContent || '').replace(/^\s*\d+\s*/, '').trim());
    return tr('Step') + ' ' + (at + 1) + ' / ' + N + ' · ' + names.join(', ');
  }
  let paint = function () {
    pages.forEach((p, i) => p.list.forEach(b => b.classList.toggle('wiz-on', i === at)));
    form.dataset.wiz = String(at);
    form.classList.toggle('wiz-last', at === N - 1);
    pages[at].list[pages[at].list.length - 1].insertAdjacentElement('afterend', nav);
    // (v4.27) the ad sits under Back / Skip / Next on every page
    const ad = form.querySelector(':scope > .ad-slot[data-ad="editor_page"]');
    if (ad) nav.insertAdjacentElement('afterend', ad);
    if (window.RichAdsMrecRefresh) window.RichAdsMrecRefresh();
    const back = $('.wiz-back');
    back.disabled = at === 0;
    back.setAttribute('aria-disabled', String(at === 0));
    $('.wiz-skip').hidden = at === N - 1;
    $('.wiz-next-t').textContent = tr(at === N - 1 ? 'Go to Design' : 'Next');
    $('.wiz-prog i').style.width = ((at + 1) / N * 100).toFixed(2) + '%';
    $('.wiz-step').textContent = stepText();
    if (typeof refSync === 'function') try { refSync(); } catch (e) {}
  };
  function topOfForm() {
    window.scrollTo({ top: 0, behavior: 'auto' }); return;   // (v4.97) a new page always starts from its top
    const head = form.querySelector('.sheet-head') || form;
    const bar = document.querySelector('.topbar');
    const y = head.getBoundingClientRect().top + window.scrollY - (bar ? bar.getBoundingClientRect().height : 0) - 8;
    window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
  }
  function go(i, dir, noScroll) {
    i = Math.max(0, Math.min(N - 1, i));
    if (window.RichPruneEmpty) window.RichPruneEmpty();      // (v4.35) empty boxes on page 5 are not kept
    if (i === at) { paint(); return; }
    at = i; paint(); document.dispatchEvent(new Event('richwizgo'));
    pages[at].list.forEach(p => {
      p.classList.remove('wiz-in-l', 'wiz-in-r'); void p.offsetWidth;
      if (dir) p.classList.add(dir > 0 ? 'wiz-in-r' : 'wiz-in-l');
    });
    if (!noScroll) topOfForm();
  }
  // Next on the first page: the first name and job title are needed for a CV
  function pageOk() {
    if (at !== 0) return true;
    const miss = ['firstName', 'title'].map(id => document.getElementById(id)).filter(el => el && !el.value.trim());
    if (!miss.length) return true;
    miss.forEach(el => {
      const f = el.closest('.field'); if (!f) return;
      f.classList.add('invalid');
      let m = f.querySelector('.error');
      if (!m) { m = document.createElement('span'); m.className = 'error'; f.appendChild(m); }
      m.textContent = tr(el.id === 'title' ? 'Enter the job title you are applying for.' : 'Enter the first name.');
      el.addEventListener('input', function fix() { if (el.value.trim()) { f.classList.remove('invalid'); const e = f.querySelector('.error'); if (e) e.remove(); el.removeEventListener('input', fix); } });
    });
    // (v4.26) glide to the top of the page first, let the red message be seen, then open the keyboard after 2 seconds
    clearTimeout(pageOk.t);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    pageOk.t = setTimeout(() => { if (!miss[0].value.trim()) miss[0].focus({ preventScroll: true }); }, 2000);
    return false;
  }
  nav.addEventListener('click', e => {
    if (e.target.closest('.wiz-back')) { if (at > 0) go(at - 1, -1); return; }
    // (v4.27) leaving page 3 (work experience, skills, summary) with Next or Skip: a full-screen ad
    // (at most once a minute, sharing the timer with the other full-screen ads)
    const fullAd = () => { if (at === 2 && window.RichAds && window.RichAds.atBreak) window.RichAds.atBreak('edit_page3', 60); };
    if (e.target.closest('.wiz-skip')) {
      // (v4.28) the user typed something on this page: make sure skipping is what they want
      if (touched.has(at) && window.RichApp && window.RichApp.confirm) {
        const here = at;
        window.RichApp.confirm('Skip this page?', 'You have filled in some details on this page. They are kept in your CV, but the page is skipped without checking it. Do you really want to skip?', 'Skip', 'Stay here', true)
          .then(yes => { if (yes && at === here) { fullAd(); go(at + 1, 1); } });
        return;
      }
      fullAd(); go(at + 1, 1); return;
    }
    if (e.target.closest('.wiz-next')) {
      if (at === N - 1) {
        // (v4.39) "Go to Design" on the last page: a full-screen ad (at most once a minute, shared with the other full-screen ads)
        if (window.RichAds && window.RichAds.atBreak) window.RichAds.atBreak('edit_finish', 60);
        const d = document.getElementById('goDesign'); if (d) d.click(); return;
      }
      if (pageOk()) { fullAd(); go(at + 1, 1); }
    }
  });

  // pages the user has typed on or changed (a CV opened from My CVs counts as untouched until the user edits it)
  const touched = new Set();
  const mark = e => {
    if (!e.isTrusted || nav.contains(e.target)) return;
    const p = e.target.closest && e.target.closest('fieldset.block');
    const i = p ? pages.findIndex(g => g.list.includes(p)) : -1;
    if (i >= 0) touched.add(i);
  };
  form.addEventListener('input', mark, true);
  form.addEventListener('change', mark, true);
  form.addEventListener('click', e => { if (e.target.closest && e.target.closest('button, [role=button], .chip') && !e.target.closest('.wiz-nav')) mark(e); }, true);
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('[data-act="edit"], #homeCreate, #heroCreate, [data-act="new"]')) touched.clear();
  }, true);

  // anything the app shows inside the form (a field with an error, a box it puts the cursor in) opens its page first
  function reveal(el) {
    if (!el || !form.contains(el)) return;
    const p = el.closest('fieldset.block');
    const i = p ? pages.findIndex(g => g.list.includes(p)) : -1;
    if (i >= 0 && i !== at) go(i, 0, true);
  }
  const focus0 = HTMLElement.prototype.focus, siv0 = Element.prototype.scrollIntoView;
  HTMLElement.prototype.focus = function (o) { reveal(this); return focus0.call(this, o); };
  Element.prototype.scrollIntoView = function (o) { reveal(this); return siv0.call(this, o); };

  // a new or another CV starts on the first page
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('[data-act="edit"], #homeCreate, #heroCreate, [data-act="new"]')) setTimeout(() => go(0, 0, true), 0);
  }, true);
  // the language can change: refresh the button words
  document.addEventListener('richlang', () => setTimeout(paint, 0));

  // (v4.97) References is now a box in the "More sections" list (page 5): Add opens it; it stays open while it has text
  const refBody = form.querySelector('.ref-body'), refTa = document.getElementById('references');
  function refSync() {
    if (!refBody || !refTa) return;
    const has = !!refTa.value.trim();
    if (has) refBody.hidden = false;
    const item = refBody.closest('.more-item');
    item.classList.toggle('has-items', !refBody.hidden);
    const c = item.querySelector('.mr-count'); if (c) { c.textContent = has ? 1 : ''; c.hidden = !has; }
  }
  form.addEventListener('click', e => {
    if (!e.target.closest || !e.target.closest('[data-ref-add]')) return;
    refBody.hidden = false; refSync(); refTa.focus();
  });
  if (refTa) refTa.addEventListener('input', refSync);
  // (v4.97) × next to the box: empties References and closes the box again
  form.addEventListener('click', e => {
    if (!e.target.closest || !e.target.closest('[data-ref-remove]')) return;
    refTa.value = ''; refTa.dispatchEvent(new Event('input', { bubbles: true }));
    refBody.hidden = true; refSync();
  });

  // (v4.97) the five pages as tabs at the top of the form (three on screen, swipe for the rest), a thin line under the open one.
  // They replace Back / Skip / Next and the step line under each page.
  const TAB_NAMES = ['Personal details', 'Education', 'Experience', 'Languages', 'More sections'];
  const tabs = document.createElement('div');
  tabs.className = 'wiz-tabs'; tabs.setAttribute('role', 'tablist');
  tabs.innerHTML = '<div class="wt-row">' + pages.map((p, i) => '<button type="button" role="tab" class="wt" data-wt="' + i + '"><span></span></button>').join('') + '</div>';
  // full width at the top of the Edit screen, outside the form card (it stays pinned under the header)
  const view = document.getElementById('view-edit');
  if (view) view.insertBefore(tabs, view.firstChild); else form.insertBefore(tabs, form.firstChild);
  function paintTabs() {
    tabs.querySelectorAll('.wt').forEach((b, i) => {
      b.querySelector('span').textContent = tr(TAB_NAMES[i] || ('Step ' + (i + 1)));
      const on = i === at; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
    });
    const row = tabs.firstChild, on = row.children[at];
    if (on) { const left = on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2; row.scrollTo({ left: Math.max(0, left), behavior: 'smooth' }); }
  }
  tabs.addEventListener('click', e => {
    const b = e.target.closest('[data-wt]'); if (!b) return;
    const i = +b.dataset.wt; if (i === at) return;
    if (at === 2 && window.RichAds && window.RichAds.atBreak) window.RichAds.atBreak('edit_page3', 60);   // same ad moment as before
    go(i, i > at ? 1 : -1);
  });
  // (v4.97) swipe left / right on the form to move to the next / previous page (like the tabs)
  let sw = null;
  // (v4.97) anywhere on the Edit screen, also the empty space under a short page
  document.addEventListener('touchstart', e => {
    const t = e.touches[0];
    if (document.body.dataset.view !== 'edit' || !form.offsetParent) { sw = null; return; }
    if (e.touches.length !== 1 || e.target.closest('.topbar, .ad-slot, .ad-zone, #adBar, .settings-page') || e.target.closest('.wt-row, input[type=range], .dd.open, .drag-h, .entries-scroll, .bl-row')) { sw = null; return; }
    sw = { x: t.clientX, y: t.clientY, t: Date.now() };
  }, { passive: true });
  // (v4.97) at the first or last page, a swipe further out moves the form and the tab row a little (rubber band),
  // and they spring back when the finger is lifted
  const bandEls = () => [form, tabs.querySelector('.wt-row')];
  document.addEventListener('touchmove', e => {
    if (!sw) return; const t = e.touches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
    if (!sw.h && !sw.v) { if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) sw.h = true; else if (Math.abs(dy) > 10) sw.v = true; }
    if (!sw.h) return;
    const rtl = document.documentElement.dir === 'rtl', next = (dx < 0) !== rtl;
    const edge = (next && at === N - 1) || (!next && at === 0);
    if (!edge) { if (sw.band) { sw.band = false; bandEls().forEach(el => { el.style.transform = ''; }); } return; }
    sw.band = true;
    const off = Math.sign(dx) * Math.min(48, Math.abs(dx) * 0.3);
    bandEls().forEach(el => { el.style.transition = 'none'; el.style.transform = 'translateX(' + off + 'px)'; });
  }, { passive: true });
  const bandBack = () => bandEls().forEach(el => { if (!el.style.transform) return; el.style.transition = 'transform .35s cubic-bezier(.2,.9,.3,1.2)'; el.style.transform = ''; setTimeout(() => { el.style.transition = ''; }, 380); });
  document.addEventListener('touchcancel', bandBack, { passive: true });
  document.addEventListener('touchend', e => {
    bandBack();
    if (!sw) return; const t = e.changedTouches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y, quick = Date.now() - sw.t < 700; sw = null;
    if (!quick || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
    if (document.querySelector('.dd.open, .dp-ov:not([hidden]), .rm-ov')) return;
    const rtl = document.documentElement.dir === 'rtl', next = (dx < 0) !== rtl;
    const i = at + (next ? 1 : -1); if (i < 0 || i >= N) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (at === 2 && window.RichAds && window.RichAds.atBreak) window.RichAds.atBreak('edit_page3', 60);
    go(i, next ? 1 : -1);
  }, { passive: true });
  // (v4.97) first time only, on Personal details: a short hint that a swipe changes the page
  function swipeTip() {
    try { if (localStorage.getItem('richSwipeTip')) return; } catch (e) { return; }
    if (at !== 0 || document.body.dataset.view !== 'edit' || document.querySelector('.sw-tip')) return;
    const tip = document.createElement('div'); tip.className = 'sw-tip'; tip.setAttribute('role', 'status');
    tip.innerHTML = '<div class="sw-card"><span class="sw-hand" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-.5V4.5a1.5 1.5 0 0 1 3 0v5.5m0-.5V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1.2a5 5 0 0 1-3.9-1.9L4.3 15.2a1.5 1.5 0 0 1 2.3-1.9L9 15.5"/></svg></span>' +
      '<span class="sw-arrows" aria-hidden="true"><i></i><i></i><i></i></span><b></b><small></small><button type="button" class="sw-ok"></button></div>';
    tip.querySelector('b').textContent = tr('Swipe to change the page');
    tip.querySelector('small').textContent = tr('Swipe left for the next page, right to go back. Or tap the tabs at the top.');
    tip.querySelector('.sw-ok').textContent = tr('Got it');
    document.body.appendChild(tip); requestAnimationFrame(() => tip.classList.add('in'));
    const done = () => { try { localStorage.setItem('richSwipeTip', '1'); } catch (e) {} tip.classList.remove('in'); setTimeout(() => tip.remove(), 220); };
    tip.addEventListener('click', done);
    document.addEventListener('richwizgo', done, { once: true });
  }
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('[data-act="edit"], #homeCreate, #heroCreate, [data-act="new"], .tp-skip, .tp-card, [data-tpdesign]')) setTimeout(swipeTip, 1400);
  }, true);
  const paint0 = paint;
  paint = function () { paint0(); paintTabs(); };
  window.RichWizard = {
    page: () => at,
    count: N,
    go: i => go(i, 0),
    reveal,
    // phone Back key / header back arrow in the Edit tab: one page back first
    back: () => { if (at > 0) { go(at - 1, -1); return true; } return false; }
  };
  paint();
})();
/* (v4.97) Small size: the Date of birth / Age switch sits inside the box; the text starts just after it in every language */
(function () {
  const seg = document.getElementById('dobMode'), f = seg && seg.closest('.dob-field');
  if (!f || !window.ResizeObserver) return;
  new ResizeObserver(() => { if (seg.offsetWidth) f.style.setProperty('--dsw', (seg.offsetWidth + 16) + 'px'); }).observe(seg);
})();
/* (v4.97) the floating font list closes when tapping anywhere outside it, or when scrolling the page */
(function () {
  function shut() {
    const l = document.getElementById('fdList'), d = document.getElementById('fontDd'), b = document.getElementById('fdBtn');
    if (!l || l.hidden) return;
    l.hidden = true; if (d) d.classList.remove('open'); if (b) b.setAttribute('aria-expanded', 'false');
  }
  document.addEventListener('pointerdown', e => { if (!e.target.closest || !e.target.closest('#fontDd')) shut(); }, true);
})();

/* (v4.97) removing something the user typed in: ask first, in a small window */
(function () {
  const form = document.getElementById('cvForm'); if (!form) return;
  const tr = s => (window.RichI18n && window.RichI18n.t ? window.RichI18n.t(s) : s);
  const SEL = '[data-remove], [data-remove-item], [data-box-clear], [data-ref-remove]';
  function scope(b) {
    if (b.matches('[data-remove-item]')) return b.closest('.mini-row') || b.parentNode;
    if (b.matches('[data-ref-remove]')) return b.closest('.ref-row');
    if (b.matches('[data-box-clear]')) return b.closest('.more-item') || b.closest('.entry');
    return b.closest('.entry') || b.parentNode;
  }
  const filled = el => Array.from(el.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea'))
    .some(i => String(i.value || '').trim());
  function ask() {
    return new Promise(done => {
      const ov = document.createElement('div'); ov.className = 'rm-ov'; ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-modal', 'true');
      ov.innerHTML = '<div class="rm-box"><span class="rm-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg></span>' +
        '<p class="rm-t"></p><p class="rm-p"></p><div class="rm-btns"><button type="button" class="rm-no"></button><button type="button" class="rm-yes"></button></div></div>';
      ov.querySelector('.rm-t').textContent = tr('Remove this?');
      ov.querySelector('.rm-p').textContent = tr('What you typed here will be deleted.');
      ov.querySelector('.rm-no').textContent = tr('Keep');
      ov.querySelector('.rm-yes').textContent = tr('Remove');
      document.body.appendChild(ov); requestAnimationFrame(() => ov.classList.add('in'));
      const end = v => { ov.classList.remove('in'); setTimeout(() => ov.remove(), 160); done(v); };
      ov.addEventListener('click', e => { if (e.target.closest('.rm-yes')) end(true); else if (e.target.closest('.rm-no') || e.target === ov) end(false); });
      ov.querySelector('.rm-no').focus({ preventScroll: true });
    });
  }
  form.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest(SEL);
    if (!b || b._rmOk) return;
    const sc = scope(b);
    if (!sc || !filled(sc)) return;            // nothing typed: removed straight away
    e.preventDefault(); e.stopImmediatePropagation();
    ask().then(yes => { if (!yes) return; b._rmOk = true; b.click(); b._rmOk = false; });
  }, true);
})();
