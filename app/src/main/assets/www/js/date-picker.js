/* Date picker for the CV form: date of birth (day, month, year) and the job / study months (month, year).
   The phone's own calendar was hard to use for a birth date (many taps back through the years) and its
   Clear / Cancel / Set buttons were small. This sheet uses three easy scroll wheels and big buttons.
   The real <input type="date|month"> stays in the form (read-only), so saving and loading work as before. */
(function () {
  'use strict';
  const T = s => (window.RichI18n ? window.RichI18n.t(s) : s);
  const ITEM = 44;                                   // row height of a wheel, px
  const pad = n => String(n).padStart(2, '0');
  const now = new Date();
  let ov, sheet, titleEl, preview, cols, input = null, kind = 'date', wheels = [];

  function monthNames() {
    const lang = (window.RichI18n && window.RichI18n.lang) || 'en';
    try {
      const f = new Intl.DateTimeFormat(lang + '-u-ca-gregory-nu-latn', { month: 'short', timeZone: 'UTC' });
      return Array.from({ length: 12 }, (_, i) => f.format(new Date(Date.UTC(2020, i, 15))));
    } catch (e) {
      return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    }
  }
  const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();

  function build() {
    ov = document.createElement('div');
    ov.className = 'dp-ov'; ov.hidden = true;
    ov.innerHTML =
      '<div class="dp-sheet" role="dialog" aria-modal="true" aria-labelledby="dpTitle">' +
        '<div class="dp-grab" aria-hidden="true"></div>' +
        '<div class="dp-head"><div class="dp-title" id="dpTitle"></div><div class="dp-preview" aria-live="polite"></div></div>' +
        '<div class="dp-cols"><div class="dp-band" aria-hidden="true"></div></div>' +
        '<div class="dp-foot">' +
          '<button type="button" class="dp-btn dp-clear">' + 'Clear' + '</button>' +
          '<button type="button" class="dp-btn dp-cancel">' + 'Cancel' + '</button>' +
          '<button type="button" class="dp-btn dp-set">' + 'Set' + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    sheet = ov.querySelector('.dp-sheet'); titleEl = ov.querySelector('.dp-title');
    preview = ov.querySelector('.dp-preview'); cols = ov.querySelector('.dp-cols');
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('.dp-cancel').addEventListener('click', close);
    ov.querySelector('.dp-clear').addEventListener('click', () => { write(''); close(); });
    ov.querySelector('.dp-set').addEventListener('click', () => { write(value()); close(); });
    document.addEventListener('keydown', e => { if (!ov.hidden && e.key === 'Escape') close(); });
  }

  // one scroll wheel: list of [value, label]
  function wheel(name, items, selected) {
    const w = document.createElement('div');
    w.className = 'dp-wheel'; w.dataset.name = name;
    w.setAttribute('role', 'listbox'); w.setAttribute('aria-label', T(name));
    w.innerHTML = '<div class="dp-spacer"></div>' +
      items.map(([v, l]) => '<div class="dp-item" role="option" data-v="' + v + '">' + l + '</div>').join('') +
      '<div class="dp-spacer"></div>';
    const obj = { el: w, items, get index() { return Math.max(0, Math.min(items.length - 1, Math.round(w.scrollTop / ITEM))); },
      get value() { return items[this.index][0]; } };
    let t = 0;
    w.addEventListener('scroll', () => { mark(obj); clearTimeout(t); t = setTimeout(() => { if (name === 'Month' || name === 'Year') fixDays(); show(); }, 90); }, { passive: true });
    w.addEventListener('click', e => {
      const it = e.target.closest('.dp-item'); if (!it) return;
      const i = [...w.querySelectorAll('.dp-item')].indexOf(it);
      w.scrollTo({ top: i * ITEM, behavior: 'smooth' });
    });
    obj.go = (v, smooth) => {
      let i = items.findIndex(x => x[0] === v); if (i < 0) i = 0;
      w.scrollTo({ top: i * ITEM, behavior: smooth ? 'smooth' : 'auto' });
      mark(obj, i);
    };
    obj.sel = selected;
    return obj;
  }
  function mark(w, i) {
    const k = i == null ? w.index : i;
    w.el.querySelectorAll('.dp-item').forEach((el, j) => el.classList.toggle('on', j === k));
  }
  const get = n => wheels.find(w => w.el.dataset.name === n);

  // keep the day list right for the month (30 / 31 days, February)
  function fixDays() {
    const d = get('Day'); if (!d) return;
    const y = get('Year').value, m = get('Month').value, max = daysIn(y, m);
    const items = d.el.querySelectorAll('.dp-item');
    items.forEach((el, j) => el.classList.toggle('off', j + 1 > max));
    if (d.index + 1 > max) d.go(max, true);
  }

  function value() {
    const y = get('Year').value, m = get('Month').value;
    if (kind === 'monthopt' && m < 0) return String(y);          // "Not shown": the year only
    if (kind !== 'date') return y + '-' + pad(m + 1);
    const d = Math.min(get('Day').value, daysIn(y, m));
    return y + '-' + pad(m + 1) + '-' + pad(d);
  }
  function show() {
    const names = monthNames(), y = get('Year').value, m = get('Month').value;
    preview.textContent = kind !== 'date' ? (m < 0 ? String(y) : names[m] + ' ' + y) : Math.min(get('Day').value, daysIn(y, m)) + ' ' + names[m] + ' ' + y;
  }

  function write(v) {
    if (!input) return;
    if (input.classList.contains('month-opt')) { input.dataset.v = v; input.value = monthLabel(v); }
    else input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function titleFor(el) {
    if (el.id === 'dob') return T('Date of birth');
    const f = el.closest('.field'), l = f && f.querySelector('label');
    if (!l) return '';
    const c = l.cloneNode(true); c.querySelectorAll('.opt').forEach(o => o.remove());   // (v4.96y) no "(optional)" in the title
    return c.textContent.trim();
  }

  function open(el) {
    if (!ov) build();
    input = el; kind = el.classList.contains('month-opt') ? 'monthopt' : el.type === 'month' ? 'month' : 'date';
    titleEl.textContent = titleFor(el);
    ov.querySelector('.dp-clear').textContent = T('Clear');
    ov.querySelector('.dp-cancel').textContent = T('Cancel');
    ov.querySelector('.dp-set').textContent = T('Set');

    const Y = now.getFullYear();
    let y, m, d;
    const v = kind === 'monthopt' ? (el.dataset.v || '') : el.value;
    if (v) { const p = v.split('-'); y = +p[0]; m = p[1] ? +p[1] - 1 : (kind === 'monthopt' ? -1 : 0); d = +p[2] || 1; }
    else if (kind === 'date') { y = 1998; m = 5; d = 15; }   // (v4.97) a birth date starts on 15 June 1998            // a sensible start for a birth date
    else { y = Y; m = kind === 'monthopt' ? -1 : now.getMonth(); d = 1; }   // (v4.96) an empty job / study date starts on "Not shown"

    const years = [];
    if (kind === 'date') for (let i = Y; i >= Y - 90; i--) years.push([i, String(i)]);
    else for (let i = Y + 1; i >= Y - 60; i--) years.push([i, String(i)]);
    if (!years.some(x => x[0] === y)) years.push([y, String(y)]), years.sort((a, b) => b[0] - a[0]);
    const names = monthNames();

    cols.querySelectorAll('.dp-wheel').forEach(w => w.remove());
    wheels = [];
    if (kind === 'date') wheels.push(wheel('Day', Array.from({ length: 31 }, (_, i) => [i + 1, String(i + 1)]), d));
    // education: the month may be left out ("Not shown", first in the list)
    wheels.push(wheel('Month', (kind === 'monthopt' ? [[-1, T('Not shown')]] : []).concat(names.map((n, i) => [i, n])), m));
    wheels.push(wheel('Year', years, y));
    cols.classList.toggle('two', kind !== 'date');
    wheels.forEach(w => cols.appendChild(w.el));

    ov.hidden = false;
    document.documentElement.classList.add('no-scroll'); document.body.classList.add('no-scroll');
    requestAnimationFrame(() => {
      wheels.forEach(w => w.go(w.sel));
      fixDays(); show();
      ov.classList.add('in');
      setTimeout(() => ov.querySelector('.dp-set').focus({ preventScroll: true }), 60);
    });
    if (window.AndroidBridge && AndroidBridge.haptic) try { AndroidBridge.haptic(); } catch (e) { /* ignore */ }
  }
  function close() {
    if (!ov || ov.hidden) return;
    ov.classList.remove('in');
    document.documentElement.classList.remove('no-scroll'); document.body.classList.remove('no-scroll');
    setTimeout(() => { ov.hidden = true; }, 200);
    const el = input; input = null;
    if (el) el.blur();                     // no blinking date segment after closing
  }
  // "2015-06" -> "Jun 2015", "2015" -> "2015" (in the app's language)
  function monthLabel(v) {
    const m = /^(\d{4})(?:-(\d{2}))?/.exec(v || '');
    return !m ? '' : m[2] ? monthNames()[+m[2] - 1] + ' ' + m[1] : m[1];
  }
  window.RichDatePicker = { open, close, monthLabel, isOpen: () => !!ov && !ov.hidden };

  // the date / month boxes open this sheet instead of the phone's calendar
  const sel = '#cvForm input[type=date], #cvForm input[type=month], #cvForm input.month-opt';
  const prep = () => document.querySelectorAll(sel).forEach(el => { if (!el.readOnly) el.readOnly = true; });
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest(sel);
    if (!el) return;
    e.preventDefault(); open(el);
  });
  document.addEventListener('keydown', e => {
    const el = e.target.closest && e.target.closest(sel);
    if (el && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) { e.preventDefault(); open(el); }
  });
  // read-only so the phone's own calendar never opens (new job boxes are added later, so watch the form)
  const start = () => {
    prep();
    const form = document.getElementById('cvForm');
    if (form) new MutationObserver(prep).observe(form, { childList: true, subtree: true });
    // the Android back button closes the sheet first (wrapped last, after the other pages)
    setTimeout(() => {
      const prevBack = window.RichAndroidBack;
      window.RichAndroidBack = function () {
        if (window.RichDatePicker.isOpen()) { close(); return true; }
        return typeof prevBack === 'function' ? prevBack.apply(this, arguments) : false;
      };
    }, 0);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
