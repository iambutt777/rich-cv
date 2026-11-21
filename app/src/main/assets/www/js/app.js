/* =========================================================================
   Rich CV Maker : Resume Builder - app logic
   ========================================================================= */
(function () {
  'use strict';
  const CFG = window.RICH_CONFIG;
  const Store = window.CVStore;
  const Pdf = window.CVPdf;
  const Writer = window.CVWriter;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  const form = $('#cvForm');

  const SIMPLE = ['firstName', 'lastName', 'title', 'phone', 'email', 'linkedin', 'website', 'address', 'nationality', 'dob', 'age', 'gender', 'marital', 'passport', 'licence', 'summary',
    'references'];
  // (v4.30) page 5 lists: one line each (saved on the CV as text, one per line), and the user's own sections
  const LINE_KINDS = ['achievements', 'awards', 'projects', 'hobbies'];
  // (v4.97) these three are typed in one box, one point per line, with the Line start bar (like job duties)
  const BOX_KINDS = ['achievements', 'awards', 'projects'];
  const lineBullets = {};
  const HOBBY_IDEAS = ['Reading Books', 'Travelling', 'Photography', 'Playing Sports', 'Listening to Music', 'Cooking', 'Gardening', 'Painting & Drawing', 'Writing',
    'Watching Documentaries', 'Playing Chess', 'Volunteering', 'Learning New Languages', 'Cycling', 'Swimming', 'Hiking', 'Public Speaking', 'Blogging',
    'Playing Musical Instruments', 'Technology & Programming'];
  const LISTS = {
    experience: () => ({ title: '', company: '', location: '', start: '', end: '', current: false, duties: '' }),
    education: () => ({ degree: '', school: '', location: '', start: '', end: '', current: false, summary: '', details: '' }),
    languages: () => ({ name: '', level: '' }),          // (v4.23) level starts as "Not shown"
    certificates: () => ({ name: '', issuer: '', year: '', summary: '' }),
    achievements: () => ({ text: '' }), awards: () => ({ text: '' }), projects: () => ({ text: '' }), hobbies: () => ({ text: '' }),
    custom: () => ({ title: '', items: [{ text: '' }] })
  };

  const state = {
    currentId: null,
    lists: { experience: [], education: [], languages: [], certificates: [], achievements: [], awards: [], projects: [], hobbies: [], custom: [] },
    skills: [],
    photo: null, photoSrc: null, photoCrop: null,
    theme: null, defaultTheme: null,
    logo: window.RICH_LOGO,
    records: [],
    dirty: false,
    seeds: {},              // "Write again" counters
    generated: {},          // last auto-written text per box, to avoid overwriting the user's own text silently
    imgCache: new Map()
  };

  /* ---------------- utilities ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  // (v4.97) every CV gets its own number that is never reused: the time it was made, a running counter and random
  // letters, checked against the CVs already on this phone. Two CVs can never share one, so they never replace each other.
  let idSeq = 0;
  function makeId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', taken = new Set((state.records || []).map(r => r.id));
    let id;
    do {
      let rnd = '';
      for (let i = 0; i < 6; i++) rnd += chars[Math.floor(Math.random() * chars.length)];
      id = 'CV-' + Date.now().toString(36).toUpperCase() + (++idSeq).toString(36).toUpperCase() + '-' + rnd;
    } while (taken.has(id));
    return id;
  }
  window.RichNewCvId = () => makeId();
  let toastTimer;
  function toast(msg, bad) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('bad', !!bad);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), bad ? 5200 : 3200);
  }
  function loadImage(src) {
    if (!src) return Promise.resolve(null);
    if (state.imgCache.has(src)) return state.imgCache.get(src);
    const p = new Promise(resolve => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = src;
    });
    if (state.imgCache.size > 24) {
      for (const k of state.imgCache.keys()) { if (k !== state.logo && k !== state.photo) state.imgCache.delete(k); }
    }
    state.imgCache.set(src, p);
    return p;
  }
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Could not read the file.'));
      r.readAsDataURL(file);
    });
  }
  // item: the name of the thing (a file or a CV), shown on its own line so a long name always fits
  function confirmBox(title, text, yesLabel, noLabel, safe, item, itemIcon) {
    return new Promise(resolve => {
      $('#confirmTitle').textContent = title;
      $('#confirmText').textContent = text;
      $('#confirmItem').hidden = !item;
      $('#confirmItemName').textContent = item || '';
      $('#confirmItemIc').textContent = itemIcon || 'PDF';
      $('#confirmItemIc').classList.toggle('is-cv', itemIcon === 'CV');
      $('#confirm').classList.toggle('is-safe', !!safe);
      $('#confirm').classList.remove('is-exit');
      $('#confirmYes').textContent = yesLabel || 'Delete';
      $('#confirmNo').textContent = noLabel || 'Cancel';
      $('#confirmYes').className = 'btn ' + (safe ? 'btn-primary' : 'btn-danger');
      const box = $('#confirm');
      box.hidden = false;
      $('#confirmNo').focus();
      const done = v => { box.hidden = true; $('#confirmYes').onclick = $('#confirmNo').onclick = null; resolve(v); };
      $('#confirmYes').onclick = () => done(true);
      $('#confirmNo').onclick = () => done(false);
    });
  }
  function nameCase(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (!s) return s;
    if (s === s.toLowerCase() || s === s.toUpperCase()) {
      return s.toLowerCase().replace(/(^|[\s\-'(.,/])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
    }
    return s;
  }
  function markDirty() { state.dirty = true; updateHeader(); schedulePreview(); }

  /* ---------------- reading / writing the CV ---------------- */
  function getCV() {
    const cv = {};
    SIMPLE.forEach(k => { cv[k] = $('#' + k).value.trim(); });
    cv.fullName = [cv.firstName, cv.lastName].filter(Boolean).join(' ');
    cv.email = cv.email.toLowerCase();
    cv.address = cv.address.slice(0, 38).trim();          // address: 38 letters at most (spaces included)
    cv.passport = cv.passport.toUpperCase().replace(/\s+/g, '');
    Object.keys(LISTS).forEach(k => { cv[k] = state.lists[k].map(o => Object.assign({}, o)); });
    LINE_KINDS.forEach(k => { cv[k] = state.lists[k].map(o => String(o.text || '').trim()).filter(Boolean).join('\n'); });
    BOX_KINDS.forEach(k => { if (lineBullets[k]) cv[k + 'Bullet'] = lineBullets[k]; });
    cv.custom = state.lists.custom.map(o => ({ title: String(o.title || '').trim(), items: (o.items || []).map(x => String(x.text || '').trim()).filter(Boolean) }))
      .filter(o => o.title || o.items.length);
    cv.skills = state.skills.slice();
    cv.photo = state.photo; cv.photoSrc = state.photoSrc; cv.photoCrop = state.photoCrop;
    cv.theme = Object.assign({}, state.theme);
    cv.design = state.theme.design;
    return cv;
  }
  function splitName(full) {
    const w = String(full || '').trim().split(/\s+/).filter(Boolean);
    return w.length > 1 ? { firstName: w.slice(0, -1).join(' '), lastName: w[w.length - 1] } : { firstName: w[0] || '', lastName: '' };
  }
  const fullNameNow = () => [$('#firstName').value.trim(), $('#lastName').value.trim()].filter(Boolean).join(' ');
  function setCV(cv) {
    // older CVs had "City, country" here; it moves into the address
    if (cv.location && !cv.address) cv = Object.assign({}, cv, { address: cv.location });
    // CVs saved before v3.76 had one "Full name": the last word becomes the last name
    if (cv.firstName == null && cv.lastName == null && cv.fullName) cv = Object.assign({}, cv, splitName(cv.fullName));
    SIMPLE.forEach(k => { $('#' + k).value = cv[k] == null ? '' : cv[k]; });
    Object.keys(LISTS).forEach(k => {
      if (BOX_KINDS.includes(k)) lineBullets[k] = cv[k + 'Bullet'] || '';
      if (LINE_KINDS.includes(k)) {      // saved as text, one per line (hobbies may also use commas)
        state.lists[k] = String(cv[k] || '').split(k === 'hobbies' ? /\n+|,|;/ : /\n+/).map(t => t.trim()).filter(Boolean).map(text => ({ text }));
      } else if (k === 'custom') {
        state.lists.custom = (Array.isArray(cv.custom) ? cv.custom : []).map(o => ({ title: o.title || '', items: (o.items || []).map(t => ({ text: typeof t === 'string' ? t : (t && t.text) || '' })) }));
      } else state.lists[k] = (cv[k] || []).map(o => Object.assign(LISTS[k](), o));
    });
    state.lists.education.forEach(e => {
      // v1.6 kept only a "year finished"; it stays as a fallback until an end month is picked
      if (e.end) delete e.year;
    });
    Object.keys(LISTS).forEach(renderList);
    state.skills = (cv.skills || []).slice();
    renderSkills();
    $('#skillSuggestions').innerHTML = '';
    state.photoSrc = null; state.photoCrop = null;
    setPhoto(cv.photo || null, cv.photoSrc || null, cv.photoCrop || null);
    state.theme = themeOf(cv);
    tplCat = null;
    Pdf.loadFont(state.theme.font).then(() => schedulePreview(0));
    renderTool(); updateDesignNote();
    state.generated = {};
    clearErrors();
    updateCounters();
  }
  function blankCV() {
    return {
      theme: Object.assign({}, state.defaultTheme),
      references: CFG.defaults.references,
      experience: [LISTS.experience()], education: [LISTS.education()],
      languages: [{ name: 'English', level: '' }], certificates: [], skills: []
    };
  }
  function resetForm() {
    state.currentId = null;
    setCV(blankCV());
    state.dirty = false;
    updateHeader();
    schedulePreview(0);
  }
  // the photo shape (Design > Photo) shown and chosen in the Edit form too
  function syncPhotoShape() {
    const sh = (state.theme && state.theme.photoShape) || 'rounded';
    const fr = $('#photoFrame'); if (fr) fr.dataset.shape = sh;
    $$('#photoShapeEdit [data-eshape]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.eshape === sh)));
  }
  function updateHeader() {
    syncPhotoShape();
    const rec = state.currentId && state.records.find(r => r.id === state.currentId);
    $('#formTitle').textContent = rec ? 'Edit CV' : 'New CV';
    $('#recordState').textContent = rec
      ? (state.dirty ? 'Unsaved changes.' : 'Saved on this device.') + ' Last saved ' + new Date(rec.updatedAt).toLocaleString()
      : 'Not saved yet.';
  }
  function updateCounters() {
    $$('.counter').forEach(c => {
      const id = c.dataset.for, ta = $('#' + id), max = CFG.limits[id] || 900;
      ta.maxLength = max;
      c.textContent = ta.value.length + ' / ' + max;
    });
  }

  /* ---------------- job title box: type with suggestions, or open the full list ---------------- */
  function comboField(id, label, val, attrs, cls) {
    return '<div class="field ' + (cls || '') + '"><label for="' + id + '">' + label + '</label>' +
      '<div class="combo"><input id="' + id + '" data-combo value="' + esc(val) + '" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false"' + attrs + '>' +
      '<button type="button" class="combo-btn" data-combo-open="' + id + '" aria-label="Show the list of job titles"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4"/></svg></button>' +
      '<div class="combo-list" role="listbox" hidden></div></div></div>';
  }
  let comboTarget = null;
  function closeSuggest(input) {
    const box = input && input.parentNode.querySelector('.combo-list');
    if (box) { box.hidden = true; box.innerHTML = ''; }
    if (input) input.setAttribute('aria-expanded', 'false');
  }
  function showSuggest(input) {
    const box = input.parentNode.querySelector('.combo-list');
    const list = Writer.matchTitles(input.value, 8);
    if (!list.length) { closeSuggest(input); return; }       // nothing matches: show nothing
    box.innerHTML = list.map(t => '<button type="button" class="combo-opt" role="option" data-pick="' + esc(t) + '">' + esc(t) + '</button>').join('');
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  function pickTitle(input, value) {
    input.value = value;
    closeSuggest(input);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    closeSuggest(input);
  }
  function openJobSheet(input) {
    comboTarget = input;
    closeSuggest(input);
    $('#jobSheetList').innerHTML = Writer.titleGroups().map(gr =>
      '<div class="sheet-group"><h3>' + esc(gr.name) + '</h3>' +
      gr.titles.map(t => '<button type="button" class="sheet-opt' + (t === input.value ? ' on' : '') + '" data-no-i18n data-sheet-pick="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div>').join('');
    $('#jobSheet').hidden = false;
    lockScroll(true);
    $('#jobSheetList').scrollTop = 0;
    $('#jobSheetClose').focus();
  }
  function lockScroll(on) {
    document.documentElement.classList.toggle('no-scroll', on);
    document.body.classList.toggle('no-scroll', on);
  }
  function closeJobSheet() { $('#jobSheet').hidden = true; lockScroll(false); if (comboTarget) comboTarget.focus(); comboTarget = null; }
  function wireCombo() {
    document.addEventListener('input', e => { if (e.target.matches('[data-combo]')) showSuggest(e.target); });
    document.addEventListener('focusout', e => {
      if (!e.target.matches('[data-combo]')) return;
      const input = e.target;
      setTimeout(() => { if (!input.parentNode.contains(document.activeElement)) closeSuggest(input); }, 150);
    });
    document.addEventListener('keydown', e => {
      if (e.target.matches('[data-combo]') && e.key === 'Escape') closeSuggest(e.target);
    });
    document.addEventListener('mousedown', e => { if (e.target.closest('.combo-opt')) e.preventDefault(); });   // keep focus while picking
    document.addEventListener('click', e => {
      const opt = e.target.closest('.combo-opt');
      if (opt) { pickTitle(opt.closest('.combo').querySelector('input'), opt.dataset.pick); return; }
      const btn = e.target.closest('[data-combo-open]');
      if (btn) { openJobSheet(document.getElementById(btn.dataset.comboOpen)); return; }
      const sp = e.target.closest('[data-sheet-pick]');
      if (sp && comboTarget) { const t = comboTarget; $('#jobSheet').hidden = true; lockScroll(false); comboTarget = null; pickTitle(t, sp.dataset.sheetPick); return; }
      if (e.target.id === 'jobSheetClose' || e.target.id === 'jobSheet') closeJobSheet();
      // tap outside closes suggestions
      $$('.combo-list:not([hidden])').forEach(b => { if (!b.parentNode.contains(e.target)) closeSuggest(b.parentNode.querySelector('input')); });
    });
  }

  /* ---------------- repeating lists ---------------- */
  // (v4.23) every choice box offers "Not shown", so it is clear that a choice can be left out
  // (v4.97) "one per line" boxes: each line shows the symbol it gets in the CV, and a small bar inside the box picks it
  const BL_STYLES = [['dot', '•'], ['dash', '–'], ['square', '▪'], ['arrow', '➤'], ['check', '✓'], ['star', '★'], ['num', '1.'], ['none', '']];
  function blBox(kind, i, key, val, style, rows, max, ph) {
    const st = BL_STYLES.some(b => b[0] === style) ? style : 'dot';
    return '<div class="bl-box" data-bl-key="' + key + '" data-bl-style="' + st + '"><div class="bl-wrap"><div class="bl-back" aria-hidden="true"></div>' +
      '<textarea id="' + kind + '-' + i + '-' + key + '" data-k="' + key + '" class="bl-ta" rows="' + rows + '" maxlength="' + max + '" placeholder="' + esc(ph) + '">' + esc(val) + '</textarea></div>' +
      '<div class="bl-bar" role="radiogroup" aria-label="' + esc(tr('Line start')) + '"><span class="bl-lbl">' + esc(tr('Line start')) + '</span>' +
      BL_STYLES.map(([id, g]) => '<button type="button" class="bl-opt" role="radio" data-bl="' + id + '" aria-checked="' + (id === st) + '" aria-label="' + esc(tr(id === 'none' ? 'None' : id === 'num' ? 'Numbers' : 'Symbol')) + '">' +
        (id === 'none' ? '<span class="bl-no">Aa</span>' : g) + '</button>').join('') + '</div></div>';
  }
  function blMark(style, n) { return style === 'none' ? '' : style === 'num' ? n + '.' : (BL_STYLES.find(b => b[0] === style) || BL_STYLES[0])[1]; }
  function blPaint(box) {
    const ta = $('textarea', box), back = $('.bl-back', box); if (!ta || !back) return;
    const st = box.dataset.blStyle || 'dot';
    if (!back.dataset.ready) {
      const cs = getComputedStyle(ta);
      ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'wordSpacing', 'textIndent'].forEach(k => { back.style[k] = cs[k]; });
      back.dataset.ready = '1';
    }
    let n = 0;
    back.innerHTML = String(ta.value).split('\n').map(l => {
      const has = l.trim() !== ''; if (has) n++;
      return '<div class="bl-l"' + (has && st !== 'none' ? ' data-m="' + esc(blMark(st, n)) + '"' : '') + '>' + (esc(l) || '​') + '</div>';
    }).join('') + '<div class="bl-l">​</div>';
    back.scrollTop = ta.scrollTop;
    box.classList.toggle('bl-off', st === 'none');
  }
  window.RichBlPaintAll = () => $$('.bl-box').forEach(blPaint);
  const LEVEL_OPTS = l => '<option value=""' + (l ? '' : ' selected') + '>Not shown</option>' +
    CFG.languageLevels.map(v => '<option value="' + v + '"' + (v === l ? ' selected' : '') + '>' + v + '</option>').join('');
  function entryHead(kind, i, label) {
    const n = state.lists[kind].length;
    return '<div class="entry-head"><strong>' + label + ' ' + (i + 1) + '</strong>' +
      (i > 0 ? '<button type="button" class="btn btn-quiet mini" data-move="-1" aria-label="Move up">↑ Up</button>' : '') +
      (i < n - 1 ? '<button type="button" class="btn btn-quiet mini" data-move="1" aria-label="Move down">↓ Down</button>' : '') +
      '<button type="button" class="icon-x" data-remove aria-label="Remove ' + label.toLowerCase() + ' ' + (i + 1) + '">×</button></div>';
  }
  function inp(kind, i, key, label, val, extra) {
    const id = kind + '-' + i + '-' + key;
    return '<div class="field ' + ((extra && extra.cls) || '') + '"><label for="' + id + '">' + label + '</label>' +
      dateWrap('<input id="' + id + '" data-k="' + key + '" value="' + esc(val) + '"' + ((extra && extra.attrs) || '') + '>', extra) + '</div>';
  }
  // education month box: the month may be left out ("2015" instead of "2015-06"); the real value is in data-v
  function monthBox(kind, i, key, label, raw, cls) {
    const id = kind + '-' + i + '-' + key, show = window.RichDatePicker ? RichDatePicker.monthLabel(raw) : (raw || '');
    return '<div class="field half ' + cls + '"><label for="' + id + '">' + label + '</label><div class="date-wrap"><input id="' + id + '" data-k="' + key +
      '" type="text" class="month-opt" readonly inputmode="none" placeholder="Not shown" data-v="' + esc(raw || '') + '" value="' + esc(show) + '">' +
      '<span class="dd-arrow date-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></span></div></div>';
  }
  // month and date boxes: our own arrow (the phone's own arrow looked out of place)
  function dateWrap(html, extra) {
    return /type="(month|date)"/.test((extra && extra.attrs) || '') ? '<div class="date-wrap">' + html +
      '<span class="dd-arrow date-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></span></div>' : html;
  }
  // (v4.97) every × next to a box (hobbies, languages, certificates, own sections and their items) is exactly as tall
  // as that box, and square; the × on job and education cards sits in the card header and is left as it is
  function syncX(root) {
    $$('.icon-x', root || document).forEach(x => {
      if (x.closest('.entry-head')) return;
      const row = x.parentElement, f = row && row.querySelector('input:not([type=checkbox]):not([type=hidden]), select, .dd > button, .dd-btn');
      if (!f || !f.offsetHeight) return;
      const h = f.offsetHeight + 'px';
      if (x.style.height !== h) { x.style.height = h; x.style.width = h; x.style.minHeight = h; x.style.alignSelf = 'flex-end'; }
      // (v4.97) the × sits exactly level with the box next to it (the nearest box on its row, e.g. "Year")
      const near = Array.from(row.querySelectorAll('input:not([type=checkbox]):not([type=hidden]), .dd-btn')).filter(i => i.offsetHeight)
        .sort((a, b) => Math.abs(a.getBoundingClientRect().right - x.getBoundingClientRect().left) - Math.abs(b.getBoundingClientRect().right - x.getBoundingClientRect().left))[0] || f;
      const cur = parseFloat(x.style.top) || 0, z = x.offsetHeight ? x.getBoundingClientRect().height / x.offsetHeight : 1;
      const d = Math.round(((near.getBoundingClientRect().top - x.getBoundingClientRect().top) / z + cur) * 2) / 2;
      if (Math.abs(d - cur) >= 0.5) { x.style.position = 'relative'; x.style.top = d + 'px'; }
    });
  }
  window.addEventListener('resize', () => syncX());
  let syncT = 0; new MutationObserver(() => { clearTimeout(syncT); syncT = setTimeout(() => syncX(), 30); }).observe(document.body, { childList: true, subtree: true });
  function renderList(kind) {
    const box = $('#list-' + kind);
    const items = state.lists[kind];
    box.innerHTML = items.map((o, i) => {
      const at = ' data-kind="' + kind + '" data-i="' + i + '"';
      if (kind === 'experience') {
        return '<div class="entry"' + at + '>' + entryHead(kind, i, 'Job') + '<div class="fields">' +
          comboField(kind + '-' + i + '-title', 'Job title', o.title, ' data-k="title" maxlength="70" data-format="name" placeholder="Sales Executive"', 'span-2') +
          inp(kind, i, 'company', 'Company <em class="opt">(optional)</em>', o.company, { attrs: ' maxlength="70" placeholder="Blue Ocean Wireless Inc."' }) +
          inp(kind, i, 'location', 'City, country <em class="opt">(optional)</em>', o.location, { attrs: ' maxlength="60" data-format="name" placeholder="Austin, Texas, USA"' }) +
          monthBox(kind, i, 'start', 'Start date <em class="opt">(optional)</em>', o.start, '') +
          monthBox(kind, i, 'end', 'End date <em class="opt">(optional)</em>', o.end, 'end-field').replace('<div class="field half end-field"', '<div class="field half end-field' + (o.current ? ' is-off' : '') + '"').replace(' data-k="end"', ' data-k="end"' + (o.current ? ' disabled' : '')) +
          '<label class="check span-2"><input type="checkbox" data-k="current"' + (o.current ? ' checked' : '') + '> I still work here</label>' +
          '<div class="field span-2"><label for="' + kind + '-' + i + '-duties">Duties and achievements <em class="opt">(optional, one per line)</em></label>' +
          blBox(kind, i, 'duties', o.duties, o.dutiesBullet, 5, CFG.limits.duties, 'What did you do in this job?') + '</div>' +
          '<div class="writer-row span-2">' +
          '<button class="btn btn-write" type="button" data-write="duties">Auto-write duties</button>' +
          '<button class="btn btn-ghost btn-small" type="button" data-write-again="duties">Write again</button>' +
          '<button class="btn btn-quiet btn-small" type="button" data-tidy="duties">Tidy text</button></div>' +
          '</div></div>';
      }
      if (kind === 'education') {
        return '<div class="entry"' + at + '>' + entryHead(kind, i, 'Education') + '<div class="fields">' +
          inp(kind, i, 'degree', 'Qualification', o.degree, { cls: 'span-2', attrs: ' maxlength="80" placeholder="Bachelor of Business Administration, High School Diploma"' }) +
          inp(kind, i, 'school', 'School, college or university <em class="opt">(optional)</em>', o.school, { cls: 'span-2', attrs: ' maxlength="80" placeholder="University of Texas at Austin"' }) +
          inp(kind, i, 'location', 'City, country <em class="opt">(optional)</em>', o.location, { cls: 'span-2', attrs: ' maxlength="60" data-format="name"' }) +
          monthBox(kind, i, 'start', 'Start date <em class="opt">(optional)</em>', o.start, '') +
          monthBox(kind, i, 'end', 'End date <em class="opt">(optional)</em>', o.end, 'end-field').replace('<div class="field half end-field"', '<div class="field half end-field' + (o.current ? ' is-off' : '') + '"').replace(' data-k="end"', ' data-k="end"' + (o.current ? ' disabled' : '')) +
          '<label class="check span-2"><input type="checkbox" data-k="current"' + (o.current ? ' checked' : '') + '> I am still studying here</label>' +
          '<div class="field span-2"><label for="' + kind + '-' + i + '-summary">Summary <em class="opt">(optional)</em></label>' +
          '<textarea id="' + kind + '-' + i + '-summary" data-k="summary" rows="3" maxlength="' + CFG.limits.details + '" placeholder="Studied business, accounting and marketing, with a final project on retail sales.">' + esc(o.summary) + '</textarea></div>' +
          '<div class="field span-2"><label for="' + kind + '-' + i + '-details">Key subjects or achievements <em class="opt">(optional, one per line)</em></label>' +
          blBox(kind, i, 'details', o.details, o.detailsBullet, 2, CFG.limits.details, 'Major in Marketing') + '</div>' +
          '</div></div>';
      }
      if (kind === 'languages') {
        // (v4.24) a slim card: grip to drag it up or down, the language, its level, remove
        return '<div class="entry lang-entry"' + at + '><div class="row-fields lang-row">' +
          inp(kind, i, 'name', 'Language', o.name, { attrs: ' maxlength="30" data-format="name" placeholder="English"' }) +
          '<div class="field"><label for="' + kind + '-' + i + '-level">Level</label><select id="' + kind + '-' + i + '-level" data-k="level">' + LEVEL_OPTS(o.level) + '</select></div>' +
          '<button type="button" class="icon-x" data-remove aria-label="Remove language ' + (i + 1) + '">×</button>' +
          '<span class="drag-h" role="button" aria-label="Drag to move language ' + (i + 1) + '">' + RichDrag.GRIP + '</span></div></div>';
      }
      if (BOX_KINDS.includes(kind)) {
        if (i > 0) return '';
        const PHB = { achievements: 'Increased monthly sales by 20%\nEmployee of the month, March 2024', awards: 'Best Customer Service Award, 2023', projects: 'Set up a new stock system for 5,000 items' };
        return '<div class="entry box-entry"' + at + '>' +
          blBox(kind, 0, 'lines', items.map(x => x.text || '').join('\n'), lineBullets[kind], 4, 2400, PHB[kind]) +
          '<button type="button" class="box-clear" data-box-clear aria-label="Remove this section">×</button></div>';
      }
      if (LINE_KINDS.includes(kind)) {
        const PH = { achievements: 'Increased monthly sales by 20%', awards: 'Best Customer Service Award, 2023', projects: 'Set up a new stock system for 5,000 items', hobbies: 'Type or choose a hobby' };
        return '<div class="entry mini-entry"' + at + '><div class="mini-row' + (kind === 'hobbies' ? ' hobby-row' : '') + '">' +
          '<input id="' + kind + '-' + i + '-text" data-k="text" value="' + esc(o.text) + '" maxlength="' + (kind === 'hobbies' ? 40 : 160) + '" placeholder="' + PH[kind] + '" aria-label="' + PH[kind] + '"' +
            (kind === 'hobbies' ? ' autocomplete="off" data-hobby="1"' : '') + ' enterkeyhint="done">' +
          (kind === 'hobbies' ? '<button type="button" class="hobby-open" data-hobby-open aria-label="Show hobby ideas"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button><div class="hobby-dd" hidden></div>' : '') +
          '<button type="button" class="icon-x" data-remove aria-label="Remove">×</button></div></div>';
      }
      if (kind === 'custom') {
        return '<div class="entry custom-entry"' + at + '><div class="mini-row">' +
          '<input id="custom-' + i + '-title" data-k="title" value="' + esc(o.title) + '" maxlength="40" data-format="name" placeholder="Section name, like Volunteer work" aria-label="Section name" enterkeyhint="done">' +
          '<button type="button" class="icon-x" data-remove aria-label="Remove this section">×</button></div>' +
          '<div class="custom-items">' + (o.items || []).map((x, j) =>
            '<div class="mini-row sub"><span class="ci-dot" aria-hidden="true"></span><input id="custom-' + i + '-item-' + j + '" data-k="item" data-sub="' + j + '" value="' + esc(x.text) + '" maxlength="160" placeholder="Helped at the city food bank every weekend" aria-label="Item ' + (j + 1) + '" enterkeyhint="done">' +
            '<button type="button" class="icon-x mini" data-remove-item="' + j + '" aria-label="Remove item ' + (j + 1) + '">×</button></div>').join('') +
          '<button type="button" class="btn btn-ghost btn-small add-item" data-add-item><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Add item</button></div></div>';
      }
      return '<div class="entry"' + at + '><div class="row-fields cert">' +
        inp(kind, i, 'name', 'Certificate or training', o.name, { cls: 'cert-name', attrs: ' maxlength="80" placeholder="ServSafe Food Handler"' }) +
        inp(kind, i, 'issuer', 'Given by <em class="opt">(optional)</em>', o.issuer, { attrs: ' maxlength="60"' }) +
        inp(kind, i, 'year', 'Year <em class="opt">(optional)</em>', o.year, { attrs: ' maxlength="10" inputmode="numeric"' }) +
        '<button type="button" class="icon-x" data-remove aria-label="Remove certificate ' + (i + 1) + '">×</button></div>' +
        '<div class="field cert-summary"><label for="' + kind + '-' + i + '-summary">Summary <em class="opt">(optional)</em></label>' +
        '<textarea id="' + kind + '-' + i + '-summary" data-k="summary" rows="2" maxlength="' + CFG.limits.details + '" placeholder="8-hour course on safe food handling, hygiene and storage.">' + esc(o.summary) + '</textarea></div></div>';
    }).join('');
    // (v4.35) page 5: how many filled entries a section has, shown next to its name
    moreCount(kind);
    $$('[data-format]', box).forEach(el => el.addEventListener('blur', () => {
      const v = nameCase(el.value);
      if (v !== el.value) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }));
  }
  function moreCount(kind) {
    const box = $('#list-' + kind), more = box && box.closest('.more-item');
    if (!more) return;
    const items = state.lists[kind], n = items.filter(o => !entryEmpty(kind, o)).length, c = $('.mr-count', more);
    if (c) { c.textContent = n; c.hidden = !n; }
    more.classList.toggle('has-items', items.length > 0);
  }
  // an entry with nothing typed in it (the level, the tick and the starting item of an own section do not count)
  function entryEmpty(kind, o) {
    if (kind === 'custom') return !String(o.title || '').trim() && !(o.items || []).some(x => String(x.text || '').trim());
    return !Object.keys(o).some(k => k !== 'level' && k !== 'current' && String(o[k] || '').trim());
  }
  // (v4.35) page 5: an empty box disappears as soon as the user moves on from it, so only filled ones stay
  const MORE_KINDS = ['hobbies', 'certificates', 'achievements', 'awards', 'projects', 'custom'];
  function pruneEmpty(keepCard) {
    MORE_KINDS.forEach(kind => {
      // (v4.36) never redraw a section while the user is typing in it (that closed the keyboard on a phone);
      // its empty boxes go once the user leaves that section
      const box = $('#list-' + kind);
      if (box && box.contains(document.activeElement)) return;
      const list = state.lists[kind]; let changed = false;
      for (let i = list.length - 1; i >= 0; i--) {
        const card = $$('#list-' + kind + ' > .entry')[i];
        if (card && (card === keepCard || card.contains(document.activeElement))) continue;
        if (kind === 'custom' && !entryEmpty(kind, list[i])) {          // empty items inside an own section go too (one is kept to type in)
          const before = list[i].items.length;
          list[i].items = list[i].items.filter(x => String(x.text || '').trim());
          if (!list[i].items.length) list[i].items.push({ text: '' });
          if (list[i].items.length !== before) changed = true;
          continue;
        }
        if (entryEmpty(kind, list[i])) { list.splice(i, 1); changed = true; }
      }
      if (changed) renderList(kind);
    });
  }
  window.RichPruneEmpty = () => pruneEmpty(null);
  function wireLists() {
    // (v4.97) line symbols: repaint while typing, keep the back layer scrolled with the box, pick a symbol from the bar
    form.addEventListener('input', e => {
      const b = e.target.closest && e.target.closest('.bl-box'); if (!b) return;
      const card = b.closest('.entry[data-kind]');
      if (card && b.dataset.blKey === 'lines') { state.lists[card.dataset.kind] = e.target.value.split('\n').map(text => ({ text })); moreCount(card.dataset.kind); }
      blPaint(b);
    });
    form.addEventListener('scroll', e => { const t = e.target; if (t.classList && t.classList.contains('bl-ta')) { const bk = t.parentNode.querySelector('.bl-back'); if (bk) bk.scrollTop = t.scrollTop; } }, true);
    form.addEventListener('click', e => {
      const o = e.target.closest && e.target.closest('.bl-opt'); if (!o) return;
      const box = o.closest('.bl-box'), card = o.closest('.entry[data-kind]'); if (!box || !card) return;
      box.dataset.blStyle = o.dataset.bl;
      $$('.bl-opt', box).forEach(x => x.setAttribute('aria-checked', String(x === o)));
      if (box.dataset.blKey === 'lines') lineBullets[card.dataset.kind] = o.dataset.bl;
      else { const rec = state.lists[card.dataset.kind][+card.dataset.i]; if (rec) rec[box.dataset.blKey + 'Bullet'] = o.dataset.bl; }
      blPaint(box); state.dirty = true; schedulePreview(0);
    });
    // text put in by Auto-write, Tidy or a reopened CV: paint those too
    setInterval(() => $$('.bl-box').forEach(b => { const t = $('textarea', b); if (t && b.offsetParent && t.value !== b._v) { b._v = t.value; blPaint(b); } }), 400);
    form.addEventListener('input', e => {
      const el = e.target, card = el.closest('.entry[data-kind]');
      if (card && el.dataset.k === 'item' && card.dataset.kind === 'custom') {      // an item inside the user's own section
        const o = state.lists.custom[+card.dataset.i], x = o && o.items[+el.dataset.sub];
        if (x) x.text = el.value;
        return;
      }
      if (card && el.dataset.k) {
        const o = state.lists[card.dataset.kind][+card.dataset.i];
        o[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.classList.contains('month-opt') ? el.dataset.v : el.value;
        if (el.dataset.k === 'end' && card.dataset.kind === 'education' && el.value) delete o.year;
        if (el.dataset.k === 'current') {
          const end = $('[data-k="end"]', card);
          const ef = $('.end-field', card); ef.hidden = false; ef.classList.toggle('is-off', el.checked); if (end) end.disabled = el.checked;
          if (el.checked) {
            if (end) { end.value = ''; if (end.dataset.v != null) end.dataset.v = ''; o.end = ''; }
            const yr = $('[data-k="year"]', card);
            if (yr) { yr.value = ''; o.year = ''; }
          }
        }
      }
    });
    form.addEventListener('change', e => {
      const el = e.target, card = el.closest('.entry[data-kind]');
      if (card && el.dataset.k && el.tagName === 'SELECT') state.lists[card.dataset.kind][+card.dataset.i][el.dataset.k] = el.value;
    });
    // (v4.30) hobbies: a drop-down with 10 ideas under the box (filtered while typing)
    function hobbyMenu(input, show) {
      const row = input.closest('.hobby-row'), dd = row && $('.hobby-dd', row);
      if (!dd) return;
      if (!show) { dd.hidden = true; row.classList.remove('open'); return; }
      const q = input.value.trim().toLowerCase();
      const used = new Set(state.lists.hobbies.map(o => String(o.text || '').trim().toLowerCase()).filter(t => t && t !== q));
      const ideas = HOBBY_IDEAS.filter(h => !used.has(h.toLowerCase()) && (!q || h.toLowerCase().includes(q)));
      // (v4.32) the user's own words: an "Add" line at the top of the list (Enter does the same)
      const own = input.value.trim(), exact = HOBBY_IDEAS.some(h => h.toLowerCase() === q);
      const addOwn = own && !exact ? '<button type="button" class="hobby-opt hobby-own" data-hobby-pick="' + esc(own) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Add</span><b>“' + esc(own) + '”</b></button>' : '';
      if (!ideas.length && !addOwn) { dd.hidden = true; row.classList.remove('open'); return; }
      dd.innerHTML = addOwn + ideas.map(h => '<button type="button" class="hobby-opt" data-hobby-pick="' + esc(h) + '">' + esc(h) + '</button>').join('');
      dd.hidden = false; row.classList.add('open');
    }
    form.addEventListener('focusin', e => { if (e.target.matches && e.target.matches('[data-hobby]')) hobbyMenu(e.target, true); });
    // (v4.38) the keyboard's Done key in any page-5 box: keep the text and close the keyboard
    form.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !e.target.matches || e.target.matches('[data-hobby]') || !e.target.closest('.more-item') || e.target.tagName !== 'INPUT') return;
      e.preventDefault();
      e.target.dispatchEvent(new Event('input', { bubbles: true }));
      e.target.blur();
    });
    form.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !e.target.matches || !e.target.matches('[data-hobby]')) return;
      e.preventDefault();                       // Enter: keep what was typed and close the list
      const inp = e.target; inp.value = inp.value.trim();
      inp.dispatchEvent(new Event('input', { bubbles: true })); hobbyMenu(inp, false); inp.blur();
    });
    form.addEventListener('input', e => { if (e.target.matches && e.target.matches('[data-hobby]')) hobbyMenu(e.target, true); });
    form.addEventListener('focusout', e => {
      if (!e.target.matches || !e.target.matches('[data-hobby]')) return;
      const inp = e.target; setTimeout(() => { if (document.activeElement !== inp && !(document.activeElement && document.activeElement.closest('.hobby-dd'))) hobbyMenu(inp, false); }, 150);
    });
    form.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('.hobby-opt')) e.preventDefault(); });   // keep the box focused
    form.addEventListener('click', e => {
      const pick = e.target.closest && e.target.closest('[data-hobby-pick]');
      const open = e.target.closest && e.target.closest('[data-hobby-open]');
      if (!pick && !open) return;
      const inp = $('[data-hobby]', e.target.closest('.hobby-row'));
      if (open) { const dd = $('.hobby-dd', e.target.closest('.hobby-row')); if (dd && !dd.hidden) hobbyMenu(inp, false); else { inp.focus(); hobbyMenu(inp, true); } return; }
      inp.value = pick.dataset.hobbyPick;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      hobbyMenu(inp, false);
      inp.blur();
    });
    form.addEventListener('input', e => { const c = e.target.closest && e.target.closest('.more-item .entry[data-kind]'); if (c) moreCount(c.dataset.kind); });
    form.addEventListener('focusout', e => {
      const card = e.target.closest && e.target.closest('.more-item .entry');
      if (!card) return;
      setTimeout(() => {
        const a = document.activeElement;
        if (a && card.contains(a)) return;                               // still typing in the same entry
        if (a && a.closest && a.closest('.hobby-dd, [data-add-item], [data-hobby-open]')) return;
        // (v4.97) an empty box is no longer removed just because the cursor left it (closing the keyboard did that);
        // empty boxes go when the user changes page
      }, 250);
    });
    // (v4.24) drag the languages into order
    RichDrag.attach($('#list-languages'), { item: '.entry', handle: '.drag-h', onDrop: (from, to) => {
      const list = state.lists.languages, [it] = list.splice(from, 1);
      list.splice(to, 0, it);
      renderList('languages'); markDirty();
    } });
    form.addEventListener('click', async e => {
      const add = e.target.closest('[data-add]');
      if (add) {
        const kind = add.dataset.add;
        if (BOX_KINDS.includes(kind) && state.lists[kind].length) {             // (v4.97) one box: a new line in it
          const ta = $('#list-' + kind + ' textarea');
          if (ta) { if (ta.value && !/\n$/.test(ta.value)) ta.value += '\n'; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); ta.dispatchEvent(new Event('input', { bubbles: true })); }
          return;
        }
        state.lists[kind].push(LISTS[kind]());
        renderList(kind);
        const cards = $$('#list-' + kind + ' .entry');
        const first = $('input, textarea', cards[cards.length - 1]);
        if (first) first.focus();
        markDirty();
        return;
      }
      const card = e.target.closest('.entry[data-kind]');
      if (!card) return;
      const kind = card.dataset.kind, i = +card.dataset.i, list = state.lists[kind];
      if (e.target.closest('[data-box-clear]')) { state.lists[kind] = []; renderList(kind); moreCount(kind); markDirty(); return; }
      // the user's own section: add or remove an item inside it
      if (e.target.closest('[data-add-item]')) {
        list[i].items.push({ text: '' });
        renderList(kind); markDirty();
        const its = $$('#list-custom .entry')[i]; const ins = its ? $$('[data-k="item"]', its) : [];
        if (ins.length) ins[ins.length - 1].focus();
        return;
      }
      const ri = e.target.closest('[data-remove-item]');
      if (ri) { list[i].items.splice(+ri.dataset.removeItem, 1); renderList(kind); markDirty(); return; }
      if (e.target.closest('[data-remove]')) {
        const o = list[i];
        const filled = kind === 'custom' ? !!(String(o.title || '').trim() || o.items.some(x => String(x.text || '').trim()))
          : Object.keys(o).some(k => k !== 'level' && k !== 'current' && String(o[k] || '').trim());
        void filled;   // (v4.97) the small "Remove this?" window (wizard.js) has already asked when something was typed
        list.splice(i, 1);
        renderList(kind); markDirty();
        return;
      }
      const mv = e.target.closest('[data-move]');
      if (mv) {
        const j = i + (+mv.dataset.move);
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        renderList(kind); markDirty();
      }
    });
  }

  /* ---------------- auto-writing (offline) ---------------- */
  async function writeInto(textarea, text, key, again) {
    const cur = textarea.value.trim();
    if (cur && !again && cur !== state.generated[key]) {
      const ok = await confirmBox('Replace your text?', 'Auto-write will replace what is in this box. You can press Write again for other wording.', 'Replace', 'Keep mine', true);
      if (!ok) return;
    }
    textarea.value = text;
    state.generated[key] = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    updateCounters();
  }
  // Tidy text: fix capitals, spaces, bullets and full stops, and always say what happened
  function tidy(ta, fn) {
    const before = ta.value;
    if (!before.trim()) { toast('Write some text first, then tap Tidy text.', true); ta.focus(); return; }
    const after = fn(before);
    if (after === before) { toast('Your text is already tidy.'); return; }
    ta.value = after;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.classList.remove('tidied'); void ta.offsetWidth; ta.classList.add('tidied');
    setTimeout(() => ta.classList.remove('tidied'), 900);
    toast('Text tidied: capitals, spaces and full stops fixed.');
  }
  function wireWriter() {
    // keep the keyboard and the text box where they are, so the tap is not lost when the screen moves
    form.addEventListener('mousedown', e => { if (e.target.closest('[data-tidy]')) e.preventDefault(); });

    form.addEventListener('click', async e => {
      const w = e.target.closest('[data-write],[data-write-again],[data-tidy]');
      if (!w) return;
      const target = w.dataset.write || w.dataset.writeAgain || w.dataset.tidy;
      const again = !!w.dataset.writeAgain;
      const cv = getCV();
      if (target === 'summary') {
        const ta = $('#summary');
        if (w.dataset.tidy) { tidy(ta, Writer.polishParagraph); return; }
        if (!cv.title && !cv.experience.some(x => x.title)) { toast('Enter the job title you are applying for first.', true); $('#title').focus(); return; }
        state.seeds.summary = again ? (state.seeds.summary || 1) + 1 : (state.seeds.summary || 1);
        await writeInto(ta, Writer.summary(cv, state.seeds.summary), 'summary', again);
        toast('Summary written for ' + Writer.detect(cv.title || cv.experience[0].title).name.toLowerCase() + ' jobs. Edit it as you like.');
        return;
      }
      // duties for one job
      const card = w.closest('.entry[data-kind]');
      if (!card) return;
      const i = +card.dataset.i, job = state.lists.experience[i], ta = $('[data-k="duties"]', card);
      if (w.dataset.tidy) { tidy(ta, Writer.polishLines); return; }
      if (!job.title) { toast('Enter the job title for this job first.', true); $('[data-k="title"]', card).focus(); return; }
      const key = 'duties-' + i;
      state.seeds[key] = again ? (state.seeds[key] || 1) + 1 : (state.seeds[key] || 1) + (i * 7);
      const others = state.lists.experience.filter((x, k) => k !== i).flatMap(x => String(x.duties || '').split(/\n+/));
      await writeInto(ta, Writer.duties(job, state.seeds[key], 5, others), key, again);
      toast('Duties written for ' + Writer.detect(job.title).name.toLowerCase() + '. Edit them to match the real job.');
    });
  }

  /* ---------------- skills ---------------- */
  function renderSkills() {
    $('#skillChips').innerHTML = state.skills.map((s, i) =>
      '<span class="chip">' + esc(s) + '<button type="button" data-skill-remove="' + i + '" aria-label="Remove ' + esc(s) + '">×</button></span>').join('');
  }
  function addSkill(s) {
    s = String(s || '').trim().replace(/\s+/g, ' ');
    if (!s) return false;
    if (state.skills.some(x => x.toLowerCase() === s.toLowerCase())) { toast(s + ' is already in the list.'); return false; }
    if (state.skills.length >= 20) { toast('Up to 20 skills fit on a CV.', true); return false; }
    state.skills.push(s.charAt(0).toUpperCase() + s.slice(1));
    renderSkills(); markDirty();
    return true;
  }
  function wireSkills() {
    const add = () => { if (addSkill($('#skillInput').value)) $('#skillInput').value = ''; $('#skillInput').focus(); };
    $('#skillAdd').addEventListener('click', add);
    $('#skillInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    $('#skillChips').addEventListener('click', e => {
      const b = e.target.closest('[data-skill-remove]');
      if (!b) return;
      state.skills.splice(+b.dataset.skillRemove, 1);
      renderSkills(); markDirty();
    });
    const trS = x => (window.RichI18n && window.RichI18n.t ? window.RichI18n.t(x) : x);
    $('#skillSuggest').addEventListener('click', () => {
      const cv = getCV();
      if (!cv.title && !cv.experience.some(x => x.title)) { toast('Enter the job title you are applying for first.', true); $('#title').focus(); return; }
      const list = Writer.suggestSkills(cv);
      $('#skillSuggestions').innerHTML = list.length
        ? '<div class="sg-head"><span class="sg-t">' + esc(trS('Suggested skills')) + ' <b class="sg-n">' + list.length + '</b></span>' +
          '<button type="button" class="sg-all" data-sg-all>' + esc(trS('Add all')) + '</button></div>' +
          '<div class="sg-grid">' + list.map(s => '<button type="button" class="sg-chip" data-suggest="' + esc(s) + '"><span class="sg-plus" aria-hidden="true"></span><span class="sg-x">' + esc(s) + '</span></button>').join('') + '</div>'
        : '';
      toast(list.length ? 'Tap a skill to add it.' : 'No more suggestions for this job.');
    });
    $('#skillSuggestions').addEventListener('click', e => {
      const box = $('#skillSuggestions');
      const sync = () => { const left = $$('[data-suggest]', box).length, n = $('.sg-n', box); if (n) n.textContent = left; if (!left) box.innerHTML = ''; };
      if (e.target.closest('[data-sg-all]')) { $$('[data-suggest]', box).forEach(x => { addSkill(x.dataset.suggest); x.remove(); }); sync(); return; }
      const b = e.target.closest('[data-suggest]');
      if (b && addSkill(b.dataset.suggest)) { b.remove(); sync(); }
    });
  }

  /* ---------------- photo ---------------- */
  // photo = cropped passport photo used in the PDF
  // photoSrc + photoCrop = the original picture and how it was cropped, so it can be adjusted again
  function setPhoto(dataUrl, src, cropInfo) {
    state.photo = dataUrl || null;
    state.photoSrc = dataUrl ? (src || state.photoSrc || dataUrl) : null;
    state.photoCrop = dataUrl ? (cropInfo || state.photoCrop || null) : null;
    const frame = $('#photoFrame');
    frame.innerHTML = dataUrl ? '<img alt="Candidate photograph preview" src="' + dataUrl + '">'
      : '<span class="pf-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z"/></svg><span>No photo</span></span>';
    $('#photoRemove').hidden = !dataUrl;
    $('#photoAdjust').hidden = !dataUrl;
    { const bb = $('#photoBgBtn'); if (bb) bb.hidden = !dataUrl; }
    const lbl = $('#photoUploadLbl'); if (lbl) lbl.textContent = dataUrl ? 'Change photo' : 'Upload photo';
    try { if (tool === 'photo') renderTool(); } catch (e) { /* the Design tools are not set up yet */ }
  }

  // Read the chosen picture, fix its orientation and keep a reasonably sized copy
  async function loadSourcePhoto(file) {
    if (!/^image\//.test(file.type)) throw new Error('Choose an image file (JPG or PNG).');
    const src = await readFile(file);
    const im = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('This image format cannot be opened. Use a JPG or PNG photo.'));
      i.src = src;
    });
    const max = 1600, s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.9);
  }

  /* ----- photo editor: drag to move, pinch / slider to zoom, rotate ----- */
  const OUT_W = 432, OUT_H = 552, MIN_ZOOM = 0.5, MAX_ZOOM = 8;
  const crop = { base: null, img: null, rot: 0, zoom: 1, ox: 0, oy: 0, W: 0, H: 0, src: null, pointers: new Map(), pinch: null };

  function rotatedSource() {
    const b = crop.base, r = ((crop.rot % 360) + 360) % 360;
    if (!r) return b;
    const c = document.createElement('canvas');
    const swap = r === 90 || r === 270;
    c.width = swap ? b.naturalHeight : b.naturalWidth;
    c.height = swap ? b.naturalWidth : b.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(r * Math.PI / 180);
    ctx.drawImage(b, -b.naturalWidth / 2, -b.naturalHeight / 2);
    return c;
  }
  const iw = () => crop.img.naturalWidth || crop.img.width;
  const ih = () => crop.img.naturalHeight || crop.img.height;
  const baseScale = () => Math.max(crop.W / iw(), crop.H / ih());
  function clampCrop() {
    const s = baseScale() * crop.zoom, w = iw() * s, h = ih() * s;
    // larger than the frame: no empty edges; smaller (zoomed out): keep the picture inside the frame
    crop.ox = w >= crop.W ? Math.min(0, Math.max(crop.W - w, crop.ox)) : Math.max(0, Math.min(crop.W - w, crop.ox));
    crop.oy = h >= crop.H ? Math.min(0, Math.max(crop.H - h, crop.oy)) : Math.max(0, Math.min(crop.H - h, crop.oy));
  }
  function setCenter(cx, cy) {
    const s = baseScale() * crop.zoom;
    crop.ox = crop.W / 2 - cx * iw() * s;
    crop.oy = crop.H / 2 - cy * ih() * s;
    clampCrop();
  }
  function getCenter() {
    const s = baseScale() * crop.zoom;
    return { cx: (crop.W / 2 - crop.ox) / (iw() * s), cy: (crop.H / 2 - crop.oy) / (ih() * s) };
  }
  function zoomAt(z, px, py) {
    z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    const s1 = baseScale() * crop.zoom, s2 = baseScale() * z;
    const ix = (px - crop.ox) / s1, iy = (py - crop.oy) / s1;
    crop.zoom = z;
    crop.ox = px - ix * s2; crop.oy = py - iy * s2;
    clampCrop();
    $('#cropZoom').value = z;
    drawCrop();
  }
  function drawCrop() {
    const cv = $('#cropCanvas'), dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.round(crop.W * dpr); cv.height = Math.round(crop.H * dpr);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    const s = baseScale() * crop.zoom;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(crop.img, crop.ox * dpr, crop.oy * dpr, iw() * s * dpr, ih() * s * dpr);
    $('#cropZoomLabel').textContent = Math.round(crop.zoom * 100) + '%';
  }
  function measureFrame() {
    const f = $('#cropFrame');
    f.style.height = Math.round(f.clientWidth * 46 / 36) + 'px';   // passport proportions on every browser
    crop.W = f.clientWidth; crop.H = f.clientHeight;
  }
  async function openCropper(src, info) {
    const im = await loadImage(src);
    if (!im) { toast('This photo cannot be opened.', true); return; }
    crop.src = src; crop.base = im;
    crop.rot = info && info.rot || 0;
    crop.img = rotatedSource();
    $('#cropper').hidden = false;
    measureFrame();
    crop.zoom = info && info.zoom || 1;
    $('#cropZoom').value = crop.zoom;
    // new photos start centred slightly high, where faces usually are
    setCenter(info ? info.cx : 0.5, info ? info.cy : 0.42);
    drawCrop();
    $('#cropUse').focus();
  }
  function closeCropper() { $('#cropper').hidden = true; crop.pointers.clear(); crop.pinch = null; }
  function cropResult() {
    const c = document.createElement('canvas');
    c.width = OUT_W; c.height = OUT_H;
    const ctx = c.getContext('2d'), k = OUT_W / crop.W, s = baseScale() * crop.zoom;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, OUT_W, OUT_H);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(crop.img, crop.ox * k, crop.oy * k, iw() * s * k, ih() * s * k);
    return c.toDataURL('image/jpeg', 0.88);
  }

  function wireCropper() {
    const cv = $('#cropCanvas');
    const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      crop.pointers.set(e.pointerId, pos(e));
      if (crop.pointers.size === 2) {
        const [a, b] = [...crop.pointers.values()];
        crop.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: crop.zoom };
      }
    });
    cv.addEventListener('pointermove', e => {
      if (!crop.pointers.has(e.pointerId)) return;
      const prev = crop.pointers.get(e.pointerId), p = pos(e);
      crop.pointers.set(e.pointerId, p);
      if (crop.pointers.size >= 2 && crop.pinch) {
        const [a, b] = [...crop.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt(crop.pinch.zoom * d / crop.pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      } else if (crop.pointers.size === 1) {
        crop.ox += p.x - prev.x; crop.oy += p.y - prev.y;
        clampCrop(); drawCrop();
      }
    });
    const up = e => { crop.pointers.delete(e.pointerId); if (crop.pointers.size < 2) crop.pinch = null; };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const p = pos(e);
      zoomAt(crop.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), p.x, p.y);
    }, { passive: false });
    $('#cropZoom').addEventListener('input', e => zoomAt(Number(e.target.value), crop.W / 2, crop.H / 2));
    $('#cropMinus').addEventListener('click', () => zoomAt(crop.zoom / 1.2, crop.W / 2, crop.H / 2));
    $('#cropPlus').addEventListener('click', () => zoomAt(crop.zoom * 1.2, crop.W / 2, crop.H / 2));
    $('#cropRotate').addEventListener('click', () => {
      const c = getCenter();
      crop.rot = (crop.rot + 90) % 360;
      crop.img = rotatedSource();
      // keep the same point in the middle after turning
      const nc = { cx: 1 - c.cy, cy: c.cx };
      setCenter(nc.cx, nc.cy); drawCrop();
    });
    $('#cropReset').addEventListener('click', () => {
      crop.rot = 0; crop.img = rotatedSource(); crop.zoom = 1; $('#cropZoom').value = 1;
      setCenter(0.5, 0.42); drawCrop();
    });
    $('#cropCancel').addEventListener('click', closeCropper);
    $('#cropUse').addEventListener('click', () => {
      const c = getCenter();
      setPhoto(cropResult(), crop.src, { zoom: crop.zoom, cx: c.cx, cy: c.cy, rot: crop.rot });
      closeCropper();
      state.dirty = true; updateHeader(); schedulePreview(0);
    });
    window.addEventListener('resize', () => {
      if ($('#cropper').hidden || $('#cropFrame').clientWidth === crop.W) return;
      const c = getCenter(); measureFrame(); setCenter(c.cx, c.cy); drawCrop();
    });
  }

  async function processLogo(file) {
    const src = await readFile(file);
    const im = await loadImage(src);
    if (!im) throw new Error('This image cannot be opened. Use a PNG or JPG logo.');
    const max = 600, s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  /* ---------------- validation ---------------- */
  function clearErrors() {
    $$('.field.invalid').forEach(f => f.classList.remove('invalid'));
    $$('.field .error').forEach(e => e.remove());
  }
  function showError(el, msg) {
    const f = el.closest('.field');
    if (!f || f.classList.contains('invalid')) return;
    f.classList.add('invalid');
    const e = document.createElement('span');
    e.className = 'error'; e.textContent = msg;
    f.appendChild(e);
  }
  function validate(cv, quiet) {
    if (!quiet) clearErrors();
    const bad = [];
    if (!cv.firstName) bad.push([$('#firstName'), 'Enter the first name.']);
    if (cv.website && (/\s/.test(cv.website) || !/[a-z0-9-]\.[a-z]{2,}/i.test(cv.website))) bad.push([$('#website'), 'Enter a website address, like www.your-name.com.']);
    if (cv.linkedin && (/\s/.test(cv.linkedin) || (/[./]/.test(cv.linkedin) && !/linkedin\.com\//i.test(cv.linkedin)))) bad.push([$('#linkedin'), 'Enter a LinkedIn link, like linkedin.com/in/your-name.']);
    if (!cv.title) bad.push([$('#title'), 'Enter the job title you are applying for.']);
    if (cv.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cv.email)) bad.push([$('#email'), 'Enter a valid email, like name@example.com.']);
    // every text box: only characters the PDF font can print
    $$('input:not([type=checkbox]):not([type=file]):not([type=range]), textarea', form).forEach(el => {
      if (!el.value || el.closest('.skill-add')) return;
      const chars = Pdf.unsupportedChars(el.value);
      if (chars.length) bad.push([el, 'Use English (Latin) letters. The PDF cannot print: ' + chars.slice(0, 6).join(' ')]);
    });
    state.skills.forEach(s => { if (Pdf.unsupportedChars(s).length) bad.push([$('#skillInput'), 'Skill "' + s + '" uses letters the PDF cannot print. Remove it and type it in English.']); });
    if (quiet) return !bad.length;          // (v4.12) auto-save: only check, never mark fields or move the page
    bad.forEach(([el, m]) => showError(el, m));
    if (bad.length) {
      bad[0][0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => bad[0][0].focus({ preventScroll: true }), 300);
    }
    return !bad.length;
  }

  /* ---------------- design settings (template, colour, font, sizes...) ---------------- */
  // old CVs saved before design settings existed only had "design"
  function themeOf(cv) { return Pdf.normTheme(Object.assign({}, state.defaultTheme, cv.theme || (cv.design ? { design: cv.design } : {}))); }
  function layoutFor(cv, extra) { return Pdf.layout(Object.assign({}, cv, { theme: themeOf(cv) }), Object.assign({ hasPhoto: !!cv.photo }, extra || {})); }
  function setTheme(patch, delay) {
    if (tryDesign) endTry();
    // (v4.97) a new colour, own colour or background: the black and white text setting no longer applies
    if (state.theme.textBW && !('textBW' in patch) && ['color', 'custom', 'bgPick'].some(k => k in patch && patch[k] !== state.theme[k])) {
      patch = Object.assign({}, patch, { textBW: false });
      const sw = document.getElementById('textBW'); if (sw) { sw.checked = false; sw.closest('.bw-row').classList.remove('is-on'); }
    }
    state.theme = Pdf.normTheme(Object.assign({}, state.theme, patch));
    // new CVs start with the last settings used (but not the section choices)
    // (v4.52) a new CV starts with the template's own colours: a colour or background chosen here stays with this CV
    const dsNow = Pdf.designs().find(d => d.id === state.theme.design);
    state.defaultTheme = Object.assign({}, state.theme, { order: Pdf.DEFAULT_THEME.order, hide: [], bgPick: 0, looks: {}, unlocks: [], color: dsNow ? dsNow.color : state.theme.color });
    Store.setSetting('theme', state.defaultTheme).catch(() => {});
    if (state.currentId) state.dirty = true;
    updateHeader(); updateDesignNote();
    if (patch && 'color' in patch) {           // keep the colour list in step (also when the colours above the CV are swiped)
      $$('#toolPanel .pal').forEach(x => x.setAttribute('aria-checked', String(x.dataset.color === state.theme.color)));
      const cc = $('#toolPanel .cc-custom'); if (cc) cc.classList.toggle('is-on', state.theme.color === 'custom');
    }
    schedulePreview(delay == null ? 0 : delay);
  }
  // (v4.20) some templates draw the photo in their own shape: say so next to the shape buttons
  const shapeCache = {};
  function shapeLocked(id) {
    if (id in shapeCache) return shapeCache[id];
    let locked = false;
    try {
      const sig = sh => JSON.stringify(Pdf.layout({ firstName: 'A', title: 'B', photo: 'x', theme: { design: id, photoShape: sh } }, { hasPhoto: true })[0]
        .filter(o => o.t === 'img').map(o => o.clip || ''));
      locked = sig('square') === sig('circle');
    } catch (e) { locked = false; }
    return (shapeCache[id] = locked);
  }
  function updateShapeNote() {
    const locked = shapeLocked(state.theme.design);
    // in Edit nothing has been picked yet: a general note there; the Design tab says it for the template on screen
    $$('.shape-note').forEach(p => {
      const lk = locked && !!p.closest('#toolPanel');
      p.textContent = lk ? 'This template uses its own photo shape, so this choice does not change it.'
        : 'Some templates use their own photo shape, so this choice may not change them.';
      p.classList.toggle('is-locked', lk);
    });
  }
  function updateDesignNote() {
    updateShapeNote();
    const ds = Pdf.designs().find(x => x.id === state.theme.design) || Pdf.designs()[0];
    const f = Pdf.fonts().find(x => x.id === state.theme.font) || Pdf.fonts()[0];
    $('#designNote').textContent = ds.name + ' \u00b7 ' + f.name + ' \u00b7 ' + Math.round(state.theme.fontScale * 100) + '%';
    if (tryDesign) { const td = Pdf.designs().find(x => x.id === tryDesign); if (td) $('#designNote').textContent = tr('Pro preview') + ': ' + td.name; }
  }
  let tool = 'template', tplCat = null;
  // (v4.97) a locked Pro template tapped in Design: shown in the preview only (with the PRO PREVIEW mark) while the
  // Pro window is open and after it is closed. The CV itself keeps its own template, so downloads are never affected.
  let tryDesign = null;
  function endTry(redraw) { if (!tryDesign) return; tryDesign = null; $$('#toolPanel .design-opt.is-trying').forEach(x => x.classList.remove('is-trying'));
    updateDesignNote(); if (redraw) schedulePreview(0); }
  let spTab = 'left';
  const sideCache = {};
  // (v4.49) the Background row: six backgrounds in one row. A template with a gradient background gets six gradients,
  // one with a single colour gets six colours (dark choices for a dark page, light ones for a light page).
  // Tap the chosen one again to go back to the template's own background.
  const bgCache = {};
  const tr = t => (window.RichI18n && window.RichI18n.t ? window.RichI18n.t(t) : t);
  function bgInfo() {
    const d = state.theme.design;
    if (!(d in bgCache)) bgCache[d] = Pdf.bgOptions(sampleIfEmpty(getCV()), { hasPhoto: !!state.photo });
    return bgCache[d];
  }
  function bgCarouselHtml(th) {
    const o = bgInfo(), pick = +th.bgPick || 0;
    const css = v => Array.isArray(v) ? 'linear-gradient(90deg,' + v.join(',') + ')' : v;
    const items = [null].concat(o.swatches);
    return '<p class="bgc-label">' + esc(tr(o.kind === 'grad' ? 'Background gradient' : 'Background colour')) + '</p>' +
      '<div class="cc bgc" id="bgCarousel" dir="ltr" role="radiogroup" aria-label="' + esc(tr('Background')) + '" tabindex="0">' +
        '<div class="cc-stage">' + items.map((v, i) =>
          '<button type="button" class="cc-card" data-cidx="' + i + '" role="radio" tabindex="-1" aria-checked="' + (pick === i) + '" aria-label="' + esc(i ? tr('Background') + ' ' + i : tr('Original')) + '">' +
            (v ? '<i class="cc-pill bg-pill' + (o.dark ? ' is-dark' : '') + '"><b style="background:' + css(v) + '"></b></i>'
               : '<i class="cc-pill bg-pill bg-orig"><b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4.4h4.4"/></svg></b></i>') +
          '</button>').join('') +
        '</div><div class="cc-dots" aria-hidden="true">' + items.map(() => '<i></i>').join('') + '</div></div>';
  }
  function sideInfo() {
    const d = state.theme.design;
    if (!(d in sideCache)) sideCache[d] = Pdf.sideOf(sampleIfEmpty(getCV()), { hasPhoto: !!state.photo });
    return sideCache[d];
  }
  let secShown = [];
  function sectionHasContent(id, cv) {
    const t = v => !!String(v || '').trim();
    switch (id) {
      case 'summary': return t(cv.summary);
      case 'experience': return (cv.experience || []).some(e => t(e.title) || t(e.company));
      case 'education': return (cv.education || []).some(e => t(e.degree) || t(e.school));
      case 'skills': return (cv.skills || []).some(t);
      case 'languages': return (cv.languages || []).some(l => t(l.name));
      case 'certificates': return (cv.certificates || []).some(c => t(c.name));
      case 'custom': return (cv.custom || []).some(c => (c.items || []).some(t));
      default: return t(cv[id]);              // achievements, awards, projects, hobbies, references
    }
  }
  const pct = v => Math.round(v * 100) + '%';
  function slider(id, label, min, max, step, value, unit) {
    return '<div class="slider-row"><label for="rg-' + id + '">' + label + '</label>' +
      '<button type="button" class="btn btn-ghost btn-small" data-step="' + id + '" data-d="-1" aria-label="Less">\u2212</button>' +
      '<input type="range" id="rg-' + id + '" data-range="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '">' +
      '<button type="button" class="btn btn-ghost btn-small" data-step="' + id + '" data-d="1" aria-label="More">+</button>' +
      '<output id="out-' + id + '">' + value + unit + '</output></div>';
  }
  function seg(attr, items, current) {
    return '<div class="seg" role="radiogroup">' + items.map(([v, l]) =>
      '<button type="button" ' + attr + '="' + v + '" aria-checked="' + (String(v) === String(current)) + '">' + l + '</button>').join('') + '</div>';
  }
  const RANGES = {
    fontScale: { key: 'fontScale', mul: 100, unit: '%' }, nameScale: { key: 'nameScale', mul: 100, unit: '%' }, lineHeight: { key: 'lineHeight', mul: 100, unit: '%' },
    sectionSpace: { key: 'sectionSpace', mul: 100, unit: '%' }, margin: { key: 'margin', mul: 1, unit: ' mm' },
    sideLine: { key: 'sideLine', mul: 100, unit: '%' }, sideSpace: { key: 'sideSpace', mul: 100, unit: '%' },
    photoSize: { key: 'photoSize', mul: 100, unit: '%' }
  };
  // (v4.86) a Pro template unlocked with a rewarded ad is free for this CV only (until Pro is bought it stays Pro elsewhere)
  const unlockedHere = id => !isPro() && !!(window.RichPremium && window.RichPremium.isLocked(id)) && window.RichPremium.unlockOk(state.theme, 'd:' + id);   // (v4.96i) for 6 hours
  const lockedHere = id => !!(window.RichPremium && window.RichPremium.isLocked(id)) && !unlockedHere(id);
  const P_panel = () => $('#toolPanel');
  function tplNowHtml() {
    const curDs = Pdf.designs().find(d => d.id === state.theme.design) || Pdf.designs()[0];
    const nowTag = lockedHere(curDs.id) ? '<em class="tn-tag tn-pro">Pro</em>' : unlockedHere(curDs.id) ? '<em class="tn-tag tn-free">' + esc(tr('Free for this CV')) + '</em>' : '';
    return '<div class="tpl-now"><span class="tn-txt"><small>' + esc(tr('Your template')) + '</small><b>' + esc(curDs.name) + '</b></span>' + nowTag +
      '<button type="button" class="tn-go" data-go-preview><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg><span>' + esc(tr('Preview')) + '</span></button></div>';
  }
  function renderTool() {
    const th = state.theme, P = $('#toolPanel');
    let ccHtml = '';
    $$('.tool').forEach(b => { const on = b.dataset.tool === tool; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
    let h = '';
    if (tool === 'template') {
      const cats = window.CVDesignCategories;
      // (v4.86) a template chosen somewhere else (the template window, a new CV): open its own category
      if (!tplCat || renderTool.lastDesign !== th.design) tplCat = (Pdf.designs().find(d => d.id === th.design) || Pdf.designs()[0]).category;
      renderTool.lastDesign = th.design;
      // (v4.96) the chosen template on top, with its state (Pro / free for this CV) and a button down to the preview;
      // the templates in one row to swipe (the chosen one is scrolled into view), so the preview stays close
      h = '<h3>Template</h3><div class="sp-tabs tp-tabs cat-tabs" role="tablist" aria-label="Template categories">' + cats.map(c =>
        '<button type="button" role="tab" data-cat="' + esc(c) + '" aria-selected="' + (c === tplCat) + '"><span>' + esc(c) + '</span></button>').join('') + '</div>' +
        '<div class="design-picker dp-row" role="radiogroup" aria-label="' + esc(tplCat) + ' templates">' + Pdf.designs().filter(ds => ds.category === tplCat).map(ds =>
        '<button type="button" class="design-opt' + (lockedHere(ds.id) ? ' is-locked' : '') + '" role="radio" aria-checked="' + (ds.id === th.design) + '" data-design="' + ds.id + '" title="' + esc(ds.note) + '">' +
        (lockedHere(ds.id) ? '<span class="lock-badge" aria-label="Pro">Pro</span>'
          : unlockedHere(ds.id) ? '<span class="unlock-badge" aria-label="' + esc(tr('Free for this CV')) + '">' + esc(tr('Free for this CV')) + '</span>' : '') +
        '<canvas aria-hidden="true"></canvas><span>' + esc(ds.name) + '</span></button>').join('') + '</div>' +
        '<p class="hint dp-swipe">' + esc(tr('Swipe for more templates')) + '</p>';
    } else if (tool === 'color') {
      // colour themes: a swipeable carousel placed right above the CV preview (#ccSlot, see Carousel below)
      h = '<h3>Colour theme</h3><p class="hint pal-hint">Swipe the colours above your CV, or choose your own colour here.</p>' +
        '<div class="col-grid">' +
        '<label class="custom-color cc-custom' + (th.color === 'custom' ? ' is-on' : '') + '" style="--cc:' + esc(th.custom) + '">' +
          '<span class="cc-sw" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M14.5 5.5l4 4M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z"/></svg></span>' +
          '<span class="cc-txt"><b>Your own colour</b><small class="cc-hex">' + esc(String(th.custom).toUpperCase()) + '</small></span>' +
          '<span class="cc-state" aria-hidden="true"></span>' +
          '<input type="color" id="customColor" value="' + esc(th.custom) + '" aria-label="Your own colour"></label>' +
        // (v4.97) all CV text in black (white on dark parts); moving a colour or background slider turns it off again
        '<label class="bw-row' + (th.textBW ? ' is-on' : '') + '"><span class="bw-ic" aria-hidden="true"><b>A</b></span>' +
          '<span class="bw-txt"><b>' + esc(tr('Black and white text')) + '</b><small>' + esc(tr('All text in black (white on dark parts)')) + '</small></span>' +
          '<input type="checkbox" id="textBW" class="bw-sw"' + (th.textBW ? ' checked' : '') + '></label>' +
        '</div><div class="bgc-card">' + bgCarouselHtml(th) + '</div>';
      ccHtml ='<div class="cc" id="colorCarousel" dir="ltr" role="radiogroup" aria-label="Colour theme" tabindex="0">' +
          '<div class="cc-stage">' + Pdf.PALETTES.map((p, i) =>
            '<button type="button" class="cc-card" data-cidx="' + i + '" role="radio" tabindex="-1" aria-checked="' + (th.color === p.id) + '" aria-label="' + esc(p.name) + '">' +
              (proColour(p.id) ? '<em class="cc-pro" aria-hidden="true">Pro</em>' : '') +
              '<i class="cc-pill' + (p.bw ? ' cc-bw' : '') + '">' + (p.bg ? '<b class="cc-bgs" style="background:' + p.bg + '"></b>' : '') + '<b style="background:' + p.primary + '"></b><b style="background:' + p.accent + '"></b><b style="background:' + (p.bw ? '#FFFFFF' : p.highlight) + '"></b></i></button>').join('') +
          '</div><div class="cc-dots" aria-hidden="true">' + Pdf.PALETTES.map(() => '<i></i>').join('') + '</div></div>';
    } else if (tool === 'size') {
      // Text & font (v3.80): the font in a drop-down list, then the text size
      const cur = Pdf.fonts().find(f => f.id === th.font) || Pdf.fonts()[0];
      h = '<h3>Text &amp; font</h3><span class="fd-label" id="fdLbl">Font</span>' +
        '<div class="font-dd" id="fontDd"><button type="button" class="fd-btn" id="fdBtn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="fdLbl">' +
          '<canvas class="fd-sample" aria-hidden="true" data-fd-font="' + cur.id + '"></canvas><span class="fd-txt"><b>' + esc(cur.name) + '</b><small>' + esc(cur.hint) + '</small></span>' +
          '<span class="fd-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></span></button>' +
        '<div class="font-list fd-list" id="fdList" role="listbox" hidden>' + Pdf.fonts().map(f =>
          '<button type="button" class="font-opt" data-font="' + f.id + '" role="option" aria-checked="' + (th.font === f.id) + '"><canvas aria-hidden="true"></canvas><span>' + esc(f.name) + '</span><small>' + esc(f.hint) + '</small></button>').join('') +
        '</div></div><p class="hint fd-hint">All fonts work offline and look the same in the PDF.</p>' +
        slider('fontScale', 'Text size', 50, 150, 5, Math.round(th.fontScale * 100), '%') +

        // (v4.77) the name has its own size, in small 1 % steps
        '<div class="name-size">' + slider('nameScale', 'Name size', 70, 130, 1, Math.round((th.nameScale || 1) * 100), '%') + '</div>' +
        '<p class="hint" style="margin-top:10px">Larger text is easier to read. Smaller text fits more on one page.</p>';
    } else if (tool === 'spacing') {
      // line spacing, space between sections and the page margin, together (the margin had its own tool before v3.78)
      // (v4.47) a template with a side column: a Left and a Right menu, each with its own sliders
      const side = sideInfo(), mainSl = () => slider('lineHeight', 'Line spacing', 85, 170, 5, Math.round(th.lineHeight * 100), '%') +
          slider('sectionSpace', 'Space between jobs and sections', 10, 200, 10, Math.round(th.sectionSpace * 100), '%'),
        sideSl = () => slider('sideLine', 'Line spacing', 85, 170, 5, Math.round(th.sideLine * 100), '%') +
          slider('sideSpace', 'Space between sections', 10, 200, 10, Math.round(th.sideSpace * 100), '%');
      let body;
      if (side) {
        const leftIsSide = side.left, cur = spTab === 'right' ? 'right' : 'left';
        body = '<div class="sp-tabs" role="tablist" aria-label="Side of the CV">' +
            ['left', 'right'].map(k => '<button type="button" role="tab" data-sptab="' + k + '" aria-selected="' + (k === cur) + '">' +
              '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><rect x="' + (k === 'left' ? 3 : 13) + '" y="4" width="8" height="16" rx="1" class="sp-fill"/></svg>' +
              '<span>' + (k === 'left' ? 'Left' : 'Right') + '</span></button>').join('') + '</div>' +
          '<p class="hint sp-what">' + ((cur === 'left') === leftIsSide ? 'The side column: contact, skills, hobbies, languages.' : 'The main part: profile, jobs, education and more.') + '</p>' +
          '<div class="sp-sliders">' + ((cur === 'left') === leftIsSide ? sideSl() : mainSl()) + '</div>';
      } else body = '<div class="sp-sliders">' + mainSl() + '</div>';
      h = '<h3>Spacing</h3>' + body +
        '<div class="sp-sliders sp-page">' + slider('margin', 'Page margin (space around the page edges)', 8, 25, 1, th.margin, ' mm') + '</div>' +
        '<p class="hint">Smaller margins fit more text. 15 mm is standard.</p>';
    } else if (tool === 'photo') {
      // (v4.45) the photo can be added, changed, adjusted and removed here too (same photo as in Edit, page 1)
      const PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z"/></svg>';
      h = '<h3>Profile picture</h3>' +
        '<div class="dp-card">' +
          '<button type="button" class="dp-frame" id="dpFrame" data-shape="' + esc(th.photoShape) + '" aria-label="' + (state.photo ? 'Adjust photo' : 'Upload photo') + '">' +
            (state.photo ? '<img alt="" src="' + state.photo + '">' : '<span class="dp-empty">' + PERSON + '</span>') + '</button>' +
          '<div class="dp-side">' +
            '<b class="dp-title">' + (state.photo ? 'Your photo' : 'No photo yet') + '</b>' +
            '<small class="dp-sub">' + (state.photo ? 'Tap the picture to zoom or move it.' : 'A clear, smiling photo with a plain background works best.') + '</small>' +
            '<div class="dp-btns">' +
              '<label class="btn dp-up"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg><span>' + (state.photo ? 'Change' : 'Upload photo') + '</span>' +
                '<input type="file" id="photoInput2" accept="image/*"></label>' +
              (state.photo ? '<button type="button" class="btn dp-del" id="dpRemove" aria-label="Remove photo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg><span>Remove</span></button>' : '') +
              (state.photo ? '<button type="button" class="btn dp-bg" id="dpBg"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg><span>Clean background</span></button>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        (state.photo ? '<label class="check"><input type="checkbox" id="photoShow"' + (th.showPhoto ? ' checked' : '') + '> Show the photo on the CV</label>' : '') +
        '<h3 style="margin-top:14px">Shape</h3>' + seg('data-shape', [['square', 'Square'], ['rounded', 'Rounded'], ['circle', 'Circle']], th.photoShape) + '<p class="hint shape-note"></p>' +
        '<div style="margin-top:12px">' + slider('photoSize', 'Photo size', 70, 130, 5, Math.round(th.photoSize * 100), '%') + '</div>';
    } else if (tool === 'sections') {
      // (v4.39) only the sections that have something in them
      secShown = th.order.filter(id => sectionHasContent(id, getCV()));
      h = '<h3>Sections</h3><p class="hint">Untick to hide a section. Hold the dots and drag to change the order.</p><div class="sec-list">' +
        (secShown.length ? '' : '<p class="hint sec-none">Nothing to arrange yet. Fill in your details in Edit and the sections show up here.</p>') +
        secShown.map((id, i) => '<div class="sec-row' + (th.hide.includes(id) ? ' off' : '') + '" data-sec="' + id + '">' +
          '<input type="checkbox" data-sec-toggle="' + id + '"' + (th.hide.includes(id) ? '' : ' checked') + ' aria-label="Show ' + esc(Pdf.SECTIONS[id]) + '">' +
          '<span class="sec-name">' + esc(Pdf.SECTIONS[id]) + '</span>' +
          '<span class="drag-h" role="button" aria-label="Drag to move ' + esc(Pdf.SECTIONS[id]) + '">' + RichDrag.GRIP + '</span></div>').join('') + '</div>' +
        '<p class="hint" style="margin-top:8px">Some templates show skills and languages in their side column.</p>';
    }
    // (v4.48) "Reset all design settings" sits in the Design header now
    if (Carousel.el) Carousel.destroy();
    if (BgCarousel.el) BgCarousel.destroy();
    P.innerHTML = h;
    if (tool === 'photo') updateShapeNote();
    if (tool === 'sections') RichDrag.attach($('.sec-list', P), { item: '.sec-row', handle: '.drag-h', onDrop: (from, to) => {
      // the list shows only filled sections: move within the full order, next to the one it was dropped on
      const order = state.theme.order.slice(), moving = secShown[from], target = secShown[to];
      order.splice(order.indexOf(moving), 1);
      const ti = order.indexOf(target);
      order.splice(from < to ? ti + 1 : ti, 0, moving);
      setTheme({ order }); renderTool();
    } });
    const slot = $('#ccSlot');                     // the colour carousel sits right above the CV pages
    if (slot) { slot.innerHTML = ccHtml; slot.hidden = !ccHtml; }
    if (ccHtml) Carousel.init($('#colorCarousel'));
    if ($('#bgCarousel', P)) BgCarousel.init($('#bgCarousel', P));
    if (tool === 'template') { renderThumbs(); centerChosenTpl(); }
    if (tool === 'size') drawFontButton();
  }
  // (v4.97) a tapped template card slides fully into view (to the middle of the row, smoothly)
  function centerCard(card) {
    const row = card && card.closest('.dp-row'); if (!row) return;
    const r = row.getBoundingClientRect(), o = card.getBoundingClientRect();
    row.scrollTo({ left: row.scrollLeft + (o.left + o.width / 2) - (r.left + r.width / 2), behavior: 'smooth' });
  }
  // (v4.96) the chosen template in the middle of the swipe row (sideways only: the page itself does not move)
  function centerChosenTpl() {
    requestAnimationFrame(() => {
      const row = $('#toolPanel .dp-row'), on = row && ($('.design-opt[aria-checked="true"]', row) || $('.design-opt', row));
      if (!row || !on) return;      // (v4.97) every category gets the same card size, also when the chosen template is not in it
      // (v4.97) cards 125% of a third of the row; the chosen one is centred when it can be (no empty space at the ends:
      // the first / last template sits at the edge), set in one step without animation (no fast sliding)
      const gap = parseFloat(getComputedStyle(row).columnGap) || 10, W = row.clientWidth;
      const cw = Math.floor((W - 2 * gap) / 3 * 1.25);
      $$('.design-opt', row).forEach(c => { c.style.setProperty('flex', '0 0 ' + cw + 'px', 'important'); c.style.setProperty('width', cw + 'px', 'important'); });
      row.style.paddingInline = ''; row.style.scrollPaddingInline = '';
      row.style.scrollBehavior = 'auto'; row.style.scrollSnapType = 'none';
      const go = () => { const r = row.getBoundingClientRect(), o = on.getBoundingClientRect(); row.scrollLeft += (o.left + o.width / 2) - (r.left + r.width / 2); };
      go(); setTimeout(() => { go(); row.style.scrollSnapType = ''; }, 60);
    });
  }
  // (v4.96) down to the CV preview (just under the colour row, when there is one)
  function goPreview() {
    const el = $('#ccSlot:not([hidden])') || $('#pages'), bar = document.querySelector('.topbar');
    // (v4.97) also clear of the sticky Design tool row, so the top of the CV is never hidden under it
    const tl = $('#tools'), tlH = tl && getComputedStyle(tl).position === 'sticky' ? tl.getBoundingClientRect().height : 0;
    const y = el.getBoundingClientRect().top + window.scrollY - (bar ? bar.getBoundingClientRect().height : 0) - tlH - 10;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }
  // the sample of the chosen font inside the drop-down button
  async function drawFontButton() {
    const c = $('#fdBtn canvas');
    if (!c) return;
    await Pdf.loadFont(c.dataset.fdFont);
    Pdf.drawSample(c, c.dataset.fdFont, (fullNameNow() || 'John Smith'), Math.max(80, c.clientWidth || 120), 26);
  }
  async function renderFontSamples() {
    const opts = $$('.font-opt');
    for (const b of opts) {
      await Pdf.loadFont(b.dataset.font);
      const c = $('canvas', b);
      if (c) Pdf.drawSample(c, b.dataset.font, (fullNameNow() || 'John Smith'), Math.max(90, c.clientWidth || b.clientWidth - 22), 30);
    }
  }
  function wireTools() {
    $('#tools').addEventListener('click', e => {
      const b = e.target.closest('.tool');
      if (!b) return;
      tool = b.dataset.tool; renderTool();
      window.scrollTo({ top: 0, behavior: 'smooth' });   // (v4.97) a new tool: start at the top of the page
    });
    const P = $('#toolPanel');
    P.addEventListener('click', async e => {
      const t = e.target;
      let b;
      if ((b = t.closest('[data-cat]'))) { tplCat = b.dataset.cat; renderTool(); return; }
      if (t.closest('[data-go-preview]')) { goPreview(); return; }
      if ((b = t.closest('#fdBtn'))) {                       // open / close the font list
        const list = $('#fdList'), open = list.hidden;
        list.hidden = !open; b.setAttribute('aria-expanded', String(open)); $('#fontDd').classList.toggle('open', open);
        if (open) {
          renderFontSamples();
          // (v4.97) the list floats over the page, above the button (below only when there is clearly more room there);
          // the page itself does not move
          const r = b.getBoundingClientRect(), z = b.offsetHeight ? r.height / b.offsetHeight : 1, bar = $('.topbar');
          const above = r.top - (bar ? bar.getBoundingClientRect().bottom : 0) - 12, below = innerHeight - r.bottom - (document.body.classList.contains('has-ad-bar') ? 70 : 12);
          const up = above >= 220 || above >= below;
          $('#fontDd').classList.toggle('up', up);
          list.style.maxHeight = Math.max(140, Math.min(380, (up ? above : below) - 8) / z) + 'px';
          const on = $('.font-opt[aria-checked="true"]', list); if (on) list.scrollTop = Math.max(0, on.offsetTop - 8);
        }
        return;
      }
      if ((b = t.closest('[data-design]'))) {
        // a template brings its own colour and font; they can be changed afterwards
        const ds = Pdf.designs().find(d => d.id === b.dataset.design);
        // (v4.96) a locked Pro template: the Pro window first (Pro, or one rewarded ad for this CV). Nothing changes until then.
        if (lockedHere(ds.id) && window.RichPremium && window.RichPremium.offer) {
          const P = window.RichPremium;
          // (v4.97) the CV preview shows this template (marked PRO PREVIEW) under the Pro window; closing the window scrolls down to it
          endTry(); tryDesign = ds.id; b.classList.add('is-trying'); updateDesignNote(); schedulePreview(0);
          centerCard(b);
          P.offer('template', { onClose: () => { if (tryDesign === ds.id) setTimeout(goPreview, 250); }, onReward: () => {
            endTry();
            const keep = (state.theme.unlocks || []).filter(k => !String(k).startsWith('d:'));    // one Pro template at a time
            state.theme = Object.assign({}, state.theme, { unlocks: keep.concat('d:' + ds.id + '@' + Date.now()) });
            const nb = $('[data-design="' + ds.id + '"]', P_panel()); if (nb) nb.click();
            setTimeout(renderTool, 450);                            // the "Pro" mark becomes "Free for this CV"
            setTimeout(() => toast('Template unlocked for this CV.'), 350);
            return 'quiet';
          } });
          return;
        }
        await Pdf.loadFont(ds.font);
        // (v4.52) colours and backgrounds belong to one template: the one left keeps its choice (for coming back to it),
        // the new one opens in its own colours, or in the ones chosen for it before in this CV
        const looks = Object.assign({}, state.theme.looks || {});
        looks[state.theme.design] = { color: state.theme.color, custom: state.theme.custom, bgPick: +state.theme.bgPick || 0 };
        const L = looks[ds.id] || { color: ds.color, bgPick: 0 };
        setTheme({ design: ds.id, color: L.color, custom: L.custom || state.theme.custom, bgPick: L.bgPick || 0, font: ds.font, looks });
        $$('[data-design]', P).forEach(x => x.setAttribute('aria-checked', String(x === b)));
        centerCard(b);
        const tn = $('.tpl-now', P); if (tn) tn.outerHTML = tplNowHtml();
        return;
      }
      if ((b = t.closest('[data-color]'))) { setTheme({ color: b.dataset.color }); renderTool(); return; }
      if ((b = t.closest('[data-font]'))) {
        const id = b.dataset.font;
        if (!(await Pdf.loadFont(id))) { toast('This font could not be loaded.', true); return; }
        setTheme({ font: id }); $$('[data-font]', P).forEach(x => x.setAttribute('aria-checked', String(x === b)));
        if ($('#fdList')) renderTool();                       // close the list, show the new font on the button
        return;
      }
      if ((b = t.closest('[data-sptab]'))) { spTab = b.dataset.sptab; renderTool(); return; }
      if ((b = t.closest('[data-scale]'))) { setTheme({ fontScale: +b.dataset.scale / 100 }); renderTool(); return; }
      if ((b = t.closest('[data-step]'))) {
        const r = RANGES[b.dataset.step], inp = $('#rg-' + b.dataset.step);
        const v = Math.min(+inp.max, Math.max(+inp.min, +inp.value + (+b.dataset.d) * (+inp.step)));
        inp.value = v; $('#out-' + b.dataset.step).textContent = v + r.unit;
        setTheme({ [r.key]: v / r.mul }, 150);
        return;
      }
      if ((b = t.closest('[data-shape]'))) { setTheme({ photoShape: b.dataset.shape }); renderTool(); return; }
      if ((b = t.closest('[data-sec-move]'))) {
        const order = state.theme.order.slice(), i = order.indexOf(b.dataset.secMove), j = i + (+b.dataset.d);
        if (j < 0 || j >= order.length) return;
        [order[i], order[j]] = [order[j], order[i]];
        setTheme({ order }); renderTool(); return;
      }
      if (t.id === 'photoAdjust2') { $('#photoAdjust').click(); return; }
      if (t.closest('#dpFrame')) { if (state.photo) $('#photoAdjust').click(); else { const i = $('#photoInput2'); if (i) i.click(); } return; }
      if (t.closest('#dpRemove')) { removePhoto().then(ok => { if (ok) renderTool(); }); return; }
      if (t.closest('#dpBg')) { if (window.RichPhotoBg) window.RichPhotoBg.open(); return; }

    });
    // (v4.97) a small "Reset design?" window with a reset icon; the page behind cannot be touched while it is open
    function resetAsk() {
      return new Promise(done => {
        const ov = document.createElement('div'); ov.className = 'rm-ov rs-ov'; ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-modal', 'true');
        ov.innerHTML = '<div class="rm-box"><span class="rm-ic rs-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5"/></svg></span>' +
          '<p class="rm-t"></p><p class="rm-p"></p><div class="rm-btns"><button type="button" class="rm-no"></button><button type="button" class="rm-yes rs-yes"></button></div></div>';
        $('.rm-t', ov).textContent = tr('Reset design?');
        $('.rm-p', ov).textContent = tr('Template, colours, font, sizes and spacing go back to the start.');
        $('.rm-no', ov).textContent = tr('Cancel'); $('.rm-yes', ov).textContent = tr('Reset');
        document.body.appendChild(ov); document.documentElement.classList.add('no-scroll'); requestAnimationFrame(() => ov.classList.add('in'));
        const end = v => { ov.classList.remove('in'); document.documentElement.classList.remove('no-scroll'); setTimeout(() => ov.remove(), 160); done(v); };
        ['touchmove', 'wheel'].forEach(t => ov.addEventListener(t, e => e.preventDefault(), { passive: false }));
        ov.addEventListener('click', e => { if (e.target.closest('.rm-yes')) end(true); else if (e.target.closest('.rm-no') || e.target === ov) end(false); });
      });
    }
    $('#headReset').addEventListener('click', async () => {
      if (!(await resetAsk())) return;
      const before = JSON.parse(JSON.stringify(state.theme));
      setTheme(Object.assign({}, Pdf.DEFAULT_THEME)); renderTool();
      // (v4.97) Undo shows under the reset button for 10 seconds
      const u = $('#headUndo'); u.hidden = false; u.classList.remove('gone');
      clearTimeout(u._t); u._t = setTimeout(() => { u.classList.add('gone'); setTimeout(() => { u.hidden = true; }, 300); }, 10000);
      u.onclick = () => { clearTimeout(u._t); setTheme(before); renderTool(); u.hidden = true; toast('Design settings are back.'); };
    });
    // (v4.97) "Your own colour" opens the app's own colour window (not the phone's plain one): it starts on the CV's
    // current colour, every colour pops when chosen, the CV shows it live, Cancel puts the old colour back
    P.addEventListener('click', e => {
      const l = e.target.closest && e.target.closest('.cc-custom'); if (!l) return;
      e.preventDefault(); openColourSheet();
    }, true);
    function openColourSheet() {
      const before = { color: state.theme.color, custom: state.theme.custom };
      const T0 = Pdf.themeColors(Pdf.normTheme(state.theme));
      let cur = String(state.theme.color === 'custom' ? state.theme.custom : T0.accent || state.theme.custom || '#1A5FE8').toUpperCase();
      const SW = ['#1A5FE8','#0B3D91','#0EA5E9','#0F766E','#16A34A','#65A30D','#CA8A04','#EAB308','#F59E0B','#EA580C','#DC2626','#BE123C',
                  '#DB2777','#C026D3','#7C3AED','#4F46E5','#334155','#111827','#78350F','#A16207','#047857','#0E7490','#9F1239','#6B7280'];
      if (!SW.includes(cur)) SW.unshift(cur), SW.pop();
      const ov = document.createElement('div'); ov.className = 'qd-ov csh-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
      ov.innerHTML = '<div class="qd-box csh"><div class="csh-top"><span class="csh-now"></span><span class="csh-t"><b>' + esc(tr('Your own colour')) + '</b><small class="csh-hex"></small></span></div>' +
        '<div class="csh-grid">' + SW.map(c => '<button type="button" class="csh-c" data-c="' + c + '" style="--c:' + c + '" aria-label="' + c + '"></button>').join('') + '</div>' +
        '<label class="csh-hue"><span>' + esc(tr('More colours')) + '</span><input type="range" min="0" max="359" step="1" class="csh-range" aria-label="' + esc(tr('More colours')) + '"></label>' +
        '<div class="csh-btns"><button type="button" class="qd-sec csh-no">' + esc(tr('Cancel')) + '</button><button type="button" class="qd-main csh-ok">' + esc(tr('Set')) + '</button></div></div>';
      document.body.appendChild(ov); requestAnimationFrame(() => ov.classList.add('in'));
      const hsl = h => { const f = n => { const k = (n + h / 30) % 12, a = 0.72 * Math.min(0.42, 1 - 0.42); return Math.round(255 * (0.42 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); }; return ('#' + f(0) + f(8) + f(4)).toUpperCase(); };
      const show = (c, live) => {
        cur = c; ov.querySelector('.csh-now').style.background = c; ov.querySelector('.csh-hex').textContent = c;
        ov.querySelectorAll('.csh-c').forEach(b => b.classList.toggle('on', b.dataset.c === c));
        if (live) setTheme({ color: 'custom', custom: c }, 120);
      };
      show(cur, false);
      ov.addEventListener('click', e => {
        const b = e.target.closest('.csh-c');
        if (b) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); show(b.dataset.c, true); return; }
        if (e.target.closest('.csh-ok')) { shut(); setTimeout(renderTool, 180); return; }
        if (e.target.closest('.csh-no') || e.target === ov) { setTheme(before); shut(); setTimeout(renderTool, 180); }
      });
      ov.querySelector('.csh-range').addEventListener('input', e => show(hsl(+e.target.value), true));
      function shut() { ov.classList.remove('in'); setTimeout(() => ov.remove(), 180); }
    }
    P.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.range) {
        const r = RANGES[t.dataset.range];
        $('#out-' + t.dataset.range).textContent = t.value + r.unit;
        setTheme({ [r.key]: +t.value / r.mul }, 150);
      } else if (t.id === 'customColor') {
        setTheme({ color: 'custom', custom: t.value }, 150);
        const l = t.closest('.cc-custom');                   // the swatch and the code follow the colour live
        if (l) { l.style.setProperty('--cc', t.value); l.classList.add('is-on'); const x = l.querySelector('.cc-hex'); if (x) x.textContent = t.value.toUpperCase(); }
      }
    });
    P.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'photoShow') setTheme({ showPhoto: t.checked });
      else if (t.id === 'textBW') { setTheme({ textBW: t.checked }); t.closest('.bw-row').classList.toggle('is-on', t.checked); }
      else if (t.dataset.secToggle) {
        const hide = state.theme.hide.filter(x => x !== t.dataset.secToggle);
        if (!t.checked) hide.push(t.dataset.secToggle);
        setTheme({ hide }); renderTool();
      } else if (t.id === 'customColor') renderTool();
    });
  }

  /* ---------------- colour carousel: swipe through the colour themes, the CV preview follows the finger ---------------- */
  // (v4.50) one swipe carousel, used twice: the colour themes and the page backgrounds (O: what it shows and does)
  function makeCarousel(O) {
    let N = 0;
    const K = 190, C = 25;                   // spring stiffness and damping (iOS-like, no bounce past the target)
    let el = null, stage = null, cards = [], dots = [], ro = null;
    let pos = 0, vel = 0, target = null, raf = 0, active = -1, spacing = 120, live = false;
    let drag = null, custom = false, zoom = 1;

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const haptic = () => {
      try { if (Android && typeof Android.haptic === 'function') { Android.haptic(); return; } } catch (e) { /* ignore */ }
      try { if (navigator.vibrate) navigator.vibrate(6); } catch (e) { /* ignore */ }
    };
    function measure() {
      if (!el) return;
      const w = el.clientWidth || 320;
      const cw = Math.round(clamp(w * 0.105, 34, 46));                 // small cards: about 40 px wide
      el.style.setProperty('--cw', cw + 'px');
      el.style.setProperty('--ch', Math.round(cw * 0.52) + 'px');
      spacing = cw * 1.02;
      // the app may be zoomed (Display size): finger moves are in screen pixels, the cards in page pixels
      const r = el.getBoundingClientRect().width;
      zoom = r && el.offsetWidth ? r / el.offsetWidth : 1;
      paint();
    }
    // place every card from the (fractional) position: centre card big and sharp, the others smaller, fainter, blurred
    function paint() {
      for (let i = 0; i < N; i++) {
        const c = cards[i], d = i - pos, a = Math.abs(d);
        if (a > 3.6) { if (c.style.visibility !== 'hidden') c.style.visibility = 'hidden'; continue; }
        c.style.visibility = '';
        const off = a <= 1 ? a : 1 + (a - 1) * 0.8;                  // outer cards sit a little closer together
        const x = Math.sign(d) * off * spacing;
        const sc = 1 - Math.min(a, 3) * 0.14;
        c.style.transform = 'translate3d(calc(-50% + ' + x.toFixed(2) + 'px), -50%, 0) scale(' + sc.toFixed(4) + ')';
        // (v4.78) the background slider fades its side cards less, so pale colours stay easy to see
        c.style.opacity = (1 - Math.min(a, 3.6) * (O.soft ? 0.15 : 0.26)).toFixed(3);
        const bl = Math.round(Math.min(a, 3) * (O.soft ? 0.4 : 1.1) * 4) / 4;                         // quarter-pixel steps: fewer repaints
        c.style.filter = bl < 0.25 ? 'none' : 'blur(' + bl + 'px)';
        c.style.zIndex = String(100 - Math.round(a * 10));
        c.style.setProperty('--glow', custom ? 0 : Math.max(0, 1 - a * 1.7).toFixed(3));
        c.style.setProperty('--ring', Math.max(0, 1 - a * 0.45).toFixed(3));        // the outer border fades with distance
      }
      for (let i = 0; i < N; i++) {
        const k = Math.max(0, 1 - Math.abs(i - pos));
        dots[i].style.transform = 'scale(' + (1 + k * 0.9).toFixed(3) + ')';
        dots[i].style.opacity = (0.35 + k * 0.65).toFixed(3);
        dots[i].style.display = Math.abs(i - pos) > 6.5 ? 'none' : '';      // (v4.11) many colours: only the dots near the current one
      }
      const now = clamp(Math.round(pos), 0, N - 1);
      if (now !== active) {
        const first = active < 0; active = now;
        cards.forEach((c, i) => c.setAttribute('aria-checked', String(!custom && i === now)));
        dots.forEach((d, i) => d.classList.toggle('on', i === now));
        if (!first && live) haptic();
      }
      if (live) livePreview();
    }
    function livePreview() { drawLive(O.live(pos)); }

    function frame(ts) {
      raf = 0;
      if (drag) return;
      const dt = Math.min(0.032, (ts - (frame.last || ts)) / 1000) || 0.016; frame.last = ts;
      const acc = -K * (pos - target) - C * vel;
      vel += acc * dt; pos += vel * dt;
      if (Math.abs(pos - target) < 0.0015 && Math.abs(vel) < 0.02) { pos = target; vel = 0; paint(); settle(); return; }
      paint();
      raf = requestAnimationFrame(frame);
    }
    function animateTo(t, v) {
      target = clamp(Math.round(t), 0, N - 1);
      if (v != null) vel = v;
      live = true; custom = false;
      cancelAnimationFrame(raf); frame.last = 0;
      raf = requestAnimationFrame(frame);
    }
    function settle() {
      live = false; target = null;
      O.settle(active);
      self.moving = false;
    }

    // ---- dragging: the carousel follows the finger. Phones use touch events (more reliable in Android's
    //      WebView); a mouse uses pointer events. The first few pixels decide the direction:
    //      sideways = the carousel (the page does not scroll), up/down = the page scrolls as usual.
    function begin(x, y, t, card) {
      cancelAnimationFrame(raf); raf = 0;
      const moving = target != null;
      drag = { x0: x, y0: y, p0: pos, on: moving, dir: moving ? 'h' : '', lastX: x, lastT: t, v: 0, card };
      if (moving) { live = true; self.moving = true; clearTimeout(previewTimer); }
    }
    // returns 'h' while the carousel owns the gesture, 'v' when it is a page scroll, '' while undecided
    function follow(x, y, t) {
      const dx = x - drag.x0, dy = y - drag.y0;
      if (!drag.dir) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return '';
        drag.dir = Math.abs(dx) * 1.15 >= Math.abs(dy) ? 'h' : 'v';
        if (drag.dir === 'v') return 'v';
        drag.on = true; live = true; custom = false; self.moving = true;
        clearTimeout(previewTimer);
        drag.lastX = x; drag.lastT = t;          // keep the start point: the phone holds back the first few pixels, the cards catch up
      }
      if (drag.dir !== 'h') return drag.dir;
      let p = drag.p0 - (x - drag.x0) / zoom / spacing;
      if (p < 0) p = -Math.pow(-p, 0.7) * 0.35; else if (p > N - 1) p = N - 1 + Math.pow(p - (N - 1), 0.7) * 0.35;   // soft edges
      const dt = Math.max(1, t - drag.lastT);
      if (dt >= 4) {
        const v = -(x - drag.lastX) / zoom / spacing / dt * 1000;                  // themes per second
        drag.v = drag.v * 0.55 + v * 0.45; drag.lastX = x; drag.lastT = t;
      }
      pos = p; paint();
      return 'h';
    }
    function finish(t, tap) {
      const d = drag; drag = null;
      if (!d.on) {                                                    // a tap: bring that card to the centre
        if (tap && d.card) animateTo(+d.card.dataset.cidx, 0);
        return;
      }
      const v = clamp(t - d.lastT < 100 ? d.v : 0, -45, 45);
      animateTo(pos + v * 0.2, v * 0.85);                             // momentum: a fast flick travels further
    }
    const cardAt = target => target && target.closest ? target.closest('.cc-card') : null;
    let touchId = null;
    function tStart(e) {
      if (e.touches.length !== 1) { if (drag && drag.on) finish(e.timeStamp, false); drag = null; touchId = null; return; }
      const tc = e.changedTouches[0]; touchId = tc.identifier;
      begin(tc.clientX, tc.clientY, e.timeStamp, cardAt(e.target));
    }
    const findTouch = list => { for (let i = 0; i < list.length; i++) if (list[i].identifier === touchId) return list[i]; return null; };
    function tMove(e) {
      if (!drag) return;
      const tc = findTouch(e.changedTouches); if (!tc) return;
      const r = follow(tc.clientX, tc.clientY, e.timeStamp);
      if (r === 'h') { if (e.cancelable) e.preventDefault(); }
      else if (r === 'v') drag = null;                                // let the page scroll
    }
    function tEnd(e) {
      if (!drag || !findTouch(e.changedTouches)) return;
      if (e.cancelable && drag.on) e.preventDefault();               // no click after a swipe
      finish(e.timeStamp, e.type === 'touchend');
      touchId = null;
    }
    // mouse / pen
    function down(e) {
      if (e.pointerType === 'touch' || (e.button != null && e.button !== 0)) return;
      begin(e.clientX, e.clientY, e.timeStamp, cardAt(e.target));
      drag.pid = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    }
    function move(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      if (follow(e.clientX, e.clientY, e.timeStamp) === 'h') e.preventDefault();
    }
    function up(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      try { el.releasePointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      finish(e.timeStamp, e.type === 'pointerup');
    }
    function key(e) {
      const k = e.key;
      if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'Home' && k !== 'End') return;
      e.preventDefault();
      const base = target != null ? target : active;
      animateTo(k === 'Home' ? 0 : k === 'End' ? N - 1 : base + (k === 'ArrowRight' ? 1 : -1));
    }

    const self = {
      moving: false,
      get el() { return el; },
      init(root) {
        el = root; stage = $('.cc-stage', el); cards = $$('.cc-card', el); dots = $$('.cc-dots i', el); N = cards.length;
        custom = O.custom ? O.custom() : false;
        const i = O.index();
        pos = i < 0 ? 0 : Math.min(N - 1, i); vel = 0; target = null; active = -1; live = false;
        el.classList.toggle('is-custom', custom);
        el.addEventListener('touchstart', tStart, { passive: true });
        el.addEventListener('touchmove', tMove, { passive: false });
        el.addEventListener('touchend', tEnd, { passive: false });
        el.addEventListener('touchcancel', tEnd, { passive: false });
        el.addEventListener('pointerdown', down);
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
        el.addEventListener('keydown', key);
        el.addEventListener('click', e => e.preventDefault());
        if (window.ResizeObserver) { ro = new ResizeObserver(measure); ro.observe(el); }
        measure();
        requestAnimationFrame(() => el && el.classList.add('ready'));
      },
      destroy() {
        cancelAnimationFrame(raf); raf = 0;
        if (ro) { ro.disconnect(); ro = null; }
        if (live && active >= 0) O.settle(active, true);   // left mid-swipe: keep where it was
        el = null; drag = null; live = false; target = null; self.moving = false;
      }
    };
    return self;
  }
  const PAL = Pdf.PALETTES;
  // the CV preview shows a mix of the two themes the carousel is between
  function blendAt(p) {
    const N = PAL.length, q = Math.max(0, Math.min(N - 1, p)), i = Math.floor(q), t = q - i, a = PAL[i], b = PAL[Math.min(N - 1, i + 1)];
    if (t < 0.0005) return { primary: a.primary, accent: a.accent, highlight: a.highlight, bg: a.bg || '#FFFFFF' };
    return { primary: Pdf.mix(a.primary, b.primary, t), accent: Pdf.mix(a.accent, b.accent, t), highlight: Pdf.mix(a.highlight, b.highlight, t),
      bg: Pdf.mix(a.bg || '#FFFFFF', b.bg || '#FFFFFF', t) };
  }
  const Carousel = makeCarousel({
    index: () => PAL.findIndex(p => p.id === state.theme.color),
    custom: () => state.theme.color === 'custom',
    live: p => ({ blend: blendAt(p) }),
    settle(i, quiet) {
      const id = PAL[i].id;
      if (state.theme.color !== id) {
        setTheme({ color: id });
        const lab = $('.cc-custom', $('#toolPanel')); if (lab) lab.classList.remove('is-on');
      } else if (!quiet) schedulePreview(0);
    }
  });
  // (v4.50) the page background: card 0 is the template's own background, then six choices (free for everyone)
  const BgCarousel = makeCarousel({
    soft: true,
    index: () => +state.theme.bgPick || 0,
    live: p => ({ bgPick: Math.max(0, Math.min(26, Math.round(p))) }),
    settle(i, quiet) {
      if ((+state.theme.bgPick || 0) !== i) setTheme({ bgPick: i });
      else if (!quiet) schedulePreview(0);
    }
  });

  // fast redraw of the CV pages with a temporary colour mix, at most once per frame
  let liveWant = null, liveBusy = false, liveCost = 8;
  function drawLive(patch) {
    liveWant = patch;
    if (liveBusy) return;
    liveBusy = true;
    requestAnimationFrame(async function step() {
      const b = liveWant; liveWant = null;
      const t0 = performance.now();
      try {
        const cv = sampleIfEmpty(getCV());
        const theme = Object.assign({}, themeOf(cv), b);
        const pages = Pdf.layout(Object.assign({}, cv, { theme }), { hasPhoto: !!cv.photo });
        const [logoEl, photoEl] = await Promise.all([loadImage(state.logo), loadImage(cv.photo)]);
        const holder = $('#pages');
        if (holder.offsetParent !== null) {
          const width = Math.max(280, Math.min(holder.clientWidth - 4 || 420, 760));
          pages.forEach((ops, i) => {
            const c = holder.children[i];
            if (c && c.tagName === 'CANVAS') { Pdf.drawToCanvas(ops, c, { logo: logoEl, photo: photoEl }, width, 1.5); watermark(c, theme); }   // sharp again when it settles
          });
        }
      } catch (e) { console.error(e); }
      liveCost = liveCost * 0.7 + (performance.now() - t0) * 0.3;
      // a slow phone redraws the CV less often, so the cards keep moving smoothly under the finger
      const wait = liveCost > 10 ? Math.min(120, liveCost * 1.6) : 0;
      setTimeout(() => { if (liveWant) requestAnimationFrame(step); else liveBusy = false; }, wait);
    });
  }

  /* ---------------- (v4.43) Pro preview mark ----------------
     A Pro template or colour can be tried, but its preview carries a "PRO PREVIEW" mark across the page,
     so a screenshot is not a finished CV. The downloaded PDF (for Pro users) has no mark. */
  const isPro = () => !!(window.RichPremium && window.RichPremium.isPremium());
  function proColour(id) {
    if (isPro() || !window.RichPremium || !window.RichPremium.colourFree) return false;
    return !window.RichPremium.colourFree(id, state.theme.design);
  }
  function watermark(c, theme) {
    if (!c || !window.RichPremium || !window.RichPremium.isThemeLocked(theme)) return;
    const ctx = c.getContext('2d'), W = c.width, H = c.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const fs = Math.round(W / 11);
    ctx.font = '800 ' + fs + 'px Poppins, Inter, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.translate(W / 2, H / 2); ctx.rotate(-Math.PI / 6);
    const step = fs * 3.2, span = Math.hypot(W, H);
    for (let y = -span / 2; y <= span / 2; y += step) {
      for (let x = -span / 2 + ((y / step) % 2 ? step : 0); x <= span / 2; x += step * 2.6) {
        ctx.fillStyle = 'rgba(40, 45, 70, 0.13)'; ctx.fillText('PRO PREVIEW', x, y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'; ctx.lineWidth = Math.max(1, fs / 30); ctx.strokeText('PRO PREVIEW', x, y);
      }
    }
    ctx.restore();
    // a band at the bottom: what it is and how to get it without the mark
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bh = Math.round(W / 13);
    ctx.fillStyle = 'rgba(14, 27, 61, 0.86)'; ctx.fillRect(0, H - bh, W, bh);
    ctx.fillStyle = '#FFD54A'; ctx.font = '700 ' + Math.round(bh * 0.42) + 'px Poppins, Inter, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // (v4.97) a template only being tried: say how to get it (downloads keep the CV's own template)
    ctx.fillText('\u265B  ' + tr(tryDesign ? 'Pro preview · Get Pro or watch an ad to use this template' : 'Pro preview · Upgrade to Pro to download without this mark'), W / 2, H - bh / 2, W * 0.94);
    ctx.restore();
  }

  /* ---------------- preview ---------------- */
  let previewTimer, thumbTimer;
  function schedulePreview(delay) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, delay == null ? 300 : delay);
  }
  function sampleIfEmpty(cv) {
    // a friendly example name and job title in the preview until the user types
    return Object.assign({}, cv, cv.fullName ? {} : { fullName: 'Your Name', firstName: 'Your', lastName: 'Name' }, { title: cv.title || 'Job Title' });
  }
  let rendering = false, again = false;
  async function renderPreview() {
    if (Carousel.moving || BgCarousel.moving) return;                 // the carousel draws the preview itself while it moves
    if (rendering) { again = true; return; }
    rendering = true;
    try {
      await Pdf.loadFont(state.theme.font);
      let cv = sampleIfEmpty(getCV());
      if (tryDesign) {                                                  // (v4.97) preview only: the Pro template being tried
        const td = Pdf.designs().find(x => x.id === tryDesign);
        if (td) { await Pdf.loadFont(td.font); cv = Object.assign({}, cv, { theme: Object.assign({}, cv.theme || {}, { design: td.id, color: td.color, font: td.font, bgPick: 0 }) }); }
      }
      const pages = layoutFor(cv);
      const [logoEl, photoEl] = await Promise.all([loadImage(state.logo), loadImage(cv.photo)]);
      const holder = $('#pages');
      if (holder.offsetParent !== null) {          // skip drawing while the preview is hidden
        const width = Math.max(280, Math.min(holder.clientWidth - 4 || 420, 760));
        while (holder.children.length > pages.length) holder.lastChild.remove();
        pages.forEach((ops, i) => {
          let c = holder.children[i];
          if (!c || c.tagName !== 'CANVAS') { c = document.createElement('canvas'); c.setAttribute('role', 'img'); holder.appendChild(c); }
          c.setAttribute('aria-label', 'Preview of CV page ' + (i + 1));
          Pdf.drawToCanvas(ops, c, { logo: logoEl, photo: photoEl }, width, 3);
          watermark(c, themeOf(cv));
        });
      }
      $('#previewMeta').textContent = 'A4, ' + pages.length + (pages.length === 1 ? ' page' : ' pages');
      if (tool === 'template') { clearTimeout(thumbTimer); thumbTimer = setTimeout(renderThumbs, 900); }
      if (!$('#fullview').hidden) renderFull();
    } catch (e) { console.error(e); }
    finally {
      rendering = false;
      if (again) { again = false; schedulePreview(60); }
    }
  }
  async function renderThumbs() {
    const cv = sampleIfEmpty(getCV());
    const [logoEl, photoEl] = await Promise.all([loadImage(state.logo), loadImage(cv.photo)]);
    const opts = $$('#toolPanel .design-opt');
    for (const b of opts) {
      const ds = Pdf.designs().find(d => d.id === b.dataset.design);
      if (ds) await Pdf.loadFont(ds.font);
    }
    opts.forEach(b => {
      const c = $('canvas', b);
      if (!c || b.offsetParent === null) return;
      const ds = Pdf.designs().find(d => d.id === b.dataset.design);
      // show each template in its own colour and font
      // (v4.55) always the template as it comes: none of the colours, background, text size or spacing chosen for this CV
      const p = Pdf.layout(Object.assign({}, cv, { theme: Object.assign({}, Pdf.DEFAULT_THEME, { design: ds.id, color: ds.color, font: ds.font, bgPick: 0 }) }),
        { hasPhoto: !!cv.photo, design: ds.id, theme: { design: ds.id, color: ds.color, font: ds.font, bgPick: 0 } });
      Pdf.drawToCanvas(p[0], c, { logo: logoEl, photo: photoEl }, Math.max(60, b.clientWidth - 8), 2);
    });
  }

  /* ---------------- full screen preview with zoom ---------------- */
  let fullZoom = 1, pinch = null;
  const fullPointers = new Map();
  function fullBase() { return Math.min($('#fullPages').clientWidth - 28, 860); }
  async function renderFull() {
    const cv = state.fullCv || sampleIfEmpty(getCV());
    await Pdf.loadFont(themeOf(cv).font);
    const pages = layoutFor(cv);
    const [logoEl, photoEl] = await Promise.all([loadImage(state.logo), loadImage(cv.photo)]);
    const holder = $('#fullPages'), w = Math.round(fullBase() * fullZoom);
    while (holder.children.length > pages.length) holder.lastChild.remove();
    pages.forEach((ops, i) => {
      let c = holder.children[i];
      if (!c) { c = document.createElement('canvas'); holder.appendChild(c); }
      Pdf.drawToCanvas(ops, c, { logo: logoEl, photo: photoEl }, w, 3);
      watermark(c, themeOf(cv));
      c.style.width = w + 'px';
    });
    centerPages();
    $('#fullZoomLabel').textContent = pct(fullZoom);
  }
  // a point on the CV (which page, and where on it), so zooming keeps that spot under the fingers
  function fullAnchor(px, py) {
    const area = $('#fullPages'), r = area.getBoundingClientRect(), k = (r.width / area.offsetWidth) || 1;
    const x = area.scrollLeft + (px - r.left) / k, y = area.scrollTop + (py - r.top) / k;
    const cs = [...area.querySelectorAll('canvas')];
    if (!cs.length) return null;
    const c = cs.find(c => y < c.offsetTop + c.offsetHeight + 8) || cs[cs.length - 1];
    return { i: cs.indexOf(c), fx: (x - c.offsetLeft) / c.offsetWidth, fy: (y - c.offsetTop) / c.offsetHeight };
  }
  function placeAnchor(a, px, py) {
    if (!a) return;
    const area = $('#fullPages'), c = area.querySelectorAll('canvas')[a.i];
    if (!c) return;
    const r = area.getBoundingClientRect(), k = (r.width / area.offsetWidth) || 1;
    area.scrollLeft = c.offsetLeft + a.fx * c.offsetWidth - (px - r.left) / k;
    area.scrollTop = c.offsetTop + a.fy * c.offsetHeight - (py - r.top) / k;
  }
  // a page shorter than the screen sits in the middle (not stuck at the top), so zooming grows from the middle too
  function centerPages() {
    const area = $('#fullPages'), cs = [...area.querySelectorAll('canvas')];
    if (!cs.length) return;
    const h = cs.reduce((t, c) => t + c.offsetHeight, 0) + 16 * (cs.length - 1);
    const pad = Math.max(16, Math.floor((area.clientHeight - h) / 2));
    area.style.paddingTop = pad + 'px'; area.style.paddingBottom = pad + 'px';
  }
  function areaMiddle() { const r = $('#fullPages').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
  // zoom in / out around the point (px, py) on screen; with no point, around the middle of the screen
  function setFullZoom(z, redraw, px, py, anchor) {
    if (px == null) [px, py] = areaMiddle();
    const a = anchor || fullAnchor(px, py);
    fullZoom = Math.min(4, Math.max(0.5, z));
    $('#fullZoomLabel').textContent = pct(fullZoom);
    const w = Math.round(fullBase() * fullZoom) + 'px';
    $$('#fullPages canvas').forEach(c => { c.style.width = w; });
    centerPages();
    placeAnchor(a, px, py);
    if (redraw) { clearTimeout(setFullZoom.t); setFullZoom.t = setTimeout(renderFull, 120); }
  }
  function closeFull() { $('#fullview').hidden = true; state.fullCv = null; state.fullRecord = null; }
  function wireFull() {
    $('#btnFull').addEventListener('click', () => { state.fullCv = null; state.fullRecord = null; $('#fullview').hidden = false; fullZoom = 1; renderFull(); });
    $('#fullClose').addEventListener('click', closeFull);
    $('#fullPlus').addEventListener('click', () => setFullZoom(fullZoom * 1.25, true));
    $('#fullMinus').addEventListener('click', () => setFullZoom(fullZoom / 1.25, true));
    $('#fullDownload').addEventListener('click', () => {
      const d = state.fullRecord;
      if (d) saveFile(d.name, d.data, 'application/pdf'); else $('#btnDownload').click();
    });
    const area = $('#fullPages');
    const mid = () => { const [a, b] = [...fullPointers.values()]; return [(a.x + b.x) / 2, (a.y + b.y) / 2, Math.hypot(a.x - b.x, a.y - b.y)]; };
    area.addEventListener('pointerdown', e => {
      fullPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fullPointers.size === 2) {
        const [mx, my, d] = mid();
        pinch = { d, z: fullZoom, a: fullAnchor(mx, my) };     // the spot between the fingers
      }
    });
    area.addEventListener('pointermove', e => {
      if (!fullPointers.has(e.pointerId)) return;
      fullPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fullPointers.size === 2 && pinch) {
        e.preventDefault();
        const [mx, my, d] = mid();
        // zoom around that spot, and follow the fingers if they move together (pan)
        setFullZoom(pinch.z * d / pinch.d, false, mx, my, pinch.a);
      }
    });
    const end = e => {
      fullPointers.delete(e.pointerId);
      if (pinch && fullPointers.size < 2) { pinch = null; clearTimeout(setFullZoom.t); setFullZoom.t = setTimeout(renderFull, 120); }
    };
    area.addEventListener('pointerup', end);
    area.addEventListener('pointercancel', end);
    area.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); setFullZoom(fullZoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), true, e.clientX, e.clientY); } }, { passive: false });
    // double tap: zoom in to that spot, double tap again: back to fit (finger lifts after a pinch do not count)
    let lastTap = 0, lastXY = [0, 0], multi = false;
    const downs = new Map();
    area.addEventListener('pointerdown', e => {
      downs.set(e.pointerId, { t: Date.now(), x: e.clientX, y: e.clientY });
      if (downs.size > 1) multi = true;
    });
    const lift = e => {
      const d = downs.get(e.pointerId); downs.delete(e.pointerId);
      if (multi) { if (!downs.size) multi = false; lastTap = 0; return; }
      if (e.type !== 'pointerup' || e.pointerType === 'mouse' || !d) return;
      if (Date.now() - d.t > 250 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) { lastTap = 0; return; }
      const t = Date.now();
      if (t - lastTap < 320 && Math.hypot(e.clientX - lastXY[0], e.clientY - lastXY[1]) < 30) {
        setFullZoom(fullZoom > 1.2 ? 1 : 2, true, e.clientX, e.clientY); lastTap = 0;
      } else { lastTap = t; lastXY = [e.clientX, e.clientY]; }
    };
    area.addEventListener('pointerup', lift);
    area.addEventListener('pointercancel', lift);
  }

  /* ---------------- files: PDF, download, share, print ---------------- */
  async function buildPdf(cv) {
    // (v4.96z) downloading, sharing and printing never ask for an upgrade and never show an ad (on any page)
    await Pdf.loadFont(themeOf(cv).font);
    const pages = layoutFor(cv);
    const bytes = await Pdf.toPdfBytes(pages, { logo: state.logo, photo: cv.photo || null }, { title: 'CV - ' + cv.fullName, author: cv.fullName });
    return { bytes, pages };
  }
  function fileNameFor(cv) {
    const safe = s => String(s || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    return 'CV_' + (safe(cv.fullName) || 'Candidate') + (cv.title ? '_' + safe(cv.title) : '') + '.pdf';
  }
  const Android = window.AndroidBridge || null;
  function toBase64(data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(new Error('Could not prepare the file.'));
      r.readAsDataURL(blob);
    });
  }
  // several files saved in one go: one message at the end instead of one per file
  let batch = null;
  async function saveMany(kind, fn) {
    batch = { count: 0, where: '', uri: '', kind };
    try { await fn(); } finally {
      const b = batch; batch = null;
      await hideLoader(0);
      if (!b.count) return;
      if (b.count === 1 && Android && b.uri) {
        if (await savedBox(b.where, { kind: b.kind })) Android.openFile(b.uri, b.kind === 'image' ? 'image/*' : /\.docx\)?$/i.test(b.where) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf');
      } else if (Android) {
        if (await savedBox(b.where, { count: b.count, kind: b.kind })) showView('downloads');
      } else savedBox(b.where || (b.kind === 'image' ? 'Picture' : 'PDF'), { count: b.count, kind: b.kind, openLabel: 'Open Downloads' }).then(v => { if (v) showView('downloads'); });
    }
  }
  async function androidSaved(res) {
    if (batch && /^ok:/.test(res || '')) { const [w, u] = res.slice(3).split('|'); if (!batch.count) { batch.where = w; batch.uri = u; } batch.count++; return; }
    if (res === 'pending') { toast('Choose a folder to save the file in.'); return; }
    if (res === 'cancel') { toast('Not saved. Saving was cancelled.'); return; }
    if (res === 'noviewer') { toast('The file is saved, but no app on this phone can open it.', true); return; }
    if (res === 'noviewer-open') { toast('No app on this phone can open this file. Install a viewer for it, or use Share.', true); return; }
    if (!/^ok:/.test(res || '')) { toast('Could not save: ' + String(res || '').replace(/^error:/, ''), true); return; }
    const [where, uri] = res.slice(3).split('|');
    // (v4.96g) the "saved" notice shows for every CV, PDF and picture, from any page
    const isPdf = /\.pdf\)?$/i.test(where), isPic = /\.(png|jpe?g)\)?$/i.test(where), isDoc = /\.docx\)?$/i.test(where);
    if (isPdf || isPic || isDoc) {
      await hideLoader(0);
      const kind = isPic ? 'image' : isDoc ? 'doc' : 'pdf';
      // (v4.97) "Open" hands the file to the phone's own app for it (PDF viewer, Gallery, Word / Docs)
      const mime = isPic ? (/\.png\)?$/i.test(where) ? 'image/png' : 'image/jpeg') : isDoc ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf';
      if (uri) { if (await savedBox(where, { kind })) Android.openFile(uri, mime); }
      else if (await savedBox(where, { kind, openLabel: 'Open Downloads' })) showView('downloads');
    } else toast('Saved to ' + where);
  }
  let pendingSave = null;
  window.RichAndroidSaved = res => {
    androidSaved(res);
    if (pendingSave && res !== 'noviewer' && res !== 'noviewer-open') { const r = pendingSave; pendingSave = null; r(/^ok:/.test(res || '')); }
  };
  let downloadsCap;
  function getDownloads() {
    if (downloadsCap === undefined) {
      downloadsCap = (window.claude && typeof window.claude.use === 'function') ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
    }
    return downloadsCap;
  }
  async function saveFile(filename, data, mime) {
    if (Android) {
      const res = Android.saveFile(await toBase64(data, mime), filename, mime);
      androidSaved(res);
      if (res === 'pending') return new Promise(r => { pendingSave = r; });     // answered after the "Save as" screen
      return /^ok:/.test(res || '');
    }
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const dl = await getDownloads();
    if (dl) {
      try { await dl.save({ filename, data: blob }); if (batch) { if (!batch.count) batch.where = filename; batch.count++; } else webSaved(filename, mime); return true; }
      catch (e) {
        if (e && e.code === 'declined') toast('Download cancelled.');
        else if (e && e.code === 'rate_limited') toast('A save prompt is already open. Finish it first.', true);
        else toast('This view cannot save files. Open the app in your browser to download.', true);
      }
      return false;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    if (batch) { if (!batch.count) batch.where = filename; batch.count++; } else webSaved(filename, mime);
    return true;
  }
  // (v4.96g) web version: the same "saved" notice; its button opens the app's Downloads page (the copy is stored there just after)
  function webSaved(filename, mime) {
    if (!/^(application\/pdf|image\/)/.test(mime || '')) { toast('Saved ' + filename); return; }
    hideLoader(0).catch(() => {});
    savedBox(filename, { kind: /^image\//.test(mime) ? 'image' : /wordprocessingml/.test(mime) ? 'doc' : 'pdf', openLabel: 'Open Downloads' }).then(v => { if (v) showView('downloads'); });
  }
  async function shareFile(filename, data, mime) {
    const res = Android.shareFile(await toBase64(data, mime), filename, mime);
    if (!/^ok/.test(res)) toast('Could not share: ' + res.replace(/^error:/, ''), true);
  }
  async function printCV(cv) {
    if (Android) {
      const { bytes } = await buildPdf(cv);
      Android.printPdf(await toBase64(bytes, 'application/pdf'), fileNameFor(cv).replace(/\.pdf$/, ''));
      return;
    }
    const [logoEl, photoEl] = await Promise.all([loadImage(state.logo), loadImage(cv.photo)]);
    const area = $('#printArea');
    area.innerHTML = '';
    await Pdf.loadFont(themeOf(cv).font);
    layoutFor(cv).forEach(ops => {
      const c = document.createElement('canvas');
      Pdf.drawToCanvas(ops, c, { logo: logoEl, photo: photoEl }, 1240 / Math.min(window.devicePixelRatio || 1, 2.5));
      const img = document.createElement('img');
      img.src = c.toDataURL('image/jpeg', 0.92);
      area.appendChild(img);
    });
    await new Promise(r => setTimeout(r, 120));
    try { window.print(); } catch (e) { toast('Printing is blocked here. Download the PDF and print it from your PDF viewer.', true); }
  }

  /* ---------------- save ---------------- */
  async function saveCurrent(auto, keep) {
    const cv = getCV();
    // auto-save keeps the work as it is, even with a field still to fix (the check runs again on Save and Download)
    if (auto && !keep && !cv.firstName && !state.currentId) return null;
    if (!auto && !validate(cv)) {
      if (currentView === 'edit') toast('Check the highlighted fields.', true);
      else {
        // the fields are in Edit, not here: say so, and make the Edit button glow until it is opened
        toast('Some details are missing. Tap Edit at the top and fix the fields marked in red.', true);
        flagEditTab();
      }
      return null;
    }
    cv.firstName = nameCase(cv.firstName); cv.lastName = nameCase(cv.lastName);
    // while auto-saving, a name box the user is typing in is left as it is (no jumping cursor)
    if (!auto || document.activeElement !== $('#firstName')) $('#firstName').value = cv.firstName;
    if (!auto || document.activeElement !== $('#lastName')) $('#lastName').value = cv.lastName;
    cv.fullName = [cv.firstName, cv.lastName].filter(Boolean).join(' ');
    const now = new Date().toISOString();
    const existing = state.currentId && state.records.find(r => r.id === state.currentId);
    const rec = Object.assign(cv, { id: existing ? existing.id : makeId(), createdAt: existing ? existing.createdAt : now, updatedAt: now });
    try { await Store.put(rec); }
    catch (e) { toast('Could not save on this device: ' + (e && e.message ? e.message : 'storage error'), true); return null; }
    state.currentId = rec.id;
    state.dirty = false;
    await refreshList();
    updateHeader();
    return rec;
  }
  /* ----- (v4.12) auto-save: every 30 seconds, and when the app goes to the background ----- */
  // the user can turn it off, and choose how often (Settings > Auto-save)
  let autoBusy = false, autoTimer = 0, autoToastT = 0;
  const AUTO_KEY = 'richAutoSave';
  function autoPrefs() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem(AUTO_KEY) || '{}') || {}; } catch (e) { p = {}; }
    const every = [10, 15, 30, 45, 60, 120, 300].includes(+p.every) ? +p.every : 30;
    return { on: p.on !== false, every };
  }
  function setAutoPrefs(patch) {
    const p = Object.assign(autoPrefs(), patch);
    try { localStorage.setItem(AUTO_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
    startAutoSave(); syncAutoUi();
  }
  function startAutoSave() {
    clearInterval(autoTimer);
    const p = autoPrefs();
    if (p.on) autoTimer = setInterval(autoSave, p.every * 1000);
  }
  function syncAutoUi() {
    const card = $('#autosaveCard'); if (card) card.classList.toggle('pro-locked', !isPro());
    const p = isPro() ? autoPrefs() : { on: false, every: autoPrefs().every };
    $$('#autoSaveOn [data-as]').forEach(b => b.setAttribute('aria-checked', String((b.dataset.as === '1') === p.on)));
    const sel = $('#autoSaveEvery'); if (sel) sel.value = String(p.every);
    const row = $('#autoSaveEveryRow'); if (row) row.classList.toggle('is-off', !p.on);
  }
  // a small note at the bottom for 2 seconds; it never takes a touch
  function autoSavedNote() {
    const t = $('#autoToast'); if (!t) return;
    t.classList.add('show');
    clearTimeout(autoToastT);
    autoToastT = setTimeout(() => t.classList.remove('show'), 2000);
  }
  async function autoSave() {
    if (!isPro()) return;                          // (v4.43) auto-save is a Pro feature
    if (autoBusy || !autoPrefs().on || !state.dirty || !(fullNameNow() || state.currentId)) return;
    autoBusy = true;
    try { const rec = await saveCurrent(true); if (rec && !document.hidden) autoSavedNote(); } catch (e) { /* try again next time */ } finally { autoBusy = false; }
  }
  startAutoSave();
  /* (v4.95) leaving the editor or starting a new CV: the open CV is kept in My CVs (for everyone, not only Pro).
     Nothing is lost by tapping Home or Create again; an empty, untouched form is not saved. */
  function hasContent(cv) {
    const keys = ['firstName', 'lastName', 'title', 'email', 'phone', 'address', 'summary'];
    if (keys.some(k => String(cv[k] || '').trim())) return true;
    // (v4.97) a new CV starts with "English" in Languages: that alone does not count as content
    const langs = (cv.languages || []).filter(l => l && (String(l.level || '').trim() || !/^english$/i.test(String(l.name || '').trim())));
    return ['experience', 'education', 'skills', 'languages'].some(k => (k === 'languages' ? langs : cv[k] || []).some(x => typeof x === 'string' ? x.trim() : x && Object.values(x).some(v => typeof v === 'string' ? v.trim() : Array.isArray(v) && v.some(t => String(t || '').trim()))));
  }
  let keepBusy = null;
  async function keepWork() {
    if (keepBusy) return keepBusy;
    if (!state.dirty) return null;
    if (!state.currentId && !hasContent(getCV())) return null;
    keepBusy = (async () => { try { return await saveCurrent(true, true); } catch (e) { return null; } finally { keepBusy = null; } })();
    return keepBusy;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('#autoSaveOn [data-as]');
    if (b && !isPro()) { if (b.dataset.as === '1' && window.RichPremium) window.RichPremium.offer('autosave'); syncAutoUi(); return; }
    if (b) setAutoPrefs({ on: b.dataset.as === '1' });
  });
  document.addEventListener('change', e => { if (e.target && e.target.id === 'autoSaveEvery') setAutoPrefs({ every: +e.target.value }); });
  // Pro bought or restored: auto-save, the preview mark and the colour badges follow at once
  document.addEventListener('richpro', () => { syncAutoUi(); startAutoSave(); renderTool(); schedulePreview(0); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncAutoUi); else syncAutoUi();
  // (v4.95) the app goes to the background or is closed: keep the open CV in My CVs for everyone (not only Pro)
  const onAway = () => { autoSave(); keepWork(); };
  // (v4.97) Android may close the app while it is in the background (to free memory). The open CV and the place
  // in it (Edit page or Design tool) are noted, so opening the app again comes straight back to the same spot.
  function rememberSpot() {
    try {
      if (!document.body.classList.contains('in-editor')) { localStorage.removeItem('richResume'); return; }
      setTimeout(() => {
        if (!state.currentId) return;
        localStorage.setItem('richResume', JSON.stringify({ id: state.currentId, view: currentView, page: window.RichWizard ? window.RichWizard.page() : 0, tool, y: window.scrollY, t: Date.now() }));
      }, 400);                                     // after keepWork has given a new CV its id
    } catch (e) { /* private mode */ }
  }
  window.RichRememberSpot = rememberSpot;
  document.addEventListener('visibilitychange', () => { if (document.hidden) onAway(); });
  window.addEventListener('pagehide', onAway);
  window.RichAppPaused = onAway;                    // told by the Android app when it goes to the background
  /* ----- loading screen while a PDF is made or saved ----- */
  let loaderEl = null, loaderT = 0, loaderSteps = 0;
  function showLoader(title, steps) {
    if (!loaderEl) {
      loaderEl = document.createElement('div');
      loaderEl.className = 'ld-ov'; loaderEl.hidden = true;
      loaderEl.setAttribute('role', 'status'); loaderEl.setAttribute('aria-live', 'polite');
      loaderEl.innerHTML = '<div class="ld-box"><div class="ld-art" aria-hidden="true"><span class="ld-ring"></span>' +
        '<span class="ld-doc"><i></i><i></i><i></i><i></i></span></div><b class="ld-title"></b><small class="ld-step"></small>' +
        '<span class="ld-bar" aria-hidden="true"><i></i></span></div>';
      document.body.appendChild(loaderEl);
    }
    $('.ld-title', loaderEl).textContent = title;
    const st = $('.ld-step', loaderEl), list = steps || [];
    let k = 0; st.textContent = list[0] || '';
    clearInterval(loaderSteps);
    if (list.length > 1) loaderSteps = setInterval(() => { k = Math.min(k + 1, list.length - 1); st.textContent = list[k]; }, 700);
    loaderEl.hidden = false; loaderT = Date.now();
    requestAnimationFrame(() => loaderEl.classList.add('in'));
  }
  async function hideLoader(minMs) {
    if (!loaderEl || loaderEl.hidden) return;
    const wait = (minMs || 0) - (Date.now() - loaderT);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    clearInterval(loaderSteps);
    loaderEl.classList.remove('in');
    await new Promise(r => setTimeout(r, 160));
    loaderEl.hidden = true;
  }
  /* ----- "PDF saved" dialog ----- */
  // opts.count > 1: one box for many files saved at once (e.g. "Save each page as its own PDF")
  let highlightNewDl = false;
  function savedBox(where, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      let ov = $('#savedBox');
      if (!ov) {
        ov = document.createElement('div');
        ov.className = 'overlay sv-ov'; ov.id = 'savedBox'; ov.hidden = true;
        ov.innerHTML = '<div class="dialog sv-box" role="alertdialog" aria-modal="true" aria-labelledby="svTitle">' +
          '<div class="sv-check" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg></div>' +
          '<h2 id="svTitle">PDF saved</h2>' +
          '<div class="sv-file"><span class="sv-pdf">PDF</span><span class="sv-txt"><b class="sv-name"></b><small class="sv-where"></small></span></div>' +
          '<div class="sv-btns"><button type="button" class="btn btn-primary sv-open">Open PDF</button><button type="button" class="btn btn-ghost sv-dl" hidden>Go to Downloads</button><button type="button" class="btn btn-ghost sv-close">Close</button></div></div>';
        document.body.appendChild(ov);
      }
      let name, folder;
      const m = /^(.*) \(([^()]+)\)$/.exec(String(where || ''));       // "the folder you chose (CV_x.pdf)"
      if (m) { folder = m[1]; name = m[2]; }
      else { const parts = String(where || '').split('/'); name = parts.pop() || where; folder = parts.join('/'); }
      const many = (opts.count || 1) > 1, pic = opts.kind === 'image', doc = opts.kind === 'doc' || /\.docx$/i.test(name || '');
      $('#svTitle', ov).textContent = tr(many ? opts.count + (pic ? ' pictures saved' : doc ? ' Word files saved' : ' PDFs saved') : (pic ? 'Picture saved' : doc ? 'Word file saved' : 'PDF saved'));
      $('.sv-pdf', ov).textContent = pic ? 'IMG' : doc ? 'DOC' : 'PDF';
      $('.sv-pdf', ov).classList.toggle('is-doc', doc); $('.sv-pdf', ov).classList.toggle('is-img', pic);
      $('.sv-pdf', ov).classList.toggle('is-many', many);
      $('.sv-pdf', ov).dataset.n = many ? String(opts.count) : '';
      $('.sv-name', ov).textContent = many ? name + '  …' : name;
      $('.sv-where', ov).textContent = many ? (folder ? folder + ' · ' : '') + 'and ' + (opts.count - 1) + ' more' : (folder ? folder : '');
      $('.sv-open', ov).textContent = tr(opts.openLabel || (many ? 'Open Downloads' : (pic ? 'Open picture' : doc ? 'Open file' : 'Open PDF')));
      // (v4.97) a file saved in Design, Edit or the PDF tools: also "Go to Downloads", which opens Downloads with it highlighted
      const goDl = (currentView === 'design' || currentView === 'edit' || currentView === 'tools') && !many && opts.openLabel !== 'Open Downloads';   // (v4.97) PDF tools too
      $('.sv-dl', ov).hidden = !goDl;
      $('.sv-dl', ov).onclick = () => { ov.hidden = true; $('.sv-open', ov).onclick = $('.sv-close', ov).onclick = ov.onclick = null; resolve(false); highlightNewDl = true; showView('downloads'); };
      ov.hidden = false; ov.classList.remove('in'); void ov.offsetWidth; ov.classList.add('in');
      if (Android && Android.haptic) try { Android.haptic(); } catch (e) { /* ignore */ }
      const done = v => { ov.hidden = true; $('.sv-open', ov).onclick = $('.sv-close', ov).onclick = ov.onclick = null; resolve(v); };
      $('.sv-open', ov).onclick = () => done(true);
      $('.sv-close', ov).onclick = () => done(false);
      ov.onclick = e => { if (e.target === ov) done(false); };
      setTimeout(() => $('.sv-open', ov).focus({ preventScroll: true }), 50);
    });
  }
  window.RichSaved = { isOpen: () => !!($('#savedBox') && !$('#savedBox').hidden), close: () => { const b = $('#savedBox .sv-close'); if (b) b.click(); } };

  async function withBusy(btn, label, fn) {
    if (btn.disabled) return;
    // (v4.96u) keep the whole button (icons too) and put it back afterwards; an icon-only button shows a spinner instead of text
    const old = btn.innerHTML, iconOnly = !btn.textContent.trim();
    btn.disabled = true;
    if (label && !iconOnly) btn.textContent = label;
    if (iconOnly) btn.classList.add('is-busy');
    try { await fn(); }
    catch (e) { if (e && e.premium) return; console.error(e); toast('Something went wrong: ' + (e && e.message ? e.message : e), true); }
    finally { btn.disabled = false; btn.innerHTML = old; btn.classList.remove('is-busy'); }
  }

  /* ---------------- Home ---------------- */
  async function updateHome() {
    setCount('#cvCount', state.records.length);
    try { setCount('#dlCount', (await Store.downloads()).length); } catch (e) { setCount('#dlCount', 0); }
    renderRecent();
  }
  // (v4.96) one set of CV actions for My CVs and for Recent CVs on Home
  async function recordAct(act, r, btn) {
      const id = r.id;
      if (act === 'edit') openCV(id, true);
      else if (act === 'pdf') { if (window.RichAskDownload) window.RichAskDownload(r); }   // (v4.97) PDF, JPG or Word
      else if (act === 'share') withBusy(btn, 'Preparing…', async () => { const { bytes } = await buildPdf(r); await shareFile(fileNameFor(r), bytes, 'application/pdf'); });
      else if (act === 'copy') {
        const now = new Date().toISOString();
        const copy = Object.assign({}, r, { id: makeId(), fullName: r.fullName, createdAt: now, updatedAt: now });
        copy.title = r.title;
        await Store.put(copy);
        await refreshList();
        toast('Copy made. Edit it for a different job.');
      } else if (act === 'delete') {
        if (!(await confirmBox('Delete this CV?', 'It will be deleted from this device. This cannot be undone.', 'Delete CV', 'Cancel', false, r.fullName || 'Untitled CV', 'CV'))) return;
        await Store.remove(id);
        if (state.currentId === id) resetForm();
        await refreshList();
        toast('Deleted.');
      }
  }
  /* (v4.96) Home: the 3 most recently edited CVs (real saved CVs), or a welcome card when there are none */
  const recentTime = r => { const t = new Date(r.updatedAt || r.createdAt).getTime(); return isNaN(t) ? 0 : t; };
  let recentKey = '';
  // (v4.96p) My CVs / Downloads titles: shrink the font a little when a translation is too long for the card
  function fitBigTitles() {
    requestAnimationFrame(() => $$('#view-home .hv-big .hv-btext b, #view-home .hv-tbar .hv-h2').forEach(b => {   // (v4.97) + the PDF Tools title
      b.style.fontSize = '';
      if (!b.offsetParent) return;
      let px = parseFloat(getComputedStyle(b).fontSize), n = 0;
      while (b.scrollWidth > b.clientWidth + 1 && px > 11 && n++ < 12) { px -= 1; b.style.fontSize = px + 'px'; }
    }));
  }
  if ('ResizeObserver' in window) new ResizeObserver(() => fitBigTitles()).observe(document.documentElement);
  document.addEventListener('richlang', () => setTimeout(fitBigTitles, 60));
  // (v4.96) the drawn mini CV (blue top with the user's photo or a person icon, short lines) for Recent CVs and Downloads
  function miniCvHtml(r) {
    return '<span class="hv-tp-top"><span class="hv-tp-bar"></span><span class="hv-tp-halo"></span>' +
  (r.photo ? '<img class="hv-tp-photo" alt="" src="' + esc(r.photo) + '">'
              : '<svg class="hv-tp-photo hv-tp-avatar" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="15" r="7.5" fill="#F2C9A4"/><path d="M12.5 13.5c0-5 3.4-8 7.5-8s7.5 3 7.5 8c-1.6-2.4-4.2-3.2-7.5-3.2s-5.9.8-7.5 3.2z" fill="#3B2A22"/><path d="M5 40c0-9 6.5-14 15-14s15 5 15 14z" fill="#1E2F66"/><path d="M17.5 26h5l-2.5 9z" fill="#fff"/><path d="M19.2 27.5h1.6l.7 5-1.5 2-1.5-2z" fill="#1F4FC8"/></svg>') +
      '</span><span class="hv-tp-lines"><i></i><i></i><i></i><i></i><i></i></span>';
  }
  function renderRecent() {
    fitBigTitles();
    const recs = state.records.slice().sort((a, b) => recentTime(b) - recentTime(a)).slice(0, 2);   // (v4.96l) the 2 latest
    $('#homeRecent').hidden = !recs.length;
    $('#homeWelcome').hidden = !!recs.length;
    const key = recs.map(r => r.id + ':' + recentTime(r) + ':' + (r.fullName || '') + ':' + (r.photo ? r.photo.length : 0)).join('|');
    if (key === recentKey) return;
    recentKey = key;
    const day = r => { const t = recentTime(r); if (!t) return ''; const d = new Date(t);   // this year: "Nov 18", older: "Nov 18, 2025"
      return d.toLocaleDateString(undefined, d.getFullYear() === new Date().getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }); };
    const name = r => r.fullName || [r.firstName, r.lastName].filter(Boolean).join(' ') || tr('Untitled CV');
    $('#recentList').innerHTML = recs.map(r =>
      '<div class="hv-rc" data-id="' + esc(r.id) + '">' +
        // (v4.96f) a drawn mini CV: blue top with the user's own photo (or a person icon), white bottom with short lines
        '<button type="button" class="hv-rthumb" data-ract="edit" aria-label="' + esc(tr('Edit')) + ' ' + esc(name(r)) + '">' +
          miniCvHtml(r) + '</button>' +
        '<div class="hv-rinfo"><b class="hv-rname">' + esc(name(r)) + '</b>' +
          (day(r) ? '<span class="hv-rdate"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>' + esc(day(r)) + '</span>' : '') +
          '<span class="hv-racts"><button type="button" class="hv-redit" data-ract="edit" aria-label="' + esc(tr('Edit')) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"/></svg><span class="hv-elab">' + esc(tr('Edit')) + '</span></button>' +
          '<button type="button" class="hv-rmore" data-ract="more" aria-label="' + esc(tr('More options')) + '" aria-haspopup="menu"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button></span>' +
        '</div></div>').join('');
    fitRecentLabels();
  }
  // (v4.96k) a translated "Edit" that does not fit its button: show just the pencil (never a cut-off word)
  function fitRecentLabels() {
    requestAnimationFrame(() => $$('#recentList .hv-redit').forEach(b => {
      b.classList.remove('no-lab');
      const l = b.querySelector('.hv-elab');
      if (l && l.offsetParent && l.scrollWidth > l.clientWidth + 1) b.classList.add('no-lab');
    }));
  }
  if ('ResizeObserver' in window) new ResizeObserver(() => fitRecentLabels()).observe(document.documentElement);
  document.addEventListener('richlang', () => setTimeout(fitRecentLabels, 50));
  function wireRecent() {
    const menu = document.createElement('div');
    menu.className = 'hv-menu'; menu.hidden = true; menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    let menuFor = null;
    const closeMenu = () => { menu.hidden = true; menuFor = null; };
    const item = (act, label, d, cls) => '<button type="button" role="menuitem" data-mact="' + act + '"' + (cls ? ' class="' + cls + '"' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>' + esc(tr(label)) + '</button>';
    $('#recentList').addEventListener('click', e => {
      const b = e.target.closest('[data-ract]'); if (!b) return;
      const r = state.records.find(x => x.id === b.closest('.hv-rc').dataset.id); if (!r) return;
      if (b.dataset.ract === 'edit') { closeMenu(); recordAct('edit', r, b); return; }
      if (menuFor === r.id && !menu.hidden) { closeMenu(); return; }
      menu.innerHTML = item('edit', 'Edit', 'M3 17.25V21h3.75L17.8 9.94l-3.75-3.75zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z') +
        item('pdf', 'Download', 'M5 20h14v-2H5zM19 9h-4V3H9v6H5l7 7z') +
        (Android ? item('share', 'Share', 'M18 16a3 3 0 0 0-2.2 1l-7-4a3 3 0 0 0 0-2l7-4A3 3 0 1 0 15 5l-7 4a3 3 0 1 0 0 6l7 4a3 3 0 1 0 3-3z') : '') +
        item('copy', 'Duplicate', 'M16 1H4a2 2 0 0 0-2 2v14h2V3h12zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11z') +
        item('delete', 'Delete', 'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z', 'is-danger');
      menu.hidden = false; menuFor = r.id;
      const br = b.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
      menu.style.left = Math.max(8, Math.min(innerWidth - mw - 8, br.right - mw)) + 'px';
      menu.style.top = (br.bottom + mh + 8 < innerHeight ? br.bottom + 6 : Math.max(8, br.top - mh - 6)) + 'px';
      const first = menu.querySelector('button'); if (first) first.focus({ preventScroll: true });
    });
    menu.addEventListener('click', e => {
      const b = e.target.closest('[data-mact]'); if (!b) return;
      const r = state.records.find(x => x.id === menuFor); closeMenu();
      if (r) recordAct(b.dataset.mact, r, b);
    });
    document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('[data-ract="more"]')) closeMenu(); }, true);
    addEventListener('scroll', closeMenu, { passive: true });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
    new MutationObserver(closeMenu).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  }

  /* ---------------- Downloads (every PDF the user downloaded) ---------------- */
  let dlSeq = 0;
  function makeDlId() { return 'DL-' + Date.now().toString(36) + (++dlSeq).toString(36) + '-' + Math.random().toString(36).slice(2, 8); }   // (v4.97) never reused
  // (v4.96) a PDF tool finished a file: one full-screen ad when the user then leaves the PDF tools (never on the download itself)
  let ptDone = false;
  async function recordDownload(name, bytes, kind, cv, mime) {
    // (v4.96z) no full-screen ad after a download any more
    if (kind && kind !== 'cv') ptDone = true;
    try {
      const data = bytes instanceof Blob ? new Uint8Array(await bytes.arrayBuffer()) : bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes);
      await Store.putDownload({ id: makeDlId(), name, kind, mime: mime || 'application/pdf', size: data.length, createdAt: new Date().toISOString(), data, cv: cv || null });
      updateHome();
    } catch (e) { console.warn('Could not keep a copy in Downloads', e); }
  }
  // save a PDF to the device and keep a copy in Downloads when the save went through
  async function downloadPdf(name, bytes, kind, cv) {
    const ok = await saveFile(name, bytes, 'application/pdf');
    if (ok) await recordDownload(name, bytes, kind, cv);
    return ok;
  }
  // save any file and keep a copy in Downloads
  async function downloadFile(name, data, mime, kind, cv) {
    const ok = await saveFile(name, data, mime);
    if (ok) await recordDownload(name, data, kind, cv || null, mime);
    return ok;
  }
  const KIND_LABEL = { cv: 'CV', merge: 'Merged PDF', split: 'Split PDF', images: 'Image to PDF', toimage: 'PDF to Image', rotate: 'Rotated PDF', numbers: 'Page numbers' };
  const typeOf = d => d.mime || 'application/pdf';
  const typeLabel = d => typeOf(d) === 'image/png' ? 'PNG' : typeOf(d) === 'image/jpeg' ? 'JPG' : /wordprocessingml/.test(typeOf(d)) ? 'DOC' : 'PDF';
  function fmtSize(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  async function renderDownloads() {
    const hl = highlightNewDl; highlightNewDl = false;
    await renderDownloads0();
    // (v4.97) coming from "Go to Downloads": the CV just saved (the newest one) is highlighted for a moment
    if (hl) {
      const it = $('#dlList .dl-item');
      if (it) { it.classList.remove('dl-new'); void it.offsetWidth; it.classList.add('dl-new'); it.scrollIntoView({ block: 'center' }); setTimeout(() => it.classList.remove('dl-new'), 4200); }
    }
  }
  // (v4.97) Downloads redesigned: a filter (All / CVs / PDF tools) with the total, the files grouped by day,
  // each file as a card with its picture, name, a coloured type tag, time and size, Open and small icon buttons
  let dlFilter = 'all';
  const DLI = {
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5.5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/><path d="M8.3 10.8l7.4-4M8.3 13.2l7.4 4"/></svg>',
    save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/></svg>',
    del: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7M10 11v6M14 11v6"/></svg>',
    open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></svg>'
  };
  function dlDay(iso) {
    const d = new Date(iso), t = new Date(); t.setHours(0, 0, 0, 0);
    const k = new Date(d); k.setHours(0, 0, 0, 0);
    const diff = Math.round((t - k) / 86400000);
    return diff === 0 ? tr('Today') : diff === 1 ? tr('Yesterday') : d.toLocaleDateString(document.documentElement.lang || undefined, { day: 'numeric', month: 'long', year: k.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
  }
  async function renderDownloads0() {
    let list = [];
    try { list = await Store.downloads(); } catch (e) { toast(e.message, true); }
    const box = $('#dlList');
    if (!list.length) {
      box.innerHTML = '<div class="dl-empty"><span class="dl-e-art" aria-hidden="true"><svg viewBox="0 0 64 64"><rect x="14" y="8" width="36" height="46" rx="6" fill="#E6F7F0"/><path d="M22 20h20M22 27h20M22 34h12" stroke="#7FD8B4" stroke-width="3" stroke-linecap="round"/><circle cx="46" cy="46" r="12" fill="#12A150"/><path d="M46 40v11M41.5 46.5L46 51l4.5-4.5" stroke="#fff" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
        '<h2>' + esc(tr('No downloads yet')) + '</h2><p>' + esc(tr('PDFs you download (CVs and PDF tools) will appear here.')) + '</p>' +
        '<button type="button" class="btn btn-primary dl-e-go" data-dact="newcv">' + esc(tr('Create a CV')) + '</button></div>';
      return;
    }
    const cvs = list.filter(d => d.kind === 'cv').length, tools = list.length - cvs;
    if ((dlFilter === 'cv' && !cvs) || (dlFilter === 'tool' && !tools)) dlFilter = 'all';
    const shown = list.filter(d => dlFilter === 'all' || (dlFilter === 'cv' ? d.kind === 'cv' : d.kind !== 'cv'));
    const total = list.reduce((n, d) => n + (d.size || 0), 0);
    const chip = (id, label, n) => '<button type="button" class="dl-chip' + (dlFilter === id ? ' on' : '') + '" data-dlf="' + id + '"><span>' + esc(tr(label)) + '</span><b>' + n + '</b></button>';
    let h = '<div class="dl-bar"><div class="dl-chips">' + chip('all', 'All', list.length) + (cvs && tools ? chip('cv', 'CVs', cvs) + chip('tool', 'PDF tools', tools) : '') + '</div>' +
      '<span class="dl-total" dir="ltr">' + fmtSize(total) + '</span></div>';
    let day = '';
    shown.forEach(d => {
      const dd = dlDay(d.createdAt);
      if (dd !== day) { day = dd; h += '<h3 class="dl-day">' + esc(dd) + '</h3>'; }
      const isCv = d.kind === 'cv', tl = typeLabel(d), kind = isCv ? 'cv' : tl === 'PDF' ? 'pdf' : 'img';
      const time = new Date(d.createdAt).toLocaleTimeString(document.documentElement.lang || [], { hour: '2-digit', minute: '2-digit' });
      h += '<div class="dl-item dl-k-' + kind + '" data-dl="' + esc(d.id) + '">' +
        '<div class="dl-top">' +
          (isCv && d.cv ? '<span class="dl-thumb" aria-hidden="true">' + miniCvHtml(d.cv) + '</span>'
            : '<span class="dl-icon' + (tl === 'PDF' ? '' : ' img') + '" aria-hidden="true">' + tl + '</span>') +
          '<div class="dl-info"><div class="dl-name">' + esc(d.name) + '</div>' +
            '<div class="dl-meta"><span class="dl-tag">' + esc(tr(KIND_LABEL[d.kind] || 'PDF')) + '</span><span><bdi>' + esc(time) + '</bdi> · <bdi dir="ltr">' + fmtSize(d.size || 0) + '</bdi></span></div></div>' +
        '</div>' +
        '<div class="dl-acts">' +
          '<button class="dl-open" data-dact="open" type="button">' + DLI.open + '<span>' + esc(tr('Open')) + '</span></button>' +
          (Android ? '<button class="dl-ib" data-dact="share" type="button" aria-label="' + esc(tr('Share')) + '" title="' + esc(tr('Share')) + '">' + DLI.share + '</button>' : '') +
          '<button class="dl-ib" data-dact="save" type="button" aria-label="' + esc(tr('Save again')) + '" title="' + esc(tr('Save again')) + '">' + DLI.save + '</button>' +
          '<button class="dl-ib dl-del" data-dact="delete" type="button" aria-label="' + esc(tr('Delete')) + '" title="' + esc(tr('Delete')) + '">' + DLI.del + '</button>' +
        '</div></div>';
    });
    box.innerHTML = h;
  }
  function wireDownloads() {
    $('#dlList').addEventListener('click', async e => {
      const f = e.target.closest('[data-dlf]');
      if (f) { dlFilter = f.dataset.dlf; renderDownloads0(); return; }
      const btn = e.target.closest('[data-dact]');
      if (!btn) return;
      if (btn.dataset.dact === 'newcv') { const c = $('#homeCreate'); showView('home'); if (c) setTimeout(() => c.click(), 50); return; }
      const id = btn.closest('.dl-item').dataset.dl;
      const d = (await Store.downloads()).find(x => x.id === id);
      if (!d) { renderDownloads(); return; }
      const act = btn.dataset.dact;
      if (act === 'open') {
        if (Android) {
          const res = Android.viewFile(await toBase64(d.data, typeOf(d)), d.name, typeOf(d));
          if (!/^ok/.test(res)) toast('Could not open: ' + res.replace(/^error:/, ''), true);
        } else {
          const url = URL.createObjectURL(new Blob([d.data], { type: typeOf(d) }));
          const w = window.open(url, '_blank');
          if (!w) await saveFile(d.name, d.data, typeOf(d));
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
      } else if (act === 'share') withBusy(btn, null, () => shareFile(d.name, d.data, typeOf(d)));
      else if (act === 'save') withBusy(btn, null, () => saveFile(d.name, d.data, typeOf(d)));
      else if (act === 'delete') {
        if (!(await confirmBox('Delete this PDF?', 'It will be removed from the Downloads list in this app. A copy already saved in your phone\'s Download folder is not deleted.', 'Delete', 'Cancel', false, d.name, 'PDF'))) return;
        await Store.removeDownload(id);
        renderDownloads(); updateHome();
      }
    });
  }

  /* ---------------- PDF tools: merge, split, image to PDF ---------------- */
  let ptool = 'merge';
  const ptState = { merge: [], split: null, images: [], toimage: null, rotate: null, numbers: null };

  /* pdf.js (Mozilla, Apache 2.0) reads PDFs to turn pages into pictures. It is loaded
     only when needed: from js/vendor in the app, or from the copy inside the one-file version. */
  let pdfjsPromise = null;
  function loadPdfJs() {
    if (!pdfjsPromise) pdfjsPromise = (async () => {
      let main, worker;
      const inl = document.getElementById('pdfjs-main');
      if (inl) {
        const url = id => {
          const b64 = document.getElementById(id).textContent.trim(), bin = atob(b64), u = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
          return URL.createObjectURL(new Blob([u], { type: 'text/javascript' }));
        };
        main = url('pdfjs-main'); worker = url('pdfjs-worker');
      } else {
        main = new URL('js/vendor/pdfjs.module.js', location.href).href;
        worker = new URL('js/vendor/pdfjs.worker.module.js', location.href).href;
      }
      const lib = await import(main);
      lib.GlobalWorkerOptions.workerSrc = worker;
      return lib;
    })().catch(e => { pdfjsPromise = null; throw new Error('The PDF reader could not start on this device.'); });
    return pdfjsPromise;
  }
  async function renderPdfPage(doc, n, scale) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.floor(vp.width)); c.height = Math.max(1, Math.floor(vp.height));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, canvas: c, viewport: vp }).promise;
    page.cleanup();
    return c;
  }
  async function openWithPdfJs(f) {
    const lib = await loadPdfJs();
    const task = lib.getDocument({ data: f.bytes.slice() });
    const doc = await task.promise;
    doc.close = () => { try { task.destroy(); } catch (e) { /* already closed */ } };
    return doc;
  }
  function onePdfPicker(id, f) {
    return '<label class="btn btn-ghost btn-file">' + (f ? 'Choose another PDF' : 'Choose a PDF file') + '<input type="file" id="' + id + '" accept="application/pdf"></label>' +
      (f ? '<div class="pt-list"><div class="pt-row"><span class="dl-icon">PDF</span><span class="pt-name">' + esc(f.name) + '<small>' + f.pages + (f.pages === 1 ? ' page' : ' pages') + '</small></span></div></div>' : '');
  }
  function pagesField(id, f, val) {
    return '<div class="field"><label for="' + id + '">Pages</label><input id="' + id + '" data-pages inputmode="numeric" placeholder="1-3, 5" value="' + esc(val || ('1-' + f.pages)) + '"></div>' +
      '<p class="hint">All pages are filled in. Change it to choose pages, for example 1-3, 5.</p>';
  }
  const segOf = (attr, items, cur) => '<div class="seg" role="radiogroup">' + items.map(([v, l]) => '<button type="button" ' + attr + '="' + v + '" aria-checked="' + (String(cur) === String(v)) + '">' + l + '</button>').join('') + '</div>';
  function today() { return new Date().toISOString().slice(0, 10); }
  function baseName(n) { return String(n || 'file').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'file'; }
  async function readPdf(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      const doc = await window.PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
      return { name: file.name, bytes, pages: doc.getPageCount() };
    } catch (e) { throw new Error(file.name + ' could not be opened. It may be damaged or password protected.'); }
  }
  function moveBtns(i, n) {
    return '<button type="button" class="btn btn-quiet mini" data-pmove="-1" data-i="' + i + '"' + (i ? '' : ' disabled') + ' aria-label="Move up">↑</button>' +
      '<button type="button" class="btn btn-quiet mini" data-pmove="1" data-i="' + i + '"' + (i < n - 1 ? '' : ' disabled') + ' aria-label="Move down">↓</button>' +
      '<button type="button" class="icon-x" data-premove="' + i + '" aria-label="Remove">×</button>';
  }
  function renderPtool() {
    $$('#toolSwitch [data-ptool]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.ptool === ptool)));
    const P = $('#ptoolPanel');
    let h = '';
    if (ptool === 'merge') {
      const L = ptState.merge;
      h = '<h2 class="pt-h">Merge PDF</h2><p class="hint">Join several PDFs into one, in the order shown.</p>' +
        '<label class="btn btn-ghost btn-file">Add PDF files<input type="file" id="ptMergeInput" accept="application/pdf" multiple></label>' +
        '<div class="pt-list">' + L.map((f, i) => '<div class="pt-row"><span class="pt-cover" data-cover="' + i + '"><span class="dl-icon">PDF</span></span><span class="pt-name">' + esc(f.name) + '<small>' + f.pages + (f.pages === 1 ? ' page' : ' pages') + '</small></span>' + moveBtns(i, L.length) + '</div>').join('') + '</div>' +
        '<button type="button" class="btn btn-primary pt-go" id="ptMergeGo"' + (L.length < 2 ? ' disabled' : '') + '>Merge ' + (L.length || '') + ' PDFs</button>' +
        (L.length < 2 ? '<p class="hint">Add at least 2 PDF files.</p>' : '');
    } else if (ptool === 'split') {
      const f = ptState.split;
      h = '<h2 class="pt-h">Split PDF</h2><p class="hint">Take the pages you need out of a PDF and save them as a new PDF.</p>' +
        '<label class="btn btn-ghost btn-file">' + (f ? 'Choose another PDF' : 'Choose a PDF file') + '<input type="file" id="ptSplitInput" accept="application/pdf"></label>' +
        (f ? '<div class="pt-list"><div class="pt-row"><span class="dl-icon">PDF</span><span class="pt-name">' + esc(f.name) + '<small>' + f.pages + (f.pages === 1 ? ' page' : ' pages') + '</small></span></div></div>' +
          gridHtml('Tap pages to keep or leave out.') +
          '<div class="field"><label for="ptPages">Pages to keep</label><input id="ptPages" inputmode="numeric" placeholder="1-3, 5" value="' + esc(ptState.splitPages || ('1-' + f.pages)) + '"></div>' +
          '<p class="hint">Use commas and dashes: 1-3, 5 keeps pages 1, 2, 3 and 5.</p>' +
          '<label class="check"><input type="checkbox" id="ptEach"' + (ptState.splitEach ? ' checked' : '') + '> Save each page as its own PDF</label>' +
          '<button type="button" class="btn btn-primary pt-go" id="ptSplitGo">Split PDF</button>' : '');
    } else if (ptool === 'toimage') {
      const f = ptState.toimage, o = ptState.toimageOpt || (ptState.toimageOpt = { fmt: 'jpg', dpi: 150 });
      h = '<h2 class="pt-h">PDF to Image</h2><p class="hint">Save PDF pages as pictures (JPG or PNG), one picture per page.</p>' + onePdfPicker('ptToImgInput', f) +
        (f ? gridHtml('Tap pages to choose which become pictures.') + pagesField('ptToImgPages', f, ptState.toimagePages) +
          '<div class="field"><span class="label">Picture type</span>' + segOf('data-imgfmt', [['jpg', 'JPG (smaller)'], ['png', 'PNG (sharpest)']], o.fmt) + '</div>' +
          '<div class="field"><span class="label">Quality</span>' + segOf('data-imgdpi', [['100', 'Normal'], ['150', 'High'], ['220', 'Very high']], o.dpi) + '</div>' +
          '<button type="button" class="btn btn-primary pt-go" id="ptToImgGo">Save as pictures</button>' : '');
    } else if (ptool === 'rotate') {
      const f = ptState.rotate;
      h = '<h2 class="pt-h">Rotate PDF</h2><p class="hint">Turn pages that are sideways or upside down.</p>' + onePdfPicker('ptRotInput', f) +
        (f ? gridHtml('Tap pages to turn them. You see the result here.') + pagesField('ptRotPages', f, ptState.rotatePages) +
          '<div class="field"><span class="label">Turn</span>' + segOf('data-rotangle', [['90', 'Right \u21bb'], ['180', 'Upside down'], ['270', 'Left \u21ba']], ptState.rotAngle || 90) + '</div>' +
          '<button type="button" class="btn btn-primary pt-go" id="ptRotGo">Rotate PDF</button>' : '');
    } else if (ptool === 'numbers') {
      const f = ptState.numbers, o = ptState.numOpt || (ptState.numOpt = { pos: 'bc', style: 'n', start: 1, skip: false });
      h = '<h2 class="pt-h">Add Page Numbers</h2><p class="hint">Print page numbers on every page of a PDF.</p>' + onePdfPicker('ptNumInput', f) +
        (f ? gridHtml('The numbers show as they will be printed.') + '<div class="field"><span class="label">Position</span>' + segOf('data-numpos', [['bc', 'Bottom centre'], ['br', 'Bottom right'], ['tr', 'Top right']], o.pos) + '</div>' +
          '<div class="field"><span class="label">Style</span>' + segOf('data-numstyle', [['n', '1'], ['of', 'Page 1 of ' + f.pages]], o.style) + '</div>' +
          '<div class="field"><label for="ptNumStart">First number</label><input id="ptNumStart" type="number" min="0" max="9999" value="' + o.start + '"></div>' +
          '<label class="check"><input type="checkbox" id="ptNumSkip"' + (o.skip ? ' checked' : '') + '> No number on the first page (cover)</label>' +
          '<button type="button" class="btn btn-primary pt-go" id="ptNumGo">Add page numbers</button>' : '');
    } else {
      const L = ptState.images;
      h = '<h2 class="pt-h">Image to PDF</h2><p class="hint">Turn photos or scans into one PDF, one image per A4 page.</p>' +
        '<label class="btn btn-ghost btn-file">Add images<input type="file" id="ptImgInput" accept="image/*" multiple></label>' +
        '<div class="pt-list">' + L.map((f, i) => '<div class="pt-row"><img class="pt-thumb" alt="" src="' + f.src + '"><span class="pt-name">' + esc(f.name) + '</span>' + moveBtns(i, L.length) + '</div>').join('') + '</div>' +
        (L.length ? '<div class="pt-preview"><div class="pt-prev-head"><b>Preview</b><small>One picture on each A4 page.</small></div><div class="pt-pages pt-a4" style="--m:' + ((ptState.imgMargin == null ? 10 : ptState.imgMargin) / 210 * 100) + '%">' +
          L.map((f, i) => '<div class="pt-page"><span class="pt-sheet"><img alt="" src="' + f.src + '"></span><span class="pt-pn">' + (i + 1) + '</span></div>').join('') + '</div></div>' : '') +
        (L.length ? '<div class="field"><span class="label">Page margin</span>' + '<div class="seg" role="radiogroup">' +
          [['0', 'None'], ['10', 'Small'], ['20', 'Large']].map(([v, l]) => '<button type="button" data-imgmargin="' + v + '" aria-checked="' + (String(ptState.imgMargin == null ? 10 : ptState.imgMargin) === v) + '">' + l + '</button>').join('') + '</div></div>' : '') +
        '<button type="button" class="btn btn-primary pt-go" id="ptImgGo"' + (L.length ? '' : ' disabled') + '>Make PDF' + (L.length ? ' (' + L.length + (L.length === 1 ? ' page)' : ' pages)') : '') + '</button>';
    }
    P.innerHTML = h;
    if (ptState[ptool] && ['split', 'toimage', 'rotate', 'numbers'].includes(ptool)) fillGrid(ptState[ptool]);
    if (ptool === 'merge') ptState.merge.forEach((f, i) => pdfThumbs(f).then(th => {
      const c = $('#ptoolPanel [data-cover="' + i + '"]');
      if (c && th[0] && ptState.merge[i] === f) c.innerHTML = '<img class="pt-thumb" alt="" src="' + th[0].url + '">';
    }).catch(() => {}));
  }
  /* ---------- previews: small pictures of the pages, for every PDF tool ---------- */
  const THUMB_MAX = 24;                                   // pages drawn in a preview (the rest are counted)
  const thumbCache = new WeakMap();                       // file -> Promise<[{url, w, h}]>
  function pdfThumbs(f) {
    if (!thumbCache.has(f)) thumbCache.set(f, (async () => {
      const doc = await openWithPdfJs(f), out = [];
      try {
        const n = Math.min(doc.numPages, THUMB_MAX);
        for (let i = 1; i <= n; i++) {
          const pg = await doc.getPage(i), vp = pg.getViewport({ scale: 1 });
          const c = await renderPdfPage(doc, i, 170 / Math.max(vp.width, 1));
          out.push({ url: c.toDataURL('image/jpeg', .82), w: c.width, h: c.height });
          c.width = c.height = 1;
        }
      } finally { doc.close(); }
      return out;
    })().catch(e => { thumbCache.delete(f); throw e; }));
    return thumbCache.get(f);
  }
  // pages as a set of indexes from a "1-3, 5" box (bad text: none chosen)
  function pageSet(text, max) { try { return new Set(parsePages(text, max)); } catch (e) { return new Set(); } }
  // [0,1,2,4] -> "1-3, 5"
  function pagesText(set) {
    const a = [...set].sort((x, y) => x - y), out = [];
    for (let i = 0; i < a.length; i++) {
      let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
      out.push(j > i ? (a[i] + 1) + '-' + (a[j] + 1) : String(a[i] + 1)); i = j;
    }
    return out.join(', ');
  }
  function gridHtml(note) { return '<div class="pt-preview"><div class="pt-prev-head"><b>Preview</b><small>' + note + '</small></div><div class="pt-pages" id="ptGrid" aria-live="polite"><div class="pt-loading"><i></i>Loading pages…</div></div></div>'; }
  // fill the grid with the pages of f; the look of each page follows the tool's settings (see updateGrid)
  async function fillGrid(f) {
    const box = $('#ptGrid');
    if (!box) return;
    try {
      const th = await pdfThumbs(f);
      if (!document.body.contains(box)) return;
      box.innerHTML = th.map((t, i) => '<button type="button" class="pt-page" data-pg="' + i + '"><span class="pt-sheet"><img alt="" src="' + t.url + '" width="' + t.w + '" height="' + t.h + '"><i class="pt-num" data-no-i18n></i></span><span class="pt-pn">' + (i + 1) + '</span></button>').join('') +
        (f.pages > th.length ? '<div class="pt-more">+ ' + (f.pages - th.length) + '</div>' : '');
      updateGrid();
    } catch (e) { box.innerHTML = '<p class="hint">' + esc(e.message) + '</p>'; }
  }
  const GRID_FIELD = { split: 'ptPages', toimage: 'ptToImgPages', rotate: 'ptRotPages' };
  function updateGrid() {
    const box = $('#ptGrid');
    if (!box) return;
    const f = ptState[ptool], cells = $$('.pt-page', box);
    if (!f || !cells.length) return;
    const fld = GRID_FIELD[ptool] && $('#' + GRID_FIELD[ptool]);
    const on = fld ? pageSet(fld.value, f.pages) : null;
    cells.forEach(c => {
      const i = +c.dataset.pg, sel = !on || on.has(i);
      c.classList.toggle('is-on', !!on && sel);
      c.classList.toggle('is-off', !!on && !sel);
      c.setAttribute('aria-pressed', String(!!on && sel));
      const sheet = $('.pt-sheet', c), num = $('.pt-num', c);
      const ang = ptool === 'rotate' && sel ? (ptState.rotAngle || 90) : 0;
      sheet.style.transform = ang ? 'rotate(' + ang + 'deg)' + (ang % 180 ? ' scale(.72)' : '') : '';
      if (ptool === 'numbers') {
        const o = ptState.numOpt, skip = o.skip && i === 0, n = (+o.start || 0) + i - (o.skip ? 1 : 0);
        num.hidden = skip; num.className = 'pt-num at-' + o.pos;
        num.textContent = o.style === 'of' ? 'Page ' + n + ' of ' + ((+o.start || 0) + f.pages - 1 - (o.skip ? 1 : 0)) : String(n);
      } else num.hidden = true;
    });
  }
  // "1-3, 5" -> [0,1,2,4]
  function parsePages(text, max) {
    const out = [];
    String(text || '').split(/[,\s]+/).filter(Boolean).forEach(part => {
      const m = /^(\d+)(?:-(\d+))?$/.exec(part);
      if (!m) throw new Error('"' + part + '" is not a page or a range like 2-4.');
      let a = +m[1], b = m[2] ? +m[2] : a;
      if (a > b) [a, b] = [b, a];
      if (a < 1 || b > max) throw new Error('Pages must be between 1 and ' + max + '.');
      for (let p = a; p <= b; p++) if (!out.includes(p - 1)) out.push(p - 1);
    });
    if (!out.length) throw new Error('Enter the pages to keep.');
    return out;
  }
  async function imageToJpeg(file) {
    const src = await readFile(file);
    const im = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error(file.name + ' could not be opened. Use JPG or PNG.')); i.src = src; });
    const max = 2200, s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(im, 0, 0, c.width, c.height);
    return { name: file.name, src: c.toDataURL('image/jpeg', 0.86), w: c.width, h: c.height };
  }
  function wirePtools() {
    $('#toolSwitch').addEventListener('click', e => { const b = e.target.closest('[data-ptool]'); if (b) { ptool = b.dataset.ptool; renderPtool(); } });
    const P = $('#ptoolPanel');
    P.addEventListener('change', async e => {
      const t = e.target;
      if (t.id === 'ptEach') { ptState.splitEach = t.checked; return; }
      if (t.id === 'ptNumSkip') { ptState.numOpt.skip = t.checked; updateGrid(); return; }
      if (t.type !== 'file' || !t.files.length) return;
      const files = [...t.files]; t.value = '';
      try {
        if (t.id === 'ptMergeInput') for (const f of files) ptState.merge.push(await readPdf(f));
        else if (t.id === 'ptSplitInput') { ptState.split = await readPdf(files[0]); ptState.splitPages = ''; }
        else if (t.id === 'ptImgInput') for (const f of files) ptState.images.push(await imageToJpeg(f));
        else if (t.id === 'ptToImgInput') { ptState.toimage = await readPdf(files[0]); ptState.toimagePages = ''; }
        else if (t.id === 'ptRotInput') { ptState.rotate = await readPdf(files[0]); ptState.rotatePages = ''; }
        else if (t.id === 'ptNumInput') ptState.numbers = await readPdf(files[0]);
      } catch (err) { toast(err.message, true); }
      renderPtool();
    });
    P.addEventListener('input', e => {
      const t = e.target;
      if (t.id === 'ptPages') ptState.splitPages = t.value;
      else if (t.id === 'ptToImgPages') ptState.toimagePages = t.value;
      else if (t.id === 'ptRotPages') ptState.rotatePages = t.value;
      else if (t.id === 'ptNumStart') ptState.numOpt.start = Math.max(0, parseInt(t.value, 10) || 0);
      updateGrid();
    });
    P.addEventListener('click', async e => {
      const t = e.target;
      const list = ptool === 'merge' ? ptState.merge : ptState.images;
      let b;
      if ((b = t.closest('[data-pmove]'))) { const i = +b.dataset.i, j = i + (+b.dataset.pmove); [list[i], list[j]] = [list[j], list[i]]; renderPtool(); return; }
      if ((b = t.closest('[data-premove]'))) { list.splice(+b.dataset.premove, 1); renderPtool(); return; }
      if ((b = t.closest('[data-imgmargin]'))) { ptState.imgMargin = +b.dataset.imgmargin; renderPtool(); return; }
      if ((b = t.closest('#ptGrid .pt-page'))) {                  // tap a page: choose it or leave it out
        const fld = GRID_FIELD[ptool] && $('#' + GRID_FIELD[ptool]), f = ptState[ptool];
        if (!fld || !f) return;
        const set = pageSet(fld.value, f.pages), i = +b.dataset.pg;
        if (set.has(i)) { if (set.size > 1) set.delete(i); else { toast('Keep at least one page.'); return; } } else set.add(i);
        fld.value = pagesText(set);
        fld.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      const pick = (attr, set) => { const x = t.closest('[' + attr + ']'); if (!x) return false; set(x.getAttribute(attr)); $$('[' + attr + ']', P).forEach(y => y.setAttribute('aria-checked', String(y === x))); return true; };
      if (pick('data-imgfmt', v => { ptState.toimageOpt.fmt = v; })) return;
      if (pick('data-imgdpi', v => { ptState.toimageOpt.dpi = +v; })) return;
      if (pick('data-rotangle', v => { ptState.rotAngle = +v; })) { updateGrid(); return; }
      if (pick('data-numpos', v => { ptState.numOpt.pos = v; })) { updateGrid(); return; }
      if (pick('data-numstyle', v => { ptState.numOpt.style = v; })) { updateGrid(); return; }
      const L = window.PDFLib;
      if (t.id === 'ptMergeGo') withBusy(t, 'Merging…', async () => {
        const out = await L.PDFDocument.create();
        for (const f of ptState.merge) {
          const src = await L.PDFDocument.load(f.bytes, { ignoreEncryption: true });
          (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
        }
        const bytes = await out.save();
        if (await downloadPdf('Merged_' + today() + '.pdf', bytes, 'merge')) { ptState.merge = []; renderPtool(); }
      });
      else if (t.id === 'ptSplitGo') withBusy(t, 'Splitting…', async () => {
        const f = ptState.split;
        let pages;
        try { pages = parsePages($('#ptPages').value, f.pages); } catch (err) { toast(err.message, true); return; }
        const src = await L.PDFDocument.load(f.bytes, { ignoreEncryption: true });
        const groups = ptState.splitEach ? pages.map(p => [p]) : [pages];
        if (groups.length > 20) { toast('Up to 20 separate files at a time. Choose fewer pages.', true); return; }
        const pagesVal = $('#ptPages').value;
        if (groups.length > 1) showLoader('Saving ' + groups.length + ' PDFs…', ['Splitting the pages…', 'Saving the files…']);
        await saveMany('pdf', async () => {
          for (const gp of groups) {
            const out = await L.PDFDocument.create();
            (await out.copyPages(src, gp)).forEach(p => out.addPage(p));
            const label = gp.length === 1 ? 'page_' + (gp[0] + 1) : 'pages_' + pagesVal.replace(/\s+/g, '').replace(/[^0-9,-]/g, '').replace(/,/g, '_');
            if (!(await downloadPdf(baseName(f.name) + '_' + label + '.pdf', await out.save(), 'split'))) break;
          }
        });
      });
      else if (t.id === 'ptToImgGo') withBusy(t, 'Saving pictures…', async () => {
        const f = ptState.toimage, o = ptState.toimageOpt;
        let pages;
        try { pages = parsePages($('#ptToImgPages').value, f.pages); } catch (err) { toast(err.message, true); return; }
        if (pages.length > 30) { toast('Up to 30 pages at a time. Choose fewer pages.', true); return; }
        const doc = await openWithPdfJs(f);
        const mime = o.fmt === 'png' ? 'image/png' : 'image/jpeg', ext = o.fmt === 'png' ? 'png' : 'jpg';
        if (pages.length > 1) showLoader('Saving ' + pages.length + ' pictures…', ['Drawing the pages…', 'Saving the pictures…']);
        await saveMany('image', async () => {
          for (const p of pages) {
            t.textContent = 'Saving page ' + (p + 1) + '…';
            const c = await renderPdfPage(doc, p + 1, o.dpi / 72);
            const blob = await new Promise(r => c.toBlob(r, mime, 0.9));
            c.width = c.height = 1;                                    // free memory on phones
            if (!(await downloadFile(baseName(f.name) + '_page_' + (p + 1) + '.' + ext, blob, mime, 'toimage'))) break;
          }
        });
        doc.close();
      });
      else if (t.id === 'ptRotGo') withBusy(t, 'Rotating…', async () => {
        const f = ptState.rotate;
        let pages;
        try { pages = parsePages($('#ptRotPages').value, f.pages); } catch (err) { toast(err.message, true); return; }
        const doc = await L.PDFDocument.load(f.bytes, { ignoreEncryption: true });
        const add = ptState.rotAngle || 90;
        pages.forEach(i => { const pg = doc.getPage(i); pg.setRotation(L.degrees((pg.getRotation().angle + add) % 360)); });
        await downloadPdf(baseName(f.name) + '_rotated.pdf', await doc.save(), 'rotate');
      });
      else if (t.id === 'ptNumGo') withBusy(t, 'Adding numbers…', async () => {
        const f = ptState.numbers, o = ptState.numOpt;
        const doc = await L.PDFDocument.load(f.bytes, { ignoreEncryption: true });
        const font = await doc.embedFont(L.StandardFonts.Helvetica);
        const total = doc.getPageCount(), size = 10, m = 28;
        doc.getPages().forEach((pg, i) => {
          if (o.skip && i === 0) return;
          const num = o.start + i - (o.skip ? 1 : 0);
          const label = o.style === 'of' ? 'Page ' + num + ' of ' + (o.start + total - 1 - (o.skip ? 1 : 0)) : String(num);
          const tw = font.widthOfTextAtSize(label, size);
          const { width: w, height: h } = pg.getSize();
          const r = ((pg.getRotation().angle % 360) + 360) % 360;
          const VW = r === 90 || r === 270 ? h : w, VH = r === 90 || r === 270 ? w : h;      // page as it is seen
          const vx = o.pos === 'bc' ? VW / 2 - tw / 2 : VW - m - tw;
          const vy = o.pos === 'tr' ? VH - m : m - 4;
          // map the visible position back onto the page's own coordinates
          const pt = r === 90 ? [w - vy, vx] : r === 180 ? [w - vx, h - vy] : r === 270 ? [vy, h - vx] : [vx, vy];
          pg.drawText(label, { x: pt[0], y: pt[1], size, font, color: L.rgb(0.25, 0.27, 0.33), rotate: L.degrees(r) });
        });
        await downloadPdf(baseName(f.name) + '_numbered.pdf', await doc.save(), 'numbers');
      });
      else if (t.id === 'ptImgGo') withBusy(t, 'Making PDF…', async () => {
        const out = await L.PDFDocument.create();
        const W = 595.28, H = 841.89, m = (ptState.imgMargin == null ? 10 : ptState.imgMargin) * 2.8346;
        for (const im of ptState.images) {
          const img = await out.embedJpg(im.src);
          const page = out.addPage([W, H]);
          const s = Math.min((W - 2 * m) / im.w, (H - 2 * m) / im.h);
          const w = im.w * s, h = im.h * s;
          page.drawImage(img, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h });
        }
        if (await downloadPdf('Images_' + today() + '.pdf', await out.save(), 'images')) { ptState.images = []; renderPtool(); }
      });
    });
  }

  /* ---------------- loading screen ---------------- */
  const splashStart = Date.now();
  function hideSplash() {
    const sp = $('#splash');
    if (!sp || sp.classList.contains('out')) return;
    setTimeout(() => {
      sp.classList.add('out');
      setTimeout(() => { sp.hidden = true; }, 450);
    }, Math.max(0, (window.RICH_SPLASH_MS || 3000) - (Date.now() - (window.RICH_SPLASH_T0 || splashStart))));   // the loading screen runs for 3 seconds
  }
  setTimeout(hideSplash, 8000);                                // never stay on the loading screen


  /* ---------------- My CVs ---------------- */
  async function refreshList() {
    try { state.records = await Store.all(); } catch (e) { state.records = []; toast(e.message, true); }
    setCount('#cvCount', state.records.length);
    renderCVList();
    if (currentView === 'home') updateHome();
  }
  function renderCVList() {
    const q = $('#search').value.trim().toLowerCase();
    const list = state.records.filter(r => !q || (r.fullName || '').toLowerCase().includes(q) || (r.title || '').toLowerCase().includes(q));
    const box = $('#cvList');
    if (!state.records.length) {
      box.innerHTML = '<div class="empty"><h2>No CVs saved yet</h2><p>Create a CV. It saves itself while you edit and will appear here.</p></div>';
      return;
    }
    if (!list.length) { box.innerHTML = '<div class="empty"><h2>No match for “' + esc(q) + '”</h2><p>Search by name or job title.</p></div>'; return; }
    const dname = r => (Pdf.designs().find(d => d.id === themeOf(r).design) || Pdf.designs()[0]).name;
    const icon = d => '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="' + d + '"/></svg>';
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    box.innerHTML = list.map(r => {
        const ini = (r.fullName || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('');
        const jobs = (r.experience || []).filter(e => e.title).length, skills = (r.skills || []).length;
        return '<div class="record" data-id="' + esc(r.id) + '">' +
          '<div class="rc-top">' +
            (r.photo ? '<img class="thumb" alt="" src="' + r.photo + '">' : '<span class="thumb" aria-hidden="true">' + esc(ini) + '</span>') +
            '<div class="rc-info"><div class="r-name">' + esc(r.fullName || 'No name') + '</div>' +
              '<div class="rc-title">' + esc(r.title || 'No job title') + '</div>' +
              // (v4.96h) one compact line: design · jobs · skills · date
              '<div class="rc-meta"><span class="rc-chip">' + esc(dname(r)) + '</span><span class="rc-count">' + plural(jobs, 'job') + ' · ' + plural(skills, 'skill') + '</span>' +
              (isNaN(new Date(r.updatedAt)) ? '' : '<span class="rc-date">' + esc(new Date(r.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })) + '</span>') + '</div></div>' +
          '</div>' +
          '<div class="r-actions">' +
            '<button class="btn btn-tonal btn-small" data-act="edit" type="button">' + icon('M3 17.25V21h3.75L17.8 9.94l-3.75-3.75zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z') + 'Edit</button>' +
            '<button class="btn btn-primary btn-small" data-act="pdf" type="button">' + icon('M5 20h14v-2H5zM19 9h-4V3H9v6H5l7 7z') + 'Download</button>' +
            '<span class="rc-icons">' +
            (Android ? '<button class="icon-btn" data-act="share" type="button" aria-label="Share" title="Share">' + icon('M18 16.1c-.8 0-1.4.3-2 .8l-7.1-4.2c.1-.2.1-.5.1-.7s0-.5-.1-.7L16 7.2c.5.5 1.2.8 2 .8 1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3c0 .2 0 .5.1.7L8 8.8C7.5 8.3 6.8 8 6 8c-1.7 0-3 1.3-3 3s1.3 3 3 3c.8 0 1.5-.3 2-.8l7.1 4.2c-.1.2-.1.4-.1.6 0 1.6 1.3 2.9 2.9 2.9s2.9-1.3 2.9-2.9-1.2-2.9-2.8-2.9z') + '</button>' : '') +
            '<button class="icon-btn" data-act="copy" type="button" aria-label="Duplicate" title="Duplicate">' + icon('M16 1H4a2 2 0 0 0-2 2v14h2V3h12zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11z') + '</button>' +
            '<button class="icon-btn rc-del" data-act="delete" type="button" aria-label="Delete" title="Delete">' + icon('M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z') + '</button>' +
            '</span>' +
          '</div></div>';
      }).join('');
  }
  let currentView = 'home';
  const viewHistory = [];               // screens to go back to with the Back button
  // (v4.96) ad unlocks of Pro templates are only for the time the user is working on that CV
  function endSessionUnlocks() {
    const U = state.theme && state.theme.unlocks;
    if (isPro() || !Array.isArray(U) || !U.some(k => String(k).startsWith('d:'))) return;
    state.theme = Object.assign({}, state.theme, { unlocks: U.filter(k => !String(k).startsWith('d:')) });
  }
  // back in the editor without opening the CV again (e.g. the Back button from My CVs) on a locked Pro template: ask for the ad
  async function guardProCv() {
    const P = window.RichPremium, th = state.theme;
    if (!P || isPro() || !th || !P.isLocked(th.design) || P.unlockOk(th, 'd:' + th.design) || guardProCv.busy) return;
    guardProCv.busy = true;
    try {
      if (await (P.directAd || P.rewardGate)('template')) { state.theme = Object.assign({}, th, { unlocks: P.stampUnlock(th, 'd:' + th.design) }); renderTool(); schedulePreview(0); }
      else showView('home');
    } finally { guardProCv.busy = false; }
  }
  function showView(name, back) {
    if (name === 'home') viewHistory.length = 0;
    else if (!back && name !== currentView) {
      const at = viewHistory.indexOf(name);
      if (at >= 0) viewHistory.length = at;            // already on the path: go back to it instead of looping
      else viewHistory.push(currentView);
    }
    const prev = currentView;
    const isEd = v => v === 'edit' || v === 'design';
    // (v4.96) leaving the CV ends its ad unlock: editing it again needs a new rewarded ad (see openCV)
    if (isEd(prev) && ['home', 'list', 'downloads', 'tools'].includes(name)) endSessionUnlocks();
    if (isEd(name) && !isEd(prev)) setTimeout(guardProCv, 0);
    if (prev === 'design' && name !== 'design') endTry();
    if (name === 'design' && prev !== 'design') [60, 400].forEach(t => setTimeout(centerChosenTpl, t));   // (v4.96) once the row has its size
    if (prev === 'tools' && name !== 'tools' && ptDone) { ptDone = false; if (window.RichAds && window.RichAds.atBreak) window.RichAds.atBreak('pdf_tool_done', 60); }
    if ((prev === 'edit' || prev === 'design') && name !== 'edit' && name !== 'design') keepWork().then(r => { if (r) toast('Your CV is saved in My CVs.'); });
    currentView = name;
    const editor = name === 'edit' || name === 'design';
    document.body.classList.toggle('can-back', name !== 'home');
    $('#goBack').tabIndex = name === 'home' ? -1 : 0;
    $$('.view-tab').forEach(t => t.classList.toggle('is-active', t.dataset.view === name));
    document.body.dataset.view = name;
    document.body.classList.toggle('in-editor', editor);
    document.body.classList.toggle('view-edit', name === 'edit');
    document.body.classList.toggle('view-design', name === 'design');
    $('#view-edit').hidden = !editor;
    $('#view-list').hidden = name !== 'list';
    $('#view-home').hidden = name !== 'home';
    $('#view-downloads').hidden = name !== 'downloads';
    $('#view-tools').hidden = name !== 'tools';
    if (name === 'home') { fitBigTitles(); setTimeout(fitBigTitles, 400); }
    window.scrollTo({ top: 0 });
    animateView(prev, name, back);
    if (editor) { schedulePreview(0); if (name === 'design') renderTool(); }
    if (name === 'home') {
      updateHome();
      const h = $('#view-home'); h.classList.remove('hc-anim'); void h.offsetWidth; h.classList.add('hc-anim');
      clearTimeout(showView.t); showView.t = setTimeout(() => h.classList.remove('hc-anim'), 1400);
    }
    if (name === 'downloads') renderDownloads();
    if (name === 'tools') renderPtool();
    if (name === 'edit' && state.fixPending) goToFirstError();
    else if (name !== 'design') clearEditFlag();
  }
  // missing details found while in Design: highlight the Edit button, then lead to the first red field
  function flagEditTab() {
    state.fixPending = true;
    const tab = $('.view-tab[data-view="edit"]');
    tab.classList.remove('needs-fix'); void tab.offsetWidth; tab.classList.add('needs-fix');
    tab.setAttribute('aria-label', 'Edit: some details need fixing');
    $('#toast').classList.add('tap-to-edit');
  }
  function clearEditFlag() {
    state.fixPending = false;
    const tab = $('.view-tab[data-view="edit"]');
    tab.classList.remove('needs-fix'); tab.removeAttribute('aria-label');
    $('#toast').classList.remove('tap-to-edit');
  }
  function goToFirstError() {
    clearEditFlag();
    $('#toast').classList.remove('show');
    setTimeout(() => {
      const f = $('#cvForm .field.invalid');
      if (!f) return;
      f.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const el = $('input, textarea, .dd-btn', f);
      if (el) setTimeout(() => el.focus({ preventScroll: true }), 350);
    }, 380);
  }
  // slide the new screen in; Edit <-> Design share one screen, so only the panel changes there
  function animateView(from, to, back) {
    if (from === to) return;
    const sec = { edit: '#view-edit', design: '#view-edit', list: '#view-list', home: '#view-home', downloads: '#view-downloads', tools: '#view-tools' };
    const el = $(sec[to]);
    if (!el || sec[from] === sec[to]) return;
    el.classList.remove('enter-fwd', 'enter-back');
    void el.offsetWidth;
    el.classList.add(back ? 'enter-back' : 'enter-fwd');
    el.addEventListener('animationend', () => el.classList.remove('enter-fwd', 'enter-back'), { once: true });
  }
  // Settings page slides out to the right
  function closeSettings() {
    const sp = $('#settings');
    if (sp.hidden || sp.classList.contains('closing')) return;
    const b = $('#closeSettings'); b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
    sp.classList.add('closing');
    document.body.classList.remove('settings-open');
    const done = () => { sp.hidden = true; sp.classList.remove('closing'); };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    else setTimeout(done, 290);
  }
  function goBack() {
    const b = $('#goBack');
    b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
    if (currentView === 'edit' && window.RichWizard && window.RichWizard.back()) return;   // (v4.17) the Edit tab's pages: one page back first
    if (currentView !== 'home') showView(viewHistory.pop() || 'home', true);
  }
  async function openCV(id, askAd) {
    if (state.dirty && state.currentId !== id &&
        !(await confirmBox('Discard unsaved changes?', 'The open CV has changes that are not saved. Open the other CV anyway?', 'Discard changes'))) return;
    const r = await Store.get(id);
    if (!r) { toast('That CV no longer exists.', true); return refreshList(); }
    // (v4.96) a CV on a Pro template (without Pro): every time it is opened again for editing, one rewarded ad first.
    // The unlock lasts while the user works on it; leaving it (Home, My CVs, Downloads, PDF tools) ends it.
    if (askAd) {
      const P = window.RichPremium, th = themeOf(r);
      if (P && !P.isPremium() && P.isLocked(th.design)) {
        if (!(await (P.directAd || P.rewardGate)('template'))) return;     // (v4.97) the ad straight away; the reason is shown by premium.js
        r.theme = Object.assign({}, r.theme || {}, { unlocks: P.stampUnlock(th, 'd:' + th.design) });
        try { await Store.put(r); } catch (e) { /* still opens */ }
        setTimeout(() => toast('Template unlocked. You can edit this CV now.'), 500);
      }
    }
    setCV(r);
    state.currentId = r.id; state.dirty = false;
    updateHeader(); showView('edit');
  }

  /* ---------------- settings: logo + backup ---------------- */
  function headerLogo() { return state.logo === window.RICH_LOGO && window.RICH_LOGO_HEADER ? window.RICH_LOGO_HEADER : state.logo; }
  function applyLogo() { $('#brandLogo').src = headerLogo(); schedulePreview(0); }
  async function exportBackup() {
    const payload = { app: 'rich-cv-maker', version: 1, exportedAt: new Date().toISOString(), cvs: await Store.all() };
    await saveFile('Rich_CV_backup_' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(payload), 'application/json');
  }
  async function importBackup(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { throw new Error('This file is not a valid backup.'); }
    const list = Array.isArray(data) ? data : data && (data.cvs || data.candidates);
    if (!Array.isArray(list)) throw new Error('No CVs found in this file.');
    let n = 0;
    for (let r of list) {
      if (!r || !r.id || !r.fullName) continue;
      // (v4.97) a CV in the file with the number of a different CV on this phone is kept as its own CV (new number);
      // the same CV (same creation time) only replaces the phone's copy when it is newer
      const mine = await Store.get(r.id).catch(() => null);
      if (mine && mine.createdAt !== r.createdAt) r = Object.assign({}, r, { id: makeId() });
      else if (mine && (r.updatedAt || '') <= (mine.updatedAt || '')) continue;
      await Store.put(r); n++;
      state.records.push(r);
    }
    await refreshList();
    toast(n + (n === 1 ? ' CV' : ' CVs') + ' loaded.');
  }

  /* ---------------- wiring ---------------- */
  function wire() {
    form.addEventListener('input', e => {
      const f = e.target.closest('.field.invalid');
      if (f) { f.classList.remove('invalid'); const er = $('.error', f); if (er) er.remove(); }
      if (e.target.tagName === 'TEXTAREA') updateCounters();
      if (e.target.id !== 'skillInput') markDirty();
    });
    form.addEventListener('change', e => { if (e.target.id !== 'skillInput') markDirty(); });
    $$('[data-format]', form).forEach(el => el.addEventListener('blur', () => {
      const v = el.dataset.format === 'passport' ? el.value.toUpperCase().replace(/\s+/g, '') : nameCase(el.value);
      if (v !== el.value) { el.value = v; markDirty(); }
    }));
    $('#email').addEventListener('blur', e => { e.target.value = e.target.value.trim().toLowerCase(); });

    form.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'submit') e.preventDefault();
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      // (v4.36) the keyboard's Enter / Go key in a box: just close the keyboard (it used to start a save and jump to a field with an error)
      if (e.submitter !== $('#btnSave')) { const a = document.activeElement; if (a && a.blur && form.contains(a)) a.blur(); return; }
      withBusy($('#btnSave'), 'Saving…', async () => {
        showLoader('Saving your CV…', ['Saving on this phone…']);
        let r; try { r = await saveCurrent(); } finally { await hideLoader(700); }
        if (r) toast('CV saved.');
      });
    });
    $('#btnDownload').addEventListener('click', () => withBusy($('#btnDownload'), 'Preparing…', async () => {
      const r = await saveCurrent(); if (!r) return;
      showLoader('Creating your PDF…', ['Laying out the pages…', 'Adding fonts and colours…', 'Saving the file…']);
      try {
        const { bytes } = await buildPdf(r);
        await hideLoader(900);
        await downloadPdf(fileNameFor(r), bytes, 'cv', r);
      } finally { hideLoader(0); }
    }));
    $('#btnPrint').addEventListener('click', () => withBusy($('#btnPrint'), null, async () => {
      const r = await saveCurrent(); if (r) await printCV(r);
    }));
    $('#btnShare').addEventListener('click', () => withBusy($('#btnShare'), 'Preparing…', async () => {
      const r = await saveCurrent(); if (!r) return;
      showLoader('Preparing your PDF…', ['Laying out the pages…', 'Adding fonts and colours…']);
      let bytes;
      try { ({ bytes } = await buildPdf(r)); } finally { await hideLoader(700); }
      await shareFile(fileNameFor(r), bytes, 'application/pdf');
    }));
    const newCv = async () => {
      // (v4.95) the open CV is saved in My CVs first (it used to ask to discard it)
      if (state.dirty) { const r = await keepWork(); if (r) toast('Your previous CV is saved in My CVs.'); }
      // (v4.56) first choose the template in a large window (every template filled with an example CV), then the Edit pages
      if (window.RichTplPick) { window.RichTplPick.open(startWithTemplate); return; }
      resetForm(); showView('edit');
    };
    const frames = n => new Promise(r => { const f = k => k ? requestAnimationFrame(() => f(k - 1)) : r(); f(n); });
    const startWithTemplate = async (id, extra) => {
      extra = extra || {};
      const ds = Pdf.designs().find(d => d.id === id);
      // (v4.95) a small loading card over a soft blur straight away, so the screen never looks stuck while the template is set up
      showLoader(id ? 'Opening your template…' : 'Opening a new CV…', ['Getting your CV ready…']); await frames(2);
      try {
        resetForm();
        if (ds) { await Pdf.loadFont(ds.font); setTheme({ design: ds.id, color: ds.color, font: ds.font, bgPick: 0, looks: {}, unlocks: extra.unlock ? ['d:' + ds.id + '@' + (extra.unlockAt || Date.now())] : [] }); }
        state.dirty = false; updateHeader();
        showView('edit');
        if (window.RichWizard) window.RichWizard.go(0);
        window.scrollTo(0, 0);
        renderTool(); updateDesignNote();
      } finally {
        if (extra.closePicker) extra.closePicker();
        await hideLoader(550);
      }
      // (v4.96) choosing a template or "Skip, choose later": a full-screen ad once the form is open
      // (not within a minute of another full-screen or reward ad, sharing the timer with the other ads)
      if (window.RichAds && window.RichAds.atBreak) window.RichAds.atBreak(id ? 'template_chosen' : 'template_skip', 60);
    };
    // (the form's own "New CV" button was removed; new CVs start from Home)
    // the same actions from the Design view (the form and its buttons are hidden there)
    $('#designSave').addEventListener('click', () => $('#btnSave').click());
    $('#designDownload').addEventListener('click', () => $('#btnDownload').click());
    // (v4.96) the floating Preview / Download bar in Design: shown while neither the CV pages nor their buttons are on screen
    $('#dzPreview').addEventListener('click', goPreview);
    $('#pvFull').addEventListener('click', () => $('#btnFull').click());
    // (v4.97) tapping the live preview hides the full-screen button; tapping it again brings the button back
    (() => {
      const wrap = $('#pvFull').parentNode; let d = null;
      wrap.addEventListener('pointerdown', e => { d = e.target.closest('#pvFull') ? null : { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
      wrap.addEventListener('pointerup', e => {
        if (!d) return; const tap = Math.hypot(e.clientX - d.x, e.clientY - d.y) < 10 && Date.now() - d.t < 500; d = null;
        if (tap) $('#pvFull').classList.toggle('is-hidden');      // a scroll or swipe does not count as a tap
      }, true);
      wrap.addEventListener('pointercancel', () => { d = null; }, true);
    })();
    // (v4.97) Home from the editor: ask to save first when there are unsaved changes
    const qdOpen = id => { const o = $(id); o.hidden = false; requestAnimationFrame(() => o.classList.add('in')); };
    const qdClose = id => { const o = $(id); o.classList.remove('in'); setTimeout(() => { o.hidden = true; }, 160); };
    window.RichDirty = () => state.dirty;
    $('#topDl').addEventListener('click', () => { endTry(true); askDownload(); });
    // (v4.97) Home from Edit or Design: the CV is saved, then a note says where to find it
    async function askHome() {
      let r = null;
      const empty = !hasContent(getCV());               // (v4.97) a completely empty CV: nothing to save, no note
      if (!empty) try { r = await saveCurrent(true, true); } catch (e) {}
      state.dirty = false;
      $('#goHome').click();
      if (r) setTimeout(() => toast('Your progress is saved. Find this CV under Recent CVs.'), 350);
    }
    $('#homeAsk').addEventListener('click', async e => {
      const b = e.target.closest('[data-ha]'); if (!b && e.target.id !== 'homeAsk') return;
      const a = b ? b.dataset.ha : 'stay'; qdClose('#homeAsk');
      if (a === 'save') { const r = await saveCurrent(); if (r) $('#goHome').click(); }
      else if (a === 'nosave') { state.dirty = false; $('#goHome').click(); }
    });
    // (v4.97) Download: PDF or JPG picture
    // (v4.97) one Download window everywhere: for the open CV, or for a saved CV (My CVs, Recent CVs, Downloads)
    let dlRec = null;
    let dlConv = null;
    const DL_SUB = { pdf: 'Best for sending and printing', jpg: 'Easy to post or send in chats', docx: 'Editable format' };
    const DL_NAME = { pdf: 'PDF', jpg: 'JPG', docx: 'Word' };
    function askDownload(rec, conv) {
      dlRec = rec || null; dlConv = conv || null;
      const box = $('#dlAsk');
      $('.dlx-t', box).textContent = tr(dlConv ? 'Save or convert' : 'Download your CV');
      $$('.dlx-opt', box).forEach(b => {
        const k = b.dataset.dl, sm = $('small', b);
        b.classList.toggle('is-cur', !!dlConv && k === dlConv.cur);
        sm.textContent = !dlConv ? tr(DL_SUB[k]) : k === dlConv.cur ? tr('Save this file again') : tr('Convert to ' + DL_NAME[k]);
      });
      // the file's own type first
      const list = $('.dlx-list', box), cur = dlConv && $('.dlx-opt[data-dl="' + dlConv.cur + '"]', box);
      ['pdf', 'jpg', 'docx'].forEach(k => list.appendChild($('.dlx-opt[data-dl="' + k + '"]', box)));
      if (cur) list.insertBefore(cur, list.firstChild);
      qdOpen('#dlAsk');
    }
    window.RichAskDownload = askDownload;
    async function downloadJpg() {
      const r = dlRec || await saveCurrent(); if (!r) return;
      showLoader('Creating your picture…', ['Drawing the CV…', 'Saving the picture…']);
      try {
        await Pdf.loadFont(themeOf(r).font);
        const [logoEl, photoEl] = await Promise.all([loadImage(state.logo), loadImage(r.photo)]);
        const pages = layoutFor(r), base = fileNameFor(r).replace(/\.pdf$/, '');
        for (let i = 0; i < pages.length; i++) {
          const c = document.createElement('canvas');
          Pdf.drawToCanvas(pages[i], c, { logo: logoEl, photo: photoEl }, 1240, 1);
          const x = document.createElement('canvas'); x.width = c.width; x.height = c.height;
          const g = x.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, x.width, x.height); g.drawImage(c, 0, 0);
          const blob = await new Promise(res => x.toBlob(res, 'image/jpeg', 0.92));
          await hideLoader(600);
          if (!(await downloadFile(base + (pages.length > 1 ? '_page_' + (i + 1) : '') + '.jpg', blob, 'image/jpeg', 'cv', r))) break;
        }
      } finally { hideLoader(0); }
    }
    // (v4.97) Word: the CV's text as an editable .docx (headings in the template's colour)
    async function downloadDocx() {
      const r = dlRec || await saveCurrent(); if (!r) return;
      showLoader('Creating your Word file…', ['Writing the CV…', 'Saving the file…']);
      try {
        const acc = (Pdf.themeColors(Pdf.normTheme(r.theme || {})).accent || '#1A5FE8');
        const blob = window.RichDocx.build(r, { t: tr, accent: acc, range: (a, b, c) => Pdf.dateRange(a, b, c), date: d => Pdf.formatDate(d) });
        await hideLoader(600);
        await downloadFile(fileNameFor(r).replace(/\.pdf$/, '.docx'), blob, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'cv', r);
      } finally { hideLoader(0); }
    }
    $('#dlAsk').addEventListener('click', e => {
      const b = e.target.closest('[data-dl]'); if (!b && e.target.id !== 'dlAsk') return;
      const a = b ? b.dataset.dl : 'cancel'; qdClose('#dlAsk');
      if (dlConv && a === dlConv.cur) { dlConv.again(); return; }
      if (a === 'pdf') {
        if (dlRec) { const r = dlRec; (async () => { showLoader('Creating your PDF…', []); try { const { bytes } = await buildPdf(r); await hideLoader(600); await downloadPdf(fileNameFor(r), bytes, 'cv', r); } catch (err) { console.error(err); toast('Could not make the PDF. Please try again.', true); } finally { hideLoader(0); } })(); }
        else $('#btnDownload').click();
      }
      else if (a === 'jpg') downloadJpg();
      else if (a === 'docx') downloadDocx();
    });
    // (v4.97) the ☰ menu in the top bar (Edit and Design): Home screen, Save CV, Download PDF
    (() => {
      const btn = $('#topMenu'), box = $('#topMenuBox'); if (!btn || !box) return;
      const shut = () => { box.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
      btn.addEventListener('click', e => { e.stopPropagation(); const open = box.hidden; box.hidden = !open; btn.setAttribute('aria-expanded', String(open)); });
      box.addEventListener('click', e => {
        const b = e.target.closest('[data-tm]'); if (!b) return; shut();
        if (b.dataset.tm === 'home') askHome();
        else if (b.dataset.tm === 'save') $('#btnSave').click();
        else if (b.dataset.tm === 'settings') $('#openSettings').click();
        else { endTry(true); askDownload(); }
      });
      document.addEventListener('pointerdown', e => { if (!box.hidden && !box.contains(e.target) && e.target !== btn && !btn.contains(e.target)) shut(); }, true);
      window.addEventListener('scroll', () => { if (!box.hidden) shut(); }, { passive: true });
    })();
    // (v4.97) downloading or sharing while a Pro template is only being tried: back to the CV's own template first
    ['#btnDownload', '#designDownload', '#dzDownload', '#designShare', '#btnShare'].forEach(sel => { const el = $(sel); if (el) el.addEventListener('click', () => endTry(true), true); });
    $('#dzDownload').addEventListener('click', () => $('#btnDownload').click());
    // (v4.97) Download in the Design header (it replaces the floating bar)
    const dzCheck = () => {
      const f = $('#dzFloat'); if (!f) return;
      let show = currentView === 'design' && !document.body.classList.contains('pp-open') && !document.querySelector('.pm-overlay');
      if (show) {
        const H = window.innerHeight, on = el => { if (!el || !el.offsetParent) return false; const r = el.getBoundingClientRect(); return r.bottom > 60 && r.top < H - 80; };
        show = !on($('#pages')) && !on($('#designActions'));
      }
      if (f.hidden === show) f.hidden = !show;
    };
    window.addEventListener('scroll', dzCheck, { passive: true });
    window.addEventListener('resize', dzCheck);
    document.addEventListener('click', () => setTimeout(dzCheck, 120), true);
    setInterval(dzCheck, 800);
    $('#designShare').addEventListener('click', () => $('#btnShare').click());
    $('#designPrint').addEventListener('click', () => $('#btnPrint').click());
    $('#btnNew').addEventListener('click', newCv);

    // the Design tab's own Upload button (the panel is redrawn, so listen on the document)
    document.addEventListener('change', async e => {
      if (!e.target || e.target.id !== 'photoInput2') return;
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try { await openCropper(await loadSourcePhoto(file), null); } catch (err) { toast(err.message, true); }
    });
    $('#photoInput').addEventListener('change', async e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try { await openCropper(await loadSourcePhoto(file), null); } catch (err) { toast(err.message, true); }
    });
    $('#photoRemove').addEventListener('click', () => { removePhoto(); });
    const adjust = () => { if (state.photo) openCropper(state.photoSrc || state.photo, state.photoSrc ? state.photoCrop : null); };
    $('#photoAdjust').addEventListener('click', adjust);
    { const bb = $('#photoBgBtn'); if (bb) bb.addEventListener('click', () => { if (window.RichPhotoBg) window.RichPhotoBg.open(); }); }
    $('#photoFrame').addEventListener('click', adjust);
    $('#photoShapeEdit').addEventListener('click', e => {
      const b = e.target.closest('[data-eshape]'); if (!b) return;
      setTheme({ photoShape: b.dataset.eshape });           // same setting as Design > Photo > Shape
      if (tool === 'photo') renderTool();
    });
    wireCropper();

    // going from Edit to Design (tab, "Go To Design Section" or the "Choose template" link) is a natural break:
    // one full-screen ad, at most once every 3 minutes, whichever way the user goes
    const toDesign = () => {
      const wasDesign = document.body.classList.contains('view-design');
      showView('design');
      if (!wasDesign && window.RichAds && window.RichAds.atBreak) window.RichAds.atBreak('design', 180);
    };
    $$('.view-tab').forEach(t => t.addEventListener('click', () => (t.dataset.view === 'design' ? toDesign() : showView(t.dataset.view))));
    $('#goHome').addEventListener('click', () => showView('home'));
    $('#goBack').addEventListener('click', goBack);

    $('#homeCreate').addEventListener('click', newCv);
    $('#homeFirst').addEventListener('click', () => $('#homeCreate').click());     // same as Create CV (one creation flow)
    $('#homeSeeAll').addEventListener('click', () => showView('list'));
    // (v4.96) opening the PDF tools from Home: a full-screen ad once the tool page is open, at most once every 3 minutes
    const toolsAd = () => { if (window.RichAds && window.RichAds.atBreak) window.RichAds.atBreak('pdf_tool_open', 180); };
    $('#homeAllTools').addEventListener('click', () => { ptool = ptool || 'merge'; showView('tools'); toolsAd(); });
    $('#homeGoPro').addEventListener('click', () => { if (window.RichPremium) (RichPremium.openPage || RichPremium.offer)('home'); });   // (v4.96m) the full Pro page
    wireRecent();
    $('#homeCvs').addEventListener('click', () => showView('list'));
    $('#homeDownloads').addEventListener('click', () => showView('downloads'));
    $$('[data-tool-open]').forEach(b => b.addEventListener('click', () => { ptool = b.dataset.toolOpen; showView('tools'); toolsAd(); }));
    wireDownloads(); wirePtools();
    $('#toast').addEventListener('click', () => { if (state.fixPending) { $('#toast').classList.remove('show'); showView('edit'); } });
    $('#goDesign').addEventListener('click', toDesign);
    $('#search').addEventListener('input', renderCVList);
    $('#cvList').addEventListener('click', async e => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const id = btn.closest('.record').dataset.id;
      const r = state.records.find(x => x.id === id);
      if (!r) return;
      recordAct(btn.dataset.act, r, btn);
    });

    const openSettings = () => {
      if (document.body.classList.contains('in-editor')) saveCurrent(true, true).catch(() => {});   // (v4.97) the work is kept first
      const sp = $('#settings'); sp.classList.remove('closing', 'scrolled'); sp.hidden = false; sp.scrollTop = 0;
      document.body.classList.add('settings-open'); $('#closeSettings').focus({ preventScroll: true });
    };
    $('#openSettings').addEventListener('click', openSettings);
    $('#openSettings2').addEventListener('click', openSettings);
    $('#closeSettings').addEventListener('click', closeSettings);
    $('#settings').addEventListener('scroll', e => e.target.classList.toggle('scrolled', e.target.scrollTop > 4), { passive: true });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!$('#jobSheet').hidden) { closeJobSheet(); return; }
      if (!$('#cropper').hidden) { closeCropper(); return; }
      if (!$('#fullview').hidden) { closeFull(); return; }
      if (!$('#confirm').hidden) { $('#confirmNo').click(); return; }
      closeSettings();
    });
    $('#exportData').addEventListener('click', () => withBusy($('#exportData'), null, exportBackup));
    $('#importData').addEventListener('change', async e => {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      try { await importBackup(file); } catch (err) { toast(err.message, true); }
    });

    window.addEventListener('beforeunload', e => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });
    let rw, lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      clearTimeout(rw); rw = setTimeout(() => schedulePreview(0), 200);
    });
  }

  /* ---------------- app theme (colours of the app, not the CV) ---------------- */
  // app looks (Google Material 3 colour schemes): Google blue by default, four more light ones and a dark one
  const APP_THEMES = {
    light:   { mode: 'light', primary: '#0B57D0', onPrimary: '#FFFFFF', pc: '#D3E3FD', onPc: '#041E49', sc: '#C2E7FF', onSc: '#001D35' },
    ocean:   { mode: 'light', primary: '#006A6A', onPrimary: '#FFFFFF', pc: '#9CF1F0', onPc: '#002020', sc: '#CCE8E7', onSc: '#051F1F' },
    emerald: { mode: 'light', primary: '#146C2E', onPrimary: '#FFFFFF', pc: '#B7F0C2', onPc: '#002109', sc: '#D2E8D3', onSc: '#0D1F12' },
    purple:  { mode: 'light', primary: '#6750A4', onPrimary: '#FFFFFF', pc: '#EADDFF', onPc: '#21005D', sc: '#E8DEF8', onSc: '#1D192B' },
    sunset:  { mode: 'light', primary: '#8B5000', onPrimary: '#FFFFFF', pc: '#FFDCBE', onPc: '#2C1600', sc: '#F2DFD1', onSc: '#2A1700' },
    neon:    { mode: 'dark',  primary: '#A8C7FA', onPrimary: '#062E6F', pc: '#0842A0', onPc: '#D3E3FD', sc: '#004A77', onSc: '#C2E7FF' }
  };
  const OLD_THEME = { navy: 'light', dark: 'neon' };         // names used by earlier versions
  // (v4.95) Home badges: a red "0" means nothing, so the badge only shows when there is something
  // (v4.95) ask first, so a photo is never removed by a stray tap (Edit page bin and Design > Photo > Remove)
  async function removePhoto() {
    if (!state.photo) return false;
    if (!(await confirmBox('Remove this photo?', 'The photo will be taken off this CV. You can add it again at any time.', 'Remove'))) return false;
    setPhoto(null); state.dirty = true; updateHeader(); schedulePreview(0);
    return true;
  }
  function setCount(sel, n) { const el = $(sel); if (!el) return; el.textContent = n; el.hidden = !n; }
  function applyAppTheme(id) {
    id = OLD_THEME[id] || id;
    if (!APP_THEMES[id]) id = 'light';
    const t = APP_THEMES[id], r = document.documentElement;
    r.dataset.theme = t.mode;
    r.dataset.accent = id;                         // the premium styles take their colours from this
    [['--primary', t.primary], ['--on-primary', t.onPrimary], ['--pc', t.pc], ['--on-pc', t.onPc], ['--sc', t.sc], ['--on-sc', t.onSc]]
      .forEach(([k, v]) => r.style.setProperty(k, v));
    const sel = $('#appTheme'); if (sel) sel.value = id;
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = t.mode === 'light' ? '#F8FAFD' : '#131314';
    try { localStorage.setItem('richTheme31', id); } catch (e) { /* not available */ }
    if (window.RichSyncBars) window.RichSyncBars();
  }
  // apply straight away (before the loading screen fades) from the copy kept in this browser
  // version 3.1 starts everyone on the light look once; a theme chosen after that is remembered
