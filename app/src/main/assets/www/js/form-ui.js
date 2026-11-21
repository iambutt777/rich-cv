/* =========================================================================
   Form look and feel (v3.9). Works on top of app.js and changes no data:
   - custom dropdowns for every <select> in the CV form. The real <select>
     stays in the page and keeps its id and value; the dropdown just shows it
     and sets it (with a normal "change" event), so saving, loading and the
     PDF work exactly as before.
   - a green tick on fields that are filled in correctly
   - numbered steps: the current section is highlighted, finished ones get
     a tick, and Back / Next buttons move between sections
   ========================================================================= */
(function () {
  const form = document.getElementById('cvForm');
  if (!form) return;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- custom dropdowns ---------------- */
  const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  const indexDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
  let openDd = null;
  const CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function enhance(sel) {
    if (sel.dataset.dd) return;
    sel.dataset.dd = '1';
    const wrap = document.createElement('div');
    wrap.className = 'dd';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'dd-btn';
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    const lab = sel.id && document.querySelector('label[for="' + sel.id + '"]');
    if (lab) { if (!lab.id) lab.id = sel.id + '-lbl'; btn.setAttribute('aria-labelledby', lab.id + ' ' + sel.id + '-dd'); }
    btn.innerHTML = '<span class="dd-val" id="' + (sel.id || '') + '-dd"></span><span class="dd-arrow">' + CHEV + '</span>';
    const list = document.createElement('div');
    list.className = 'dd-list'; list.setAttribute('role', 'listbox'); list.hidden = true;
    sel.parentNode.insertBefore(wrap, sel);
    wrap.append(sel, btn, list);
    sel.classList.add('dd-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    // a label click focuses the hidden select: pass it on to the button
    sel.addEventListener('focus', () => btn.focus());

    const sync = () => {
      const o = sel.options[sel.selectedIndex];
      $('.dd-val', btn).textContent = o ? o.text : '';
      wrap.classList.toggle('is-empty', !sel.value);
    };
    sel._ddSync = sync;
    // keep the button right when app.js sets the value in code
    Object.defineProperty(sel, 'value', { configurable: true, get() { return valueDesc.get.call(this); }, set(v) { valueDesc.set.call(this, v); sync(); } });
    Object.defineProperty(sel, 'selectedIndex', { configurable: true, get() { return indexDesc.get.call(this); }, set(v) { indexDesc.set.call(this, v); sync(); } });
    sel.addEventListener('change', sync);

    function build() {
      list.innerHTML = '';
      Array.from(sel.options).forEach((o, k) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'dd-opt'; b.setAttribute('role', 'option');
        const on = k === sel.selectedIndex;
        b.setAttribute('aria-selected', String(on)); if (on) b.classList.add('on');
        b.innerHTML = '<span></span>' + TICK; b.firstChild.textContent = o.text;
        b.addEventListener('click', () => {
          const changed = sel.selectedIndex !== k;
          indexDesc.set.call(sel, k); sync(); close(true);
          if (changed) sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
        list.appendChild(b);
      });
    }
    // open upwards only if there is no room below (keeps it on screen on phones)
    // and never taller than the room there (any screen size: the list scrolls inside instead)
    function place() {
      list.style.maxHeight = '';
      const r = btn.getBoundingClientRect();
      const bar = wrap.closest('.settings-page') ? wrap.closest('.settings-page').querySelector('.sp-bar') : document.querySelector('.topbar');
      const topLimit = bar ? Math.max(0, bar.getBoundingClientRect().bottom) + 6 : 6;
      const zoom = btn.offsetHeight ? r.height / btn.offsetHeight : 1;      // screen pixels per page pixel (Display size)
      const below = innerHeight - r.bottom - (document.body.classList.contains('has-ad-bar') ? 70 : 12);
      const above = r.top - topLimit;
      const need = Math.min(260, list.scrollHeight + 16) * zoom;           // (v4.96) in screen pixels, like the room
      const up = below < need && above > below;
      wrap.classList.toggle('up', up);
      const room = (up ? above : below) - 8;
      if (room < list.scrollHeight * zoom) list.style.maxHeight = Math.max(120, room / zoom) + 'px';
    }
    function open() {
      if (openDd && openDd !== api) openDd.close();
      build();
      // (v4.96) tapped straight after typing in a box: the keyboard is still up and the screen looks short, so the list
      // used to open upwards the first time. Close the keyboard and place the list again once the screen has its full height.
      const ae = document.activeElement, typing = ae && ae !== btn && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|range|color|file)$/.test(ae.type)));
      if (typing) ae.blur();
      list.hidden = false; wrap.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
      place();
      if (typing) [120, 300, 550].forEach(t => setTimeout(() => { if (openDd === api && !list.hidden) place(); }, t));
      openDd = api;
      const cur = $('.dd-opt.on', list) || $('.dd-opt', list);
      if (cur) cur.focus({ preventScroll: true });
    }
    function close(focusBtn) {
      if (list.hidden) return;
      wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
      if (reduce()) list.hidden = true;
      else { wrap.classList.add('closing'); setTimeout(() => { wrap.classList.remove('closing'); if (!wrap.classList.contains('open')) list.hidden = true; }, 160); }
      if (openDd === api) openDd = null;
      if (focusBtn) btn.focus({ preventScroll: true });
    }
    const api = { close, wrap, place };
    btn.addEventListener('click', () => (list.hidden || !wrap.classList.contains('open') ? open() : close(true)));
    btn.addEventListener('keydown', e => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
    });
    list.addEventListener('keydown', e => {
      const opts = $$('.dd-opt', list); const i = opts.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (opts[i + 1] || opts[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (opts[i - 1] || opts[opts.length - 1]).focus(); }
      else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(true); }
    });
    sync();
  }
  document.addEventListener('pointerdown', e => { if (openDd && !openDd.wrap.contains(e.target)) openDd.close(); });
  // (v4.96) the screen changed size while a list is open (keyboard closing, rotation): place it again
  window.addEventListener('resize', () => { if (openDd && openDd.place) openDd.place(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && openDd) { e.stopPropagation(); openDd.close(true); } }, true);
  window.RichDropdown = { isOpen: () => !!openDd, close: () => { if (openDd) { openDd.close(true); return true; } return false; } };
  // form.reset() changes values without the setter
  form.addEventListener('reset', () => setTimeout(() => $$('select', form).forEach(s => s._ddSync && s._ddSync()), 0));

  /* ---------------- valid ticks ---------------- */
  const CHECKS = {
    firstName: v => v.trim().length >= 2,
    lastName: v => v.trim().length >= 2,
    website: v => /^\S+\.[a-z]{2,}\S*$/i.test(v.trim()),
    linkedin: v => /linkedin\.com\/\S+/i.test(v) || /^[\w-]{3,}$/.test(v.trim()),
    title: v => v.trim().length >= 2,
    phone: v => (v.replace(/\D/g, '').length >= 7),
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
    address: v => v.trim().length >= 5,
    nationality: v => v.trim().length >= 2,
    dob: v => false,          // (v4.97) a picked date is a selection: no tick (ticks only on boxes you type in)
    age: v => +v >= 14 && +v <= 90,
    passport: v => /^[A-Z0-9]{5,}$/i.test(v.replace(/\s+/g, '')),      // (v4.97) ticks on every filled box
    licence: v => v.trim().length >= 2
  };
  function checkField(el) {
    const f = el.closest('.field'); if (!f || !CHECKS[el.id] || el.hidden) return;
    f.classList.toggle('is-valid', !!el.value && CHECKS[el.id](el.value) && !f.classList.contains('invalid'));
  }
  const checkAll = () => Object.keys(CHECKS).forEach(id => { const el = document.getElementById(id); if (el) checkField(el); });

  /* ---------------- date of birth OR age, both optional; only one is kept ---------------- */
  const dob = document.getElementById('dob'), age = document.getElementById('age'), dobClear = document.getElementById('dobClear');
  const dobMode = document.getElementById('dobMode');
  if (dob && age && dobClear && dobMode) {
    let mode = 'dob';
    const setMode = (m, clearOther) => {
      mode = m;
      dobMode.querySelectorAll('[data-dobmode]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.dobmode === m)));
      dob.hidden = m !== 'dob'; age.hidden = m !== 'age';
      if (clearOther) {                                   // keep just one of them in the CV
        const other = m === 'dob' ? age : dob;
        if (other.value) { other.value = ''; other.dispatchEvent(new Event('input', { bubbles: true })); other.dispatchEvent(new Event('change', { bubbles: true })); }
      }
      syncDob();
    };
    const cur = () => (mode === 'dob' ? dob : age);
    function syncDob() {
      if (!dob.value && age.value && mode === 'dob') { setMode('age'); return; }   // a CV that was saved with an age
      if (dob.value && mode === 'age') { setMode('dob'); return; }
      // a date box can't be emptied by typing on most phones, so it gets a Remove link; the age box is just deleted by hand
      dobClear.hidden = mode !== 'dob' || !dob.value;
      const w = dob.closest('.date-wrap'); if (w) w.classList.toggle('is-empty', !dob.value);   // (v4.23) "Not shown" while empty
      dobClear.textContent = 'Remove date of birth';
      const f = dob.closest('.field');
      if (f) f.classList.toggle('is-valid', !!cur().value && CHECKS[cur().id](cur().value) && !f.classList.contains('invalid'));
    }
    dobMode.addEventListener('click', e => {
      const b = e.target.closest('[data-dobmode]'); if (!b || b.dataset.dobmode === mode) return;
      setMode(b.dataset.dobmode, true);
      cur().focus();
    });
    [dob, age].forEach(el => { el.addEventListener('input', syncDob); el.addEventListener('change', syncDob); });
    age.addEventListener('blur', () => { if (age.value) { const n = Math.round(+age.value); age.value = n >= 14 && n <= 90 ? String(n) : ''; age.dispatchEvent(new Event('input', { bubbles: true })); } });
    dobClear.addEventListener('click', () => {
      const el = cur(); el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      syncDob();
    });
    // a CV opened from My CVs fills the fields in code: check again shortly after
    document.addEventListener('click', () => setTimeout(syncDob, 150));
    form.addEventListener('reset', () => setTimeout(() => setMode('dob'), 0));
  }

  /* ---------------- steps ---------------- */
  const blocks = $$('fieldset.block', form);
  // a list section counts as finished when one of its entries has some text in it
  const hasText = sel => $$(sel + ' input:not([type=checkbox]), ' + sel + ' textarea').some(el => el.value.trim());
  // (v4.22) keyed by section, so the sections can sit in any order on the pages
  const filled = {
    personal: () => !!($('#firstName').value.trim() && $('#title').value.trim()),
    summary: () => !!$('#summary').value.trim(),
    experience: () => hasText('#list-experience'),
    education: () => hasText('#list-education'),
    skills: () => !!$('#skillChips .chip'),
    languages: () => hasText('#list-languages'),
    certificates: () => hasText('#list-certificates'),
    more: () => ['certificates', 'achievements', 'awards', 'projects', 'hobbies', 'custom'].some(k => hasText('#list-' + k)) || !!$('#references').value.trim(),
    references: () => !!$('#references').value.trim()
  };
  function markSteps() { blocks.forEach(b => { const f = filled[b.dataset.sec]; b.classList.toggle('done', !!(f && f())); }); checkAll(); }
  let raf = 0;
  const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(markSteps); };

  // highlight the section being worked on
  if ('IntersectionObserver' in window) {
    const seen = new Map();
    const io = new IntersectionObserver(es => {
      es.forEach(e => seen.set(e.target, e.isIntersecting ? e.intersectionRect.height : 0));
      let best = null, h = 0;
      seen.forEach((v, el) => { if (v > h) { h = v; best = el; } });
      blocks.forEach(b => b.classList.toggle('current', b === best));
    }, { threshold: [0, .1, .25, .5, .75, 1], rootMargin: '-80px 0px -35% 0px' });
    blocks.forEach(b => io.observe(b));
  }
  form.addEventListener('focusin', e => { const b = e.target.closest('fieldset.block'); if (b) blocks.forEach(x => x.classList.toggle('current', x === b)); });

  /* ---------------- wire up ---------------- */
  $$('select', form).forEach(enhance);
  const themeSel = document.getElementById('appTheme');
  if (themeSel) enhance(themeSel);
  const langSel = document.getElementById('appLang');
  if (langSel) enhance(langSel);
  const autoSel = document.getElementById('autoSaveEvery');
  if (autoSel) enhance(autoSel);
  new MutationObserver(ms => {
    ms.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      if (n.matches('select')) enhance(n); else $$('select', n).forEach(enhance);
    }));
    later();
  }).observe(form, { childList: true, subtree: true });
  form.addEventListener('input', e => { if (CHECKS[e.target.id]) checkField(e.target); later(); });
  form.addEventListener('change', e => { if (CHECKS[e.target.id]) checkField(e.target); });
  form.addEventListener('change', later);
  form.addEventListener('focusout', e => { if (CHECKS[e.target.id]) setTimeout(() => checkField(e.target), 0); });
  // set by app.js when a CV is opened: refresh ticks a moment later
  document.addEventListener('click', e => { if (e.target.closest('[data-act="edit"], #homeCreate, #heroCreate, .view-tab')) setTimeout(markSteps, 120); });
  markSteps();
  setTimeout(markSteps, 1500);

  /* ---------------- design section: coloured slider fill ---------------- */
  const panel = document.getElementById('toolPanel');
  if (panel) {
    const fill = r => { const min = +r.min || 0, max = +r.max || 100; r.style.setProperty('--pct', ((r.value - min) / (max - min || 1) * 100).toFixed(1) + '%'); };
    const fillAll = () => $$('input[type=range]', panel).forEach(fill);
    panel.addEventListener('input', e => { if (e.target.type === 'range') fill(e.target); });
    panel.addEventListener('click', () => setTimeout(fillAll, 0));
    new MutationObserver(fillAll).observe(panel, { childList: true, subtree: true });
    fillAll();
  }
})();
