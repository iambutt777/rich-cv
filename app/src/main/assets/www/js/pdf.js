/* =========================================================================
   CV PDF engine.
   1) layout()       turns the CV + its design settings into drawing
                     operations per A4 page (millimetres, origin top-left).
   2) toPdfBytes()   draws them into a real PDF (pdf-lib).
   3) drawToCanvas() draws the same operations on a <canvas> for the preview,
                     so the preview matches the PDF line for line.
   Fonts: Helvetica, Times and Courier are built into every PDF. Other fonts
   come from js/fonts/<id>.js as letter outlines, drawn as vector shapes, with
   an invisible text layer so the PDF can still be searched and copied.
   The templates live in js/cv-designs.js.
   ========================================================================= */
window.CVPdf = (function () {
  const CFG = window.RICH_CONFIG;
  const C = CFG.brand;
  const PAGE_W = 210, PAGE_H = 297;
  const PT = 0.352778;                       // 1 pt in mm
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const LEVELS = CFG.languageLevels;

  /* ---------- fonts ---------- */
  const STANDARD = {
    helvetica: { css: 'Helvetica, Arial, "Liberation Sans", sans-serif',
      pdf: { regular: 'Helvetica', bold: 'HelveticaBold', italic: 'HelveticaOblique', boldItalic: 'HelveticaBoldOblique' } },
    times: { css: '"Times New Roman", Times, "Liberation Serif", serif',
      pdf: { regular: 'TimesRoman', bold: 'TimesRomanBold', italic: 'TimesRomanItalic', boldItalic: 'TimesRomanBoldItalic' } },
    courier: { css: '"Courier New", Courier, "Liberation Mono", monospace',
      pdf: { regular: 'Courier', bold: 'CourierBold', italic: 'CourierOblique', boldItalic: 'CourierBoldOblique' } }
  };
  const FONT_LIST = [
    { id: 'helvetica', name: 'Helvetica', hint: 'Clean and classic' },
    { id: 'poppins', name: 'Poppins', hint: 'Modern geometric' },
    { id: 'josefin', name: 'Josefin Sans', hint: 'Elegant geometric' },
    { id: 'carlito', name: 'Carlito', hint: 'Like Calibri' },
    { id: 'caladea', name: 'Caladea', hint: 'Like Cambria' },
    { id: 'adventor', name: 'Adventor', hint: 'Like Avant Garde' },
    { id: 'dejavusans', name: 'DejaVu Sans', hint: 'Wide and very readable' },
    { id: 'heroscn', name: 'Heros Condensed', hint: 'Narrow, fits more text' },
    { id: 'inter', name: 'Inter', hint: 'Clean and modern' },
    { id: 'latolight', name: 'Lato Light', hint: 'Light and friendly' },
    { id: 'poppinslight', name: 'Poppins Light', hint: 'Thin and stylish' },
    { id: 'lmsans', name: 'Latin Modern Sans', hint: 'Soft and simple' },
    { id: 'kerkissans', name: 'Kerkis Sans', hint: 'Round and open' },
    { id: 'loma', name: 'Loma', hint: 'Wide and friendly' },
    { id: 'times', name: 'Times', hint: 'Traditional serif' },
    { id: 'pagella', name: 'Pagella', hint: 'Like Palatino' },
    { id: 'bonum', name: 'Bonum', hint: 'Like Bookman' },
    { id: 'schola', name: 'Schola', hint: 'Like Century Schoolbook' },
    { id: 'dejavuserif', name: 'DejaVu Serif', hint: 'Strong classic serif' },
    { id: 'lora', name: 'Lora', hint: 'Elegant book serif' },
    { id: 'lmroman', name: 'Latin Modern', hint: 'Academic classic' },
    { id: 'courier', name: 'Courier', hint: 'Typewriter style' },
    { id: 'lmmono', name: 'Typewriter Light', hint: 'Light typewriter' },
    { id: 'sourcecode', name: 'Source Code', hint: 'Tech and coding jobs' }
  ];
  let std = null;                            // pdf-lib standard fonts, for measuring
  const encodable = new Map();
  let FAM = 'helvetica';                     // font family used by the layout being built

  async function init() {
    if (std) return;
    const { PDFDocument, StandardFonts } = window.PDFLib;
    const doc = await PDFDocument.create();
    std = {};
    for (const fam of Object.keys(STANDARD)) {
      std[fam] = {};
      for (const [st, key] of Object.entries(STANDARD[fam].pdf)) std[fam][st] = await doc.embedFont(StandardFonts[key]);
    }
  }
  const isStd = fam => !!STANDARD[fam];
  const fontReady = fam => isStd(fam) || !!(window.CVFonts && window.CVFonts[fam]);
  // load js/fonts/<id>.js when a font is picked (already inline in the one-file version)
  const loading = {};
  function loadFont(fam) {
    if (fontReady(fam)) return Promise.resolve(true);
    if (!FONT_LIST.some(f => f.id === fam)) return Promise.resolve(false);
    if (loading[fam]) return loading[fam];
    loading[fam] = new Promise(resolve => {
      const s = document.createElement('script');
      s.src = 'js/fonts/' + fam + '.js';
      s.onload = () => resolve(fontReady(fam));
      s.onerror = () => { delete loading[fam]; resolve(false); };
      document.head.appendChild(s);
    });
    return loading[fam];
  }
  const famOf = f => fontReady(f) ? f : 'helvetica';
  const glyphs = (fam, st) => window.CVFonts[fam].styles[st || 'regular'];

  /* ---------- text helpers ---------- */
  function canEncode(ch) {
    if (encodable.has(ch)) return encodable.get(ch);
    let ok = true;
    try { std.helvetica.regular.widthOfTextAtSize(ch, 10); } catch (e) { ok = false; }
    encodable.set(ch, ok);
    return ok;
  }
  // characters the CV fonts cannot show (for example Thai or Myanmar script)
  function unsupportedChars(text) {
    const bad = new Set();
    for (const ch of String(text || '').replace(/[\r\n\t]/g, ' ')) if (!canEncode(ch)) bad.add(ch);
    return [...bad];
  }
  /* ---------- small line icons for contact details ----------
     24 x 24 units, drawn with a round-capped stroke; paths use only M, L, C and Z (same in the preview and the PDF) */
  const ICONS = (() => {
    const f = n => +n.toFixed(2);
    const circ = (cx, cy, r) => { const k = 0.5523 * r; return 'M ' + f(cx + r) + ' ' + f(cy) + ' C ' + f(cx + r) + ' ' + f(cy + k) + ' ' + f(cx + k) + ' ' + f(cy + r) + ' ' + f(cx) + ' ' + f(cy + r) +
      ' C ' + f(cx - k) + ' ' + f(cy + r) + ' ' + f(cx - r) + ' ' + f(cy + k) + ' ' + f(cx - r) + ' ' + f(cy) + ' C ' + f(cx - r) + ' ' + f(cy - k) + ' ' + f(cx - k) + ' ' + f(cy - r) + ' ' + f(cx) + ' ' + f(cy - r) +
      ' C ' + f(cx + k) + ' ' + f(cy - r) + ' ' + f(cx + r) + ' ' + f(cy - k) + ' ' + f(cx + r) + ' ' + f(cy) + ' Z'; };
    const rr = (x, y, w, h, r) => { const k = 0.5523 * r, P = (...a) => a.map(f).join(' ');
      return 'M ' + P(x + r, y) + ' L ' + P(x + w - r, y) + ' C ' + P(x + w - r + k, y, x + w, y + r - k, x + w, y + r) + ' L ' + P(x + w, y + h - r) +
        ' C ' + P(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h) + ' L ' + P(x + r, y + h) + ' C ' + P(x + r - k, y + h, x, y + h - r + k, x, y + h - r) +
        ' L ' + P(x, y + r) + ' C ' + P(x, y + r - k, x + r - k, y, x + r, y) + ' Z'; };
    return {
      phone: 'M 7.4 3 C 8 2.8 8.7 3.1 9 3.7 L 10.3 6.6 C 10.6 7.3 10.4 8 9.8 8.4 L 8.3 9.5 C 9.4 11.8 11.6 14.1 14.1 15.3 L 15.3 13.9 C 15.8 13.3 16.6 13.1 17.2 13.5 L 20.1 14.9 C 20.8 15.2 21.1 16 20.9 16.6 L 20.2 19.4 C 20 20.1 19.3 20.6 18.6 20.6 C 10.6 20.2 3.9 13.6 3.4 5.6 C 3.4 4.9 3.8 4.2 4.5 4 Z',
      email: rr(2.5, 5, 19, 14, 2.4) + ' M 3.4 6.6 L 12 13.2 L 20.6 6.6',
      address: 'M 12 21.6 C 12 21.6 4.6 15 4.6 9.7 C 4.6 5.4 7.9 2.4 12 2.4 C 16.1 2.4 19.4 5.4 19.4 9.7 C 19.4 15 12 21.6 12 21.6 Z ' + circ(12, 9.7, 2.7),
      linkedin: rr(2.6, 2.6, 18.8, 18.8, 3.6) + ' M 7.9 10.6 L 7.9 16.6 M 7.9 7.3 L 7.9 7.5 M 11.7 16.6 L 11.7 10.6 M 11.7 13.2 C 11.7 11.5 12.9 10.5 14.4 10.5 C 15.9 10.5 16.7 11.5 16.7 13.1 L 16.7 16.6',
      website: circ(12, 12, 9) + ' M 3 12 L 21 12 M 12 3 C 8.6 6.4 8.6 17.6 12 21 M 12 3 C 15.4 6.4 15.4 17.6 12 21',
      flag: 'M 5.5 21.5 L 5.5 3.2 M 5.5 4 C 8.4 2.6 10.6 5.4 13.4 4.2 C 15.4 3.4 17.3 3.4 19 4.1 L 19 13.1 C 17.3 12.4 15.4 12.4 13.4 13.2 C 10.6 14.4 8.4 11.6 5.5 13',
      calendar: rr(3, 4.8, 18, 16.4, 2.6) + ' M 3 10 L 21 10 M 8 2.8 L 8 6.6 M 16 2.8 L 16 6.6 M 7.6 14.2 L 7.6 14.4 M 12 14.2 L 12 14.4 M 16.4 14.2 L 16.4 14.4 M 7.6 17.4 L 7.6 17.6 M 12 17.4 L 12 17.6',
      person: circ(12, 7.6, 3.9) + ' M 4.6 21 C 4.6 16.5 7.9 13.7 12 13.7 C 16.1 13.7 19.4 16.5 19.4 21',
      rings: circ(8.8, 14.6, 5.6) + ' ' + circ(15.2, 14.6, 5.6) + ' M 10.4 5.2 L 12 2.8 L 13.6 5.2 L 12 7.4 Z',
      passport: rr(4.8, 2.6, 14.4, 18.8, 2.2) + ' ' + circ(12, 9.8, 3.7) + ' M 8.3 9.8 L 15.7 9.8 M 9.4 16.8 L 14.6 16.8',
      // (v4.29) driving licence: a car
      car: 'M 3.4 14.2 L 5.4 9.2 C 5.8 8.2 6.7 7.6 7.8 7.6 L 16.2 7.6 C 17.3 7.6 18.2 8.2 18.6 9.2 L 20.6 14.2 L 20.6 18.2 L 3.4 18.2 Z M 6.8 18.2 L 6.8 20.6 M 17.2 18.2 L 17.2 20.6 M 6.9 14.3 L 7.1 14.3 M 16.9 14.3 L 17.1 14.3 M 5.2 11.6 L 18.8 11.6'
    };
  })();
  // every contact and personal detail has a small icon (v3.79: personal details too, as "Label: value")
  const ICON_OF = { Phone: 'phone', Email: 'email', Address: 'address', LinkedIn: 'linkedin', Website: 'website', Nationality: 'flag', 'Date of birth': 'calendar', Age: 'calendar',
    Gender: 'person', 'Marital status': 'rings', 'Passport no.': 'passport', 'Driving licence': 'car' };
  // shown as the value alone; the others as "Label: value"
  const PLAIN = { Phone: 1, Email: 1, Address: 1, LinkedIn: 1, Website: 1 };
  const LABEL_OF = { 'Passport no.': 'Passport', 'Driving licence': 'Licence' };
  // "https://www.linkedin.com/in/name/" -> "linkedin.com/in/name"; a bare name -> "linkedin.com/in/name"
  function linkedinText(v) {
    let t = String(v || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
    if (!t) return '';
    if (!/linkedin\.com\//i.test(t)) t = 'linkedin.com/in/' + t.replace(/^@/, '');
    return t.replace(/^[a-z]{2,3}\.linkedin\.com/i, 'linkedin.com');
  }

  function clean(text) {
    let out = '';
    for (const ch of String(text == null ? '' : text).replace(/\t/g, ' ')) out += (ch === '\n' || canEncode(ch)) ? ch : '?';
    return out;
  }
  function measure(text, size, st, fam) {
    fam = famOf(fam || FAM);
    text = clean(text);
    if (isStd(fam)) return std[fam][st || 'regular'].widthOfTextAtSize(text, size) * PT;
    const g = glyphs(fam, st).g;
    let w = 0;
    for (const ch of text) { const gl = g[ch.codePointAt(0)] || g[63]; w += gl ? gl[0] : 500; }
    return w * size / 1000 * PT;
  }
  function wrap(text, maxW, size, st) {
    const lines = [];
    clean(text).split(/\n/).forEach(para => {
      const words = para.trim().split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); return; }
      let line = '';
      words.forEach(word => {
        if (measure(word, size, st) > maxW) {
          if (line) { lines.push(line); line = ''; }
          let chunk = '';
          for (const ch of word) {
            if (chunk && measure(chunk + ch, size, st) > maxW) { lines.push(chunk); chunk = ch; } else chunk += ch;
          }
          line = chunk;
          return;
        }
        const test = line ? line + ' ' + word : word;
        if (measure(test, size, st) <= maxW) line = test;
        else { if (line) lines.push(line); line = word; }
      });
      lines.push(line);
    });
    while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    return lines;
  }
  function formatDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? parseInt(m[3], 10) + ' ' + MONTHS[parseInt(m[2], 10) - 1] + ' ' + m[1] : '';
  }
  function formatMonth(v) {
    const m = /^(\d{4})-(\d{2})/.exec(v || '');
    return m ? SHORT_MONTHS[parseInt(m[2], 10) - 1] + ' ' + m[1] : String(v || '');
  }
  // education: "Jun 2014 – Mar 2018", "Jun 2014 – Present" (an old year-only value still shows)
  function eduDate(e) {
    const a = formatMonth(e.start);
    const b = e.current ? 'Present' : (formatMonth(e.end) || String(e.year || '').trim());
    return a && b ? a + ' \u2013 ' + b : (a || b || '');
  }
  function dateRange(start, end, current) {
    const a = formatMonth(start), b = current ? 'Present' : formatMonth(end);
    return a && b ? a + ' \u2013 ' + b : (a || b || '');
  }

  /* ---------- colours ---------- */
  const PALETTES = [
    { id: 'royal', name: 'Navy and gold', primary: '#0B1F4B', accent: '#1F4FD8', highlight: '#E8B21E' },
    { id: 'emerald', name: 'Emerald', primary: '#0F3D33', accent: '#1E8E6E', highlight: '#7FD1B0' },
    { id: 'teal', name: 'Teal and amber', primary: '#0B3C49', accent: '#127C8A', highlight: '#F2A541' },
    { id: 'sky', name: 'Sky blue', primary: '#0D3B66', accent: '#2D88D8', highlight: '#F4D35E' },
    { id: 'burgundy', name: 'Burgundy', primary: '#4A0E1C', accent: '#9B2335', highlight: '#D8A15E' },
    { id: 'rose', name: 'Rose', primary: '#4A1D33', accent: '#C2477B', highlight: '#E9B44C' },
    { id: 'purple', name: 'Royal purple', primary: '#2E1A47', accent: '#6B3FA0', highlight: '#F2B84B' },
    { id: 'orange', name: 'Sunset orange', primary: '#3B2416', accent: '#D9622B', highlight: '#F2B84B' },
    { id: 'forest', name: 'Forest green', primary: '#1F3B22', accent: '#3E7D3A', highlight: '#C9B458' },
    { id: 'slate', name: 'Slate and cyan', primary: '#1E293B', accent: '#475569', highlight: '#38BDF8' },
    { id: 'charcoal', name: 'Charcoal and gold', primary: '#22262E', accent: '#4A5260', highlight: '#C9A227' },
    { id: 'mono', name: 'Black and white', primary: '#111111', accent: '#3A3A3A', highlight: '#9A9A9A' },
    { id: 'ocean', name: 'Ocean and cyan', primary: '#0A2540', accent: '#0E8FB8', highlight: '#7DD3E8' },
    { id: 'lime', name: 'Fresh green', primary: '#1F3D1A', accent: '#56A62B', highlight: '#B5DE7C' },
    { id: 'sand', name: 'Sand and brown', primary: '#3E3324', accent: '#9C7F52', highlight: '#D9C29A' },
    { id: 'sun', name: 'Sunny yellow', primary: '#2D2E3A', accent: '#E9A800', highlight: '#FFD43B' },
    { id: 'sage', name: 'Sage grey', primary: '#3F4D47', accent: '#5F716A', highlight: '#B7C4BE' },
    { id: 'emgold', name: 'Emerald and gold', primary: '#0B3B2E', accent: '#1E6B52', highlight: '#C9A877' },
    { id: 'bronze', name: 'Black and bronze', primary: '#141414', accent: '#8C6A43', highlight: '#C9A27A' },
    { id: 'ember', name: 'Charcoal and orange', primary: '#2B2B2B', accent: '#F28C1B', highlight: '#FFB347' },
    { id: 'copper', name: 'Copper', primary: '#6E2C0B', accent: '#A0491A', highlight: '#E9C3A6' },
    // (v4.11) 15 more
    { id: 'indigo', name: 'Indigo and coral', primary: '#1E1B4B', accent: '#4F46E5', highlight: '#FB7185' },
    { id: 'wine', name: 'Wine and blush', primary: '#3B0A1E', accent: '#8E1B3F', highlight: '#F4A6B8' },
    { id: 'mint', name: 'Navy and mint', primary: '#0F2A44', accent: '#14A38B', highlight: '#8FE3CF' },
    { id: 'plum', name: 'Plum and gold', primary: '#2A0F2E', accent: '#7A2E7E', highlight: '#E3B341' },
    { id: 'olive', name: 'Olive and cream', primary: '#2F3318', accent: '#6B7A2A', highlight: '#D8CB8A' },
    { id: 'steel', name: 'Steel blue', primary: '#1B2A3A', accent: '#3B6E99', highlight: '#A9C9E8' },
    { id: 'terracotta', name: 'Terracotta', primary: '#3A1C12', accent: '#C0562F', highlight: '#F0B48A' },
    { id: 'navyred', name: 'Navy and red', primary: '#0A1A3A', accent: '#C8102E', highlight: '#F2B8C0' },
    { id: 'aqua', name: 'Aqua and coral', primary: '#083344', accent: '#0891B2', highlight: '#FF8A65' },
    { id: 'lavender', name: 'Lavender', primary: '#2E2549', accent: '#7C6BC4', highlight: '#CDBEF5' },
    { id: 'chocolate', name: 'Chocolate and caramel', primary: '#2B1A12', accent: '#7B4A2E', highlight: '#D9A066' },
    { id: 'turquoise', name: 'Turquoise and gold', primary: '#073B3A', accent: '#0F8F7E', highlight: '#E8C547' },
    { id: 'crimson', name: 'Black and red', primary: '#121212', accent: '#B3121F', highlight: '#F05A64' },
    { id: 'denim', name: 'Denim and sand', primary: '#1C2B4A', accent: '#3D5A8A', highlight: '#E2C799' },
    { id: 'magenta', name: 'Magenta and pink', primary: '#3A0D3F', accent: '#C2187A', highlight: '#F7A8D6' },
    // only black and white: no grey, no colour
    { id: 'bw', name: 'Only black and white', primary: '#000000', accent: '#000000', highlight: '#FFFFFF', bw: true },
    // (v4.11) these four also colour the whole page background
    { id: 'bg-cream', name: 'Navy on cream page', primary: '#1F2A44', accent: '#8A6A3B', highlight: '#D8B66A', bg: '#FBF5EA' },
    { id: 'bg-mint', name: 'Green on mint page', primary: '#12372A', accent: '#2E7D5B', highlight: '#8CCBA8', bg: '#EDF6F0' },
    { id: 'bg-blush', name: 'Rose on blush page', primary: '#4A1C2B', accent: '#B03F58', highlight: '#EFA9B6', bg: '#FCEFF1' },
    { id: 'bg-ice', name: 'Navy on ice blue page', primary: '#102A43', accent: '#2F6FB3', highlight: '#94BFEB', bg: '#EDF3FA' }
  ];
  function hexToRgb(h) { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbToHex(r, g, b) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
  function mix(a, b, t) { const x = hexToRgb(a), y = hexToRgb(b); return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); }
  // ---- (v4.10) italic lines (company, school, title) always read clearly on what is behind them ----
  // The colour under the text is worked out from the shapes drawn before it; a colour that is too faint for it
  // is made darker (light page) or lighter (dark page), keeping its hue, until it reaches a clear contrast.
  const ITALIC_MIN = 4.6;
  function hex6(c) { c = String(c || ''); return /^#[0-9a-f]{3}$/i.test(c) ? '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : (/^#[0-9a-f]{6}$/i.test(c) ? c : null); }
  function luminance(c) { return hexToRgb(c).map(v => v / 255).map(u => u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4)).reduce((a, u, i) => a + u * [0.2126, 0.7152, 0.0722][i], 0); }
  function contrast(a, b) { const A = luminance(a), B = luminance(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); }
  function inPoly(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function colourUnder(ops, upto, x, y) {
    for (let i = upto - 1; i >= 0; i--) {
      const o = ops[i];
      if ((o.t === 'rect' || o.t === 'rrect') && o.fill && x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return hex6(o.fill);
      if (o.t === 'circle' && o.fill && Math.hypot(x - o.cx, y - o.cy) <= o.r) return hex6(o.fill);
      if (o.t === 'poly' && o.fill && inPoly(o.pts, x, y)) return hex6(o.fill);
      if (o.t === 'grad' && inPoly(o.pts, x, y)) {
        const dx = o.x1 - o.x0, dy = o.y1 - o.y0, L = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - o.x0) * dx + (y - o.y0) * dy) / L)) * (o.stops.length - 1);
        const k = Math.min(o.stops.length - 2, Math.floor(t));
        return mix(hex6(o.stops[k]) || '#ffffff', hex6(o.stops[k + 1]) || '#ffffff', t - k);
      }
      if (o.t === 'img' && x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return null;   // over a picture: leave it
    }
    return '#ffffff';
  }
  // (v4.11) a page-colour theme: the white of the page (and white boxes on it) becomes the page colour
  const isWhite = c => /^#(fff|ffffff)$/i.test(String(c || ''));
  function pageBackground(ops, bg) {
    ops.forEach(o => {
      if (o.t === 'text' || o.t === 'icon' || o.t === 'line' || o.t === 'img') return;
      if (isWhite(o.fill)) o.fill = bg;
      if (o.t === 'grad') o.stops = o.stops.map(c => isWhite(c) ? bg : c);
    });
    ops.unshift({ t: 'rect', x: 0, y: 0, w: PAGE_W, h: PAGE_H, fill: bg });
  }
  /* (v4.49) page backgrounds. A template whose page is one flat colour gets plain colours; a template whose page is a
     gradient gets gradients. theme.bgPick = 1..26 (0 or none: the template's own). */
  // (v4.51) 26 plain colours and 26 gradients, light and dark: the CV text changes colour by itself to stay readable
  const BG_FLAT = ['#FBF5EA', '#EEF6F0', '#EDF3FA', '#FCEFF1', '#F3EFFB', '#F2F0EB', '#FFF8E1', '#E8F7F8', '#FDF0E6', '#EEF0F4', '#F4F9E9', '#FAF0F6', '#E9EEF5',
    '#1E2430', '#0F223F', '#12332A', '#2A1838', '#3A1E26', '#161616', '#0B3B4A', '#3B2A12', '#14213D', '#264653', '#3D405B', '#5B2333', '#2F4858'];
  const BG_GRAD = [['#FFFFFF', '#E2ECFA'], ['#FFFDF6', '#F0E1C2'], ['#F7FFF9', '#D6ECDF'], ['#FFF7F9', '#F2D6DF'], ['#FAF7FF', '#DED5F3'], ['#FCFCFC', '#DCDCDC'],
    ['#FFEFBA', '#FFFFFF'], ['#E0EAFC', '#CFDEF3'], ['#FDFCFB', '#E2D1C3'], ['#D3CCE3', '#E9E4F0'], ['#FFDDE1', '#EE9CA7'], ['#E6F9F4', '#B9E4D6'], ['#FFF1E6', '#F7C9A9'],
    ['#0F2027', '#203A43', '#2C5364'], ['#141E30', '#243B55'], ['#232526', '#414345'], ['#16222A', '#3A6073'], ['#24112F', '#4B2A5E'], ['#0A2620', '#1F5A47'],
    ['#000428', '#004E92'], ['#0F0C29', '#302B63', '#24243E'], ['#134E5E', '#71B280'], ['#2C3E50', '#4CA1AF'], ['#200122', '#6F0000'], ['#41295A', '#2F0743'], ['#1D4350', '#A43931']];
  const BG_N = 26;
  function opArea(o) {
    if (o.t === 'rect' || o.t === 'rrect') return Math.abs(o.w * o.h);
    if (o.t === 'circle') return Math.PI * o.r * o.r;
    if ((o.t === 'poly' || o.t === 'grad') && o.pts) { let a = 0; o.pts.forEach((q, i) => { const r = o.pts[(i + 1) % o.pts.length]; a += q[0] * r[1] - r[0] * q[1]; }); return Math.abs(a / 2); }
    return 0;
  }
  const opColour = o => o.t === 'grad' ? o.stops.reduce((m, c, i) => mix(m, hex6(c) || '#ffffff', 1 / (i + 1)), hex6(o.stops[0]) || '#ffffff') : hex6(o.fill);
  // what the page background of a laid-out page is: { kind: 'flat' | 'grad', dark }
  function bgKindOf(ops) {
    let best = null, A = 0;
    ops.forEach(o => { if (o.t !== 'rect' && o.t !== 'rrect' && o.t !== 'poly' && o.t !== 'grad' && o.t !== 'circle') return; if (o.t !== 'grad' && !hex6(o.fill)) return; const a = opArea(o); if (a > A) { A = a; best = o; } });
    if (!best || A < PAGE_W * PAGE_H * 0.3) return { kind: 'flat', dark: false, white: true };
    const c = opColour(best), dark = luminance(c) < 0.18;
    if (!dark && isWhite(c)) return { kind: 'flat', dark: false, white: true };
    return { kind: best.t === 'grad' ? 'grad' : 'flat', dark, base: c };
  }
  function bgSetOf(k) { return k.kind === 'grad' ? BG_GRAD : BG_FLAT; }
  const spread = (stops, n) => Array.from({ length: Math.max(2, n) }, (_, i) => {
    const t = i / (Math.max(2, n) - 1) * (stops.length - 1), k = Math.min(stops.length - 2, Math.floor(t));
    return mix(stops[k], stops[k + 1], t - k);
  });
  function applyBgPick(pages, pick) {
    const k = bgKindOf(pages[0]), set = bgSetOf(k), v = set[(pick - 1) % BG_N];
    if (!v) return;
    const big = o => opArea(o) > PAGE_W * PAGE_H * 0.012;
    pages.forEach(ops => {
      if (k.white) {
        pageBackground(ops, Array.isArray(v) ? v[0] : v);
        return;
      }
      const lum0 = luminance(k.base);
      ops.forEach(o => {
        if (!big(o)) return;
        if (o.t === 'grad' && Array.isArray(v)) {
          const c = opColour(o);
          if ((luminance(c) < 0.18) === k.dark && (k.dark || luminance(c) > 0.6)) o.stops = spread(v, o.stops.length);
        } else if (o.t !== 'grad' && hex6(o.fill)) {
          const c = hex6(o.fill), L = luminance(c);
          if ((L < 0.18) !== k.dark || (!k.dark && L < 0.6)) return;
          // keep the template's light and dark steps: a piece a little lighter than the page stays a little lighter
          const base = Array.isArray(v) ? mix(v[0], v[v.length - 1], 0.5) : v, d = L - lum0;
          o.fill = d > 0.004 ? mix(base, '#FFFFFF', Math.min(0.35, d * 3)) : d < -0.004 ? mix(base, '#000000', Math.min(0.35, -d * 3)) : base;
        }
      });
    });
  }
  // for the Colour tool: which six backgrounds this template gets
  function bgOptions(cv, opts) {
    try {
      const c = Object.assign({}, cv, { theme: Object.assign({}, cv.theme, { bgPick: 0 }) });
      const k = bgKindOf(layout(c, opts)[0]);
      return { kind: k.kind, dark: !!k.dark, swatches: bgSetOf(k) };
    } catch (e) { return { kind: 'flat', dark: false, swatches: BG_FLAT }; }
  }
  // (v4.51) after a background is chosen: every text and icon is checked against what is under it and made lighter
  // or darker until it reads clearly (only text that is hard to read changes)
  const READ_MIN = 4.2;
  function readablePts(o) {
    if (o.t === 'text' && hex6(o.color)) {
      const w = measure(o.s, o.size, o.font, famOf(o.fam || FAM));
      let x = o.x; if (o.align === 'right') x -= w; else if (o.align === 'center') x -= w / 2;
      const yy = o.y - o.size * 0.3528 * 0.35;
      return [0.05, 0.5, 0.95].map(f => [x + w * f, yy]);
    }
    if (o.t === 'icon' && hex6(o.color)) { const c = o.s * 12; return [[o.x + c, o.y + c]]; }
    return null;
  }
  // before the new background goes in: what is under each text now (text whose background does not change keeps its colour)
  function markUnder(ops) { ops.forEach((o, i) => { const pts = readablePts(o); if (pts) o._under = pts.map(q => colourUnder(ops, i, q[0], q[1]) || '').join(); }); }
  function readableAll(ops) {
    ops.forEach((o, i) => {
      const keep = o._under; delete o._under;
      const pts0 = readablePts(o);
      if (!pts0 || keep == null) return;
      if (pts0.map(q => colourUnder(ops, i, q[0], q[1]) || '').join() === keep) return;
      const pts = pts0;
      const bgs = pts.map(q => colourUnder(ops, i, q[0], q[1]));
      if (bgs.some(b => !b)) return;
      const from = hex6(o.color), worst = cc => Math.min(...bgs.map(b => contrast(cc, b)));
      // (v4.53) on a dark background, text that does not stand out strongly goes full white
      if (o.t === 'text' && bgs.every(b => luminance(b) < 0.2) && worst(from) < 7) { o.color = '#FFFFFF'; return; }
      if (worst(from) >= READ_MIN) return;
      const best = ['#000000', '#FFFFFF'].map(to => {
        let k = 0, cc = from;
        while (k < 1 && worst(cc) < READ_MIN) { k = Math.min(1, k + 0.05); cc = mix(from, to, k); }
        return { cc, k, cr: worst(cc) };
      }).sort((p, q) => (q.cr >= READ_MIN) - (p.cr >= READ_MIN) || (p.cr >= READ_MIN ? p.k - q.k : q.cr - p.cr))[0];
      o.color = best.cc;
    });
  }
  // (v4.77) Name size slider: the name's letters get bigger or smaller where the template put them.
  // Lines drawn by nameLine keep their alignment (left, centre or right); other big text made only of the name's words
  // is found by its words. Each line keeps its own baseline.
  function scaleName(ops, k, cv) {
    const words = new Set(String([cv.fullName, cv.firstName, cv.lastName].filter(Boolean).join(' ')).toUpperCase().split(/\s+/).filter(Boolean));
    if (!words.size) return;
    const isName = o => o.t === 'text' && !o.nmFixed && (o.nm || (o.size >= 12 && /bold/i.test(o.font || '') && String(o.s).trim() &&
      String(o.s).toUpperCase().split(/\s+/).filter(Boolean).every(w => words.has(w))));
    // group: ops of one nameLine call, or name ops on the same baseline
    const groups = new Map();
    ops.forEach(o => {
      if (!isName(o)) return;
      const key = o.nm || ('y' + Math.round(o.y * 10));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    });
    groups.forEach((list, key) => {
      list.sort((a, b) => a.x - b.x);
      const fam = famOf(list[0].fam || 'helvetica');
      const oldW = list.map(o => measure(o.s, o.size, o.font, fam));
      list.forEach(o => { o.size = o.size * k; });
      if (list.length === 1 && !(typeof key === 'object')) return;     // one piece: its own alignment keeps it in place
      const newW = list.map(o => measure(o.s, o.size, o.font, fam));
      const space = measure(' ', list[0].size, list[0].font, fam);
      const total = newW.reduce((a, b) => a + b, 0) + space * (list.length - 1);
      const g0 = typeof key === 'object' ? key : { x: list[0].x, align: list[0].align || 'left' };
      let cx = g0.align === 'center' ? g0.x - total / 2 : g0.align === 'right' ? g0.x - total : (typeof key === 'object' ? g0.x : list[0].x);
      if (list.length === 1) {
        const o = list[0];
        if (o.align === 'left' || !o.align) o.x = cx;
        return;
      }
      list.forEach((o, i) => { o.x = cx; o.align = 'left'; cx += newW[i] + space; });
    });
  }
  function readableItalic(ops) {
    ops.forEach((o, i) => {
      if (o.t !== 'text' || !/italic/i.test(o.font || '') || !hex6(o.color)) return;
      const w = measure(o.s, o.size, o.font, famOf(o.fam || FAM));
      let x = o.x; if (o.align === 'right') x -= w; else if (o.align === 'center') x -= w / 2;
      const yy = o.y - o.size * 0.3528 * 0.35;
      const bgs = [0.05, 0.5, 0.95].map(f => colourUnder(ops, i, x + w * f, yy));
      if (bgs.some(b => !b)) return;
      let c = hex6(o.color);
      if (Math.min(...bgs.map(b => contrast(c, b))) >= ITALIC_MIN) return;
      // try darker and lighter: take the smaller change that reads clearly (or, on a mid-tone, the clearer one)
      const from = c, best = ['#000000', '#ffffff'].map(to => {
        let k = 0, cc = from;
        while (k < 1 && Math.min(...bgs.map(b => contrast(cc, b))) < ITALIC_MIN) { k = Math.min(1, k + 0.04); cc = mix(from, to, k); }
        return { cc, k, cr: Math.min(...bgs.map(b => contrast(cc, b))) };
      }).sort((p, q) => (q.cr >= ITALIC_MIN) - (p.cr >= ITALIC_MIN) || (p.cr >= ITALIC_MIN ? p.k - q.k : q.cr - p.cr))[0];
      o.color = best.cc;
    });
  }
  function themeColors(theme) {
    let p = PALETTES.find(x => x.id === (theme.color === 'gcc' ? 'royal' : theme.color)) || PALETTES[0];
    if (theme.color === 'custom' && /^#[0-9a-f]{6}$/i.test(theme.custom || '')) {
      const a = theme.custom;
      p = { primary: mix(a, '#000000', 0.55), accent: a, highlight: mix(a, '#FFFFFF', 0.45) };
    }
    // live preview while the colour carousel moves: a mix of two themes (never saved)
    if (theme.blend && /^#[0-9a-f]{6}$/i.test(theme.blend.primary || '')) p = theme.blend;
    const BG = /^#[0-9a-f]{6}$/i.test(p.bg || '') && p.bg.toUpperCase() !== '#FFFFFF' ? p.bg : null, W = BG || '#FFFFFF';
    return {
      primary: p.primary, accent: p.accent, highlight: p.highlight,
      tint: mix(p.accent, W, 0.9), tint2: mix(p.accent, W, 0.8),
      dark2: mix(p.primary, '#FFFFFF', 0.14), soft: mix(p.primary, W, 0.7),
      paper: mix(p.highlight, W, 0.94), grey: BG ? mix(BG, '#000000', 0.04) : '#F2F3F5', hlText: mix(p.highlight, '#000000', 0.38),
      ink: C.ink, muted: C.muted, line: C.line, white: '#FFFFFF', bg: BG,
      // only black and white: the light fills stay white too
      ...(p.bw ? { tint: '#FFFFFF', tint2: '#FFFFFF', paper: '#FFFFFF', grey: '#FFFFFF', soft: '#FFFFFF', hlText: '#000000', muted: '#000000', line: '#000000' } : {})
    };
  }

  /* ---------- design settings (stored with each CV) ---------- */
  const SECTIONS = { summary: 'Profile', experience: 'Work experience', education: 'Education', skills: 'Skills', languages: 'Languages', certificates: 'Certificates and training',
    achievements: 'Achievements', awards: 'Awards & Honors', projects: 'Projects', hobbies: 'Hobbies', custom: 'Your own sections', references: 'References' };
  const DEFAULT_THEME = {
    design: 'sidebar', color: 'royal', custom: '#1F4FD8', font: 'helvetica',
    fontScale: 1, lineHeight: 1, sectionSpace: 1, margin: 15,
    sideLine: 1, sideSpace: 1, nameScale: 1,          // (v4.47) the side column of a two-column template has its own spacing
    photoShape: 'rounded', photoSize: 1, showPhoto: true, textBW: false,
    order: ['summary', 'experience', 'education', 'skills', 'languages', 'certificates', 'achievements', 'awards', 'projects', 'hobbies', 'custom', 'references'],
    hide: []
  };
  function normTheme(t) {
    const th = Object.assign({}, DEFAULT_THEME, t || {});
    if (th.color === 'gcc') th.color = 'royal';          // colour theme renamed
    const known = Object.keys(SECTIONS);
    th.order = (th.order || []).filter(s => known.includes(s));
    // a section added in a later version goes in before References (or at the end)
    known.forEach(s => { if (th.order.includes(s)) return; const r = th.order.indexOf('references'); if (r >= 0 && s !== 'references') th.order.splice(r, 0, s); else th.order.push(s); });
    th.hide = (th.hide || []).filter(s => known.includes(s));
    th.fontScale = Math.min(1.5, Math.max(0.5, +th.fontScale || 1));
    th.nameScale = Math.min(1.3, Math.max(0.7, +th.nameScale || 1));          // (v4.77) the name's own size
    th.lineHeight = Math.min(1.7, Math.max(0.85, +th.lineHeight || 1));
    th.sectionSpace = Math.min(2, Math.max(0.1, +th.sectionSpace || 1));
    th.sideLine = Math.min(1.7, Math.max(0.85, +th.sideLine || 1));
    th.sideSpace = Math.min(2, Math.max(0.1, +th.sideSpace || 1));
    th.margin = Math.min(25, Math.max(8, +th.margin || 15));
    th.photoSize = Math.min(1.3, Math.max(0.7, +th.photoSize || 1));
    return th;
  }

  /* ---------- layout engine (shared by every template) ---------- */
  // Side-column sections (skills, languages...) that do not fit next to page 1 continue in the
  // side column of page 2 when the design has one there and the CV runs to page 2 anyway;
  // otherwise they move into the main column (second run).
  // A design may ask for roomier spacing (D.roomy: more open lines, more space under headings); it is used
  // only when it costs no extra page and moves nothing out of the side column.
  // (v4.47) where a template keeps its side column (skills, languages...): null for a one-column template
  let LAST_SIDE = null;
  function sideOf(cv, opts) {
    LAST_SIDE = null;
    try { layout(cv, opts); } catch (e) { return null; }
    return LAST_SIDE ? { left: LAST_SIDE.x + LAST_SIDE.w / 2 < 105 } : null;
  }
  function layout(cv, opts) {
    opts = opts || {};
    const th = normTheme(Object.assign({}, cv.theme, opts.theme));
    const D = window.CVDesigns[opts.design || th.design] || window.CVDesigns[window.CVDesignList[0].id];
    const run = roomy => { const f = layoutOnce(cv, opts, true, roomy); return f.ok ? f : layoutOnce(cv, opts, false, roomy); };
    let pages;
    if (!D.roomy) pages = run(false).pages;
    else {
      const a = run(true);
      if (a.pages.length === 1 && !a.over) pages = a.pages;
      else { const b = run(false); pages = (b.pages.length * 10 + b.over) < (a.pages.length * 10 + a.over) ? b.pages : a.pages; }
    }
    // (v4.97) no italic text in any CV: italic becomes regular (bold italic becomes bold), shown 60% strong instead
    pages = pages.map(ops => ops.map(o => (o && o.t === 'text' && (o.font === 'italic' || o.font === 'boldItalic')) ? Object.assign({}, o, { font: o.font === 'italic' ? 'regular' : 'bold', op: 0.6 }) : o));
    return th.textBW ? pages.map(textBW) : pages.map(fixContrast);
  }
  // (v4.97) Design > Colour > "Black and white text": every text (and its small icons) becomes black, or white
  // where it was light text on a dark part. Shapes, lines and pictures keep their colours.
  // (v4.97) every text must stand out from what is under it: a colour too close to its background
  // (e.g. a yellow company name on a cream column) is made darker, or lighter on dark parts, keeping its hue
  const HEX = /^#?([0-9a-f]{6})$/i;
  const rgbOf = c => { const m = HEX.exec(String(c || '').trim()); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const hexOf = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  const lumA = a => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(a[0]) + 0.7152 * f(a[1]) + 0.0722 * f(a[2]); };
  const ratio = (a, b) => { const x = lumA(a), y = lumA(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  function bgFinder() {
    const inPoly = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const shapes = [];
    return {
      add(o) {
        if (((o.t === 'rect' || o.t === 'rrect' || o.t === 'circle' || o.t === 'poly') && o.fill && HEX.test(String(o.fill).trim()) && !(o.op < 0.5)) || (o.t === 'grad' && o.stops)) { shapes.push(o); return true; }
        return false;
      },
      at(o) {
        const sz = o.t === 'icon' ? (o.s || 0.4) * 24 : (o.size || 8);
        const x = o.t === 'icon' ? o.x + sz / 2 : (o.align === 'right' ? o.x - 2 : o.align === 'center' ? o.x : o.x + 2);
        const y = o.t === 'icon' ? o.y + sz / 2 : o.y - sz * 0.3;
        for (let i = shapes.length - 1; i >= 0; i--) {
          const r = shapes[i];
          if ((r.t === 'rect' || r.t === 'rrect') && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.fill;
          if (r.t === 'circle' && Math.hypot(x - r.cx, y - r.cy) <= r.r) return r.fill;
          if ((r.t === 'poly' || r.t === 'grad') && r.pts && r.pts.length > 2 && inPoly(r.pts, x, y)) return r.t === 'grad' ? r.stops[Math.floor(r.stops.length / 2)] : r.fill;
        }
        return '#FFFFFF';
      }
    };
  }
  function fixContrast(ops) {
    const bg = bgFinder();
    return ops.map(o => {
      if (bg.add(o)) return o;
      if (o.t !== 'text' || !o.color) return o;
      const c = rgbOf(o.color), b = rgbOf(bg.at(o)); if (!c || !b) return o;
      const op = o.op == null ? 1 : o.op, seen = x => x.map((v, i) => v * op + b[i] * (1 - op));
      const need = (o.size || 8) >= 13 ? 3 : 4.2;
      if (ratio(seen(c), b) >= need) return o;
      const dark = lumA(b) > 0.35, goal = dark ? [0, 0, 0] : [255, 255, 255];
      let k = 0, nc = c;
      while (k < 1 && ratio(seen(nc), b) < need) { k += 0.05; nc = c.map((v, i) => v + (goal[i] - v) * k); }
      return Object.assign({}, o, { color: hexOf(nc) });
    });
  }
  function textBW(ops) {
    const lum = c => {
      const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim()); if (!m) return 0;
      const n = parseInt(m[1], 16), f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(n >> 16 & 255) + 0.7152 * f(n >> 8 & 255) + 0.0722 * f(n & 255);
    };
    // (v4.97) decide by what is UNDER the text (the last filled shape there), not by the text's own colour,
    // so a light heading on a white page becomes black and the name on a dark band stays white
    const inPoly = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const shapes = [];
    const bgAt = (x, y) => {
      for (let i = shapes.length - 1; i >= 0; i--) {
        const o = shapes[i];
        if ((o.t === 'rect' || o.t === 'rrect') && x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return o.fill;
        if (o.t === 'circle' && Math.hypot(x - o.cx, y - o.cy) <= o.r) return o.fill;
        if ((o.t === 'poly' || o.t === 'grad') && o.pts && o.pts.length > 2 && inPoly(o.pts, x, y)) return o.t === 'grad' ? o.stops[Math.floor(o.stops.length / 2)] : o.fill;
      }
      return '#FFFFFF';
    };
    return ops.map(o => {
      if (((o.t === 'rect' || o.t === 'rrect' || o.t === 'circle' || o.t === 'poly') && o.fill && /^#?[0-9a-f]{6}$/i.test(String(o.fill).trim())) || (o.t === 'grad' && o.stops)) { shapes.push(o); return o; }
      if (!((o.t === 'text' || o.t === 'icon') && o.color)) return o;
      const sz = o.t === 'icon' ? (o.s || 0.4) * 24 : (o.size || 8), x = o.t === 'icon' ? o.x + sz / 2 : (o.align === 'right' ? o.x - 2 : o.align === 'center' ? o.x : o.x + 2);
      const y = o.t === 'icon' ? o.y + sz / 2 : o.y - sz * 0.3;
      return Object.assign({}, o, { color: lum(bgAt(x, y)) < 0.3 ? '#FFFFFF' : '#000000' });
    });
  }
  function layoutOnce(cv, opts, carryOK, roomy) {
    const th = normTheme(Object.assign({}, cv.theme, opts.theme));
    const DES = window.CVDesigns;
    const D = DES[opts.design || th.design] || DES[window.CVDesignList[0].id];
    FAM = famOf(th.font);
    const T = themeColors(th);
    if (D.recolor) Object.assign(T, D.recolor(T));   // e.g. light text on a dark page
    const R = roomy && D.roomy ? D.roomy : null;
    // D.dense: a compact design (Creative, v4.00): closer lines, smaller gaps between sections, lower headings
    const DN = D.dense || null;
    const SC = th.fontScale, LHM = th.lineHeight * (R ? R.line || 1 : 1) * (DN ? DN.line || 1 : 1), SPM = th.sectionSpace * (DN ? DN.space || 1 : 1);
    const pages = [];
    let ops, y = 0, pageNo = 0, F;

    const contacts = [
      ['Phone', cv.phone], ['Email', cv.email], ['Address', cv.address || cv.location], ['LinkedIn', linkedinText(cv.linkedin)], ['Website', String(cv.website || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')], ['Nationality', cv.nationality],
      ['Date of birth', cv.dob ? formatDate(cv.dob) : ''], ['Age', !cv.dob && cv.age ? String(cv.age) : ''], ['Gender', cv.gender], ['Marital status', cv.marital], ['Passport no.', cv.passport], ['Driving licence', cv.licence]
    ].filter(c => c[1]);
    const hidden = new Set(th.hide);
    const skills = hidden.has('skills') ? [] : (cv.skills || []).filter(Boolean);
    // (v4.33) hobbies as a list (a design may show them in its side column, above the languages)
    const hobbies = hidden.has('hobbies') ? [] : String(cv.hobbies || '').split(/\n+|,|;/).map(t => t.replace(/^\s*[-\u2022*]\s*/, '').trim()).filter(Boolean).map(h => h.charAt(0).toUpperCase() + h.slice(1));
    const languages = hidden.has('languages') ? [] : (cv.languages || []).filter(l => l && l.name);

    const g = {
      rect: (x, yy, w, h, fill, stroke, lw) => ops.push({ t: 'rect', x, y: yy, w, h, fill, stroke, lw }),
      rrect: (x, yy, w, h, r, fill, stroke, lw) => ops.push({ t: 'rrect', x, y: yy, w, h, r, fill, stroke, lw }),
      line: (x1, y1, x2, y2, color, lw) => ops.push({ t: 'line', x1, y1, x2, y2, color, lw: lw || 0.25 }),
      text: (s, x, yy, size, st, color, align) => ops.push({ t: 'text', s: clean(s), x, y: yy, size, font: st || 'regular', fam: FAM, color: color || T.ink, align: align || 'left' }),
      img: (key, x, yy, w, h, clip) => ops.push({ t: 'img', key, x, y: yy, w, h, clip }),
      circle: (cx, cy, r, fill, stroke, lw) => ops.push({ t: 'circle', cx, cy, r, fill, stroke, lw }),
      poly: (pts, fill) => ops.push({ t: 'poly', pts, fill }),
      mix,
      // linear gradient over a shape, drawn as thin overlapping slices
      // stops: colours spread evenly; angle: 0 = left to right, 90 = top to bottom
      // true linear gradient over a shape (a real PDF shading, like Android's PDF engine writes)
      // stops: colours spread evenly; angle: 0 = left to right, 90 = top to bottom
      // ref: optional bigger shape the gradient runs across (so a piece matches the page background)
      gradPoly(pts, stops, angle, ref) {
        if (!Array.isArray(stops)) { g.poly(pts, stops); return; }
        const a = (angle || 0) * Math.PI / 180, d = [Math.cos(a), Math.sin(a)];
        const src = Array.isArray(ref) ? ref : pts;
        const proj = src.map(p => p[0] * d[0] + p[1] * d[1]);
        const t0 = Math.min(...proj), t1 = Math.max(...proj);
        if (t1 - t0 <= 0) { g.poly(pts, stops[0]); return; }
        const cx = src.reduce((v, p) => v + p[0], 0) / src.length, cy = src.reduce((v, p) => v + p[1], 0) / src.length;
        const c0 = cx * d[0] + cy * d[1];
        ops.push({ t: 'grad', pts, stops: stops.slice(),
          x0: cx + d[0] * (t0 - c0), y0: cy + d[1] * (t0 - c0), x1: cx + d[0] * (t1 - c0), y1: cy + d[1] * (t1 - c0) });
      },
      gradRect(x, yy, w, h, stops, angle, n) { g.gradPoly([[x, yy], [x + w, yy], [x + w, yy + h], [x, yy + h]], stops, angle, n); },
      // polished metal (gold, bronze) and soft depth gradients from one colour
      metal: c => [mix(c, '#000000', 0.42), mix(c, '#000000', 0.1), mix(c, '#FFFFFF', 0.55), mix(c, '#000000', 0.04), mix(c, '#000000', 0.38)],
      depth: (c, k) => [mix(c, '#FFFFFF', 0.14 * (k || 1)), c, mix(c, '#000000', 0.32 * (k || 1))],
      // rounded rectangle as points; r = [top-left, top-right, bottom-right, bottom-left]
      roundPts(x, yy, w, h, r) {
        r = (Array.isArray(r) ? r : [r, r, r, r]).map(v => Math.max(0, Math.min(v || 0, w / 2, h / 2)));
        const pts = [], arc = (cx, cy, rad, a0) => {
          if (!rad) { pts.push([cx, cy]); return; }
          for (let i = 0; i <= 8; i++) { const a = (a0 + 90 * i / 8) * Math.PI / 180; pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]); }
        };
        arc(r[0] ? x + r[0] : x, r[0] ? yy + r[0] : yy, r[0], 180);
        arc(r[1] ? x + w - r[1] : x + w, r[1] ? yy + r[1] : yy, r[1], 270);
        arc(r[2] ? x + w - r[2] : x + w, r[2] ? yy + h - r[2] : yy + h, r[2], 0);
        arc(r[3] ? x + r[3] : x, r[3] ? yy + h - r[3] : yy + h, r[3], 90);
        return pts;
      },
      // outline of a photo frame shape inside the box x, y, w, h
      shapePts(shape, x, yy, w, h) {
        const cx = x + w / 2, cy = yy + h / 2, ring = (n, rot) => Array.from({ length: n }, (_, i) => {
          const a = (rot + 360 * i / n) * Math.PI / 180; return [cx + w / 2 * Math.cos(a), cy + h / 2 * Math.sin(a)];
        });
        switch (shape) {
          case 'circle': return ring(72, 0);
          case 'hex': return [[cx, yy], [x + w, yy + h * 0.25], [x + w, yy + h * 0.75], [cx, yy + h], [x, yy + h * 0.75], [x, yy + h * 0.25]];
          case 'hexflat': return [[x + w * 0.25, yy], [x + w * 0.75, yy], [x + w, cy], [x + w * 0.75, yy + h], [x + w * 0.25, yy + h], [x, cy]];
          case 'oct': { const c = 0.293; return [[x + w * c, yy], [x + w * (1 - c), yy], [x + w, yy + h * c], [x + w, yy + h * (1 - c)], [x + w * (1 - c), yy + h], [x + w * c, yy + h], [x, yy + h * (1 - c)], [x, yy + h * c]]; }
          case 'dec': return ring(10, -90);
          case 'arch': return g.roundPts(x, yy, w, h, [w / 2, w / 2, w * 0.14, w * 0.14]);
          case 'squircle': return g.roundPts(x, yy, w, h, Math.min(w, h) * 0.24);
          case 'stadium': return g.roundPts(x, yy, w, h, Math.min(w, h) * 0.42);
          case 'rounded': return g.roundPts(x, yy, w, h, 3.5);
          default: return [[x, yy], [x + w, yy], [x + w, yy + h], [x, yy + h]];
        }
      },
      // photo in a shape with optional rings (colour or gradient stops); initials when there is no photo
      photoShape(x, yy, w, h, shape, o) {
        o = o || {};
        if (!g.showPhoto || w <= 0) return;
        const P = pad => g.shapePts(shape, x - pad, yy - pad, w + 2 * pad, h + 2 * pad);
        if (o.ring) g.gradPoly(P((o.ringW || 2) + (o.gapW || 0)), o.ring, o.angle == null ? 45 : o.angle);
        if (o.gapW) g.poly(P(o.gapW), o.gap || T.white);
        if (g.hasPhoto) { g.img('photo', x, yy, w, h, g.shapePts(shape, x, yy, w, h)); return; }
        g.gradPoly(P(0), o.fill || g.depth(T.accent), 90);
        const ts = Math.min(w, h) * 0.34 / PT;
        g.text(g.initials(), x + w / 2, yy + h / 2 + ts * PT * 0.36, ts, 'bold', o.initials || T.white, 'center');
      },
      // draw into a separate list (to measure first, then add a background under it)
      // an email that is too long for the width: break before @ and dots, keeping each line at full size
      breakEmail(v, w, size, at) {
        if (measure(v, size, 'regular') * 0.84 <= w) return [v];
        const lines = [];
        v.split(at || /(?=[@.])/).forEach(tk => {
          const last = lines.length - 1;
          if (last >= 0 && measure(lines[last] + tk, size, 'regular') <= w) lines[last] += tk; else lines.push(tk);
        });
        return lines.length > 3 ? lines.slice(0, 2).concat(lines.slice(2).join('')) : lines;
      },
      layer(fn) { const keep = ops, tmp = []; ops = tmp; let r; try { r = fn(); } finally { ops = keep; } return { ops: tmp, r }; },
      emit(list) { list.forEach(o => ops.push(o)); },
      measure: (t, size, st) => measure(t, size, st), wrap, formatDate, C, CFG, cv, T, th,
      contacts, skills, languages, LEVELS,
      M: th.margin, PS: th.photoSize, LHM,
      fs: n => n * SC,
      hasPhoto: !!opts.hasPhoto && th.showPhoto !== false,
      showPhoto: th.showPhoto !== false,
      branding: cv.branding !== false,
      name: cv.fullName || 'Your Name',
      // first and last name (CVs from before v3.76 have only the full name: its last word is the last name)
      ...(() => {
        const full = String(cv.fullName || 'Your Name').trim().split(/\s+/).filter(Boolean);
        const first = String(cv.firstName || '').trim().split(/\s+/).filter(Boolean);
        const n1 = cv.firstName != null && first.length && first.length <= full.length ? first.length : Math.max(1, full.length - 1);
        return { firstWords: full.length > 1 ? n1 : full.length };
      })(),
      roomy: !!R,                // the design's roomier spacing is on
      useIcons: !D.noIcons,
      twoTone: !!D.twoTone, lastColor: D.lastColor || null,     // first and last name in two colours
      iconOf: k => (!D.noIcons && ICON_OF[k]) || null,
      // "Gender: " for personal details, '' for phone, email, address and LinkedIn
      labelOf: k => PLAIN[k] ? '' : (LABEL_OF[k] || k) + ': ',
      contactText: c => (PLAIN[c[0]] ? '' : (LABEL_OF[c[0]] || c[0]) + ': ') + c[1],
      contactWidth: (c, size) => measure(g.labelOf(c[0]), size, 'bold') + measure(c[1], size, 'regular'),
      // one detail on one line: the label in bold, then the value; shrinks to 84 % at most, then shortens the value
      contactDraw(c, x, yy, maxW, size, color, labelColor, align) {
        const lab = g.labelOf(c[0]), w0 = g.contactWidth(c, size);
        const s = w0 > maxW ? Math.max(size * 0.84, size * maxW / w0 * 0.98) : size;
        const lw = lab ? measure(lab, s, 'bold') : 0;
        const val = lw + measure(c[1], s, 'regular') > maxW ? g.fit(c[1], Math.max(4, maxW - lw), s, 'regular') : c[1];
        const tw = lw + measure(val, s, 'regular');
        let cx = align === 'right' ? x - tw : align === 'center' ? x - tw / 2 : x;
        if (lab) { g.text(lab.trimEnd(), cx, yy, s, 'bold', labelColor || color); cx += lw; }
        g.text(val, cx, yy, s, 'regular', color);
        return tw;
      },
      // a small contact icon; x, yTop: its top-left corner; size: its width in mm
      icon(kind, x, yTop, size, color, lw) { if (ICONS[kind]) ops.push({ t: 'icon', d: ICONS[kind], x, y: yTop, s: size / 24, color, lw: lw || 2 }); },
      // one line of the name; with two colours the first-name words get c1 and the last-name words c2
      // (startWord: how many words of the name came on the lines before)
      nameLine(text, x, yy, size, st, c1, c2, align, startWord) {
        const from = ops.length, grp = { x, align: align || 'left' };
        g._nameLine(text, x, yy, size, st, c1, c2, align, startWord);
        for (let i = from; i < ops.length; i++) if (ops[i].t === 'text') ops[i].nm = grp;       // (v4.77) the name: its size can change
      },
      _nameLine(text, x, yy, size, st, c1, c2, align, startWord) {
        if (!c2 || c2 === c1) { g.text(text, x, yy, size, st, c1, align); return; }
        const words = String(text).split(' '), runs = [];
        words.forEach((w, i) => {
          const c = (startWord || 0) + i < g.firstWords ? c1 : c2;
          if (runs.length && runs[runs.length - 1][1] === c) runs[runs.length - 1][0] += ' ' + w; else runs.push([w, c]);
        });
        const total = measure(text, size, st);
        let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
        runs.forEach(([t, c], i) => { g.text(t, cx, yy, size, st, c, 'left'); cx += measure(t + (i < runs.length - 1 ? ' ' : ''), size, st); });
      },
      oneLine(text, x, yy, maxW, size, st, color, align) {
        const w = measure(text, size, st);
        const sz = w > maxW ? Math.max(3.2, size * maxW / w * 0.98) : size;
        g.text(g.fit(text, maxW, sz, st), x, yy, sz, st, color, align);
      },
      fit(text, maxW, size, st) {
        let t = String(text || '');
        if (measure(t, size, st) <= maxW) return t;
        while (t.length > 1 && measure(t + '...', size, st) > maxW) t = t.slice(0, -1);
        return t.trimEnd() + '...';
      },
      wrapMax(text, maxW, size, st, maxLines) {
        const lines = wrap(text, maxW, size, st);
        if (lines.length <= maxLines) return lines;
        const keep = lines.slice(0, maxLines);
        keep[maxLines - 1] = g.fit(lines.slice(maxLines - 1).join(' '), maxW, size, st);
        return keep;
      },
      initials() { return (cv.fullName || '?').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase(); },
      // the photo in the chosen shape (a template may force a shape)
      photo(x, yy, w, h, ring, shape) {
        shape = shape || th.photoShape;
        if (shape === 'circle') {
          const r = Math.min(w, h) / 2, cx = x + w / 2, cy = yy + h / 2;
          if (ring) g.circle(cx, cy, r + 1.1, ring);
          g.circle(cx, cy, r + 0.25, T.white);
          g.img('photo', cx - r, cy - r, 2 * r, 2 * r, 'circle');
        } else if (shape === 'rounded') {
          if (ring) g.rrect(x - 1.1, yy - 1.1, w + 2.2, h + 2.2, 4.2, ring);
          g.rrect(x - 0.25, yy - 0.25, w + 0.5, h + 0.5, 3.3, T.white);
          g.img('photo', x, yy, w, h, 'rounded');
        } else {
          if (ring) g.rect(x - 1, yy - 1, w + 2, h + 2, ring);
          g.rect(x - 0.3, yy - 0.3, w + 0.6, h + 0.6, T.white);
          g.img('photo', x, yy, w, h);
        }
      },
      // photo, or a circle with initials when there is no photo
      photoOrInitials(x, yy, w, h, ring, fill, textColor, shape) {
        if (!g.showPhoto || w <= 0) return;
        if (g.hasPhoto) { g.photo(x, yy, w, h, ring, shape); return; }
        const r = Math.min(w, h) / 2.2;
        g.circle(x + w / 2, yy + h / 2, r, fill, ring, ring ? 0.7 : 0);
        const ts = r * 0.95 / PT;
        g.text(g.initials(), x + w / 2, yy + h / 2 + ts * PT * 0.36, ts, 'bold', textColor, 'center');
      },
      meter(x, yMid, level, on, off, k) {
        const n = Math.max(0, LEVELS.indexOf(level)), s = k || 1;
        // (v4.97) a design can show the level as one slim rounded bar instead of 5 blocks
        if (D.langStyle === 'bar') {
          const W = (LEVELS.length * 4.2 - 0.8) * s, h = 1.5 * s;
          g.rrect(x, yMid - h / 2, W, h, h / 2, off);
          g.rrect(x, yMid - h / 2, W * (n + 1) / LEVELS.length, h, h / 2, on);
          return;
        }
        for (let i = 0; i < LEVELS.length; i++) g.rect(x + i * 4.2 * s, yMid - 0.9 * s, 3.4 * s, 1.8 * s, i <= n ? on : off);
      },
      // contact, skills and languages in a column (sidebars); returns the new y
      sideOverflow: new Set(),
      sideDrew: new Set(), mainDrew: new Set(),       // (v4.49) hobbies are drawn once: in the side column if it shows them, else in the main part
      carry: [],                 // side sections continued in the page-2 side column
      sideLists(o) {
        let yy = o.y;
        // side columns keep the user's line spacing (a design's roomier main text does not apply here); o.lineK opens it a little
        if (D.side && D.side.length) LAST_SIDE = { x: o.x, w: o.w };
        const fsz = g.fs(8.8), lab = g.fs(6.8), lh = fsz * 0.45 * th.sideLine * (o.lineK || 1);
        // clear space before every section except the first
        const SS = th.sideSpace, LS = th.sideLine, END = 3 * SS;            // (v4.47) the side column's own sliders
        const head = (t, at) => o.heading(t, at > o.y + 0.5 ? at + (o.gap == null ? 4.5 : o.gap) * SS : at);
        // (v4.34) one text lane for the whole column: where the contact text starts (after its icons);
        // skill and hobby points sit under the icons, language names start on the same lane
        const ISZ = Math.min(3.3, 2.95 * SC), LX = o.x + ISZ + 1.9, LW = o.x + o.w - LX;
        const dot = (yv) => g.text('\u2022', o.x + ISZ / 2 - measure('\u2022', fsz, 'bold') / 2, yv, fsz, 'bold', o.bullet);
        function drawSec(sec, maxY) {
          if (sec === 'summary') {
            if (!cv.summary || hidden.has('summary')) return;
            yy = head(SECTIONS.summary, yy);
            const ls = wrap(cv.summary, o.w, fsz, 'regular');
            ls.forEach((l, i) => {
              if (yy > maxY - 3) return;
              const last = yy + lh > maxY - 3 && i < ls.length - 1;
              g.text(last ? g.fit(l + ' ' + ls.slice(i + 1).join(' '), o.w, fsz, 'regular') : l, o.x, yy, fsz, 'regular', o.value);
              yy += lh;
            });
            yy += END;
          } else if (sec === 'contact' && contacts.length) {
            yy = head('Contact', yy);
            // short details sit two in a row when the column is wide enough; labels bold so they stay readable
            const lsz = g.fs(7.2), gap = 4, half = (o.w - gap) / 2, pairOK = o.w >= 46;
            const SHORT = ['Phone', 'Nationality', 'Date of birth', 'Age', 'Gender', 'Marital status', 'Passport no.'];
            const rows = []; let pend = null;
            const iconRows = contacts.filter(c => g.iconOf(c[0]));
            contacts.filter(c => !g.iconOf(c[0])).forEach(c => {
              const short = pairOK && SHORT.includes(c[0]) && measure(c[1], fsz, 'regular') <= half && measure(c[0], lsz, 'bold') <= half;
              if (!short) { if (pend) rows.push([pend]); pend = null; rows.push([c]); return; }
              if (pend) { rows.push([pend, c]); pend = null; } else pend = c;
            });
            if (pend) rows.push([pend]);
            // never shrink below 84 % (no thin text); a long email breaks before the @ instead
            const drawFit = (t, x, yv, w) => {
              const wd = measure(t, fsz, 'regular'), sz = wd > w ? Math.max(fsz * 0.84, fsz * w / wd * 0.98) : fsz;
              g.text(g.fit(t, w, sz, 'regular'), x, yv, sz, 'regular', o.value);
            };
            const valueLines = (k, v, w) => {
              if (k === 'Email') return g.breakEmail(v, w, fsz);
              if (k === 'LinkedIn') return g.breakEmail(v, w, fsz, /(?=\/)/);      // a long link breaks before a slash
              return g.wrapMax(v, w, fsz, 'regular', k === 'Address' ? 4 : 2);
            };
            // phone, email, LinkedIn, address: a small icon and the value (no word label)
            const isz = Math.min(3.3, 2.95 * SC), itx = o.x + isz + 1.9, itw = o.w - isz - 1.9;
            // personal details: "Label: value" on one line, or the value under the label in a narrow column
            iconRows.forEach(c => {
              if (yy > maxY - 6) return;
              g.icon(g.iconOf(c[0]), o.x, yy - fsz * PT * 0.36 - isz / 2, isz, o.icon || o.bullet || o.label);
              let n;
              if (!g.labelOf(c[0])) {
                const ls = valueLines(c[0], c[1], itw);
                ls.forEach((l, j) => drawFit(l, itx, yy + j * lh, itw));
                n = ls.length;
              } else if (g.contactWidth(c, fsz) * 0.84 <= itw) { g.contactDraw(c, itx, yy, itw, fsz, o.value, o.value); n = 1; }
              else { g.text(g.labelOf(c[0]).trimEnd(), itx, yy, fsz, 'bold', o.value); drawFit(c[1], itx, yy + lh, itw); n = 2; }
              yy += n * lh + 1;                              // close together, 2 px more than v3.77
            });
            if (iconRows.length && rows.length) yy += 2.4;
            rows.forEach(r => {
              if (yy > maxY - 8) return;
              const w = r.length > 1 ? half : o.w;
              let n = 1;
              r.forEach((c, i) => {
                const x = o.x + i * (half + gap);
                g.text(c[0], x, yy, lsz, 'bold', o.label);
                const ls = valueLines(c[0], c[1], w);
                ls.forEach((l, j) => drawFit(l, x, yy + lsz * 0.5 + 1 + j * lh, w));
                n = Math.max(n, ls.length);
              });
              yy += lsz * 0.5 + 1 + n * lh + 2.6;
            });
            yy += END;
          } else if (sec === 'skills' && skills.length && o.chips && false) {
            // skills as small rounded tags, several in a row
            yy = head('Skills', yy);
            const csz = g.fs(8.4), H = csz * 0.6 + 2.4, PX = 2.8, GAP = 2;
            let x = o.x, top = yy - 3.4;                  // first row just under the heading line
            skills.forEach(s => {
              const t = g.fit(s, o.w - 2 * PX, csz, 'regular'), w = measure(t, csz, 'regular') + 2 * PX;
              if (x > o.x && x + w > o.x + o.w) { x = o.x; top += H + GAP; }
              if (top + H > maxY) return;
              g.rrect(x, top, w, H, H / 2, o.chipFill || T.tint, o.chipLine || null, 0.3);
              g.text(t, x + PX, top + H / 2 + csz * 0.13, csz, 'regular', o.chipText || o.value);
              x += w + GAP;
            });
            yy = top + H + lh + END - 1.5;
          } else if (sec === 'skills' && skills.length) {
            yy = head('Skills', yy);
            skills.forEach(s => {
              if (yy > maxY - 4) return;
              g.wrapMax(s, LW, fsz, 'regular', 2).forEach((l, i) => {
                if (i === 0) dot(yy);
                g.text(l, LX, yy, fsz, 'regular', o.value); yy += lh;
              });
              yy += 0.9 * LS;
            });
            yy += END;
          } else if (sec === 'hobbies' && hobbies.length && !g.mainDrew.has('hobbies')) {
            g.sideDrew.add('hobbies');
            // (v4.33) hobbies in the side column, in the column's own colours (like the skills)
            yy = head('Hobbies', yy);
            if (o.chips && false) {
              const csz = g.fs(8.4), H = csz * 0.6 + 2.4, PX = 2.8, GAP = 2;
              let x = o.x, top = yy - 3.4;
              hobbies.forEach(s => {
                const t = g.fit(s, o.w - 2 * PX, csz, 'regular'), w = measure(t, csz, 'regular') + 2 * PX;
                if (x > o.x && x + w > o.x + o.w) { x = o.x; top += H + GAP; }
                if (top + H > maxY) return;
                g.rrect(x, top, w, H, H / 2, o.chipFill || T.tint, o.chipLine || null, 0.3);
                g.text(t, x + PX, top + H / 2 + csz * 0.13, csz, 'regular', o.chipText || o.value);
                x += w + GAP;
              });
              yy = top + H + lh + END - 1.5;
            } else {
              hobbies.forEach(s => {
                if (yy > maxY - 4) return;
                g.wrapMax(s, LW, fsz, 'regular', 2).forEach((l, i) => {
                  if (i === 0) dot(yy);
                  g.text(l, LX, yy, fsz, 'regular', o.value); yy += lh;
                });
                yy += 0.9 * LS;
              });
              yy += END;
            }
          } else if (sec === 'languages' && languages.length) {
            yy = head('Languages', yy);
            const word = o.w >= 70;                       // wide column: the level in words too
            languages.forEach(l => {
              if (yy > maxY - 4) return;
              const lw = word && l.level ? measure(l.level, lab, 'regular') + 3 : 0;
              // on the lane; a long name in a narrow column gets a little smaller, and only if that is not enough starts further left
              const st = word ? 'bold' : 'regular', avail = o.w - 23 - lw - (LX - o.x), nw = measure(l.name, fsz, st);
              if (nw <= avail) g.text(l.name, LX, yy, fsz, st, o.value);
              else if (nw * 0.86 <= avail) g.text(l.name, LX, yy, fsz * avail / nw, st, o.value);
              else g.text(g.fit(l.name, o.w - 23 - lw, fsz, st), o.x, yy, fsz, st, o.value);
              if (lw) g.text(l.level, o.x + o.w - 23, yy - 0.2, lab, 'regular', o.label || o.value, 'right');
              if (l.level) g.meter(o.x + o.w - 20.4, yy - 1.1, l.level, o.meterOn, o.meterOff);
              yy += Math.max(5.6 * LS, lh + 1.6 * LS);
            });
            yy += END;
          }
        }
        // a section that does not fit in the column moves to the main column (contact always stays)
        // contact always first, the other sections in the order chosen in Design > Sections
        // hobbies only in a design that lists them for its side column (else they stay in the main column)
        const want = (o.order || ['contact', 'skills', 'hobbies', 'languages']).filter(s => s !== 'hobbies' || (D.side || []).includes('hobbies'));
        let order = (want.includes('contact') ? ['contact'] : []).concat(want.filter(s => s !== 'contact').sort((a, b) => th.order.indexOf(a) - th.order.indexOf(b)));
        // (v4.33) hobbies sit right above the languages
        // (v4.97) no fixed place for hobbies any more: the order set in Design > Sections is used as it is
        order.forEach(sec => {
          const start = yy;
          const L = g.layer(() => { drawSec(sec, Infinity); return yy; });
          if (L.r <= o.maxY) { g.emit(L.ops); return; }
          yy = start;
          if (sec === 'contact') drawSec(sec, o.maxY);
          else g.sideOverflow.add(sec);
        });
        return yy;
      }
    };

    let pageTop = 0;
    function newPage() {
      ops = []; pages.push(ops); pageNo++;
      F = D.frame(g, pageNo);
      y = D.page(g, pageNo);
      pageTop = y;
    }
    const ensure = h => { if (y + h > F.bottom) newPage(); };
    // (v4.46) one gap after every section, whatever it holds (text, points, tags or languages), so the CV reads evenly;
    // it grows and shrinks with the "Space between jobs and sections" slider
    const SEC_END = 2.2 * SPM;
    function heading(title, after) {
      const hh = (D.headH + (R ? R.head || 0 : 0) + (DN ? DN.head || 0 : 0)) * (0.75 + 0.25 * SC);
      if (y > pageTop + 1) y += 2.5 * SPM;          // space between sections
      ensure(hh + (after || 12));
      D.heading(g, title, F.x, y, F.w);
      y += hh;
    }
    function paragraph(text, size) {
      size = g.fs(size || 9.6);
      const LH = size * 0.45 * LHM;
      wrap(text, F.w, size, 'regular').forEach(l => {
        ensure(LH);
        g.text(l, F.x, y + LH * 0.72, size, 'regular', T.ink);
        y += LH;
      });
      y += SEC_END;
    }
    // a title on up to 2 lines: only the first line shares its row with the date, the second may use the full width
    function titleLines(t, w1, w2, size) {
      const all = wrap(t, w1, size, 'bold');
      const s = clean(t).trim();
      if (all.length <= 1 || w2 <= w1 || !s.startsWith(all[0])) return g.wrapMax(t, w1, size, 'bold', 2);
      return [all[0]].concat(g.wrapMax(s.slice(all[0].length).trim(), w2, size, 'bold', 1));
    }
    // a list symbol drawn as a shape (so it looks the same in every font); yb is the text baseline
    function bulletMark(st, n, x, yb, size, col) {
      const k = size / 9.4, cy = yb - 1.05 * k;
      if (st === 'none') return;
      if (st === 'dot' || !st) { g.circle(x + 1.9, cy, 0.62 * k, col); return; }
      if (st === 'dash') { g.rect(x + 1, cy - 0.22 * k, 2.2 * k, 0.44 * k, col); return; }
      if (st === 'square') { g.rect(x + 1.3, cy - 0.6 * k, 1.2 * k, 1.2 * k, col); return; }
      if (st === 'arrow') { g.poly([[x + 1.1, cy - 0.95 * k], [x + 3.1 * k + 0.2, cy], [x + 1.1, cy + 0.95 * k]], col); return; }
      if (st === 'check') { g.line(x + 0.9, cy, x + 1.7, cy + 0.85 * k, col, 0.42 * k); g.line(x + 1.7, cy + 0.85 * k, x + 3.3, cy - 1.0 * k, col, 0.42 * k); return; }
      if (st === 'star') {
        const P = [];
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.48 * k : 1.15 * k; P.push([x + 2 + r * Math.cos(a), cy + r * Math.sin(a)]); }
        g.poly(P, col); return;
      }
      if (st === 'num') { g.text(n + '.', x, yb, size * 0.92, 'bold', col); return; }
      g.circle(x + 1.9, cy, 0.62 * k, col);
    }
    function entry(e) {
      const TL = D.timeline ? 7 : 0;
      const x = F.x + TL, w = F.w - TL;
      const ts = g.fs(10.5), ss = g.fs(9), bs = g.fs(9.4), ds = g.fs(8.5);
      const tLH = ts * 0.46 * LHM, sLH = ss * 0.47 * LHM, bLH = bs * 0.44 * LHM;
      const dateW = e.date ? measure(e.date, ds, 'bold') + 4 : 0;
      const titles = titleLines(e.title || '', w - dateW, w, ts);
      const sub = e.sub ? g.wrapMax(e.sub, w, ss, 'italic', 2) : [];
      const bullets = String(e.bullets || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
      const para = e.para ? wrap(String(e.para).replace(/\s*\n\s*/g, ' '), w, bs, 'regular') : [];
      ensure(titles.length * tLH + sub.length * sLH + (bullets.length || para.length ? bLH : 0) + 2);
      const top = y, topOps = ops;
      titles.forEach((l, i) => g.text(l, x, y + ts * 0.36 + i * tLH, ts, 'bold', T.ink));
      if (e.date) g.text(e.date, F.x + F.w, y + ts * 0.36, ds, 'bold', D.dateColor ? D.dateColor(T) : T.muted, 'right');
      y += titles.length * tLH;
      sub.forEach(l => { g.text(l, x, y + ss * 0.37, ss, 'italic', D.subColor ? D.subColor(T) : T.accent); y += sLH; });
      if (para.length) {
        y += 0.8;
        para.forEach(l => { ensure(bLH); g.text(l, x, y + bs * 0.33, bs, 'regular', T.ink); y += bLH; });
      }
      y += bullets.length ? 0.8 : 0;
      // (v4.97) the symbol chosen under the box in the form: dot (default), dash, square, arrow, check, star, numbers or none
      const bst = e.bulletStyle || 'dot', bcol = D.bulletColor ? D.bulletColor(T) : T.accent, ind = bst === 'none' ? 0 : bst === 'num' ? 5.6 : 5;
      bullets.forEach((b, bi) => {
        wrap(b, w - ind, bs, 'regular').forEach((l, i) => {
          ensure(bLH);
          if (i === 0) bulletMark(bst, bi + 1, x, y + bs * 0.33, bs, bcol);
          g.text(l, x + ind, y + bs * 0.33, bs, 'regular', T.ink);
          y += bLH;
        });
      });
      if (D.timeline) {
        const dotY = top + ts * 0.25, cur = ops;
        ops = topOps;
        g.line(F.x + 2.2, dotY, F.x + 2.2, topOps === cur ? Math.max(dotY, y - 1) : F.bottom, T.line, 0.5);
        g.circle(F.x + 2.2, dotY, 1.6, T.accent, T.white, 0.5);
        ops = cur;
      }
      y += 2.6 * SPM;
    }
    // (v4.29) achievements, awards, projects: one point per line; hobbies: one per line or separated by commas
    function lines(text, commas) { return String(text || '').split(commas ? /\n+|,|;/ : /\n+/).map(t => t.replace(/^\s*[-\u2022*]\s*/, '').trim()).filter(Boolean); }
    function bulletList(list, style) {
      const bs = g.fs(9.4), bLH = bs * 0.44 * LHM, st = style || 'dot', ind = st === 'none' ? 0 : st === 'num' ? 5.6 : 5;
      list.forEach((b, bi) => {
        wrap(b, F.w - ind, bs, 'regular').forEach((l, i) => {
          ensure(bLH);
          if (i === 0) bulletMark(st, bi + 1, F.x, y + bs * 0.33, bs, D.bulletColor ? D.bulletColor(T) : T.accent);   // (v4.97) the symbol chosen in the form
          g.text(l, F.x + ind, y + bs * 0.33, bs, 'regular', T.ink);
          y += bLH;
        });
        y += 0.6 * LHM;
      });
      y += SEC_END;
    }
    // (v4.97) skills and hobbies: no boxes or outlines any more. A neat grid: 3 columns on a wide column (2 on a narrow one),
    // each item with a small dot in the accent colour, the columns lined up under each other
    function chips(list) {
      const fsz = g.fs(8.8), cols = F.w >= 135 ? 3 : 2, gap = 4, colW = (F.w - gap * (cols - 1)) / cols;
      const rowH = fsz * 0.42 * LHM + 1.6 * LHM, dotR = Math.max(0.55, fsz * 0.075);
      const col = D.bulletColor ? D.bulletColor(T) : T.accent;
      ensure(rowH + 1);
      let i = 0;
      list.forEach(s => {
        const c = i % cols;
        if (c === 0 && i > 0) { y += rowH; ensure(rowH); }
        const x = F.x + c * (colW + gap);
        const t = g.fit(s, colW - 3.4, fsz, 'regular');
        g.circle(x + dotR, y + fsz * 0.35 - fsz * 0.12, dotR, col);
        g.text(t, x + 3.2, y + fsz * 0.35, fsz, 'regular', T.ink);
        i++;
      });
      y += rowH + SEC_END + 0.4;
    }
    // languages side by side: 3 in a row (2 on narrow columns); name, then level bars and level word under it
    function languageGrid(list) {
      // a design may ask for its own number of columns and a smaller size (D.langCols, D.langScale)
      const cols = D.langCols || (F.w >= 135 ? 3 : 2), gap = D.langCols ? 4 : 5, colW = (F.w - gap * (cols - 1)) / cols, ks = D.langScale || 1;
      const fsz = g.fs(9.6 * ks), lsz = g.fs(7.4 * ks), nameH = fsz * 0.45 * LHM;
      const rowH = nameH + 6 * LHM;
      // (v4.97) bar style: the name with its level word on one line and a slim level bar the width of the cell under it
      if (D.langStyle === 'bar') {
        const [mOn, mOff] = D.meterColors ? D.meterColors(T, g) : [T.accent, T.line];
        const rh = nameH + 4.4 * LHM;
        for (let i = 0; i < list.length; i += cols) {
          ensure(rh);
          list.slice(i, i + cols).forEach((l, k) => {
            const x = F.x + k * (colW + gap), ww = l.level ? Math.min(colW * 0.5, measure(l.level, lsz, 'regular')) : 0;
            g.text(g.fit(l.name, colW - (ww ? ww + 1.5 : 0), fsz, 'bold'), x, y + fsz * 0.37, fsz, 'bold', T.ink);
            if (!l.level) return;
            g.text(g.fit(l.level, colW * 0.5, lsz, 'regular'), x + colW, y + fsz * 0.37, lsz, 'regular', T.muted, 'right');
            const n = Math.max(0, LEVELS.indexOf(l.level)), bh = 1.5 * ks, by = y + nameH + 1.4;
            g.rrect(x, by, colW, bh, bh / 2, mOff);
            g.rrect(x, by, colW * (n + 1) / LEVELS.length, bh, bh / 2, mOn);
          });
          y += rh + 1.2 * LHM;
        }
        y += SEC_END - 1.5;
        return;
      }
      for (let i = 0; i < list.length; i += cols) {
        ensure(rowH);
        list.slice(i, i + cols).forEach((l, k) => {
          const x = F.x + k * (colW + gap);
          g.text(g.fit(l.name, colW, fsz, 'bold'), x, y + fsz * 0.37, fsz, 'bold', T.ink);
          if (l.level) {
            const my = y + nameH + 2.2;
            // light text on a dark page: bright bars
            const [mOn, mOff] = D.meterColors ? D.meterColors(T, g) : D.recolor ? [D.bulletColor ? D.bulletColor(T) : T.highlight, T.line] : [T.accent, T.line];
            g.meter(x, my, l.level, mOn, mOff, ks);
            g.text(g.fit(l.level, colW - 22.5 * ks - 0.5, lsz, 'regular'), x + 22.5 * ks, my + lsz * 0.13, lsz, 'regular', T.muted);
          }
        });
        y += rowH + 1.5 * LHM;
      }
      y += SEC_END - 1.5;
    }

    /* ----- content, in the chosen order ----- */
    newPage();
    const over = g.sideOverflow.size;              // side sections that did not fit next to page 1
    const carry = carryOK && D.side2 && g.sideOverflow.size > 0;
    if (carry) g.carry = (D.side || []).filter(sec => g.sideOverflow.has(sec));
    const side = new Set((D.side || []).filter(sec => carry || !g.sideOverflow.has(sec)));
    th.order.forEach(sec => {
      if (hidden.has(sec)) return;
      // hobbies: in the side column when it drew them; otherwise here (a design whose side column does not list them)
      if (side.has(sec) && !(sec === 'hobbies' && !g.sideDrew.has('hobbies'))) return;
      if (sec === 'hobbies') g.mainDrew.add('hobbies');
      if (sec === 'summary' && cv.summary) { heading(SECTIONS.summary, 14); paragraph(cv.summary); }
      else if (sec === 'experience') {
        const jobs = (cv.experience || []).filter(e => e && (e.title || e.company));
        if (!jobs.length) return;
        heading(SECTIONS.experience, 22);
        jobs.forEach(e => entry({ title: e.title, date: dateRange(e.start, e.end, e.current), sub: [e.company, e.location].filter(Boolean).join(', '), bullets: e.duties, bulletStyle: e.dutiesBullet }));
      } else if (sec === 'education') {
        const edu = (cv.education || []).filter(e => e && (e.degree || e.school));
        if (!edu.length) return;
        heading(SECTIONS.education, 16);
        edu.forEach(e => entry({ title: e.degree || e.school, date: eduDate(e), sub: e.degree ? [e.school, e.location].filter(Boolean).join(', ') : e.location, para: e.summary, bullets: e.details, bulletStyle: e.detailsBullet }));
      } else if (sec === 'skills' && skills.length) { heading(SECTIONS.skills, 10); chips(skills); }
      else if (sec === 'languages' && languages.length) { heading(SECTIONS.languages, 8); languageGrid(languages); }
      else if (sec === 'certificates') {
        const certs = (cv.certificates || []).filter(c => c && c.name);
        if (!certs.length) return;
        heading(SECTIONS.certificates, 12);
        certs.forEach(c => entry({ title: c.name, date: c.year || '', sub: c.issuer, para: c.summary }));
      } else if ((sec === 'achievements' || sec === 'awards' || sec === 'projects') && lines(cv[sec]).length) { heading(SECTIONS[sec], 8); bulletList(lines(cv[sec]), cv[sec + 'Bullet']); }
      else if (sec === 'hobbies' && lines(cv.hobbies, true).length) { heading(SECTIONS.hobbies, 8); chips(lines(cv.hobbies, true).map(h => h.charAt(0).toUpperCase() + h.slice(1))); }
      // (v4.30) the user's own sections: their name as the heading, the items as points
      else if (sec === 'custom' && Array.isArray(cv.custom)) cv.custom.forEach(c => {
        const items = (c.items || []).map(t => String(typeof t === 'string' ? t : (t && t.text) || '').trim()).filter(Boolean);
        const title = String(c.title || '').trim();
        if (!items.length) return;
        heading(title || 'More', 8); bulletList(items);
      });
      else if (sec === 'references' && String(cv.references || '').trim()) { heading(SECTIONS.references, 8); paragraph(cv.references, 9.4); }
    });

    // the side sections carried over: drawn in the page-2 side column (all must fit, or run again without)
    let ok = true, sideBottom = 0;
    if (g.carry.length) {
      if (pages.length < 2) ok = false;
      else {
        ops = pages[1];
        g.sideOverflow = new Set();
        const L = g.layer(() => D.side2(g, g.carry));
        if (g.sideOverflow.size) ok = false; else { g.emit(L.ops); sideBottom = L.r || 0; }
      }
    }
    if (ok && D.finish) { ops = pages[pages.length - 1]; D.finish(g, pages.length, { mainBottom: y, sideBottom: pages.length === 2 ? sideBottom : 0 }); }
    pages.forEach((p, i) => { ops = p; D.footer(g, i + 1, pages.length); });
    if (T.bg) pages.forEach(p => pageBackground(p, T.bg));
    if (+th.bgPick >= 1 && +th.bgPick <= BG_N) { pages.forEach(markUnder); applyBgPick(pages, +th.bgPick); pages.forEach(readableAll); }
    if (th.nameScale !== 1) pages.forEach(p => scaleName(p, th.nameScale, cv));
    pages.forEach(readableItalic);
    FAM = 'helvetica';
    return { pages, ok, over };
  }

  /* ---------- shapes ---------- */
  function roundedPath(x, y, w, h, r, k) {     // SVG path (y down) in points
    r = Math.min(r, w / 2, h / 2);
    const X = v => (v * k).toFixed(2);
    return 'M ' + X(x + r) + ' ' + X(y) + ' L ' + X(x + w - r) + ' ' + X(y) + ' Q ' + X(x + w) + ' ' + X(y) + ' ' + X(x + w) + ' ' + X(y + r) +
      ' L ' + X(x + w) + ' ' + X(y + h - r) + ' Q ' + X(x + w) + ' ' + X(y + h) + ' ' + X(x + w - r) + ' ' + X(y + h) +
      ' L ' + X(x + r) + ' ' + X(y + h) + ' Q ' + X(x) + ' ' + X(y + h) + ' ' + X(x) + ' ' + X(y + h - r) +
      ' L ' + X(x) + ' ' + X(y + r) + ' Q ' + X(x) + ' ' + X(y) + ' ' + X(x + r) + ' ' + X(y) + ' Z';
  }
  function canvasRounded(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  /* ---------- PDF renderer (pdf-lib) ---------- */
  function hexRgb(hex) { const [r, g, b] = hexToRgb(hex); return window.PDFLib.rgb(r / 255, g / 255, b / 255); }
  function containBox(iw, ih, box, fill) {
    if (fill) return { x: box.x, y: box.y, w: box.w, h: box.h };
    const s = Math.min(box.w / iw, box.h / ih), w = iw * s, h = ih * s;
    return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
  }
  function coverBox(iw, ih, box) {          // fill the box, cropping the picture (round photos)
    const s = Math.max(box.w / iw, box.h / ih), w = iw * s, h = ih * s;
    return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2.6, w, h };
  }
  async function toPdfBytes(pages, images, meta) {
    const L = window.PDFLib;
    const doc = await L.PDFDocument.create();
    doc.setTitle(meta.title || CFG.company.documentTitle);
    doc.setAuthor(meta.author || CFG.company.name);
    doc.setSubject(CFG.company.documentTitle);
    doc.setCreator('Rich CV Maker : Resume Builder');
    const stdCache = {};
    async function stdFont(fam, st) {
      const key = fam + st;
      if (!stdCache[key]) stdCache[key] = await doc.embedFont(L.StandardFonts[STANDARD[fam].pdf[st]]);
      return stdCache[key];
    }
    const emb = {};
    for (const key of Object.keys(images)) {
      const src = images[key];
      if (src) emb[key] = /^data:image\/png/.test(src) ? await doc.embedPng(src) : await doc.embedJpg(src);
    }
    const k = 1 / PT, H = PAGE_H * k;
    const ctx = doc.context;
    let shN = 0;
    const shadings = page => {
      let res = page.node.Resources();
      if (!res) { res = ctx.obj({}); page.node.set(L.PDFName.of('Resources'), res); }
      let d = res.lookupMaybe(L.PDFName.of('Shading'), L.PDFDict);
      if (!d) { d = ctx.obj({}); res.set(L.PDFName.of('Shading'), d); }
      return d;
    };
    for (const ops of pages) {
      const page = doc.addPage([PAGE_W * k, H]);
      for (const o of ops) {
        if (o.t === 'rect') {
          page.drawRectangle({ x: o.x * k, y: H - (o.y + o.h) * k, width: o.w * k, height: o.h * k,
            color: o.fill ? hexRgb(o.fill) : undefined, borderColor: o.stroke ? hexRgb(o.stroke) : undefined, borderWidth: o.stroke ? (o.lw || 0.25) * k : 0 });
        } else if (o.t === 'icon') {
          page.pushOperators(L.pushGraphicsState(), L.setLineJoin(L.LineJoinStyle.Round));
          page.drawSvgPath(o.d, { x: o.x * k, y: H - o.y * k, scale: o.s * k, borderColor: hexRgb(o.color), borderWidth: o.lw, borderLineCap: L.LineCapStyle.Round });
          page.pushOperators(L.popGraphicsState());
        } else if (o.t === 'rrect') {
          page.drawSvgPath(roundedPath(o.x, o.y, o.w, o.h, o.r, k), { x: 0, y: H,
            color: o.fill ? hexRgb(o.fill) : undefined, borderColor: o.stroke ? hexRgb(o.stroke) : undefined, borderWidth: o.stroke ? (o.lw || 0.25) * k : 0 });
        } else if (o.t === 'line') {
          page.drawLine({ start: { x: o.x1 * k, y: H - o.y1 * k }, end: { x: o.x2 * k, y: H - o.y2 * k }, thickness: o.lw * k, color: hexRgb(o.color) });
        } else if (o.t === 'circle') {
          page.drawEllipse({ x: o.cx * k, y: H - o.cy * k, xScale: o.r * k, yScale: o.r * k,
            color: o.fill ? hexRgb(o.fill) : undefined, borderColor: o.stroke ? hexRgb(o.stroke) : undefined, borderWidth: o.stroke ? (o.lw || 0.3) * k : 0 });
        } else if (o.t === 'poly') {
          const path = o.pts.map((p, i) => (i ? 'L ' : 'M ') + (p[0] * k).toFixed(2) + ' ' + (p[1] * k).toFixed(2)).join(' ') + ' Z';
          page.drawSvgPath(path, { x: 0, y: H, color: hexRgb(o.fill) });
        } else if (o.t === 'grad') {
          // axial shading clipped to the shape
          const rgb = c => hexToRgb(c).map(v => +(v / 255).toFixed(4));
          const C = o.stops.map(rgb);
          const parts = C.slice(1).map((c, i) => ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: C[i], C1: c, N: 1 })));
          const fn = parts.length === 1 ? parts[0] : ctx.register(ctx.obj({ FunctionType: 3, Domain: [0, 1], Functions: parts,
            Bounds: parts.slice(1).map((_, i) => +((i + 1) / parts.length).toFixed(5)), Encode: parts.flatMap(() => [0, 1]) }));
          const sh = ctx.register(ctx.obj({ ShadingType: 2, ColorSpace: 'DeviceRGB', Coords: [o.x0 * k, H - o.y0 * k, o.x1 * k, H - o.y1 * k], Function: fn, Extend: [true, true] }));
          const name = 'Sh' + (shN++);
          shadings(page).set(L.PDFName.of(name), sh);
          const path = [L.pushGraphicsState()];
          o.pts.forEach((p, i) => path.push(i ? L.lineTo(p[0] * k, H - p[1] * k) : L.moveTo(p[0] * k, H - p[1] * k)));
          path.push(L.closePath(), L.clip(), L.endPath(), L.PDFOperator.of('sh', [L.PDFName.of(name)]), L.popGraphicsState());
          page.pushOperators(...path);
        } else if (o.t === 'text') {
          const fam = famOf(o.fam);
          const w = measure(o.s, o.size, o.font, fam) * k;
          let x = o.x * k;
          if (o.align === 'right') x -= w; else if (o.align === 'center') x -= w / 2;
          const yb = H - o.y * k;
          if (isStd(fam)) {
            page.drawText(o.s, { x, y: yb, size: o.size, font: await stdFont(fam, o.font), color: hexRgb(o.color), opacity: o.op || 1 });
          } else {
            const gset = glyphs(fam, o.font).g, sc = o.size / 1000;
            let cx = x;
            for (const ch of o.s) {
              const gl = gset[ch.codePointAt(0)] || gset[63];
              if (!gl) { cx += o.size * 0.5; continue; }
              if (gl[1]) page.drawSvgPath(gl[1], { x: cx, y: yb, scale: sc, color: hexRgb(o.color), opacity: o.op || 1, borderOpacity: o.op || 1 });
              cx += gl[0] * sc;
            }
            // invisible text so the PDF can still be searched and copied
            if (o.s.trim()) page.drawText(o.s, { x, y: yb, size: o.size, font: await stdFont('helvetica', o.font), opacity: 0 });
          }
        } else if (o.t === 'img' && emb[o.key]) {
          const im = emb[o.key];
          if (o.clip) {
            const ops2 = [L.pushGraphicsState()];
            if (Array.isArray(o.clip)) {
              o.clip.forEach((p, i) => ops2.push(i ? L.lineTo(p[0] * k, H - p[1] * k) : L.moveTo(p[0] * k, H - p[1] * k)));
            } else if (o.clip === 'circle') {
              const cx = (o.x + o.w / 2) * k, cy = H - (o.y + o.h / 2) * k, rx = o.w / 2 * k, ry = o.h / 2 * k, c = 0.5523;
              ops2.push(L.moveTo(cx + rx, cy),
                L.appendBezierCurve(cx + rx, cy + ry * c, cx + rx * c, cy + ry, cx, cy + ry),
                L.appendBezierCurve(cx - rx * c, cy + ry, cx - rx, cy + ry * c, cx - rx, cy),
                L.appendBezierCurve(cx - rx, cy - ry * c, cx - rx * c, cy - ry, cx, cy - ry),
                L.appendBezierCurve(cx + rx * c, cy - ry, cx + rx, cy - ry * c, cx + rx, cy));
            } else {
              const x0 = o.x * k, y0 = H - (o.y + o.h) * k, w = o.w * k, h = o.h * k, r = Math.min(3 * k, w / 2, h / 2);
              ops2.push(L.moveTo(x0 + r, y0), L.lineTo(x0 + w - r, y0), L.appendQuadraticCurve(x0 + w, y0, x0 + w, y0 + r),
                L.lineTo(x0 + w, y0 + h - r), L.appendQuadraticCurve(x0 + w, y0 + h, x0 + w - r, y0 + h),
                L.lineTo(x0 + r, y0 + h), L.appendQuadraticCurve(x0, y0 + h, x0, y0 + h - r),
                L.lineTo(x0, y0 + r), L.appendQuadraticCurve(x0, y0, x0 + r, y0));
            }
            ops2.push(L.closePath(), L.clip(), L.endPath());
            page.pushOperators(...ops2);
            const b = o.clip !== 'rounded' ? coverBox(im.width, im.height, o) : containBox(im.width, im.height, o, true);
            page.drawImage(im, { x: b.x * k, y: H - (b.y + b.h) * k, width: b.w * k, height: b.h * k });
            page.pushOperators(L.popGraphicsState());
          } else {
            const b = containBox(im.width, im.height, o, o.key === 'photo');
            page.drawImage(im, { x: b.x * k, y: H - (b.y + b.h) * k, width: b.w * k, height: b.h * k });
          }
        }
      }
    }
    return doc.save();
  }

  /* ---------- Canvas renderer (preview / print) ---------- */
  const pathCache = new Map();
  function glyphPath(fam, st, cp) {
    const key = fam + '|' + st + '|' + cp;
    if (!pathCache.has(key)) {
      const gl = glyphs(fam, st).g[cp];
      pathCache.set(key, gl && gl[1] ? new Path2D(gl[1]) : null);
    }
    return pathCache.get(key);
  }
  function drawToCanvas(ops, canvas, imgEls, pxWidth, maxDpr) {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr || 3);
    const s = (pxWidth * dpr) / PAGE_W;
    canvas.width = Math.round(PAGE_W * s);
    canvas.height = Math.round(PAGE_H * s);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ops.forEach(o => {
      if (o.t === 'rect') {
        if (o.fill) { ctx.fillStyle = o.fill; ctx.fillRect(o.x * s, o.y * s, o.w * s, o.h * s); }
        if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = (o.lw || 0.25) * s; ctx.strokeRect(o.x * s, o.y * s, o.w * s, o.h * s); }
      } else if (o.t === 'rrect') {
        canvasRounded(ctx, o.x * s, o.y * s, o.w * s, o.h * s, o.r * s);
        if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
        if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = (o.lw || 0.25) * s; ctx.stroke(); }
      } else if (o.t === 'line') {
        ctx.strokeStyle = o.color; ctx.lineWidth = o.lw * s;
        ctx.beginPath(); ctx.moveTo(o.x1 * s, o.y1 * s); ctx.lineTo(o.x2 * s, o.y2 * s); ctx.stroke();
      } else if (o.t === 'circle') {
        ctx.beginPath(); ctx.arc(o.cx * s, o.cy * s, o.r * s, 0, Math.PI * 2);
        if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
        if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = (o.lw || 0.3) * s; ctx.stroke(); }
      } else if (o.t === 'grad') {
        const gr = ctx.createLinearGradient(o.x0 * s, o.y0 * s, o.x1 * s, o.y1 * s);
        o.stops.forEach((c, i) => gr.addColorStop(i / (o.stops.length - 1), c));
        ctx.fillStyle = gr; ctx.beginPath();
        o.pts.forEach((p, i) => i ? ctx.lineTo(p[0] * s, p[1] * s) : ctx.moveTo(p[0] * s, p[1] * s));
        ctx.closePath(); ctx.fill();
      } else if (o.t === 'icon') {
        ctx.save(); ctx.translate(o.x * s, o.y * s); ctx.scale(o.s * s, o.s * s);
        ctx.lineWidth = o.lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = o.color;
        ctx.stroke(new Path2D(o.d)); ctx.restore();
      } else if (o.t === 'poly') {
        ctx.fillStyle = o.fill; ctx.beginPath();
        o.pts.forEach((p, i) => i ? ctx.lineTo(p[0] * s, p[1] * s) : ctx.moveTo(p[0] * s, p[1] * s));
        ctx.closePath(); ctx.fill();
      } else if (o.t === 'text') {
        const fam = famOf(o.fam);
        const w = measure(o.s, o.size, o.font, fam);
        let x = o.x;
        if (o.align === 'right') x -= w; else if (o.align === 'center') x -= w / 2;
        ctx.fillStyle = o.color;
        ctx.globalAlpha = o.op || 1;
        if (isStd(fam)) {
          const style = (o.font === 'italic' || o.font === 'boldItalic' ? 'italic ' : '') + (o.font === 'bold' || o.font === 'boldItalic' ? 'bold ' : '');
          ctx.font = style + (o.size * PT * s) + 'px ' + STANDARD[fam].css;
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          // (v4.97) a phone without Helvetica / Times draws a wider stand-in font: fit it to the width used for the PDF
          const real = ctx.measureText(o.s).width, want = w * s;
          if (real > 0 && want > 0 && Math.abs(real / want - 1) > 0.01) {
            ctx.save(); ctx.translate(x * s, o.y * s); ctx.scale(want / real, 1); ctx.fillText(o.s, 0, 0); ctx.restore();
          } else ctx.fillText(o.s, x * s, o.y * s);
        } else {
          const gset = glyphs(fam, o.font).g, sc = o.size * PT * s / 1000;
          ctx.save();
          ctx.translate(x * s, o.y * s);
          ctx.scale(sc, sc);
          for (const ch of o.s) {
            const cp = ch.codePointAt(0), use = gset[cp] ? cp : 63, gl = gset[use];
            const p = glyphPath(fam, o.font, use);
            if (p) ctx.fill(p);
            ctx.translate(gl ? gl[0] : 500, 0);
          }
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      } else if (o.t === 'img' && imgEls[o.key]) {
        const im = imgEls[o.key];
        if (o.clip) {
          ctx.save();
          if (Array.isArray(o.clip)) { ctx.beginPath(); o.clip.forEach((p, i) => i ? ctx.lineTo(p[0] * s, p[1] * s) : ctx.moveTo(p[0] * s, p[1] * s)); ctx.closePath(); }
          else if (o.clip === 'circle') { ctx.beginPath(); ctx.ellipse((o.x + o.w / 2) * s, (o.y + o.h / 2) * s, o.w / 2 * s, o.h / 2 * s, 0, 0, Math.PI * 2); }
          else canvasRounded(ctx, o.x * s, o.y * s, o.w * s, o.h * s, 3 * s);
          ctx.clip();
          const b = o.clip !== 'rounded' ? coverBox(im.naturalWidth, im.naturalHeight, o) : containBox(im.naturalWidth, im.naturalHeight, o, true);
          ctx.drawImage(im, b.x * s, b.y * s, b.w * s, b.h * s);
          ctx.restore();
        } else {
          const b = containBox(im.naturalWidth, im.naturalHeight, o, o.key === 'photo');
          ctx.drawImage(im, b.x * s, b.y * s, b.w * s, b.h * s);
        }
      }
    });
  }

  // small sample of a font for the font picker
  function drawSample(canvas, fam, text, cssW, cssH, color) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    fam = famOf(fam);
    let px = cssH * 0.62 * dpr;
    const wmm = measure(text, 10, 'bold', fam);                   // width at 10 pt, in mm
    const wpx = wmm / (10 * PT) * px;
    if (wpx > canvas.width) px *= canvas.width / wpx;
    const y = canvas.height * 0.72;
    ctx.fillStyle = color || '#1A2238';
    if (isStd(fam)) { ctx.font = 'bold ' + px + 'px ' + STANDARD[fam].css; ctx.fillText(text, 0, y); return; }
    const gset = glyphs(fam, 'bold').g, sc = px / 1000;
    ctx.save(); ctx.translate(0, y); ctx.scale(sc, sc);
    for (const ch of clean(text)) {
      const cp = ch.codePointAt(0), use = gset[cp] ? cp : 63, gl = gset[use], p = glyphPath(fam, 'bold', use);
      if (p) ctx.fill(p);
      ctx.translate(gl ? gl[0] : 500, 0);
    }
    ctx.restore();
  }

  return {
    sideOf, bgOptions,
    drawSample,
    init, layout, toPdfBytes, drawToCanvas, unsupportedChars, formatDate, formatMonth, dateRange,
    loadFont, fontReady, PAGE_W, PAGE_H, LEVELS, SECTIONS, DEFAULT_THEME, normTheme, PALETTES, themeColors, mix,
    fonts: () => FONT_LIST, designs: () => window.CVDesignList,
    _measure: (t, s, st, fam) => measure(t, s, st, fam)
  };
})();