try { applyAppTheme(localStorage.getItem('richTheme31') || 'light'); } catch (e) { applyAppTheme('light'); }

  /* ---------------- app text size ---------------- */
  // Display size: the whole app is zoomed evenly (text, buttons, spacing), like a lower screen DPI
  const UI_SIZES = [0.75, 0.85];   // (v4.96) only two sizes: Small (0.75) and Large (0.85)
  // (v4.97) the light header: the strip behind the phone's status bar matches it (white with dark icons, or dark in the dark theme)
  function syncBars() {
    try {
      const B = window.AndroidBridge; if (!B || !B.setBars) return;
      const dark = document.documentElement.dataset.theme === 'dark';
      B.setBars(dark ? '#10151F' : '#FFFFFF', dark);
    } catch (e) { /* older app */ }
  }
  window.RichSyncBars = syncBars;
  // (v4.97) the header's height, so the Design header can stay right under it while scrolling
  (() => { const t = document.querySelector('.topbar'); if (!t) return; const set = () => document.documentElement.style.setProperty('--hdr-h', t.offsetHeight + 'px');
    set(); if (window.ResizeObserver) new ResizeObserver(set).observe(t); })();
  [0, 400, 1500, 3500].forEach(t => setTimeout(syncBars, t));
  function applyUiScale(v) {
    if (!UI_SIZES.includes(v)) v = 0.85;   // (v4.97) new installs start on Large
    document.documentElement.style.fontSize = '';
    document.documentElement.style.zoom = v === 1 ? '' : String(v);
    document.documentElement.style.setProperty('--ui-zoom', String(v));
    document.documentElement.style.setProperty('--sp-z', String(0.85 / v));   // loading screen keeps one size
    // bigger sizes: text grows, but buttons and cards do not get much taller (see css data-ui-big)
    if (v >= 1) document.documentElement.setAttribute('data-ui-big', v > 1 ? '2' : '1'); else document.documentElement.removeAttribute('data-ui-big');
    try { localStorage.setItem('richDisplaySize', String(v)); } catch (e) { /* private mode */ }
    document.documentElement.dataset.uiSize = v >= 0.85 ? 'large' : 'small';   // (v4.96u) for size-specific spacing
    $$('#uiScale [data-ui]').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.ui === v)));
  }
  function wireUiScale() {
    $('#appTheme').addEventListener('change', e => {           // applied as soon as a theme is chosen
      applyAppTheme(e.target.value);
      Store.setSetting('appTheme', e.target.value).catch(() => {});
    });
    $('#uiScale').addEventListener('click', e => {
      const b = e.target.closest('[data-ui]');
      if (!b) return;
      const v = +b.dataset.ui;
      if (+getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom') === v) return;   // already this size
      // (v4.97) a calm switch: the screen fades out, changes size with every animation paused (no wobbling while
      // things resize), and fades back in once the new size has settled
      const H = document.documentElement;
      H.classList.add('ui-resizing');
      setTimeout(() => {
        applyUiScale(v);
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
          H.classList.add('ui-resized');
          setTimeout(() => H.classList.remove('ui-resizing', 'ui-resized'), 220);
        }, 120)));
      }, 140);
      Store.setSetting('displaySize', v).catch(() => {});
      schedulePreview(100);
    });
  }

  // Android back button: close dialogs, then go back to the editor
  window.RichAndroidBack = function () {
    if (window.RichTplPick && window.RichTplPick.isOpen()) { window.RichTplPick.close(); return true; }
    if (window.RichAds && window.RichAds.closeOpen()) return true;
    if (window.RichDropdown && window.RichDropdown.close()) return true;
    if (window.RichIntro && window.RichIntro.isOpen()) return window.RichIntro.back();
    if (!$('#jobSheet').hidden) { closeJobSheet(); return true; }
    if ($$('.combo-list:not([hidden])').length) { $$('[data-combo]').forEach(closeSuggest); return true; }
    if (!$('#cropper').hidden) { closeCropper(); return true; }
    if (!$('#confirm').hidden) { $('#confirmNo').click(); return true; }
    if (!$('#settings').hidden) { closeSettings(); return true; }
    if (window.RichSaved && window.RichSaved.isOpen()) { window.RichSaved.close(); return true; }
    if (!$('#fullview').hidden) { closeFull(); return true; }
    if (currentView !== 'home') { showView(viewHistory.pop() || 'home', true); return true; }
    // (v4.97) Back on the Home screen: ask before closing the app
    if (exitOk) return false;
    const q = confirmBox('Exit Rich CV Maker?', 'Do you really want to close the app?', 'Exit', 'Stay', true);
    $('#confirm').classList.add('is-exit');           // a small box without the icon
    q.then(yes => {
      if (!yes) return;
      try { if (Android && typeof Android.exitApp === 'function') { Android.exitApp(); return; } } catch (e) { /* older app */ }
      exitOk = true;                                 // an older app without exitApp: the next Back closes it
      toast('Press Back again to exit.');
      setTimeout(() => { exitOk = false; }, 3000);
    });
    return true;
  };
  let exitOk = false;

  /* ---------------- helpers for js/cloud.js and js/premium.js ---------------- */
  window.RichApp = {
    designs: () => Pdf.designs(),
    currentDesign: () => state.theme && state.theme.design,
    refreshList: () => refreshList(),
    redrawTemplates: () => { if (tool === 'template') renderTool(); updateDesignNote(); },
    toast: (m, bad) => toast(m, bad),
    isDirty: () => !!state.dirty,
    confirm: (title, text, yes, no, safe) => confirmBox(title, text, yes, no, safe),
    // (v4.66) the photo background cleaner (js/photobg.js)
    photo: () => state.photo,
    setCleanPhoto: url => { setPhoto(url, state.photoSrc, state.photoCrop); state.dirty = true; updateHeader(); schedulePreview(0); },
    cv: () => getCV()
  };

  /* ---------------- start ---------------- */
  async function start() {
    if (Android) { document.documentElement.classList.add('is-android'); $('#btnShare').hidden = false; $('#designShare').hidden = false; }
    $('#brandLogo').src = headerLogo();   // header logo shows even if the PDF engine fails
    wireLists(); wireWriter(); wireSkills(); wireCombo(); wireTools(); wireFull(); wire(); wireUiScale();
    if (!window.PDFLib) {
      $('#pages').innerHTML = '<div class="preview-empty">The PDF engine did not load. Check your internet connection and reload the page.</div>';
      toast('The PDF engine did not load. Reload the page with an internet connection.', true);
      hideSplash();
      return;
    }
    await Pdf.init();
    state.defaultTheme = Pdf.normTheme({});
    try {
      const t = await Store.getSetting('theme');
      if (t) state.defaultTheme = Pdf.normTheme(t);
      else { const d = await Store.getSetting('design'); if (d) state.defaultTheme = Pdf.normTheme({ design: d }); }
    } catch (e) { /* first run */ }
    state.defaultTheme.order = Pdf.DEFAULT_THEME.order.slice(); state.defaultTheme.hide = [];
    { const d0 = Pdf.designs().find(d => d.id === state.defaultTheme.design);           // (v4.52) new CVs: the template's own colours
      state.defaultTheme.bgPick = 0; state.defaultTheme.looks = {}; state.defaultTheme.unlocks = []; if (d0) state.defaultTheme.color = d0.color; }
    state.theme = Pdf.normTheme(state.defaultTheme);
    try { applyUiScale(+(await Store.getSetting('displaySize')) || 0.85); } catch (e) { applyUiScale(0.85); }   // (v4.97) Large unless the user chose Small
    try { const t = await Store.getSetting('appTheme'); if (t) applyAppTheme(t); } catch (e) { /* first run */ }
    applyLogo();
    await refreshList();
    resetForm();
    try { await Pdf.loadFont(state.theme.font); } catch (e) { /* preview falls back to Helvetica */ }
    showView('home');
    try { localStorage.removeItem('richResume'); } catch (e) {}   // (v4.97) the app always opens on Home
    hideSplash();
  }
  start().catch(e => { console.error(e); hideSplash(); });
})();
