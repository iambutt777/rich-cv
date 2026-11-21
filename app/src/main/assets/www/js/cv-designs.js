/* =========================================================================
   CV templates: 8 categories x 8 templates = 64, plus 24 Premium = 88.
   A template = a page layout (FAMILY) + a heading style (HEAD) + options,
   plus a starting colour theme and font (applied when the template is
   chosen; the user can change them afterwards in Colour and Font).
   Every template follows the user's text size, spacing, margin and photo
   settings. Content and page breaks are shared (js/pdf.js).
   Units: millimetres on an A4 page (210 x 297), origin top-left.

   To add a template: add a line to TEMPLATES at the bottom.
   ========================================================================= */
(function () {
  const mixC = (a, b, k) => window.CVPdf.mix(a, b, k);
  const WHITE = '#FFFFFF';

  /* ---------------- helpers ---------------- */
  // CVs carry no page numbers (v3.26). Kept as a no-op so every template's footer still works.
  function pageNum() { /* no page numbers on CV pages */ }
  // photo size for a template, honouring the user's size and shape choice
  function pdim(g, w, h) {
    if (!g.showPhoto) return [0, 0];            // photo switched off: keep no space for it
    const k = g.PS;
    return g.th.photoShape === 'circle' ? [w * k * 1.05, w * k * 1.05] : [w * k, h * k];
  }
  // colour of the last name in two-colour designs (null: one colour)
  const isLight = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return false; const n = parseInt(m[1], 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) > 170; };
  function lastColor(g, c) {
    if (!g.twoTone) return null;
    const T = g.T;
    if (g.lastColor) return g.lastColor(T, c);
    return isLight(c) ? T.highlight : c === T.accent ? T.primary : T.accent;
  }
  function nameBlock(g, x, y, w, size, color, titleColor, align, titleStyle) {
    const c2 = lastColor(g, color); let k = 0;
    g.wrapMax(g.name, w, size, 'bold', 2).forEach(l => { g.nameLine(l, x, y, size, 'bold', color, c2, align, k); k += l.split(' ').length; y += size * 0.41; });
    if (g.cv.title) { g.text(g.fit(g.cv.title, w, 12, titleStyle || 'regular'), x, y - size * 0.07, 12, titleStyle || 'regular', titleColor, align); y += 5.5; }
    return y;
  }
  // label the details that would be unclear on their own
  const shortContact = ([k, v]) => k === 'Passport no.' ? 'Passport ' + v : k === 'Date of birth' ? 'Born ' + v : k === 'Gender' || k === 'Marital status' || k === 'Nationality' ? k + ': ' + v : v;
  // icon top for text whose baseline is at y (the icon sits in the middle of the capital letters)
  const iconTop = (y, size, isz) => y - size * 0.3528 * 0.36 - isz / 2;
  // contact details in a line (wrapping): phone, email, LinkedIn and address with a small icon, the rest in words
  function contactLine(g, x, y, w, color, align, size, iconColor) {
    size = size || 8.6;
    if (!g.contacts.length) return y;
    if (!g.useIcons) {
      g.wrapMax(g.contacts.map(shortContact).join('   ·   '), w, size, 'regular', 5).forEach(l => { g.text(l, x, y, size, 'regular', color, align); y += 4.2; });
      return y;
    }
    const isz = 3.1, ig = 1.3, GAP = 5.2, M = t => g.measure(t, size, 'regular');
    const rows = []; let cur = [], cw = 0;
    const push = it => {
      const iw = (it.k ? isz + ig : 0) + (it.c ? it.w : M(it.t)), add = cur.length ? GAP + iw : iw;
      if (cur.length && cw + add > w) { rows.push([cur, cw]); cur = []; cw = 0; }
      cw += cur.length ? GAP + iw : iw; cur.push(it);
    };
    g.contacts.forEach(c => {
      const k = g.iconOf(c[0]), room = w - (k ? isz + ig : 0);
      const cwid = k ? g.contactWidth(c, size) : M(shortContact(c));
      if (cwid <= room) { push(k ? { k, c, w: cwid } : { t: shortContact(c) }); return; }
      if (k && g.labelOf(c[0])) { push({ k, c, w: room }); return; }       // a labelled detail: shrinks a little
      // too long for one line (a long address): its own lines
      if (cur.length) { rows.push([cur, cw]); cur = []; cw = 0; }
      g.wrapMax(k ? c[1] : shortContact(c), room, size, 'regular', 2).forEach((l, i) => rows.push([[{ k: i ? null : k, t: l, pad: !!(k && i) }], (k ? isz + ig : 0) + M(l)]));
    });
    if (cur.length) rows.push([cur, cw]);
    rows.forEach(([row, rw]) => {
      let cx = align === 'center' ? x - rw / 2 : align === 'right' ? x - rw : x;
      row.forEach((it, i) => {
        if (i) {
          if (!it.k && !row[i - 1].k) g.circle(cx + GAP / 2, y - size * 0.3528 * 0.33, 0.36, color);
          cx += GAP;
        }
        if (it.k) { g.icon(it.k, cx, iconTop(y, size, isz), isz, iconColor || color); cx += isz + ig; }
        else if (it.pad) cx += isz + ig;
        if (it.c) { g.contactDraw(it.c, cx, y, it.w + 0.01, size, color, color); cx += it.w; }
        else { g.text(it.t, cx, y, size, 'regular', color); cx += M(it.t); }
      });
      y += 5.2;
    });
    return y;
  }
  // grid cells; the address gets a whole row so it stays readable.
  // Details with an icon come first and take less height (no word label above them).
  // (v3.93) no empty cells: a detail too long for one cell waits until the row is full, then takes a whole row;
  // the columns have a wider gap so neighbours never touch
  const GRID_GAP = 7;
  // shift: move the 2nd column right by this many mm (the 1st column gets wider, the 2nd narrower)
  function gridCells(g, cols, w, shift) {
    // (v3.98) first try: every detail in its own cell, row by row, each column as wide as its longest detail,
    // the free space shared equally between the columns (no empty cells, no whole-row details)
    if (cols > 1 && w && !shift) {
      const n = g.contacts.length, need = Array(cols).fill(0), isz = 5;
      g.contacts.forEach(([k, v], i) => { need[i % cols] = Math.max(need[i % cols], isz + g.contactWidth([k, v], 8.8)); });
      const used = need.reduce((a, b) => a + b, 0), gap = (w - used) / (cols - 1);
      if (n > cols && gap >= 5) {
        const xs = need.map((_, c) => need.slice(0, c).reduce((a, b) => a + b, 0) + c * gap);
        const cells = g.contacts.map(([k, v], i) => ({ k, v, row: Math.floor(i / cols), col: i % cols, span: 1, ic: !!g.iconOf(k), xo: xs[i % cols], cw: need[i % cols] + gap * 0.5 }));
        const rows = Math.ceil(n / cols), top = [];
        let h = 0;
        for (let r = 0; r < rows; r++) { top[r] = h; h += cells.filter(c => c.row === r).every(c => c.ic) ? 5 : 8.6; }
        return { cells, rows, top, height: h };
      }
    }
    const cells = [], iconRow = [], wait = []; let row = 0, col = 0;
    const colW = w ? (w - (cols - 1) * GRID_GAP) / cols : 1e9, sh = shift || 0;
    const cellW = c => colW + (c === 0 ? sh : c === 1 ? -sh : 0);
    const put = (k, v, span) => {
      const ic = !!g.iconOf(k);
      cells.push({ k, v, row, col, span, ic });
      iconRow[row] = iconRow[row] !== false && ic;
      col += span;
      if (col >= cols) { row++; col = 0; while (wait.length) { const [a, b] = wait.shift(); put(a, b, cols); } }
    };
    g.contacts.forEach(([k, v]) => {
      const fitsIn = c => g.contactWidth([k, v], 8.8) <= cellW(c) - 5.5;
      const wide = cols > 1 && !(fitsIn(0) && fitsIn(1) || fitsIn(col));
      if (wide && col) wait.push([k, v]); else put(k, v, wide ? cols : 1);
    });
    if (wait.length) { if (col) { row++; col = 0; } wait.splice(0).forEach(([a, b]) => put(a, b, cols)); }
    const rows = row + (col ? 1 : 0), top = [];
    let h = 0;
    for (let r = 0; r < rows; r++) { top[r] = h; h += iconRow[r] ? (r + 1 < rows && !iconRow[r + 1] ? 6.7 : 5) : 8.6; }
    return { cells, rows, top, height: h };
  }
  const gridHeight = (g, cols, w, shift) => gridCells(g, cols, w, shift).height;
  function contactGrid(g, x, y, w, cols, labelColor, valueColor, iconColor, shift) {
    const sh = shift || 0, colW = (w - (cols - 1) * GRID_GAP) / cols, G = gridCells(g, cols, w, sh);
    G.cells.forEach(({ k, v, row, col, span, ic }) => {
      const C = G.cells.find(c => c.k === k && c.row === row && c.col === col);
      const cx = C && C.xo != null ? x + C.xo : x + col * (colW + GRID_GAP) + (col >= 1 ? sh : 0), cy = y + G.top[row];
      const cw = C && C.cw != null ? C.cw : span > 1 ? colW * span + GRID_GAP * (span - 1) : colW + (col === 0 ? sh : col === 1 ? -sh : 0);
      if (ic) {
        const isz = 3.3, by = cy + 2.3;
        g.icon(g.iconOf(k), cx, iconTop(by, 8.8, isz), isz, iconColor || labelColor);
        g.contactDraw([k, v], cx + isz + 1.7, by, cw - isz - 1.7, 8.8, valueColor, valueColor);
      } else {
        g.text(k, cx, cy, 6.8, 'regular', labelColor);
        g.oneLine(v, cx, cy + 3.9, cw, 8.8, 'regular', valueColor);
      }
    });
    return y + G.height;
  }
  const cont = (g, x, y, color, w) => g.text(g.fit(g.name + '  (continued)', w || 150, 10.5, 'bold'), x, y, 10.5, 'bold', color);

  /* ---------------- heading styles ---------------- */
  const HEAD = {
    bar: { h: 11, f(g, t, x, y, w) { const s = g.fs(11.5), T = g.T; g.rect(x, y + 1.3, 1.6, 5, T.primary); g.text(t, x + 4, y + 5.4, s, 'bold', T.primary); g.line(Math.min(x + w, x + 7 + g.measure(t, s, 'bold')), y + 3.8, x + w, y + 3.8, T.highlight, 0.5); } },
    under: { h: 11, f(g, t, x, y) { g.text(t, x, y + 5, g.fs(12), 'bold', g.T.primary); g.rect(x, y + 7.2, 14, 1.1, g.T.highlight); } },
    caps: { h: 11, f(g, t, x, y, w) { g.text(t.toUpperCase(), x, y + 5, g.fs(9.8), 'bold', g.T.accent); g.line(x, y + 7.4, x + w, y + 7.4, g.T.line, 0.35); } },
    dot: { h: 11, f(g, t, x, y) { g.circle(x + 2.2, y + 3.6, 2.2, g.T.accent); g.text(t, x + 7, y + 5.1, g.fs(12), 'bold', g.T.primary); } },
    pill: { h: 11.5, f(g, t, x, y, w) { const s = g.fs(10.5); g.rrect(x, y, g.measure(t, s, 'bold') + 8, 7, 3.5, g.T.primary); g.text(t, x + 4, y + 4.9, s, 'bold', WHITE); g.line(x, y + 8.6, x + w, y + 8.6, g.T.tint2, 0.3); } },
    center: { h: 11, f(g, t, x, y, w) {
      const s = g.fs(11.5), tw = g.measure(t, s, 'bold');
      g.text(t, x + w / 2, y + 5.2, s, 'bold', g.T.primary, 'center');
      if (w / 2 - tw / 2 - 4 > 3) { g.line(x, y + 3.6, x + w / 2 - tw / 2 - 4, y + 3.6, g.T.highlight, 0.4); g.line(x + w / 2 + tw / 2 + 4, y + 3.6, x + w, y + 3.6, g.T.highlight, 0.4); }
    } },
    band: { h: 12, f(g, t, x, y, w) { g.rect(x, y, w, 7.4, g.T.tint); g.rect(x, y, 1.4, 7.4, g.T.accent); g.text(t, x + 4, y + 5.2, g.fs(10.5), 'bold', g.T.primary); } },
    // (v4.97) Bold Banner: a gold bar, the heading in the dark colour and a soft line to the end
    goldbar: { h: 11, f(g, t, x, y, w) { const s = g.fs(11), T = g.T, tw = g.measure(t, s, 'bold'); g.rrect(x, y + 1, 1.8, 5.6, 0.9, T.highlight); g.text(t, x + 4.6, y + 5.4, s, 'bold', T.primary); if (x + 8 + tw < x + w) g.line(x + 8.6 + tw, y + 3.9, x + w, y + 3.9, T.tint2, 0.35); } },
    square: { h: 11, f(g, t, x, y) { g.rect(x, y + 2, 3.2, 3.2, g.T.highlight); g.text(t, x + 6, y + 5.2, g.fs(12), 'bold', g.T.accent); } },
    line: { h: 11, f(g, t, x, y, w) { const s = g.fs(12); g.text(t, x, y + 5.2, s, 'bold', g.T.primary); g.line(Math.min(x + w, x + 3 + g.measure(t, s, 'bold')), y + 3.7, x + w, y + 3.7, g.T.accent, 0.6); } },
    rule: { h: 11.5, f(g, t, x, y, w) { g.text(t, x, y + 5, g.fs(12), 'bold', g.T.primary); g.line(x, y + 7.6, x + w, y + 7.6, g.T.primary, 0.8); } },
    plain: { h: 11, f(g, t, x, y, w) { g.text(t, x, y + 5, g.fs(12), 'bold', g.T.ink); g.line(x, y + 7.3, x + w, y + 7.3, g.T.line, 0.4); } }
  };

  /* ---------------- page layouts ---------------- */
  const FAMILY = {};

  // side column (left or right) with photo, contact, skills and languages
  FAMILY.sidebar = o => {
    const W = o.W || 66, L = o.side !== 'right', colX = L ? 0 : 210 - W;
    return {
      side: ['skills', 'hobbies', 'languages'],
      frame(g) { const gap = Math.max(8, g.M * 0.65); return L ? { x: W + gap, w: 210 - W - gap - g.M, bottom: 280 } : { x: g.M, w: 210 - W - gap - g.M, bottom: 280 }; },
      page(g, p) {
        const T = g.T, F = this.frame(g);
        const tone = o.tone || 'dark';
        const C = tone === 'dark'
          ? { bg: T.primary, head: T.highlight, label: T.soft, value: WHITE, bullet: T.highlight, on: T.highlight, off: T.dark2, rule: T.highlight, ring: T.highlight, fill: T.accent }
          : tone === 'tint'
            ? { bg: T.tint, head: T.primary, label: T.muted, value: T.ink, bullet: T.accent, on: T.accent, off: T.tint2, rule: T.accent, ring: T.accent, fill: T.accent }
            : { bg: T.grey, head: T.ink, label: T.muted, value: T.ink, bullet: T.accent, on: T.accent, off: T.line, rule: T.line, ring: WHITE, fill: T.primary };
        g.rect(colX, 0, W, 297, C.bg);
        if (tone !== 'light') g.rect(L ? W : colX - 1.1, 0, 1.1, 297, tone === 'dark' ? T.highlight : T.accent);
        if (o.corner) g.poly(L ? [[0, 0], [W + 4, 0], [0, W - 4]] : [[210, 0], [206 - W, 0], [210, W - 4]], T.accent);
        const pad = 8, cx = colX + W / 2;
        if (p > 1) {
          g.wrapMax(g.name, W - 2 * pad, 10, 'bold', 3).forEach((l, i) => g.text(l, cx, 20 + i * 4.6, 10, 'bold', C.value, 'center'));
          return 18;
        }
        const [pw, ph] = pdim(g, o.round ? 40 : 36, o.round ? 40 : 46);
        g.photoOrInitials(cx - pw / 2, 14, pw, ph, C.ring, C.fill, WHITE, o.round ? 'circle' : null);
        const heading = (t, yy) => { g.text(t, colX + pad, yy, g.fs(9.5), 'bold', C.head); g.line(colX + pad, yy + 2, colX + W - pad, yy + 2, C.rule, 0.3); return yy + 8; };
        g.sideLists({ x: colX + pad, y: ph ? 14 + ph + 12 : 20, w: W - 2 * pad, maxY: 274, heading, label: C.label, value: C.value, bullet: C.bullet, meterOn: C.on, meterOff: C.off });
        const ty = nameBlock(g, F.x, 24, F.w, o.nameSize || 22, o.nameAccent ? T.accent : T.primary, o.nameAccent ? T.muted : T.accent);
        if (o.nameRule !== false) g.rect(F.x, ty, 25, 1.1, T.highlight);
        return ty + 9;
      },
      footer(g, i, n) { const F = this.frame(g); pageNum(g, i, n, F.x + F.w, 290, g.T.muted); }
    };
  };

  // coloured header band with name, contact grid and photo
  FAMILY.band = o => ({
    frame: g => ({ x: g.M, w: 210 - 2 * g.M, bottom: 280 }),
    page(g, p) {
      const T = g.T, F = this.frame(g), bg = o.color === 'accent' ? T.accent : T.primary;
      if (p > 1) { g.rect(0, 0, 210, 15, bg); g.rect(0, 15, 210, 1, T.highlight); cont(g, F.x, 9.8, WHITE); return 24; }
      const [pw, ph] = pdim(g, 33, 42);
      const left = o.photo === 'left';
      const tw = g.hasPhoto ? F.w - pw - 8 : F.w, tx = g.hasPhoto && left ? F.x + pw + 8 : F.x;
      const nl = g.wrapMax(g.name, tw, 22, 'bold', 2).length;
      const bandH = Math.max(g.hasPhoto ? ph + 12 : 0, 19 + nl * 9 + (g.cv.title ? 7 : 0) + gridHeight(g, 2, tw) + 3);
      g.rect(0, 0, 210, bandH, bg);
      g.rect(0, bandH, 210, 1.6, T.highlight);
      if (g.hasPhoto) g.photo(left ? F.x : F.x + F.w - pw, 7, pw, ph, T.highlight);
      const yy = nameBlock(g, tx, 19, tw, 22, WHITE, o.color === 'accent' ? T.tint : T.highlight);
      contactGrid(g, tx, yy + 1, tw, 2, o.color === 'accent' ? T.tint2 : T.soft, WHITE, T.highlight);
      return bandH + 10;
    },
    footer(g, i, n) { g.line(g.M, 287, 210 - g.M, 287, g.T.highlight, 0.4); pageNum(g, i, n, 210 - g.M, 292.5, g.T.muted); }
  });

  // white page with thin top line; name left of or centred without photo
  FAMILY.executive = o => ({
    subColor: T => T.primary,
    frame: g => ({ x: g.M, w: 210 - 2 * g.M, bottom: 280 }),
    page(g, p) {
      const T = g.T, F = this.frame(g);
      g.rect(0, 0, 210, o.topBar || 3, T.primary);
      if (p > 1) { cont(g, F.x, 13, T.primary); g.line(F.x, 16.5, F.x + F.w, 16.5, T.highlight, 0.4); return 24; }
      const [pw, ph] = pdim(g, 27, 34.5);
      const photo = g.hasPhoto;
      const center = o.center && !photo;
      const cx = photo ? F.x + pw + 7 : center ? 105 : F.x, al = center ? 'center' : 'left', tw = photo ? F.w - pw - 7 : F.w;
      if (photo) g.photo(F.x, 10, pw, ph, T.primary);
      let yy = nameBlock(g, cx, 21, tw, 24, T.primary, T.accent, al, 'italic');
      yy = contactLine(g, cx, yy, tw, T.muted, al, 8.6, T.accent);
      yy = Math.max(yy + 2, photo ? 12 + ph : 0);
      g.line(F.x, yy, F.x + F.w, yy, T.highlight, 0.8);
      if (o.double !== false) g.line(F.x, yy + 1.4, F.x + F.w, yy + 1.4, T.highlight, 0.25);
      return yy + 8;
    },
    footer(g, i, n) { g.line(g.M, 287, 210 - g.M, 287, g.T.line, 0.3); pageNum(g, i, n, 210 - g.M, 292.5, g.T.muted); }
  });

  // diagonal two-colour header and a contact strip
  // (v3.85) the whole page in the soft tint of the contact strip; tags white so they still stand out
  FAMILY.diag = () => ({
    frame: g => ({ x: g.M, w: 210 - 2 * g.M, bottom: 280 }),
    chipFill: () => WHITE, chipLine: T => mixC(T.accent, '#FFFFFF', 0.7),
    page(g, p) {
      const T = g.T, F = this.frame(g);
      g.rect(0, 0, 210, 297, T.tint);
      if (p > 1) { g.rect(0, 0, 210, 14, T.accent); g.poly([[172, 0], [210, 0], [210, 14], [165, 14]], T.primary); cont(g, F.x, 9.2, WHITE, 140); return 23; }
      g.rect(0, 0, 210, 46, T.accent);
      g.poly([[156, 0], [210, 0], [210, 46], [134, 46]], T.primary);
      g.poly([[148, 0], [153, 0], [131, 46], [126, 46]], T.highlight);
      let tx = F.x;
      const [pw, ph] = pdim(g, 25, 32);
      if (this.photoRight && pw) {
        // picture in the dark box on the right (initials there until a photo is added); the name stays where it is
        const k = Math.min(1, 36 / ph), w = pw * k, h = ph * k, x = 184 - w / 2, y = 23 - h / 2;
        if (g.hasPhoto) g.photo(x, y, w, h, WHITE);
        else {
          const sh = g.th.photoShape, cx = x + w / 2, cy = y + h / 2, ring = T.highlight, fill = g.mix(T.primary, '#FFFFFF', 0.12);
          if (sh === 'circle') { const r = Math.min(w, h) / 2; g.circle(cx, cy, r + 1.1, ring); g.circle(cx, cy, r, fill); }
          else if (sh === 'rounded') { g.rrect(x - 1.1, y - 1.1, w + 2.2, h + 2.2, 4.2, ring); g.rrect(x, y, w, h, 3.3, fill); }
          else { g.rect(x - 1, y - 1, w + 2, h + 2, ring); g.rect(x, y, w, h, fill); }
          const ts = Math.min(w, h) * 0.34 / 0.3528;
          g.text(g.initials(), cx, cy + ts * 0.3528 * 0.36, ts, 'bold', WHITE, 'center');
        }
      } else if (g.hasPhoto) { g.photo(F.x, Math.max(4, 23 - ph / 2), pw, ph, WHITE); tx = F.x + pw + 7; }
      nameBlock(g, tx, 21, 120 - (tx - F.x), 21, WHITE, T.highlight);
      let sy = 46;
      if (g.contacts.length) {
        const gh = gridHeight(g, 3, F.w);
        contactGrid(g, F.x, 52.5, F.w, 3, T.accent, T.ink, T.accent);
        sy = 46 + gh + 6;
        g.line(F.x, sy, F.x + F.w, sy, mixC(T.accent, '#FFFFFF', 0.72), 0.3);     // a fine line under the details
      }
      return sy + 8;
    },
    footer(g, i, n) {
      g.rect(0, 288, 210, 9, g.T.primary);
      g.poly([[176, 288], [180, 288], [176, 297], [172, 297]], g.T.highlight);
      // (no page number on CV pages)
    }
  });

  // framed page (cream or white paper), everything centred
  FAMILY.frame = o => ({
    chipStyle: 'pill',
    subColor: T => T.hlText, dateColor: T => T.hlText, bulletColor: T => T.hlText,
    frame: g => { const x = Math.max(20, g.M + 5); return { x, w: 210 - 2 * x, bottom: 274 }; },
    page(g, p) {
      const T = g.T;
      if (o.paper !== false) g.rect(0, 0, 210, 297, T.paper);
      g.rect(7, 7, 196, 283, null, T.primary, 1.2);
      g.rect(9.5, 9.5, 191, 278, null, T.highlight, 0.45);
      if (o.corners) [[9.5, 9.5], [200.5, 9.5], [9.5, 287.5], [200.5, 287.5]].forEach(([x, y]) => g.poly([[x, y - 2.4], [x + 2.4, y], [x, y + 2.4], [x - 2.4, y]], T.highlight));
      if (p > 1) { g.text(g.fit(g.name, 150, 11, 'bold'), 105, 20, 11, 'bold', T.primary, 'center'); g.line(60, 23.5, 150, 23.5, T.highlight, 0.4); return 31; }
      let yy = 25;
      const [pw, ph] = pdim(g, 28, 35.5);
      if (g.hasPhoto) { g.photo(105 - pw / 2, 15, pw, ph, T.highlight); yy = 15 + ph + 10; }
      yy = nameBlock(g, 105, yy, 160, 22, T.primary, T.hlText, 'center', 'italic');
      yy = contactLine(g, 105, yy + 1, 160, T.muted, 'center', 8.4, T.hlText);
      return yy + 6;
    },
    footer(g, i, n) { pageNum(g, i, n, 197, 283.5, g.T.muted); }
  });

  // no colour blocks, section headings in the left margin
  FAMILY.minimal = o => ({
    chipStyle: 'outline', fixedHeading: true, headH: 0.01,
    frame: g => { const x = g.M + 38; return { x, w: 210 - x - g.M, bottom: 282 }; },
    heading(g, t, x, y) {
      // (v4.29) a long single word (ACHIEVEMENTS) gets a little smaller instead of breaking in the middle
      const T = t.toUpperCase(), longest = Math.max(...T.split(/\s+/).map(w => g.measure(w, g.fs(8.6), 'bold')));
      const sz = longest > 31.5 ? g.fs(8.6) * 31.5 / longest : g.fs(8.6);
      g.wrapMax(T, 32, sz, 'bold', 2).forEach((l, i) => g.text(l, g.M, y + 3.6 + i * 3.8, sz, 'bold', g.T.accent));
    },
    page(g, p) {
      const T = g.T;
      if (p > 1) { cont(g, g.M, 16, T.ink); g.line(g.M, 19.5, 210 - g.M, 19.5, T.ink, 0.5); return 28; }
      const [pw, ph] = pdim(g, 26, 33);
      const tw = 210 - 2 * g.M - (g.hasPhoto ? pw + 6 : 0);
      if (g.hasPhoto) g.photo(210 - g.M - pw, 14, pw, ph, null);
      let yy = nameBlock(g, g.M, 26, tw, o.nameSize || 26, T.ink, T.accent);
      yy = contactLine(g, g.M, yy + 1, tw, T.muted, 'left', 8.6, T.accent);
      yy = Math.max(yy + 3, g.hasPhoto ? 18 + ph : 0);
      g.line(g.M, yy, 210 - g.M, yy, o.accentRule ? T.accent : T.ink, 0.6);
      return yy + 9;
    },
    footer(g, i, n) { pageNum(g, i, n, 210 - g.M, 291, g.T.muted); }
  });

  // centred photo and name on a colour banner
  FAMILY.banner = o => ({
    chipStyle: 'pill',
    frame: g => ({ x: g.M, w: 210 - 2 * g.M, bottom: 280 }),
    page(g, p) {
      const T = g.T, bg = o.color === 'accent' ? T.accent : T.primary;
      if (p > 1) { g.rect(0, 0, 210, 14, bg); g.text(g.fit(g.name, 160, 10.5, 'bold'), 105, 9.2, 10.5, 'bold', WHITE, 'center'); return 23; }
      const [pw, ph] = pdim(g, 30, 38);
      let yy = 22;
      const est = (g.hasPhoto ? ph + 14 : 10) + 12 + (g.cv.title ? 6 : 0) + 4;
      g.rect(0, 0, 210, est + 8, bg);
      if (g.hasPhoto) { g.photo(105 - pw / 2, 9, pw, ph, T.highlight); yy = 9 + ph + 12; }
      yy = nameBlock(g, 105, yy, 180, 22, WHITE, o.color === 'accent' ? T.tint : T.highlight, 'center');
      const bandH = Math.max(est + 8, yy + 2);
      g.rect(0, bandH, 210, 1.2, T.highlight);
      return contactLine(g, 105, bandH + 7, 180, T.ink, 'center', 8.6, T.accent) + 5;
    },
    footer(g, i, n) { pageNum(g, i, n, 210 - g.M, 292, g.T.muted); }
  });

  // (v4.97) Bold Banner, new body: the same banner and contact line on top; under it the main column on the left and a soft
  // rounded panel on the right with skills, languages and hobbies (gold-edged headings, simple dotted lists, level bars)
  FAMILY.bannerPro = o => {
    const PW = 58, GAP = 7;
    return {
      side: ['skills', 'hobbies', 'languages'],
      frame: g => ({ x: g.M, w: 210 - 2 * g.M - PW - GAP, bottom: 282 }),
      page(g, p) {
        const T = g.T, bg = T.primary, px = 210 - g.M - PW;
        if (p > 1) { g.rect(0, 0, 210, 14, bg); g.rect(0, 14, 210, 0.9, T.highlight); g.text(g.fit(g.name, 160, 10.5, 'bold'), 105, 9.2, 10.5, 'bold', WHITE, 'center'); return 24; }
        const [pw, ph] = pdim(g, 30, 38);
        let yy = 22;
        const est = (g.hasPhoto ? ph + 14 : 10) + 12 + (g.cv.title ? 6 : 0) + 4;
        g.rect(0, 0, 210, est + 8, bg);
        g.circle(196, 6, 22, mixC(bg, '#FFFFFF', 0.06)); g.circle(16, 16, 9, mixC(bg, '#FFFFFF', 0.05));
        if (g.hasPhoto) { g.photo(105 - pw / 2, 9, pw, ph, T.highlight); yy = 9 + ph + 12; }
        yy = nameBlock(g, 105, yy, 180, 22, WHITE, T.highlight, 'center');
        const oldH = Math.max(est + 8, yy + 2), base = yy - 8, bandH = base + (oldH - base) * 0.7;   // (v4.97) 30% less space under the name (from the title line)
        if (bandH < est + 8) g.rect(0, bandH, 210, est + 8 - bandH + 0.5, WHITE);
        g.rect(0, bandH, 210, 1.2, T.highlight);
        const top = contactLine(g, 105, bandH + 7, 180, T.ink, 'center', 8.6, T.accent) + 4;
        // the side panel
        g.rrect(px, top, PW, 284 - top, 5, mixC(T.tint, '#FFFFFF', 0.35), mixC(T.tint2, '#FFFFFF', 0.2), 0.3);
        g.rrect(px + PW / 2 - 10, top - 0.8, 20, 1.6, 0.8, T.highlight);
        const pad = 6;
        const heading = (t, y2) => { const s = g.fs(10); g.rrect(px + pad, y2 - 3.6, 1.6, 4.6, 0.8, T.highlight); g.text(t, px + pad + 4, y2, s, 'bold', T.primary); g.line(px + pad, y2 + 2.6, px + PW - pad, y2 + 2.6, T.tint2, 0.3); return y2 + 8.5; };
        g.sideLists({ x: px + pad, y: top + 11, w: PW - 2 * pad, maxY: 278, order: ['skills', 'languages', 'hobbies'], heading,
          label: T.muted, value: T.ink, bullet: T.accent, meterOn: T.accent, meterOff: T.tint2 });
        return top + 4;
      },
      footer(g, i, n) { pageNum(g, i, n, 210 - g.M, 292, g.T.muted); }
    };
  };

  // small header, contact details on the right; fits more on a page
  FAMILY.compact = () => ({
    frame: g => ({ x: g.M, w: 210 - 2 * g.M, bottom: 284 }),
    page(g, p) {
      const T = g.T, F = this.frame(g);
      if (p > 1) { cont(g, F.x, 14, T.primary); g.line(F.x, 16.5, F.x + F.w, 16.5, T.accent, 0.4); return 22; }
      const [pw, ph] = pdim(g, 22, 28);
      let lx = F.x;
      if (g.hasPhoto) { g.photo(F.x, 11, pw, ph, null); lx = F.x + pw + 6; }
      const rw = 70;
      let yy = nameBlock(g, lx, 20, F.w - (lx - F.x) - rw - 4, 20, T.primary, T.accent);
      let ry = 14;
      // details in a block on the right of the page, each line starting at the same place (left to right):
      // icon, then the text; the block is as wide as its longest line
      const isz = 3.1, gut = g.useIcons ? isz + 1.6 : 0, rx = F.x + F.w;
      const wOf = c => g.iconOf(c[0]) ? gut + g.contactWidth(c, 8.4) : g.measure(shortContact(c), 8.4, 'regular');
      const bw = Math.min(rw, Math.max(0, ...g.contacts.map(wOf))), bx = rx - bw;
      g.contacts.forEach(c => {
        const ic = g.iconOf(c[0]);
        if (ic) { g.icon(ic, bx, iconTop(ry, 8.4, isz), isz, T.accent); g.contactDraw(c, bx + gut, ry, bw - gut, 8.4, T.ink, T.ink); }
        else g.oneLine(shortContact(c), bx, ry, bw, 8.4, 'regular', T.ink);
        ry += ic ? 5 : 4.3;
      });
      yy = Math.max(yy, ry, g.hasPhoto ? 11 + ph + 3 : 0);
      g.rect(F.x, yy, F.w, 0.9, T.primary);
      return yy + 6;
    },
    footer(g, i, n) { pageNum(g, i, n, 210 - g.M, 292, g.T.muted); }
  });

  // colour stripe down the left edge
  FAMILY.stripe = o => {
    const SW = o.width || 9;
    return {
      chipStyle: 'outline',
      frame: g => { const x = Math.max(g.M + 6, SW + 13); return { x, w: 210 - x - g.M, bottom: 282 }; },
      page(g, p) {
        const T = g.T, F = this.frame(g);
        g.rect(0, 0, SW, 297, T.accent);
        g.rect(SW, 0, 1.4, 297, T.highlight);
        if (p > 1) { cont(g, F.x, 16, T.primary); return 25; }
        const [pw, ph] = pdim(g, 30, 38);
        g.photoOrInitials(F.x, 12, pw, ph, T.highlight, T.primary, WHITE);
        const gap = pw ? pw + 8 : 0, tx = F.x + gap, tw = F.w - gap;
        let yy = nameBlock(g, tx, 24, tw, 24, T.primary, T.accent);
        contactGrid(g, tx, yy + 1, tw, 2, T.muted, T.ink, T.accent);
        yy = Math.max(12 + ph + 6, yy + 1 + gridHeight(g, 2, tw));
        g.line(F.x, yy, F.x + F.w, yy, T.line, 0.4);
        return yy + 8;
      },
      footer(g, i, n) { pageNum(g, i, n, 210 - g.M, 291, g.T.muted); }
    };
  };

  // name on colour, contact details on a light panel
  // o.dark: the right half of the header in a lighter shade of the same dark colour (light text, gold icons)
  FAMILY.split = o => ({
    frame: g => ({ x: g.M, w: 210 - 2 * g.M, bottom: 280 }),
    page(g, p) {
      const T = g.T, F = this.frame(g);
      const DK = !!(o && o.dark), RB = DK ? g.mix(T.primary, '#FFFFFF', 0.12) : T.tint;
      const ink = DK ? '#F2F3F5' : T.ink, icn = DK ? T.highlight : T.accent;
      if (p > 1) { g.rect(0, 0, 125, 14, T.primary); g.rect(125, 0, 85, 14, RB); cont(g, F.x, 9.2, WHITE, 105); return 23; }
      const [pw, ph] = pdim(g, 27, 34);
      const pitch = c => g.iconOf(c[0]) ? 5.1 : 7.6;
      const listH = g.contacts.reduce((a, c) => a + pitch(c), 0);
      const H = Math.max(52, (g.hasPhoto ? ph + 16 : 0), 12 + listH);
      g.rect(0, 0, 125, H, T.primary);
      g.rect(125, 0, 85, H, RB);
      g.rect(0, H, 210, 1.3, T.highlight);
      let tx = F.x;
      if (g.hasPhoto) { g.photo(F.x, (H - ph) / 2, pw, ph, T.highlight); tx = F.x + pw + 6; }
      const nl = g.wrapMax(g.name, 125 - tx - 6, 20, 'bold', 2).length;
      nameBlock(g, tx, H / 2 - (nl - 1) * 4 - (g.cv.title ? 1 : -3), 125 - tx - 6, 20, WHITE, T.highlight);
      let cy = (H - listH) / 2 + 3;
      const cw = 210 - 132 - g.M + 4;
      g.contacts.forEach(c => {
        const [k, v] = c, ic = g.iconOf(k);
        if (ic) {
          const by = cy + 2.2;
          g.icon(ic, 132, iconTop(by, 8.6, 3.2), 3.2, icn);
          g.contactDraw(c, 137, by, cw - 5, 8.6, ink, ink);
        } else {
          g.text(k, 132, cy, 6.6, 'regular', icn);
          g.oneLine(v, 132, cy + 3.6, cw, 8.6, 'regular', ink);
        }
        cy += pitch(c);
      });
      return H + 10;
    },
    footer(g, i, n) { g.line(g.M, 287, 210 - g.M, 287, g.T.line, 0.3); pageNum(g, i, n, 210 - g.M, 292.5, g.T.muted); }
  });

  // white header with decorative circles in the top corner
  FAMILY.bubble = () => ({
    chipStyle: 'pill',
    frame: g => ({ x: g.M, w: 210 - 2 * g.M, bottom: 282 }),
    page(g, p) {
      const T = g.T, F = this.frame(g);
      g.circle(204, 4, 40, T.tint);
      g.circle(176, -6, 22, T.tint2);
      g.circle(206, 40, 10, T.accent);
      g.circle(4, 296, 22, T.tint);
      if (p > 1) { cont(g, F.x, 16, T.accent, 130); return 26; }
      const [pw, ph] = pdim(g, 32, 40);
      g.photoOrInitials(F.x, 12, pw, ph, T.accent, T.accent, WHITE);
      const tx = F.x + (pw ? pw + 8 : 0), tw = 125 - (tx - F.x);
      let yy = nameBlock(g, tx, 26, tw, 24, T.primary, T.accent);
      // contact details use the full width under the name (clear of the small circle on the right)
      yy = contactGrid(g, tx, yy + 2, F.x + F.w - tx - 14, 2, T.accent, T.ink, T.accent);
      yy = Math.max(yy, 12 + ph + 4);
      return yy + 8;
    },
    footer(g, i, n) { pageNum(g, i, n, 210 - g.M, 291, g.T.muted); }
  });

  // rounded tinted card at the top holding photo, name and contacts
  FAMILY.boxed = o => ({
    photoRight: !!(o && o.photoRight),
    chipStyle: 'pill',
    frame: g => ({ x: g.M + 2, w: 210 - 2 * g.M - 4, bottom: 282 }),
    page(g, p) {
      const T = g.T, F = this.frame(g), cx = g.M, cw = 210 - 2 * g.M;
      if (p > 1) { g.rrect(cx, 8, cw, 12, 4, T.tint); cont(g, cx + 6, 16, T.primary, cw - 12); return 28; }
      const [pw, ph] = pdim(g, 28, 35);
      const R = !!this.photoRight && pw > 0;       // picture on the right of the card (space kept even without a photo)
      const tx = cx + 7 + (g.hasPhoto && !R ? pw + 7 : 0), tw = cw - (tx - cx) - 7 - (R ? pw + 9 : 0);
      const nl = g.wrapMax(g.name, tw, 22, 'bold', 2).length;
      const SH = R ? 6 : 0;                         // Slate Card: 2nd contact column a little to the right
      // responsive: the details go in one column under the name when that still fits next to the picture
      // (few details); otherwise in two columns
      const top = 16 + nl * 9 + (g.cv.title ? 6 : 0) + 4, pH = g.hasPhoto || R ? ph + 14 : 0;
      // Slate Card: every detail in one column on the left (the card grows if needed); others: one column when it fits next to the picture
      const COLS = R || (pH && top + gridHeight(g, 1, tw) <= pH) ? 1 : 2;
      // Slate Card: the last 4 details (when there are more than 4) in a second column on the right
      const list = g.contacts, right = R && list.length > 4 ? list.slice(-4) : [], left = R ? list.slice(0, list.length - right.length) : [];
      const PITCH = 5, slateH = Math.max(left.length, right.length) * PITCH;
      const H = Math.max(pH, R ? top + slateH : top + gridHeight(g, COLS, tw, COLS > 1 ? SH : 0));
      g.rrect(cx, 10, cw, H, 5, T.tint);
      g.rrect(cx, 10, 3, H, 1.5, T.accent);
      if (R) {
        const x = cx + cw - 7 - pw, y = 10 + (H - ph) / 2;
        if (g.hasPhoto) g.photo(x, y, pw, ph, WHITE);
        else {
          const sh = g.th.photoShape, mx = x + pw / 2, my = y + ph / 2, fill = g.mix(T.accent, '#FFFFFF', 0.82);
          if (sh === 'circle') { const r = Math.min(pw, ph) / 2; g.circle(mx, my, r + 1.1, WHITE); g.circle(mx, my, r, fill); }
          else if (sh === 'rounded') { g.rrect(x - 1.1, y - 1.1, pw + 2.2, ph + 2.2, 4.2, WHITE); g.rrect(x, y, pw, ph, 3.3, fill); }
          else { g.rect(x - 1, y - 1, pw + 2, ph + 2, WHITE); g.rect(x, y, pw, ph, fill); }
          const ts = Math.min(pw, ph) * 0.34 / 0.3528;
          g.text(g.initials(), mx, my + ts * 0.3528 * 0.36, ts, 'bold', T.accent, 'center');
        }
      } else if (g.hasPhoto) g.photo(cx + 7, 10 + (H - ph) / 2, pw, ph, WHITE);
      const yy = nameBlock(g, tx, 24, tw, 22, T.primary, T.accent);
      if (R) {
        const isz = 3.3, col = (items, x, w) => items.forEach((c, i) => {
          const by = yy + 1 + i * PITCH + 2.3;
          g.icon(g.iconOf(c[0]) || 'address', x, by - 8.8 * 0.3528 * 0.36 - isz / 2, isz, T.accent);
          g.contactDraw(c, x + isz + 1.7, by, w - isz - 1.7, 8.8, T.ink, T.ink);
        });
        // the left column as wide as its longest detail; the right column right after it
        const lw = right.length ? Math.min(tw * 0.62, Math.max(...left.map(c => isz + 1.7 + g.contactWidth(c, 8.8))) + 1) : tw;
        col(left, tx, lw);
        if (right.length) col(right, tx + lw + 6, tw - lw - 6);
      } else contactGrid(g, tx, yy + 1, tw, COLS, T.accent, T.ink, T.accent, COLS > 1 ? SH : 0);
      return 10 + H + 9;
    },
    footer(g, i, n) { pageNum(g, i, n, 210 - g.M, 291, g.T.muted); }
  });


  /* ---------------- Premium: decorated header, round photo, side column ---------------- */
  // points along a cubic curve, for smooth shapes drawn as polygons
  function bez(p0, p1, p2, p3, n) {
    const out = [];
    for (let i = 0; i <= (n || 24); i++) {
      const t = i / (n || 24), u = 1 - t;
      out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
    }
    return out;
  }
  // y of a gentle wave across the page
  const wave = (x, base, amp, k, ph) => base + amp * Math.sin((x / 210) * Math.PI * (k || 2) + (ph || 0));
  function waveBand(g, y0, y1, amp, color, k, ph) {          // filled from y0(top) down to a wavy edge around y1
    const pts = [[0, y0], [210, y0]];
    for (let x = 210; x >= 0; x -= 5) pts.push([x, wave(x, y1, amp, k, ph)]);
    g.poly(pts, color);
  }
  function waveStripe(g, y1, amp, thick, color, k, ph) {     // a wavy ribbon
    const top = [], bot = [];
    for (let x = 0; x <= 210; x += 5) { top.push([x, wave(x, y1, amp, k, ph)]); bot.unshift([x, wave(x, y1, amp, k, ph) + thick]); }
    g.poly(top.concat(bot), color);
  }

  FAMILY.premium = o => {
    const W = o.W || 70;
    const isDark = o.head === 'dark';
    return {
      side: ['skills', 'hobbies', 'languages'],      // (v4.33) hobbies on the left, above the languages
      chipStyle: 'pill',
      frame(g) { const gap = Math.max(8, g.M * 0.6); return { x: W + gap, w: 210 - W - gap - g.M, bottom: 284 }; },
      colors(T) {
        return o.side === 'dark'
          ? { bg: T.primary, head: WHITE, icon: T.highlight, iconDot: T.primary, label: T.soft, value: WHITE, bullet: T.highlight, on: T.highlight, off: T.dark2, rule: T.dark2 }
          : o.side === 'paper'
            ? { bg: T.paper, head: T.primary, icon: T.highlight, iconDot: WHITE, label: T.muted, value: T.ink, bullet: T.hlText, on: T.hlText, off: T.line, rule: T.line }
            : o.side === 'light'
              ? { bg: T.grey, head: T.primary, icon: T.accent, iconDot: WHITE, label: T.muted, value: T.ink, bullet: T.accent, on: T.accent, off: T.line, rule: T.line }
              : { bg: T.tint, head: T.primary, icon: T.accent, iconDot: WHITE, label: T.muted, value: T.ink, bullet: T.accent, on: T.accent, off: T.tint2, rule: T.tint2 };
      },
      // the decorations behind the header (H = header height)
      decor(g, H, small) {
        const T = g.T;
        switch (o.decor) {
          case 'swoosh': {                       // colour curve around the photo, top left
            const h = small ? 18 : H - 2, r = small ? 46 : 94;
            const outer = bez([r, 0], [r * 0.72, h * 0.08], [r * 0.6, h * 0.72], [0, h]);
            g.poly([[0, 0]].concat(outer), T.accent);
            g.poly([[0, 0]].concat(bez([r * 0.7, 0], [r * 0.5, h * 0.1], [r * 0.36, h * 0.6], [0, h * 0.8])), T.primary);
            if (o.glow) g.poly(outer.concat(bez([0, h + 2.4], [r * 0.64, h * 0.76], [r * 0.76, h * 0.1], [r + 4, 0])), T.highlight);
            if (!small) { g.circle(206, 8, 22, T.tint); g.circle(198, -4, 10, T.tint2); }
            break;
          }
          case 'wave': {                         // dark header with a gold ribbon under it
            waveBand(g, 0, H - 5, 3.2, T.primary, 1.6, 0.4);
            waveStripe(g, H - 4.2, 3.2, 2.4, T.highlight, 1.6, 0.4);
            if (o.layer) waveStripe(g, H - 12, 4, 6, T.accent, 1.3, 2.2);
            break;
          }
          case 'shards': {                       // overlapping triangles, top right
            g.poly([[118, 0], [210, 0], [210, 36]], T.tint2);
            g.poly([[146, 0], [210, 0], [210, 26], [168, 14]], T.accent);
            g.poly([[176, 0], [210, 0], [210, 12]], T.primary);
            g.poly([[0, 0], [34, 0], [0, 20]], T.tint2);
            break;
          }
          case 'diag': {                         // dark header with light slanted panels
            g.rect(0, 0, 210, H, T.primary);
            g.poly([[150, 0], [174, 0], [146, H], [122, H]], T.dark2);
            g.poly([[178, 0], [210, 0], [210, H], [154, H]], T.accent);
            g.poly([[196, 0], [210, 0], [210, H * 0.55]], T.highlight);
            break;
          }
          case 'cream': {                        // soft tinted header with a thin rule
            g.rect(0, 0, 210, H, T.tint);
            g.circle(196, 10, 26, T.tint2);
            g.rect(0, H - 0.9, 210, 0.9, T.accent);
            break;
          }
          case 'night': {                        // dark header with rings, top right
            g.rect(0, 0, 210, H, T.primary);
            g.circle(196, 6, 30, T.dark2);
            g.circle(196, 6, 22, T.primary);
            g.circle(182, H - 6, 9, T.accent);
            g.rect(0, H - 1.1, 210, 1.1, T.accent);
            break;
          }
          case 'tide': {                         // colour wave across the top
            waveBand(g, 0, small ? 10 : 14, small ? 2 : 5, T.accent, 1.4, 0.2);
            waveStripe(g, small ? 11 : 17.5, small ? 2 : 5, small ? 1 : 2, T.highlight, 1.4, 0.2);
            break;
          }
          case 'stripes': {                      // slanted stripes, top right, dark curve top left
            g.poly([[0, 0], [62, 0]].concat(bez([62, 0], [44, 8], [22, 30], [0, 40])), T.primary);
            for (let i = 0; i < 4; i++) {
              const x = 172 + i * 10;
              g.poly([[x, 0], [x + 5, 0], [x + 5 - 22, 46], [x - 22, 46]], i % 2 ? T.accent : T.primary);
            }
            break;
          }
        }
      },
      page(g, p) {
        const T = g.T, F = this.frame(g), C = this.colors(T);
        const light = !isDark && o.decor !== 'diag' && o.decor !== 'night';
        if (p > 1) {
          const H2 = 18;
          g.rect(0, H2, W, 297 - H2, C.bg);
          if (light) { g.rect(0, 0, 210, H2, o.decor === 'cream' ? T.tint : WHITE); g.rect(0, H2 - 0.8, 210, 0.8, T.accent); }
          else g.rect(0, 0, 210, H2, T.primary);
          g.text(g.fit(g.name + '  (continued)', 180, 10.5, 'bold'), g.M, 11.5, 10.5, 'bold', light ? T.primary : WHITE);
          if (o.mainPaper) g.rect(W, H2, 210 - W, 297 - H2, T.paper);
          return H2 + 10;
        }
        const [pw] = pdim(g, 38, 38);
        const nl = g.wrapMax(g.name, (o.photoRight ? 210 - 2 * g.M - pw - 10 : F.w), 23, 'bold', 2).length;
        const top = o.decor === 'tide' ? 14 : 0;                 // room for the wave above the photo
        const H = top + Math.max(56, pw ? pw + 18 : 0, 26 + nl * 9.4 + (g.cv.title ? 8 : 0));
        // page backgrounds
        g.rect(0, H, W, 297 - H, C.bg);
        if (o.mainPaper) g.rect(W, H, 210 - W, 297 - H, T.paper);
        this.decor(g, H, false);
        const nameC = light ? T.primary : WHITE, titleC = light ? T.accent : T.highlight;
        // photo in a double ring
        const pcy = top + (H - top) / 2;
        let pcx = W / 2;
        if (o.photoRight) pcx = 210 - g.M - pw / 2 - 2;
        if (pw) {
          const r = pw / 2;
          g.circle(pcx, pcy, r + 3, o.ring === 'highlight' ? T.highlight : T.accent);
          g.photoOrInitials(pcx - r, pcy - r, pw, pw, WHITE, T.accent, WHITE, 'circle');
        }
        // name and job title
        const nx = o.photoRight ? g.M + 2 : F.x, nw = o.photoRight ? 210 - 2 * g.M - pw - 12 : F.w;
        const blockH = nl * 9.4 + (g.cv.title ? 6 : 0);
        nameBlock(g, nx, pcy - blockH / 2 + 6.5, nw, 23, nameC, titleC);
        if (o.photoRight) g.rect(nx, pcy + blockH / 2 + 2, 22, 1, T.highlight);
        // side column: contact, skills, languages with round icons
        const pad = 7;
        const heading = (t, yy) => {
          g.circle(pad + 2.6, yy - 1.2, 2.6, C.icon);
          g.circle(pad + 2.6, yy - 1.2, 0.9, C.iconDot);
          g.text(t, pad + 7.2, yy, g.fs(10.5), 'bold', C.head);
          return yy + 7;
        };
        g.sideLists({ x: pad, y: H + 11, w: W - 2 * pad, maxY: 288, heading, label: C.label, value: C.value, bullet: C.bullet, meterOn: C.on, meterOff: C.off });
        return H + 9;
      },
      footer(g, i, n) { const F = this.frame(g); pageNum(g, i, n, F.x + F.w, 292, g.T.muted); }
    };
  };
  // headings in the main column: bold colour title with a light rule
  HEAD.prem = { h: 11, f(g, t, x, y, w) { const s = g.fs(12.5); g.text(t, x, y + 5.2, s, 'bold', g.T.accent); g.line(Math.min(x + w, x + 3 + g.measure(t, s, 'bold')), y + 3.7, x + w, y + 3.7, g.T.tint2, 0.5); } };


  /* ---------------- Premium, gradient designs ---------------- */
  // photo box for a fixed-shape frame (follows the photo size setting, within limits)
  const psz = (g, w, h, maxK) => g.showPhoto ? [w * Math.min(g.PS, maxK || 1.15), h * Math.min(g.PS, maxK || 1.15)] : [0, 0];
  const DARK_TEXT = () => ({ ink: '#F2F2F2', muted: '#B9BDC6', line: '#4A4F59' });
  const upper = s => String(s || '').toUpperCase();
  // name (up to 2 lines) and job title; returns the y under them
  function luxName(g, x, y, w, size, color, titleColor, align, o) {
    o = o || {};
    const lines = g.wrapMax(o.caps ? upper(g.name) : g.name, w, size, 'bold', 2), c2 = o.last || lastColor(g, color);
    let k = 0;
    lines.forEach(l => { g.nameLine(l, x, y, size, 'bold', color, c2, align, k); k += l.split(' ').length; y += size * 0.43; });
    if (g.cv.title) {
      const ts = o.titleSize || 11.5, t = o.titleCaps ? upper(g.cv.title) : g.cv.title;
      g.oneLine(t, x, y + ts * 0.12, w, ts, o.titleStyle || 'regular', titleColor, align);
      y += ts * 0.5 + 1.5;
    }
    return y;
  }
  const nameHeight = (g, w, size, caps) => g.wrapMax(caps ? upper(g.name) : g.name, w, size, 'bold', 2).length * size * 0.43 + (g.cv.title ? 7.2 : 0);
  // a side-column heading drawn by a function: (t, yy) -> next y
  const sideCols = o => ({ label: o.label, value: o.value, bullet: o.bullet, meterOn: o.on, meterOff: o.off });

  // 1. dark slanted column, round photo, orange ribbon with the name
  FAMILY.lxRibbon = () => ({
    side: ['summary', 'skills', 'hobbies', 'languages'], fixedHeading: true, headH: 11.5, timeline: true,
    lastColor: T => T.primary,                          // the last name dark on the orange ribbon
    dateColor: T => T.accent, subColor: T => T.accent, bulletColor: T => T.accent,
    frame: g => ({ x: 106, w: 210 - 106 - g.M + 3, bottom: 284 }),
    heading(g, t, x, y) { g.text(upper(t), x, y + 5.2, g.fs(12), 'bold', g.T.primary); g.gradRect(x, y + 7.2, 16, 1.2, g.depth(g.T.accent), 0); },
    page(g, p) {
      const T = g.T, A = T.accent;
      g.gradPoly([[0, 0], [88, 0], [76, 297], [0, 297]], g.depth(T.primary, 1.2), 90);
      g.poly([[88, 0], [100, 0], [80, 297], [76, 297]], g.mix(T.primary, '#000000', 0.55));
      if (p > 1) {
        g.wrapMax(g.name, 66, 11, 'bold', 2).forEach((l, i) => g.text(l, 8, 18 + i * 5, 11, 'bold', WHITE));
        return 16;
      }
      const [pw] = psz(g, 44, 44, 1.1);
      if (pw) g.photoShape(42 - pw / 2, 12, pw, pw, 'circle', { ring: g.metal(A), ringW: 2.6, gapW: 1.4, gap: T.primary });
      const yR = pw ? 12 + pw + 10 : 18;
      const rh = 9 + nameHeight(g, 82, 19) ;
      g.gradPoly([[0, yR + 2], [92, yR], [92, yR + rh], [0, yR + rh + 3]], g.depth(A), 0);
      g.gradPoly([[90, yR], [104, yR - 3], [97, yR + rh / 2], [104, yR + rh + 3], [90, yR + rh]], g.metal(A), 90);
      luxName(g, 8, yR + 9, 82, 19, WHITE, g.mix(A, '#FFFFFF', 0.75), 'left', { titleSize: 8.6, titleCaps: true });
      const heading = (t, yy) => {
        g.gradPoly(g.roundPts(-6, yy - 5.3, 54, 7.6, [0, 3.8, 3.8, 0]), g.depth(A), 0);
        g.rect(0, yy - 5.3, 4, 7.6, WHITE);
        g.text(upper(t), 9, yy, g.fs(9.6), 'bold', WHITE);
        return yy + 8.5;
      };
      g.sideLists(Object.assign({ x: 8, y: yR + rh + 14, w: 64, maxY: 288, heading, order: ['summary', 'contact', 'skills', 'hobbies', 'languages'] },
        sideCols({ label: g.mix(T.primary, '#FFFFFF', 0.55), value: WHITE, bullet: A, on: A, off: g.mix(T.primary, '#FFFFFF', 0.2) })));
      return 18;
    },
    footer(g, i, n) { pageNum(g, i, n, 210 - g.M, 292, g.T.muted); }
  });

  // 2. yellow shape with photo and name, contact bar, dark "about me" box
  FAMILY.lxSunny = () => ({
    side: ['summary', 'skills', 'hobbies', 'languages'], fixedHeading: true, headH: 11.5,
    dateColor: T => T.primary,
    frame: g => ({ x: g.M, w: 127 - g.M, bottom: 284 }),
    heading(g, t, x, y) { g.text(upper(t), x, y + 5.2, g.fs(12), 'bold', g.T.primary); g.gradRect(x, y + 7.2, 14, 1.3, [g.T.highlight, g.T.accent], 0); },
    page(g, p) {
      const T = g.T, M = g.M;
      const sideX = 137, sideW = 210 - sideX - M + 4;
      const sideHead = (t, yy) => {
        g.poly([[sideX, yy - 3.8], [sideX + 3, yy - 2.1], [sideX, yy - 0.4]], T.accent);
        g.text(upper(t), sideX + 5, yy, g.fs(10.5), 'bold', T.primary); return yy + 7;
      };
      const cols = sideCols({ label: T.muted, value: T.ink, bullet: T.accent, on: T.accent, off: T.line });
      if (p > 1) { g.line(132, 12, 132, 286, T.primary, 0.5); return 16; }
      const [pw, ph] = psz(g, 56, 58);
      // (v4.74) the yellow shape ends well before the dark Profile box (a clear gap, nothing touches)
      const NW = 84 - M, full = String(g.name || '').replace(/\s+/g, ' ').trim();
      // a long name gets a little smaller so it is shown in full on two lines (never cut off)
      let NS = 22;
      while (NS > 14 && g.wrapMax(full, NW, NS, 'bold', 2).join(' ') !== full) NS -= 1;
      const nh = nameHeight(g, NW, NS);
      const blobTop = pw ? 10 + ph * 0.6 : 8, textY = pw ? 10 + ph + 13 : 24;
      let blobBot = textY + nh + 4;
      // contact list with a yellow bar
      let cy = 12;
      const cw = 210 - 119.5 - M + 4;
      g.contacts.forEach(c => {
        const ic = g.iconOf(c[0]);
        if (ic) g.icon(ic, 114.4, iconTop(cy, 9.2, 3.3), 3.3, T.primary); else g.circle(116, cy - 1.2, 1, T.primary);
        if (ic && g.labelOf(c[0])) { g.contactDraw(c, 119.5, cy, cw, 9.2, T.ink, T.ink); cy += 4.6 + 1.3; return; }
        const t = ic ? c[1] : shortContact(c);
        // fits at 84 % or more: one line; otherwise more lines (email breaks before @ and dots), never thin text
        const lines = c[0] === 'Email' ? g.breakEmail(t, cw, 9.2) : g.measure(t, 9.2, 'regular') * 0.84 <= cw ? [t] : g.wrapMax(t, cw, 9.2, 'regular', 3);
        lines.forEach(l => { g.oneLine(l, 119.5, cy, cw, 9.2, 'regular', T.ink); cy += 4.6; });
        cy += 1.3;
      });
      g.gradRect(103, 0, 5, Math.max(cy, 20), [T.highlight, T.accent], 90);
      // about me box
      let boxBot = cy;
      const showSum = g.cv.summary && !g.th.hide.includes('summary');
      if (showSum) {
        const top = Math.max(cy + 3, 34), iw = 210 - 111 - M + 3;
        const ls = g.wrapMax(g.cv.summary, iw, 9.2, 'regular', 16);
        const h = 17 + ls.length * 4.3;
        g.gradPoly(g.roundPts(103, top, 110, h, [12, 0, 0, 0]), g.depth(T.primary), 90);
        g.text('PROFILE', 111, top + 9.5, 11, 'bold', WHITE);
        ls.forEach((l, i) => g.text(l, 111, top + 16 + i * 4.3, 9.2, 'regular', '#F2F2F2'));
        boxBot = top + h;
      }
      // the yellow shape lines up with the bottom of the Profile box when they are close, so both end on one line
      if (showSum && boxBot > blobBot && boxBot - blobBot < 22) blobBot = boxBot;
      g.poly(g.roundPts(-12, blobTop + 3.5, 104, blobBot - blobTop, [0, 34, 34, 0]), g.mix(T.highlight, '#FFFFFF', 0.5));
      g.gradPoly(g.roundPts(-12, blobTop, 100, blobBot - blobTop, [0, 32, 32, 0]), [g.mix(T.highlight, '#FFFFFF', 0.2), T.highlight, T.accent], 90);
      if (pw) g.photoShape(M - 1, 10, pw, ph, 'squircle', {});
      luxName(g, M, textY, NW, NS, T.primary, T.primary, 'left', { titleSize: 13 });
      const top2 = Math.max(blobBot, boxBot) + 9;
      g.line(132, top2, 132, 286, T.primary, 0.5);
      g.sideLists(Object.assign({ x: sideX, y: top2 + 5, w: sideW, maxY: 286, heading: sideHead, order: ['skills', 'hobbies', 'languages'] }, cols));
      return top2;
    },
    footer(g, i, n) { pageNum(g, i, n, 210 - g.M, 292, g.T.muted); }
  });

  // 3. large round photo in the corner, dark name panel, thin divider
  FAMILY.lxSage = () => ({
    side: ['skills', 'hobbies', 'languages'], fixedHeading: true, headH: 11.5,
    frame: g => ({ x: 100, w: 210 - 100 - g.M + 2, bottom: 284 }),
    heading(g, t, x, y) { g.text(upper(t), x, y + 5.2, g.fs(12), 'bold', g.T.primary); },
    page(g, p) {
      const T = g.T, M = g.M;
      g.circle(216, 150, 18, T.tint2);
      const head = (t, yy) => { g.text(upper(t), M - 3, yy, g.fs(11), 'bold', T.primary); g.gradRect(M - 3, yy + 1.6, 10, 0.9, g.depth(T.accent), 0); return yy + 7.5; };
      const cols = sideCols({ label: T.muted, value: T.ink, bullet: T.accent, on: T.primary, off: T.line });
      if (p > 1) {
        g.gradRect(0, 0, 210, 10, g.depth(T.primary), 0);
        g.line(93, 16, 93, 286, T.primary, 0.6);
        return 18;
      }
      g.gradPoly(g.roundPts(88, -40, 122, 110, [0, 0, 34, 46]), g.depth(T.primary), 0);
      const r = g.showPhoto ? 54 * Math.min(g.PS, 1.05) : 0, cx = 44, cy = 44;
      if (r) g.photoShape(cx - r, cy - r, 2 * r, 2 * r, 'circle', { ring: WHITE, ringW: 2.4, fill: g.depth(T.accent) });
      const y2 = luxName(g, 117, 30, 210 - 117 - M + 4, 21, WHITE, '#E8EEEB', 'left', { caps: true, titleSize: 12.5 });
      g.rect(117, y2 + 1, 52, 0.6, WHITE);
      g.line(93, 80, 93, 286, T.primary, 0.6);
      g.sideLists(Object.assign({ x: M - 3, y: r ? Math.max(cy + r + 12, 84) : 84, w: 93 - M - 3, maxY: 288, heading: head, order: ['contact', 'skills', 'hobbies', 'languages'] }, cols));
      return 80;
    },
    footer(g, i, n) { pageNum(g, i, n, 210 - g.M, 292, g.T.muted); }
  });

  // 4. dark column, gold tab headings, content on dark rounded panel
  FAMILY.lxGoldTab = () => ({
    side: ['skills', 'hobbies', 'languages'], fixedHeading: true, headH: 13,
    recolor: DARK_TEXT, dateColor: T => T.highlight, subColor: T => T.highlight, bulletColor: T => T.highlight,
    frame: (g, p) => ({ x: 86, w: 108, bottom: 278 }),
    heading(g, t, x, y) {
      const s = g.fs(10.5), tw = g.measure(t, s, 'bold');
      g.poly(g.roundPts(x - 20, y, tw + 30, 7.6, [0, 3.8, 3.8, 0]), g.T.highlight);          // (v4.73) flat gold, no gradient
      g.text(t, x, y + 5.4, s, 'bold', '#1E1608');
    },
    page(g, p) {
      const T = g.T, H = T.highlight;
      // (v4.73) flat, clean colours: a solid side column, a light page and one solid dark panel
      g.rect(0, 0, 66, 297, T.primary);
      g.rect(66, 0, 144, 297, '#EDEDED');
      g.rect(190, 0, 20, 297, '#F6F6F6');
      const panel = top => g.poly(g.roundPts(74, top, 128, 286 - top, 6), '#222222');
      if (p > 1) { panel(10); g.wrapMax(g.name, 54, 11, 'bold', 3).forEach((l, i) => g.text(l, 8, 18 + i * 5, 11, 'bold', WHITE)); return 20; }
      const [pw, ph] = psz(g, 46, 56);
      if (pw) g.photoShape(33 - pw / 2, 12, pw, ph, 'rounded', { ring: H, ringW: 1.6 });
      const ny = luxName(g, 78, 30, 210 - 78 - g.M, 22, '#1E1E1E', '#1E1E1E', 'left', { caps: true, titleSize: 0.01 });
      let top = ny + 2;
      if (g.cv.title) {
        const t = upper(g.cv.title), tw = Math.min(g.measure(t, 9.6, 'bold'), 210 - 84 - g.M);
        g.poly(g.roundPts(66, ny - 4, tw + 18, 7.6, [0, 3.8, 3.8, 0]), H);
        g.oneLine(t, 78, ny + 1.4, tw, 9.6, 'bold', '#1E1608');
        top = ny + 8;
      }
      top = Math.max(top + 6, 50);
      panel(top);
      const head = (t, yy) => {
        g.poly(g.roundPts(-4, yy - 5.3, 60, 7.6, [0, 3.8, 3.8, 0]), H);
        g.text(t, 9, yy, g.fs(10), 'bold', '#1E1608'); return yy + 8.5;
      };
      g.sideLists(Object.assign({ x: 9, y: (pw ? 12 + ph + 14 : 22), w: 50, maxY: 288, heading: head, order: ['contact', 'skills', 'hobbies', 'languages'] },
        sideCols({ label: '#A9A9A9', value: '#F1F1F1', bullet: H, on: H, off: '#4A4A4A' })));
      return top + 9;
    },
    footer(g, i, n) { pageNum(g, i, n, 200, 292, '#777777'); }
  });

  // gold outlined pill heading (used by several dark designs)
  function pillHead(g, t, x, y, w, filled, flat) {
    const s = g.fs(11), H = g.T.highlight;
    if (filled && flat) {                          // (v4.73) one solid gold, no shine
      g.poly(g.roundPts(x, y, w, 8.4, 4.2), H);
      g.text(t, x + w / 2, y + 5.9, s, 'bold', '#1A1408', 'center');
    } else if (filled) {
      g.gradPoly(g.roundPts(x, y, w, 8.4, 4.2), g.metal(H), 90);
      g.text(t, x + w / 2, y + 5.9, s, 'bold', '#1A1408', 'center');
    } else {
      g.gradPoly(g.roundPts(x, y, w, 8.4, 4.2), g.metal(H), 0);
      g.poly(g.roundPts(x + 0.75, y + 0.75, w - 1.5, 6.9, 3.45), g.mix(g.T.primary, '#000000', 0.25));
      g.text(t, x + w / 2, y + 5.9, s, 'bold', WHITE, 'center');
    }
  }

  // 5. (v4.97) Navy Gold, redesigned: a header of layered wave ribbons (navy and gold) with fine flowing gold curves,
  // a round photo with a gold ring, a side panel whose edge flows like a wave, traced by a double gold line
  // (in place of the old gold bar), matching waves in the bottom corner and headings with a small gold swoosh.
  // Built to hold many sections on one page.
  const waveY = (x, y0, amp, freq, ph) => y0 + amp * Math.sin(x / 210 * Math.PI * freq + ph);
  const waveX = (y, x0, amp, freq, ph) => x0 + amp * Math.sin(y / 297 * Math.PI * freq + ph);
  function curve(g, pts, col, lw) { for (let i = 1; i < pts.length; i++) g.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], col, lw); }
  FAMILY.lxNavyGold = () => {
    const EDGE = y => waveX(y, 71, 3.2, 3, 0.4);                         // the side panel's flowing right edge
    return {
      side: ['skills', 'hobbies', 'languages'], fixedHeading: true, headH: 10.5, langStyle: 'bar',
      recolor: DARK_TEXT, dateColor: T => T.highlight, subColor: T => T.highlight, bulletColor: T => T.highlight,
      meterColors: T => [T.highlight, g1(T)],
      frame: (g, p) => p > 1 ? { x: 14, w: 182, bottom: 280 } : { x: 83, w: 210 - 83 - 11, bottom: 278 },
      heading(g, t, x, y, w) {
        const H = g.T.highlight, fs = g.fs(10.4);
        g.text(upper(t), x, y + 4.6, fs, 'bold', H);
        const tw = Math.max(22, g.measure(upper(t), fs, 'bold'));
        const P = []; for (let i = 0; i <= 16; i++) { const xx = x + tw * i / 16; P.push([xx, y + 7 + 0.9 * Math.sin(i / 16 * Math.PI * 2)]); }
        curve(g, P, H, 0.55);
        g.circle(x + tw + 1.6, y + 7, 0.6, H);
      },
      page(g, p) {
        const T = g.T, H = T.highlight, N = T.primary, DEEP = g.mix(N, '#000000', 0.5), MID = g.mix(N, '#000000', 0.25), LITE = g.mix(N, '#FFFFFF', 0.08);
        g.gradRect(0, 0, 210, 297, [MID, DEEP], 90);
        const band = (y0, amp, freq, ph, top) => { const P = top ? [[0, 0], [210, 0]] : [[0, 297], [210, 297]]; for (let k = 40; k >= 0; k--) { const x = 210 * k / 40; P.push([x, waveY(x, y0, amp, freq, ph)]); } return top ? P : P; };
        const line = (y0, amp, freq, ph, col, lw, x0, x1) => { const P = []; for (let k = 0; k <= 50; k++) { const x = (x0 || 0) + ((x1 || 210) - (x0 || 0)) * k / 50; P.push([x, waveY(x, y0, amp, freq, ph)]); } curve(g, P, col, lw); };
        // bottom corner waves (every page)
        g.gradPoly(band(282, 4, 1.4, 2.2, false), g.metal(H), 0);
        g.poly(band(285.5, 4, 1.4, 2.5, false), g.mix(N, '#000000', 0.15));
        line(279, 4, 1.4, 2.0, g.mix(H, DEEP, 0.35), 0.3);
        if (p > 1) {
          g.poly(band(13, 2.5, 1.6, 0.6, true), LITE); line(14.5, 2.5, 1.6, 0.6, H, 0.5);
          return 25;
        }
        // the header: layered wave ribbons and fine flowing gold curves
        const HB = 50;
        g.gradPoly(band(HB + 4.5, 5, 1.6, 0.6, true), g.metal(H), 0);         // gold ribbon peeking under
        g.poly(band(HB + 2.2, 5, 1.6, 0.75, true), DEEP);
        g.gradPoly(band(HB, 5, 1.6, 0.6, true), [g.mix(N, '#FFFFFF', 0.14), N, g.mix(N, '#000000', 0.12)], 0);
        line(HB - 8, 6, 1.9, 1.4, g.mix(H, N, 0.35), 0.35, 95, 210);
        line(HB - 13, 7, 1.7, 2.1, g.mix(H, N, 0.55), 0.3, 110, 210);
        line(HB - 18, 5, 2.2, 0.9, g.mix(H, N, 0.7), 0.25, 125, 210);
        // glowing gold arcs in the top-right corner, with a few sparkles
        [16, 22, 28, 34, 40].forEach((r, i) => {
          const A = []; for (let k = 0; k <= 24; k++) { const a = Math.PI * 0.5 + Math.PI * 0.5 * k / 24; A.push([214 + r * Math.cos(a), -6 + r * Math.sin(a)]); }
          curve(g, A, g.mix(H, N, 0.15 + i * 0.16), i === 1 ? 0.9 : 0.45);
        });
        [[186, 9, 0.7], [178, 22, 0.5], [199, 30, 0.6], [168, 12, 0.4]].forEach(([x, y, r]) => g.circle(x, y, r, g.mix(H, '#FFFFFF', 0.3)));
        // the photo and the name
        const [pw] = psz(g, 34, 34, 1.05);
        let nx = 15;
        if (pw) {
          const r = pw / 2, cx = 14 + r, cy = 9 + r;
          g.circle(cx, cy, r + 2.6, g.mix(H, N, 0.6));
          g.photoShape(cx - r, cy - r, pw, pw, 'circle', { ring: g.metal(H), ringW: 1.5, gapW: 0.8, gap: N });
          nx = 14 + pw + 9;
        }
        const nameW = 198 - nx, ns = 21, nh = nameHeight(g, nameW, ns, true);
        luxName(g, nx, 9 + Math.max(pw, 30) / 2 - nh / 2 + ns * 0.33, nameW, ns, '#FFFFFF', H, 'left', { caps: true, titleSize: 11.5, titleStyle: 'bold' });
        // the side panel with its flowing edge, traced by a double gold line
        const top = HB + 8, P = [[0, top - 2]];
        for (let k = 0; k <= 40; k++) { const y = top - 2 + (276 - top + 2) * k / 40; P.push([EDGE(y), y]); }
        P.push([0, 276]);
        g.poly(P, LITE);
        const E1 = [], E2 = [];
        for (let k = 0; k <= 60; k++) { const y = top - 2 + (276 - top + 2) * k / 60; E1.push([EDGE(y) + 1.2, y]); E2.push([EDGE(y) + 3, y]); }
        curve(g, E1, H, 0.6); curve(g, E2, g.mix(H, DEEP, 0.5), 0.3);
        const head = (t, yy) => {
          g.text(upper(t), 11, yy, g.fs(9.6), 'bold', H);
          const tw = Math.max(16, g.measure(upper(t), g.fs(9.6), 'bold'));
          const S = []; for (let i = 0; i <= 12; i++) S.push([11 + tw * i / 12, yy + 1.9 + 0.7 * Math.sin(i / 12 * Math.PI * 2)]);
          curve(g, S, H, 0.45);
          return yy + 7;
        };
        g.sideLists(Object.assign({ x: 11, y: top + 7, w: 55, maxY: 272, heading: head, gap: 4.5, order: ['contact', 'skills', 'hobbies', 'languages'] },
          sideCols({ label: '#9FA8C0', value: '#F2F2F2', bullet: H, on: H, off: g1(T) })));
        return top + 3;
      },
      footer(g, i, n) { pageNum(g, i, n, 140, 292, '#8A93AA'); }
    };
  };
  const g1 = T => window.CVPdf.mix(T.primary, '#FFFFFF', 0.22);

  // 6. (v4.75) Emerald Gold, redesigned: a deep emerald header with glossy 3D balls in the top-right corner,
  // a round photo with a gold ring, soft faded shadows, a light side card and clean headings with a small gold ball
  // a glossy 3D ball: rings from the dark edge to a bright spot near the top left
  function ball3d(g, cx, cy, r, base, under) {
    if (under) {                                   // a soft, faded shadow under the ball
      for (let k = 0; k < 7; k++) g.circle(cx + r * 0.22, cy + r * 0.3, r * (1.16 - k * 0.025), g.mix(under, '#000000', 0.03 + k * 0.03));
    }
    const N = Math.max(10, Math.min(30, Math.round(r * 1.6))), lx = cx - r * 0.38, ly = cy - r * 0.42;
    const edge = g.mix(base, '#000000', 0.42), lite = g.mix(base, '#FFFFFF', 0.78);
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), rr = r * (1 - t * 0.9);
      const col = t < 0.55 ? g.mix(edge, base, t / 0.55) : g.mix(base, lite, (t - 0.55) / 0.45);
      g.circle(cx + (lx - cx) * t * 0.85, cy + (ly - cy) * t * 0.85, rr, col);
    }
    g.circle(lx - r * 0.06, ly - r * 0.06, r * 0.1, g.mix(lite, '#FFFFFF', 0.7));        // the shine spot
  }
  // a faded shadow under a rounded card: a few rings that get lighter outwards
  function softShadow(g, x, y, w, h, r) {
    [[3.2, 0.025], [2.2, 0.045], [1.3, 0.07], [0.6, 0.095]].forEach(([d, k]) =>
      g.poly(g.roundPts(x - d + 0.6, y - d + 1.4, w + 2 * d, h + 2 * d, r + d), g.mix('#FFFFFF', '#1C2B26', k)));
  }
  FAMILY.lxEmerald = () => ({
    side: ['skills', 'hobbies', 'languages'], fixedHeading: true, headH: 11.5,
    dateColor: T => T.accent, bulletColor: T => T.highlight,
    frame: (g, p) => p > 1 ? { x: g.M, w: 210 - 2 * g.M, bottom: 284 } : { x: 84, w: 210 - 84 - g.M, bottom: 284 },
    heading(g, t, x, y, w) {
      const T = g.T, s = g.fs(11.5), tw = g.measure(upper(t), s, 'bold');
      ball3d(g, x + 1.9, y + 3.6, 1.9, T.highlight);
      g.text(upper(t), x + 5.6, y + 5.2, s, 'bold', T.primary);
      g.line(x + 7.6 + tw, y + 3.6, x + w, y + 3.6, g.mix(T.highlight, '#FFFFFF', 0.35), 0.5);
    },
    page(g, p) {
      const T = g.T, H = T.highlight, E = T.primary, M = g.M;
      const lightE = g.mix(E, '#FFFFFF', 0.28);
      if (p > 1) {
        g.rect(0, 0, 210, 13, E);
        ball3d(g, 203, 2, 9, H, E); ball3d(g, 186, 7, 3.6, lightE, E);
        g.rect(0, 13, 210, 8, WHITE);                      // the balls' shadows stay inside the header
        g.rect(0, 13, 210, 0.9, H);
        g.gradRect(0, 13.9, 210, 4.5, [g.mix(E, '#FFFFFF', 0.82), '#FFFFFF'], 90);
        return 24;
      }
      const [pw, ph] = psz(g, 44, 44, 1.1);
      const HH = Math.max(pw ? 14 + ph + 10 : 0, 58);
      // header: deep emerald, a thin gold line and a faded shadow under it
      g.rect(0, 0, 210, HH, E);
      // the 3D balls in the top-right corner
      ball3d(g, 206, 4, 25, H, E);
      ball3d(g, 168, HH - 18, 9.5, lightE, E);
      ball3d(g, 187, HH - 8, 4.6, H, E);
      ball3d(g, 160, 12, 3, g.mix(H, '#FFFFFF', 0.2), E);
      g.rect(0, HH, 210, 8, WHITE);                        // the balls' shadows stay inside the header
      g.rect(0, HH, 210, 1.1, H);
      g.gradRect(0, HH + 1.1, 210, 6, [g.mix(E, '#FFFFFF', 0.8), '#FFFFFF'], 90);
      // photo with a gold ring
      let nx = M;
      if (pw) { g.photoShape(M + 1, 13, pw, ph, 'circle', { ring: [H, H], ringW: 1.4, gapW: 0.9, gap: E }); nx = M + pw + 10; }
      // (v4.76) a big name in capitals: first name on one line, last name under it (gold), then the job title
      const nw = 152 - nx;
      const fn = String(g.cv.firstName || '').trim(), ln = String(g.cv.lastName || '').trim();
      let L = fn && ln ? [fn, ln] : g.wrapMax(String(g.name || '').replace(/\s+/g, ' ').trim(), nw, 30, 'bold', 2);
      L = L.map(upper);
      // (v4.77) the Name size slider is applied here (bigger names still fit the space and keep clear line gaps)
      const KN = (g.th && g.th.nameScale) || 1;
      let NS = 32 * KN;                            // as large as fits, like a bold printed name
      while (NS > 12 && L.some(l => g.measure(l, NS, 'bold') > nw)) NS -= 0.5;
      const LH = NS * 0.4, ts = 12.5, blockH = L.length * LH + (g.cv.title ? ts * 0.55 + 3 : 0);
      let ny = HH / 2 - blockH / 2 + NS * 0.3;
      const NL = g.layer(() => L.forEach((l, i) => { g.oneLine(l, nx, ny, nw, NS, 'bold', i === L.length - 1 && L.length > 1 ? H : WHITE); ny += LH; }));
      NL.ops.forEach(o => { o.nmFixed = true; }); g.emit(NL.ops);
      if (g.cv.title) g.oneLine(g.cv.title, nx, ny + 2.2, nw, ts, 'bold', g.mix(H, '#FFFFFF', 0.25));
      // the side card with a faded shadow
      const top = HH + 10, cx = M - 4, cw = 66, ch = 286 - top;
      softShadow(g, cx, top, cw, ch, 5);
      g.poly(g.roundPts(cx, top, cw, ch, 5), '#F5F2EA');
      g.rect(cx + 6, top, cw - 12, 1.1, H);
      const sideHead = (t, yy) => {
        ball3d(g, cx + 7.2, yy - 1.3, 1.7, H);
        g.text(upper(t), cx + 10.6, yy, g.fs(10), 'bold', E);
        return yy + 7;
      };
      g.sideLists(Object.assign({ x: cx + 5, y: top + 11, w: cw - 10, maxY: 280, heading: sideHead, order: ['contact', 'skills', 'hobbies', 'languages'] },
        sideCols({ label: T.muted, value: T.ink, bullet: H, on: E, off: g.mix(H, '#FFFFFF', 0.6) })));
      return HH + 12;
    },
    footer(g, i, n) { pageNum(g, i, n, 210 - g.M, 292, g.T.muted); }
  });
  // 7. black column with gold blocks and an arch photo
  // (v4.80) glass helpers: a pane with a light edge, a soft body and a shine across its top half
  function glass(g, x, y, w, h, r, base, o) {
    o = o || {};
    const R = Array.isArray(r) ? r : [r, r, r, r], RI = R.map(v => Math.max(0, v - 0.45));
    if (o.shadow) [[2.4, 0.05], [1.4, 0.09], [0.6, 0.13]].forEach(([d, k]) =>
      g.poly(g.roundPts(x - d + 0.5, y - d + 1.2, w + 2 * d, h + 2 * d, R.map(v => v + d)), g.mix(o.shadow, '#000000', k)));
    g.poly(g.roundPts(x, y, w, h, R), g.mix(base, '#FFFFFF', o.edge != null ? o.edge : 0.42));            // the light glass edge
    g.gradPoly(g.roundPts(x + 0.45, y + 0.45, w - 0.9, h - 0.9, RI),
      [g.mix(base, '#FFFFFF', o.lift != null ? o.lift + 0.06 : 0.2), g.mix(base, '#FFFFFF', o.lift != null ? o.lift : 0.1), g.mix(base, '#FFFFFF', o.lift != null ? o.lift + 0.03 : 0.14)], 90);
    const sh = Math.min(h * 0.45, o.shineH || 30);                                                          // the shine
    g.gradPoly(g.roundPts(x + 0.9, y + 0.9, w - 1.8, sh, [Math.max(0, RI[0] - 0.4), Math.max(0, RI[1] - 0.4), Math.min(RI[2], sh / 2), Math.min(RI[3], sh / 2)]),
      [g.mix(base, '#FFFFFF', (o.lift != null ? o.lift : 0.1) + 0.2), g.mix(base, '#FFFFFF', (o.lift != null ? o.lift : 0.1) + 0.04)], 90);
  }
  // a soft glowing blob (behind the glass): rings that fade into the colour under it
  function blob(g, cx, cy, r, col, under, n) {
    n = Math.max(14, n || 14);
    for (let k = 0; k < n; k++) { const t = k / (n - 1); g.circle(cx, cy, r * (1 - t * 0.9), g.mix(under, col, Math.pow(t, 1.6))); }
  }
  // the photo: a circle that sits half on the curved gold piece and half on the dark column
  function halfPhoto(g, cx, edgeY, T, H) {
    const [pw] = psz(g, 42, 42, 1.1);
    if (!pw) return 0;
    const r = pw / 2;
    g.photoShape(cx - r, edgeY - r, pw, pw, 'circle', { ring: [g.mix(H, '#FFFFFF', 0.55), H, g.mix(H, '#000000', 0.25)], ringW: 1.8, gapW: 1, gap: '#FFFFFF', angle: 90 });
    return edgeY + r;
  }

  // 7. (v4.80) Black Arch, glass: a dark column with glowing gold blobs behind frosted glass cards, a curved gold top
  // with the round photo sitting half across its curve, and glass headings on a soft light page
  FAMILY.lxArch = () => ({
    side: ['summary', 'skills', 'hobbies', 'languages'], fixedHeading: true, headH: 12,
    dateColor: T => T.accent, subColor: T => T.accent, bulletColor: T => T.accent,
    frame: g => ({ x: 86, w: 210 - 86 - g.M + 1, bottom: 284 }),
    heading(g, t, x, y, w) {
      const H = g.T.highlight;
      glass(g, x - 2, y, (w || 110) + 2, 8.4, 4.2, g.mix(H, '#FFFFFF', 0.62), { edge: 0.55, lift: 0.18, shineH: 4 });
      g.circle(x + 2.6, y + 4.2, 1.5, H);
      g.text(upper(t), x + 6, y + 5.8, g.fs(11), 'bold', g.T.primary);
    },
    page(g, p) {
      const T = g.T, H = T.highlight, D = g.mix(T.primary, '#FFFFFF', 0.06);
      // the dark column with soft gold glows that show around the glass
      g.gradRect(0, 0, 74, 297, [g.mix(D, '#FFFFFF', 0.08), D, g.mix(D, '#000000', 0.35)], 90);
      blob(g, 70, 130, 24, g.mix(H, D, 0.45), D);
      blob(g, 2, 216, 28, g.mix(H, D, 0.55), D);
      // the light page (drawn over anything that spilled out of the column), with soft gold glows top right
      g.gradRect(74, 0, 136, 297, ['#FAF8F4', '#FFFFFF', '#FBF9F5'], 90);
      blob(g, 214, -8, 44, g.mix(H, '#FFFFFF', 0.6), '#FAF8F4');
      blob(g, 172, 10, 12, g.mix(H, '#FFFFFF', 0.7), '#FAF8F4');
      // (v4.81) clean gold pieces: one smooth curve each, a soft shine, nothing sticking out
      const goldPiece = (pts) => g.gradPoly(pts, [g.mix(H, '#FFFFFF', 0.28), H, g.mix(H, '#000000', 0.1)], 90);
      goldPiece(g.roundPts(0, 275, 74, 30, [0, 15, 0, 0]));
      if (p > 1) { goldPiece(g.roundPts(0, 0, 74, 16, [0, 0, 16, 0])); return 20; }
      // the curved gold top; the photo sits half on its curve
      const EDGE = 50;
      goldPiece(g.roundPts(0, 0, 74, EDGE, [0, 0, 36, 0]));
      let y = halfPhoto(g, 37, EDGE, T, H);
      y = (y ? y + 9 : 56);
      y = luxName(g, 37, y, 62, 16, WHITE, H, 'center', { caps: true, titleSize: 8.8, titleCaps: true }) + 5;
      const head = (t, yy) => { g.circle(12.5, yy - 1.3, 1.7, H); g.text(upper(t), 16.5, yy, g.fs(10), 'bold', WHITE); return yy + 7; };
      const cols = sideCols({ label: '#B4B4B4', value: '#F4F4F4', bullet: H, on: H, off: '#4A4A4A' });
      // contact in one glass card, the other lists in a second one (cards are as tall as what is in them)
      const card = (order, y0, maxY) => {
        const L = g.layer(() => g.sideLists(Object.assign({ x: 10, y: y0 + 8, w: 55, maxY, heading: head, order }, cols)));
        if (!L.ops.length) return y0;
        glass(g, 4, y0, 66, Math.min(maxY + 4, L.r + 1) - y0, 7, D, { shadow: D, edge: 0.26, lift: 0.09, shineH: 12 });
        g.emit(L.ops);
        return L.r + 5;
      };
      y = card(['contact'], y, 268);
      card(['summary', 'skills', 'hobbies', 'languages'], y, 266);
      return 22;
    },
    footer(g, i, n) { pageNum(g, i, n, 210 - g.M, 292, g.T.muted); }
  });

  // 8. (v4.81) Rainbow Curves: a dark column with rainbow arcs sweeping from the top-left corner, the round photo
  // with a rainbow ring sitting on the arcs, pastel rainbow arcs in the top-right of the page, rainbow lines under the
  // headings and a thin rainbow stripe along the bottom
  const RAINBOW = ['#FF4D6D', '#FF9F1C', '#FFD60A', '#2EC4B6', '#3A86FF', '#8338EC'];
  // (v4.82) a wide, soft rainbow: many thin rings that blend the colours into each other and fade into the
  // background at both edges (strength: how strong the colour is in the middle of the band)
  function rbAt(t) { const q = Math.max(0, Math.min(1, t)) * (RAINBOW.length - 1), k = Math.min(RAINBOW.length - 2, Math.floor(q)); return [k, q - k]; }
  function softRainbow(g, cx, cy, R, width, under, strength, fadeK) {
    const N = Math.max(40, Math.round(width * 1.6));
    for (let n = 0; n <= N; n++) {
      const t = n / N, [k, f] = rbAt(t), c = g.mix(RAINBOW[k], RAINBOW[k + 1], f);
      const a = strength * Math.pow(Math.sin(Math.PI * t), fadeK || 0.9);
      g.circle(cx, cy, R - width * t, g.mix(under, c, a));
    }
    g.circle(cx, cy, R - width, under);
  }
  // smoke: a soft cloud of colour that fades out at its edge
  function smoke(g, cx, cy, r, col, under, strength) {
    const N = 22;
    for (let n = 0; n < N; n++) { const t = n / (N - 1); g.circle(cx, cy, r * (1 - t * 0.95), g.mix(under, col, strength * Math.pow(t, 1.8))); }
  }
  // (v4.84) Rainbow Curves, redesigned: a pastel rainbow header with a soft wave and a faded shadow, a flat
  // illustration (a rainbow arch over two clouds, with sparkles), a round photo with a white ring, a floating side card
  // with a faded shadow, rainbow lines under the headings and a small cloud scene at the bottom
  const annulus = (g, cx, cy, r1, r2, col) => {           // the top half of a ring (a rainbow band)
    const P = [];
    for (let k = 0; k <= 24; k++) { const a = Math.PI + Math.PI * k / 24; P.push([cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)]); }
    for (let k = 24; k >= 0; k--) { const a = Math.PI + Math.PI * k / 24; P.push([cx + r2 * Math.cos(a), cy + r2 * Math.sin(a)]); }
    g.poly(P, col);
  };
  const cloud = (g, x, y, s, col, shade) => {               // a flat cloud with a faded shadow under it
    [[0.025, 1.1], [0.05, 0.6]].forEach(([k, d]) => g.poly(g.roundPts(x - s * 1.45 - d * 0.2, y - s * 0.05 + d * 0.5, s * 2.9 + d * 0.4, s * 0.7, s * 0.35), g.mix(shade, '#2B3A55', k)));
    g.circle(x - s * 0.9, y, s * 0.55, col); g.circle(x - s * 0.15, y - s * 0.35, s * 0.8, col); g.circle(x + s * 0.75, y - s * 0.05, s * 0.6, col);
    g.poly(g.roundPts(x - s * 1.5, y - s * 0.15, s * 3, s * 0.65, s * 0.32), col);
  };
  const sparkle = (g, cx, cy, r, col) => {                  // a four-point star
    const P = [];
    for (let k = 0; k < 8; k++) { const a = -Math.PI / 2 + k * Math.PI / 4, rr = k % 2 ? r * 0.28 : r; P.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
    g.poly(P, col);
  };
  const wavePts = (y0, amp, top) => {                       // the header shape: a soft wave along its bottom
    const P = [[0, top], [210, top]];
    for (let k = 40; k >= 0; k--) { const x = 210 * k / 40; P.push([x, y0 + amp * Math.sin(x / 210 * Math.PI * 1.6 + 0.6)]); }
    return P;
  };
  // (v4.97) the rainbow follows the colour chosen in Design: the template's own colour keeps the real rainbow,
  // any other colour gives a 6-step band made from that colour scheme
  const curvesRB = g => {
    const th = g.th || {}, T = g.T;
    if ((th.color || 'royal') === 'royal' && !th.blend) return RAINBOW;
    return [g.mix(T.primary, '#FFFFFF', 0.25), g.mix(T.accent, T.primary, 0.25), T.accent, g.mix(T.accent, T.highlight, 0.5), T.highlight, g.mix(T.highlight, '#FFFFFF', 0.35)];
  };
  const curvesBlue = g => (curvesRB(g) === RAINBOW ? '#3A86FF' : g.T.accent);
  FAMILY.lxCurves = () => ({
    side: ['skills', 'hobbies', 'languages'], fixedHeading: true, headH: 12, langCols: 2,
    dateColor: T => T.accent, subColor: T => T.accent, bulletColor: T => (T.__rbBlue || '#3A86FF'),
    frame: (g, p) => p > 1 ? { x: g.M, w: 210 - 2 * g.M, bottom: 276 } : { x: 82, w: 210 - 82 - g.M, bottom: 276 },
    heading(g, t, x, y, w) {
      const T = g.T, RB = curvesRB(g);
      sparkle(g, x + 1.8, y + 3.6, 2.1, RB === RAINBOW ? '#FFB703' : T.highlight);
      g.text(upper(t), x + 5.4, y + 5, g.fs(11.5), 'bold', T.primary);
      g.gradPoly(g.roundPts(x + 5.4, y + 7.3, (w || 110) - 5.4, 1, 0.5), RB.map(c => g.mix(c, '#FFFFFF', 0.15)), 0);
    },
    page(g, p) {
      const T = g.T, RB = curvesRB(g), BL = curvesBlue(g), PASTEL = RB.map(c => g.mix(c, '#FFFFFF', 0.74)), SH = '#EEF1F6';
      T.__rbBlue = BL;
      g.rect(0, 0, 210, 297, WHITE);
      const HB = p > 1 ? 18 : 62;
      // faded shadow under the wave, then the pastel rainbow header
      [[4.5, 0.03], [3, 0.05], [1.6, 0.075]].forEach(([d, k]) => g.poly(wavePts(HB + d, 4, 0), g.mix('#FFFFFF', '#2B3A55', k)));
      g.gradPoly(wavePts(HB, 4, 0), PASTEL, 0);
      // the bottom: a small cloud scene and a thin rainbow stripe
      g.gradRect(0, 294, 210, 3, RB.map(c => g.mix(c, '#FFFFFF', 0.2)), 0);
      cloud(g, 186, 287, 5.5, '#F3F6FB', SH); cloud(g, 166, 290, 3.6, '#F3F6FB', SH);
      sparkle(g, 200, 278, 1.8, PASTEL[2]); sparkle(g, 152, 283, 1.3, PASTEL[4]);
      if (p > 1) {
        [10, 8.4, 6.8, 5.2, 3.6, 2].reduce((r, nx, k) => (annulus(g, 190, 16, r, nx, RB[k]), nx), 11.6);
        return HB + 10;
      }
      // the illustration: a rainbow arch over two clouds, with sparkles
      const ax = 176, ay = 47;
      let r = 30;
      RB.forEach(c => { annulus(g, ax, ay, r, r - 3.4, g.mix(c, '#FFFFFF', 0.08)); r -= 3.4; });
      cloud(g, ax - 22, ay + 1, 6.5, WHITE, g.mix(PASTEL[4], '#000000', 0.05));
      cloud(g, ax + 22, ay + 1, 7.5, WHITE, g.mix(PASTEL[5], '#000000', 0.05));
      sparkle(g, ax - 34, 14, 2.6, WHITE); sparkle(g, ax + 8, 8, 1.8, WHITE); sparkle(g, 204, 26, 2.2, WHITE); sparkle(g, ax - 6, 30, 1.4, WHITE);
      // the photo: white ring and a faded shadow
      const [pw] = psz(g, 40, 40, 1.1);
      let nx = 14;
      if (pw) {
        const pr = pw / 2, cx = 14 + pr, cy = 31;
        [[3.4, 0.04], [2.2, 0.07], [1.2, 0.1]].forEach(([d, k]) => g.circle(cx + 0.6, cy + 1.6, pr + d, g.mix(PASTEL[1], '#2B3A55', k)));
        g.photoShape(cx - pr, cy - pr, pw, pw, 'circle', { ring: WHITE, ringW: 1.8 });
        nx = 14 + pw + 8;
      }
      // the name and job title
      const nw = 136 - nx, full = String(g.name || '').replace(/\s+/g, ' ').trim();
      let NS = 24 * ((g.th && g.th.nameScale) || 1);
      while (NS > 12 && g.wrapMax(full, nw, NS, 'bold', 2).join(' ') !== full) NS -= 0.5;
      const lines = g.wrapMax(full, nw, NS, 'bold', 2), LH = NS * 0.42;
      let ny = 31 - (lines.length * LH + (g.cv.title ? 7 : 0)) / 2 + NS * 0.32;
      const NL = g.layer(() => lines.forEach(l => { g.text(l, nx, ny, NS, 'bold', T.primary); ny += LH; }));
      NL.ops.forEach(o => { o.nmFixed = true; }); g.emit(NL.ops);
      if (g.cv.title) { g.oneLine(g.cv.title, nx, ny + 2, nw, 11, 'regular', g.mix(T.primary, '#FFFFFF', 0.2)); g.gradPoly(g.roundPts(nx, ny + 4.6, 26, 0.9, 0.45), RB, 0); }
      // the floating side card with a faded shadow
      const top = HB + 12, cx0 = 9, cw = 64;
      const head = (t, yy) => { g.gradPoly(g.roundPts(cx0 + 5, yy - 3.3, 3.3, 3.3, 1.65), RB, 45); g.text(upper(t), cx0 + 10.5, yy, g.fs(10), 'bold', T.primary); return yy + 7; };
      const L = g.layer(() => g.sideLists(Object.assign({ x: cx0 + 5, y: top + 10, w: cw - 10, maxY: 270, heading: head, order: ['contact', 'skills', 'hobbies', 'languages'] },
        sideCols({ label: T.muted, value: T.ink, bullet: BL, on: BL, off: RB === RAINBOW ? '#DCE5F3' : T.tint2 }))));
      const ch = Math.max(60, Math.min(274, L.r + 4) - top);
      softShadow(g, cx0, top, cw, ch, 7);
      g.poly(g.roundPts(cx0, top, cw, ch, 7), WHITE);
      g.emit(L.ops);
      return HB + 12;
    },
    footer(g, i, n) { pageNum(g, i, n, 105, 291, g.T.muted); }
  });

  // dark page with gold step lines, polygon photo, two columns (9 and 12)
  FAMILY.lxGoldFrame = o => ({
    side: ['summary', 'skills', 'hobbies', 'languages'], fixedHeading: true, headH: 13,
    recolor: DARK_TEXT, dateColor: T => T.highlight, subColor: T => T.highlight, bulletColor: T => T.highlight,
    frame: g => ({ x: 12, w: 85, bottom: o.bars ? 280 : 282 }),
    heading(g, t, x, y, w) { pillHead(g, t, x + 8, y, w - 16, o.filled, o.flat); },
    page(g, p) {
      const T = g.T, H = T.highlight, gold = o.flat ? [H, H] : g.metal(H);
      // (v4.73) Gold Bars: flat colours (one solid page colour, solid gold bars and headings)
      if (o.flat) g.rect(0, 0, 210, 297, T.primary);
      else g.gradRect(0, 0, 210, 297, [g.mix(T.primary, '#FFFFFF', 0.06), T.primary, g.mix(T.primary, '#000000', 0.45)], 90);
      if (o.bars) {
        if (o.flat) { g.poly([[0, 0], [210, 0], [200, 9], [10, 9]], H); g.poly([[10, 288], [200, 288], [210, 297], [0, 297]], H); }
        else { g.gradPoly([[0, 0], [210, 0], [200, 9], [10, 9]], gold, 0); g.gradPoly([[10, 288], [200, 288], [210, 297], [0, 297]], gold, 0); }
      }
      const t0 = o.bars ? 9 : 0;
      if (p > 1) { g.line(103, t0 + 8, 103, 282, H, 0.5); return t0 + 12; }
      const [pw] = psz(g, 56, 56, 1.1);
      if (pw) g.photoShape(16, t0 + 9, pw, pw, o.shape, o.flat ? { ring: H, ringW: 2, gapW: 0.9, gap: T.primary } : { ring: o.shape === 'dec' ? g.metal('#A0A0A0') : gold, ringW: 2.6, gapW: 0.9, gap: T.primary, angle: 90 });
      const lineY = Math.max(pw ? t0 + 9 + pw + 9 : 0, 82);
      const x = 111, w = 210 - x - g.M + 4;
      luxName(g, x, lineY - 34, w, 21, WHITE, '#E6E6E6', 'left', { caps: true, titleSize: 13, titleStyle: 'bold' });
      // gold step line
      g.line(0, lineY + 6, 62, lineY + 6, H, 0.8); g.line(62, lineY + 6, 70, lineY - 1, H, 0.8); g.line(70, lineY - 1, 210, lineY - 1, H, 0.8);
      g.line(103, lineY - 1, 103, 282, H, 0.5);
      if (!o.bars) { g.line(10, 286, 96, 286, H, 0.8); g.line(96, 286, 103, 282, H, 0.8); g.line(103, 282, 210, 282, H, 0.8); }
      g.sideLists(Object.assign({ x, y: lineY + 13, w, maxY: o.bars ? 282 : 280, heading: (t, yy) => { pillHead(g, t, x + 4, yy - 5.8, w - 8, o.filled, o.flat); return yy + 9; }, gap: 7,
        order: ['contact', 'summary', 'skills', 'hobbies', 'languages'] },
        sideCols({ label: '#A9A9A9', value: '#F2F2F2', bullet: H, on: H, off: '#454545' })));
      return lineY + 9;
    },
    footer(g, i, n) { pageNum(g, i, n, 97, o.bars ? 285 : 292, '#8A8A8A'); }
  });

  // (v4.97) Octagon Gold, redesigned: a dark page with a thin gold frame and small octagon corner marks, a short header
  // (small octagon photo, name and title), a soft side panel on the left, compact headings with a gold octagon mark.
  // Built to hold many sections on one page.
  const octPts = (cx, cy, r) => { const P = []; for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; P.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return P; };
  FAMILY.lxOctNoir = () => {
    const SX = 12, SW = 58, MX = 79;
    return {
      side: ['skills', 'hobbies', 'languages'], fixedHeading: true, headH: 10, langStyle: 'bar',
      recolor: DARK_TEXT, dateColor: T => T.highlight, subColor: T => T.highlight, bulletColor: T => T.highlight,
      meterColors: T => [T.highlight, '#4A4F59'],
      frame: (g, p) => p > 1 ? { x: 14, w: 182, bottom: 284 } : { x: MX, w: 210 - MX - 12, bottom: 284 },
      heading(g, t, x, y, w) {
        const H = g.T.highlight;
        g.poly(octPts(x + 1.8, y + 3.4, 1.8), H);
        g.text(upper(t), x + 5.4, y + 4.8, g.fs(10.2), 'bold', '#FFFFFF');
        const tw = g.measure(upper(t), g.fs(10.2), 'bold') + 8;
        g.line(x + tw, y + 3.4, x + (w || 110), y + 3.4, g.mix(H, g.T.primary, 0.45), 0.35);
      },
      page(g, p) {
        const T = g.T, H = T.highlight, BG = g.mix(T.primary, '#000000', 0.25);
        g.gradRect(0, 0, 210, 297, [g.mix(BG, '#FFFFFF', 0.05), BG, g.mix(BG, '#000000', 0.35)], 90);
        // thin gold frame with octagon marks in the corners
        const F = g.mix(H, BG, 0.25);
        g.line(6, 6, 204, 6, F, 0.35); g.line(6, 291, 204, 291, F, 0.35); g.line(6, 6, 6, 291, F, 0.35); g.line(204, 6, 204, 291, F, 0.35);
        [[6, 6], [204, 6], [6, 291], [204, 291]].forEach(([cx, cy]) => { g.poly(octPts(cx, cy, 2.6), BG); g.poly(octPts(cx, cy, 1.9), H); });
        if (p > 1) return 16;
        // header: octagon photo, name, title, a gold rule
        const [pw] = psz(g, 34, 34, 1.05);
        let nx = 14;
        if (pw) { g.photoShape(13, 12, pw, pw, 'oct', { ring: g.metal(H), ringW: 1.6, gapW: 0.8, gap: BG, angle: 90 }); nx = 13 + pw + 9; }
        const nameW = 196 - nx, ns = 21;
        const nh = nameHeight(g, nameW, ns, true);
        const ny = 12 + Math.max(pw, 30) / 2 - nh / 2 + ns * 0.33;
        const yEnd = luxName(g, nx, ny, nameW, ns, '#FFFFFF', H, 'left', { caps: true, titleSize: 11.5, titleStyle: 'bold' });
        g.line(nx, yEnd + 1.2, nx + 38, yEnd + 1.2, H, 0.7); g.poly(octPts(nx + 40.5, yEnd + 1.2, 1.2), H);
        const top = Math.max(12 + (pw || 30), yEnd + 3) + 7;
        // the soft side panel
        g.poly(g.roundPts(SX - 3, top - 2, SW + 6, 286 - top, 5), g.mix(BG, '#FFFFFF', 0.07));
        const head = (t, yy) => {
          g.poly(octPts(SX + 1.8, yy - 1.4, 1.7), H);
          g.text(upper(t), SX + 5.2, yy, g.fs(9.6), 'bold', H);
          return yy + 6.5;
        };
        g.sideLists(Object.assign({ x: SX + 1, y: top + 6, w: SW - 2, maxY: 282, heading: head, gap: 4.5, order: ['contact', 'skills', 'hobbies', 'languages'] },
          sideCols({ label: '#B9BDC6', value: '#F2F2F2', bullet: H, on: H, off: '#4A4F59' })));
        return top + 2;
      },
      footer(g, i, n) { pageNum(g, i, n, 105, 289, '#8A8A8A'); }
    };
  };

  // (v4.97) Gold Bars, redesigned: an ivory page with a charcoal header and a charcoal column on the right (an L shape),
  // three rising gold bars in the corner, a decagon photo, headings with a small gold bar chart, a gold strip at the bottom.
  // Built to hold many sections on one page.
  FAMILY.lxBarsL = () => {
    const CX = 146, IVORY = '#FBF8F2';
    const bars = (g, x, yb, k, col) => [0.55, 0.8, 1.05].forEach((h, i) => g.rect(x + i * 1.55 * k, yb - h * 3.4 * k, 1.05 * k, h * 3.4 * k, col));
    return {
      side: ['skills', 'hobbies', 'languages'], fixedHeading: true, headH: 10, langStyle: 'bar',
      dateColor: T => g0(T), subColor: T => g0(T), bulletColor: T => T.highlight,
      meterColors: T => [T.highlight, '#E8E1D0'],
      frame: (g, p) => ({ x: 13, w: CX - 13 - 8, bottom: 284 }),
      heading(g, t, x, y, w) {
        const T = g.T;
        bars(g, x, y + 5.2, 1, T.highlight);
        g.text(upper(t), x + 6.4, y + 4.9, g.fs(10.2), 'bold', T.primary);
        const tw = g.measure(upper(t), g.fs(10.2), 'bold') + 9;
        g.line(x + tw, y + 3.4, x + (w || 110), y + 3.4, '#E2D9C4', 0.35);
      },
      page(g, p) {
        const T = g.T, H = T.highlight, C = T.primary;
        g.rect(0, 0, 210, 297, IVORY);
        g.rect(CX, 0, 210 - CX, 297, C);                                   // the right column, the whole height
        g.rect(0, 291, 210, 6, H);                                         // gold strip at the bottom
        if (p > 1) { g.rect(0, 0, 210, 5, C); return 14; }
        const HB = 44;
        g.rect(0, 0, 210, HB, C);                                          // the header (an L with the column)
        // three rising gold bars in the corner of the header
        [[176, 20], [186, 28], [196, 36]].forEach(([x, h]) => g.rect(x, HB - h, 7, h, H));
        const [pw] = psz(g, 30, 30, 1.05);
        let nx = 14;
        if (pw) { g.photoShape(12, (HB - pw) / 2, pw, pw, ({ square: 'square', rounded: 'rounded', circle: 'circle' })[g.th.photoShape] || 'circle', { ring: H, ringW: 1.5, gapW: 0.8, gap: C }); nx = 12 + pw + 8; }
        const nameW = 170 - nx, ns = 20, nh = nameHeight(g, nameW, ns, true);
        luxName(g, nx, HB / 2 - nh / 2 + ns * 0.33, nameW, ns, '#FFFFFF', H, 'left', { caps: true, titleSize: 11.5, titleStyle: 'bold' });
        const head = (t, yy) => {
          bars(g, CX + 7, yy + 0.4, 0.85, H);
          g.text(upper(t), CX + 12.4, yy, g.fs(9.6), 'bold', H);
          return yy + 6.5;
        };
        g.sideLists(Object.assign({ x: CX + 7, y: HB + 10, w: 210 - CX - 13, maxY: 286, heading: head, gap: 4.5, order: ['contact', 'skills', 'hobbies', 'languages'] },
          sideCols({ label: '#B9BDC6', value: '#F2F2F2', bullet: H, on: H, off: '#4A4F59' })));
        return HB + 8;
      },
      footer(g, i, n) { pageNum(g, i, n, 80, 288, '#9A8F78'); }
    };
  };
  // dates and company names on the ivory page: the gold made darker, so it reads well on light paper
  const g0 = T => window.CVPdf.mix(T.highlight, '#000000', 0.38);

  // 10. charcoal page, grey column with a full-width photo, orange ribbon headings
  FAMILY.lxOrange = () => ({
    side: ['skills', 'hobbies', 'languages'], fixedHeading: true, headH: 13.5,
    recolor: DARK_TEXT, dateColor: T => T.accent, subColor: T => T.accent, bulletColor: T => T.accent,
    frame: g => ({ x: 82, w: 210 - 82 - Math.min(g.M, 11), bottom: 284 }),
    heading(g, t, x, y, w) {
      const A = g.T.accent, fold = g.mix(A, '#000000', 0.5);
      g.poly([[x - 2, y + 7.6], [x + 3, y + 7.6], [x + 3, y + 9.8]], fold);
      g.poly([[x + w + 2, y + 7.6], [x + w - 3, y + 7.6], [x + w - 3, y + 9.8]], fold);
      g.gradRect(x - 2, y, w + 4, 7.6, [g.mix(A, '#FFFFFF', 0.15), A, g.mix(A, '#000000', 0.12)], 90);
      g.text(upper(t), x + w / 2, y + 5.4, g.fs(10.5), 'bold', WHITE, 'center');
    },
    page(g, p) {
      const T = g.T, A = T.accent;
      g.gradRect(0, 0, 210, 297, g.depth(T.primary), 90);
      g.gradRect(0, 0, 74, 297, g.depth(g.mix(T.primary, '#FFFFFF', 0.16)), 90);
      if (p > 1) return 16;
      let y = 0;
      if (g.showPhoto) { const ph = 66 * Math.min(g.PS, 1.1); g.photoShape(0, 0, 74, ph, 'rect', { fill: g.depth(A) }); y = ph; }
      const nh = nameHeight(g, 64, 16) + 9;
      g.gradRect(0, y, 74, nh, [g.mix(T.primary, '#000000', 0.15), g.mix(T.primary, '#000000', 0.45)], 90);
      luxName(g, 37, y + 9.5, 64, 16, WHITE, '#E0E0E0', 'center', { caps: true, titleSize: 8.4, titleCaps: true });
      const head = (t, yy) => {
        g.poly([[62, yy + 2.2], [68, yy + 2.2], [62, yy + 4.4]], g.mix(A, '#000000', 0.5));
        g.gradRect(0, yy - 5.4, 68, 7.6, [g.mix(A, '#FFFFFF', 0.15), A, g.mix(A, '#000000', 0.12)], 90);
        g.text(upper(t), 10, yy, g.fs(10), 'bold', WHITE); return yy + 9;
      };
      g.sideLists(Object.assign({ x: 9, y: y + nh + 12, w: 58, maxY: 288, heading: head, order: ['contact', 'skills', 'hobbies', 'languages'] },
        sideCols({ label: '#B4B4B4', value: '#F2F2F2', bullet: A, on: A, off: '#5A5A5A' })));
      return 14;
    },
    footer(g, i, n) { pageNum(g, i, n, 200, 292, '#9A9A9A'); }
  });

  // 11. copper page, white diagonal stripes, hexagon photo on a light panel
  // Page 2: skills and languages that did not fit next to page 1 continue in the light column;
  // with nothing for that column, page 2 is one wide copper page. The last page ends with the
  // white stripes again, low in the free space under the text.
  FAMILY.lxCopper = () => {
    const LIGHT = '#F7F3EF', INK = '#3A1808', PAGE = [[0, 0], [210, 0], [210, 297], [0, 297]];
    const mix = (a, b, k) => window.CVPdf.mix(a, b, k);
    const yAt = (x, c) => c - 0.62 * x;
    const bg = T => [mix(T.accent, '#FFFFFF', 0.06), T.accent, T.primary];
    const twoCol = (g, p) => p === 1 || (p === 2 && g.carry.length > 0);
    const head = (g, t, yy, x) => { g.text(upper(t), x, yy, g.fs(10.5), 'bold', g.T.primary); g.line(x, yy + 1.8, x + 40, yy + 1.8, g.T.accent, 0.4); return yy + 7; };
    const cols = T => sideCols({ label: '#8A6450', value: INK, bullet: T.accent, on: T.accent, off: '#E2CFC2' });
    // two white stripes along y = c - 0.62x (the second one 9 mm lower)
    const stripes = (g, c, to) => { const X = to || 210; [[c, c + 4.5], [c + 9, c + 13.5]].forEach(([a, b]) => g.poly([[0, a], [X, yAt(X, a)], [X, yAt(X, b)], [0, b]], WHITE)); };
    // does a group of side lists fit above maxY? (draws nothing)
    const fits = (g, o) => {
      const keep = new Set(g.sideOverflow);
      g.layer(() => g.sideLists(o));
      const ok = g.sideOverflow.size === keep.size;
      g.sideOverflow.clear(); keep.forEach(v => g.sideOverflow.add(v));
      return ok;
    };
    return {
      side: ['skills', 'hobbies', 'languages'], fixedHeading: true, headH: 11.5,
      langStyle: 'bar', langCols: 3,               // (v4.97) slim level bars; on the copper side 3 languages in a row
      recolor: () => ({ ink: '#FFF7F0', muted: '#F3D9C6', line: '#C98B66' }),
      dateColor: T => T.highlight, subColor: T => T.highlight, bulletColor: T => T.highlight,
      meterColors: T => [T.highlight, mix(T.highlight, T.primary, 0.62)],
      frame: (g, p) => twoCol(g, p) ? { x: 96, w: 210 - 96 - Math.min(g.M, 11), bottom: 284 } : { x: g.M, w: 210 - 2 * g.M, bottom: 284 },
      heading(g, t, x, y) { g.text(upper(t), x, y + 5.2, g.fs(12), 'bold', WHITE); g.rect(x, y + 7.3, 16, 1, g.T.highlight); },
      page(g, p) {
        const T = g.T;
        g.gradRect(0, 0, 210, 297, bg(T), 120);
        if (p > 1) {
          if (twoCol(g, p)) g.rect(0, 0, 88, 297, LIGHT);
          return 16;
        }
        g.poly([[0, yAt(0, 102)], [88, yAt(88, 102)], [88, 297], [0, 297]], LIGHT);   // (v4.08) narrower: the copper side is wider   // (v4.07) 28 mm higher: more room
        stripes(g, 84);
        luxName(g, g.M - 2, 22, 92, 20, WHITE, T.highlight, 'left', { titleSize: 12.5 });
        const [pw, ph] = psz(g, 56, 49, 1.05);
        let y = 136;
        if (pw) { g.photoShape(6, 106, pw, ph, 'hexflat', { ring: g.depth(T.accent), ringW: 1.6 }); y = 106 + ph + 12; }
        else y = 114;
        const c = cols(T), H = (x, yy, t) => head(g, t, yy, x);
        // contact, then skills, then languages under each other; what does not fit goes on in the light column of page 2
        let yy = y;
        const ord = (g.th && g.th.order) || [];   // (v4.97) after contact, the order chosen in Design > Sections
        ['contact'].concat(['skills', 'hobbies', 'languages'].sort((a, b) => ord.indexOf(a) - ord.indexOf(b))).forEach(sec => {
          const o = Object.assign({ x: 8, y: yy, w: 74, maxY: 296, heading: (t, at) => H(8, at, t), order: [sec] }, c);   // (v4.97) the section's end spacing may reach the edge; the last text stays ~10 mm above it
          if (sec === 'contact' || fits(g, o)) yy = g.sideLists(o) + 1; else g.sideOverflow.add(sec);
        });
        return 45;   // (v4.09) clear of the white stripes, which end at y 38 where the copper side starts
      },
      // page 2 light column: what did not fit on page 1 (skills as tags, languages with their level)
      side2(g, list) {
        const T = g.T;
        return g.sideLists(Object.assign({ x: 8, y: 23.2, w: 74, maxY: 284, gap: 6, chips: true, heading: (t, yy) => head(g, t, yy, 8), order: list,
          chipFill: '#FFFFFF', chipLine: mix(T.accent, '#FFFFFF', 0.55), chipText: INK }, cols(T)));
      },
      // last page: page 1's stripes again, mirrored: they sweep up through the free space under the text,
      // with copper under them, so a short last page still looks complete
      finish(g, n, info) {
        if (n < 2) return;
        const T = g.T, two = twoCol(g, n), right = 210 - Math.min(g.M, 11);
        const cSide = Math.max(176, info.sideBottom + 9 + 0.62 * 82);
        let c = Math.max(176, info.mainBottom + 9 + 0.62 * right);
        if (two) c = Math.max(c, cSide);
        if (c <= 360) {                                        // across the page
          if (two) g.gradPoly([[0, c - 4.5], [94, yAt(94, c - 4.5)], [94, 297], [0, 297]], bg(T), 120, PAGE);
          stripes(g, c);
        } else if (two && cSide <= 330) {                      // the copper column is full: only in the light column
          c = cSide;
          g.gradPoly([[0, c - 4.5], [90, yAt(90, c - 4.5)], [90, 297], [0, 297]], bg(T), 120, PAGE);
          stripes(g, c, 88);
        } else return;
        // the name again in the copper corner, like the top of page 1
        const nl = g.wrapMax(g.name, 92, 15, 'bold', 2), nw = Math.max(...nl.map(l => g.measure(l, 15, 'bold')));
        const ny = 284 - (g.cv.title ? 7.6 : 0) - (nl.length - 1) * 6.45;
        if (yAt(g.M - 2 + nw, c) < ny - 13) luxName(g, g.M - 2, ny, 92, 15, WHITE, T.highlight, 'left', { titleSize: 10 });
      },
      footer(g, i, n) { pageNum(g, i, n, 200, 292, '#F3D9C6'); }
    };
  };

  /* ---------------- the 88 templates ---------------- */
  const CATEGORIES = ['Professional', 'Modern', 'Creative', 'Simple', 'Elegant', 'Two Column', 'Bold Header', 'Compact', 'Premium'];
  // (v4.42) the free templates are shown in 3 groups (the 8 families stay as they are inside)
  const GROUP = { Professional: 'Professional', Elegant: 'Professional', Simple: 'Professional',
    Modern: 'Modern', 'Two Column': 'Modern', Compact: 'Modern',
    Creative: 'Creative', 'Bold Header': 'Creative', Premium: 'Premium' };
  // [id, name, category, layout, layout options, heading, extras, colour, font]
  const TEMPLATES = [
    // Professional
    ['classic', 'Classic Header', 0, 'band', {}, 'bar', {}, 'royal', 'helvetica'],
    ['executive', 'Executive', 0, 'executive', { center: true }, 'caps', {}, 'royal', 'helvetica'],
    ['split', 'Split Header', 0, 'split', {}, 'line', {}, 'royal', 'helvetica'],
    ['pro-slate', 'Slate Office', 0, 'band', { color: 'accent', photo: 'left' }, 'caps', {}, 'slate', 'carlito'],
    ['pro-navy', 'Navy Serif', 0, 'executive', {}, 'rule', {}, 'royal', 'caladea'],
    ['pro-charcoal', 'Charcoal Split', 0, 'split', {}, 'bar', {}, 'charcoal', 'carlito'],
    ['pro-sky', 'Sky Corporate', 0, 'band', {}, 'under', {}, 'sky', 'dejavusans'],
    ['pro-wine', 'Wine Manager', 0, 'executive', { center: true, topBar: 5 }, 'center', {}, 'burgundy', 'pagella'],
    // Modern
    ['modern', 'Modern Timeline', 1, 'diag', {}, 'dot', { timeline: true, chipStyle: 'pill', photoRight: true }, 'royal', 'helvetica'],
    ['corner', 'Fresh Corner', 1, 'sidebar', { tone: 'light', corner: true, W: 68, nameAccent: true, nameRule: false }, 'plain', { timeline: true }, 'royal', 'helvetica'],
    ['mod-green', 'Green Corner', 1, 'sidebar', { tone: 'light', corner: true, W: 68, round: true, nameAccent: true, nameRule: false }, 'plain', { timeline: true }, 'emerald', 'poppins'],
    ['mod-teal', 'Teal Wave', 1, 'diag', {}, 'pill', { chipStyle: 'pill', photoRight: true }, 'teal', 'poppins'],
    ['mod-purple', 'Purple Bubbles', 1, 'bubble', {}, 'dot', { timeline: true }, 'purple', 'adventor'],
    ['mod-sky', 'Sky Right', 1, 'sidebar', { side: 'right', tone: 'tint', W: 70 }, 'under', {}, 'sky', 'poppins'],
    ['mod-orange', 'Orange Flow', 1, 'diag', {}, 'square', { timeline: true, photoRight: true }, 'orange', 'dejavusans'],
    ['mod-card', 'Slate Card', 1, 'boxed', { photoRight: true }, 'caps', {}, 'slate', 'poppins'],
    // Creative
    ['stripe', 'Creative Stripe', 2, 'stripe', {}, 'square', {}, 'royal', 'helvetica'],
    ['banner', 'Bold Banner', 2, 'bannerPro', {}, 'goldbar', {}, 'royal', 'helvetica'],
    ['cre-rose', 'Rose Bubbles', 2, 'bubble', {}, 'pill', {}, 'rose', 'poppins'],
    ['cre-sunset', 'Sunset Stripe', 2, 'stripe', { width: 16 }, 'dot', {}, 'orange', 'adventor'],
    ['cre-violet', 'Violet Banner', 2, 'banner', { color: 'accent' }, 'center', {}, 'purple', 'poppins'],
    ['cre-teal', 'Teal Card', 2, 'boxed', {}, 'square', { timeline: true }, 'teal', 'adventor'],
    ['cre-forest', 'Forest Corner', 2, 'sidebar', { side: 'right', tone: 'light', corner: true, W: 68, round: true, nameAccent: true, nameRule: false }, 'square', {}, 'forest', 'poppins'],
    ['cre-berry', 'Berry Bubbles', 2, 'bubble', {}, 'under', {}, 'burgundy', 'caladea'],
    // Simple
    ['minimal', 'Minimal', 3, 'minimal', {}, null, {}, 'royal', 'helvetica'],
    ['compact', 'Compact', 3, 'compact', {}, 'caps', {}, 'royal', 'helvetica'],
    ['sim-classic', 'Black and White', 3, 'minimal', {}, null, {}, 'mono', 'times'],
    ['sim-plain', 'Plain Office', 3, 'executive', { double: false }, 'caps', {}, 'mono', 'helvetica'],
    ['sim-charcoal', 'Charcoal Lines', 3, 'compact', {}, 'line', {}, 'charcoal', 'carlito'],
    ['sim-slate', 'Slate Minimal', 3, 'minimal', { accentRule: true }, null, {}, 'slate', 'dejavusans'],
    ['sim-type', 'Typewriter', 3, 'executive', { double: false }, 'rule', {}, 'mono', 'courier'],
    ['sim-forest', 'Forest Simple', 3, 'compact', {}, 'under', {}, 'forest', 'schola'],
    // Elegant
    ['elegant', 'Elegant Frame', 4, 'frame', {}, 'center', {}, 'royal', 'helvetica'],
    ['ele-wine', 'Wine Frame', 4, 'frame', { corners: true }, 'center', {}, 'burgundy', 'pagella'],
    ['ele-gold', 'Charcoal Gold', 4, 'frame', {}, 'center', {}, 'charcoal', 'bonum'],
    ['ele-navy', 'Navy Classic', 4, 'executive', { center: true }, 'center', {}, 'royal', 'schola'],
    ['ele-violet', 'Violet Frame', 4, 'frame', { paper: false, corners: true }, 'center', {}, 'purple', 'caladea'],
    ['ele-forest', 'Forest Serif', 4, 'band', {}, 'rule', {}, 'forest', 'dejavuserif'],
    ['ele-teal', 'Teal Column', 4, 'sidebar', { tone: 'tint', W: 66 }, 'center', {}, 'teal', 'pagella'],
    ['ele-rose', 'Rose Frame', 4, 'frame', { corners: true }, 'center', {}, 'rose', 'schola'],
    // Two Column
    ['sidebar', 'Royal Sidebar', 5, 'sidebar', { tone: 'dark' }, 'under', {}, 'royal', 'helvetica'],
    ['rightbar', 'Right Column', 5, 'sidebar', { side: 'right', tone: 'tint', W: 70 }, 'under', {}, 'royal', 'helvetica'],
    ['two-emerald', 'Emerald Column', 5, 'sidebar', { tone: 'dark' }, 'caps', {}, 'emerald', 'carlito'],
    ['two-wine', 'Wine Right', 5, 'sidebar', { side: 'right', tone: 'dark' }, 'bar', {}, 'burgundy', 'caladea'],
    ['two-sky', 'Sky Light Column', 5, 'sidebar', { tone: 'light' }, 'dot', { timeline: true }, 'sky', 'dejavusans'],
    ['two-charcoal', 'Charcoal Round', 5, 'sidebar', { tone: 'dark', round: true }, 'line', {}, 'charcoal', 'poppins'],
    ['two-orange', 'Orange Column', 5, 'sidebar', { tone: 'tint' }, 'square', {}, 'orange', 'carlito'],
    ['two-purple', 'Purple Right', 5, 'sidebar', { side: 'right', tone: 'light', corner: true, round: true }, 'under', {}, 'purple', 'adventor'],
    // Bold Header
    ['hdr-navy', 'Navy Header', 6, 'band', { photo: 'left' }, 'caps', {}, 'royal', 'poppins'],
    ['hdr-emerald', 'Emerald Split', 6, 'split', {}, 'under', {}, 'emerald', 'carlito'],
    ['hdr-sky', 'Sky Banner', 6, 'banner', { color: 'accent' }, 'band', {}, 'sky', 'helvetica'],
    ['hdr-orange', 'Orange Header', 6, 'band', { color: 'accent' }, 'bar', {}, 'orange', 'heroscn'],
    ['hdr-slate', 'Slate Diagonal', 6, 'diag', {}, 'line', {}, 'slate', 'heroscn'],
    ['hdr-teal', 'Teal Split', 6, 'split', {}, 'dot', {}, 'teal', 'poppins'],
    ['hdr-purple', 'Purple Header', 6, 'band', {}, 'pill', {}, 'purple', 'carlito'],
    ['hdr-wine', 'Wine Banner', 6, 'banner', {}, 'caps', {}, 'burgundy', 'schola'],
    // Compact
    ['cmp-navy', 'Navy Compact', 7, 'compact', {}, 'band', {}, 'royal', 'heroscn'],
    ['cmp-slate', 'Slate Compact', 7, 'compact', {}, 'caps', {}, 'slate', 'heroscn'],
    ['cmp-emerald', 'Emerald Narrow', 7, 'sidebar', { tone: 'light', W: 58 }, 'caps', {}, 'emerald', 'heroscn'],
    ['cmp-mono', 'Mono Compact', 7, 'compact', {}, 'line', {}, 'mono', 'carlito'],
    ['cmp-sky', 'Sky Compact', 7, 'executive', { double: false }, 'caps', {}, 'sky', 'heroscn'],
    ['cmp-charcoal', 'Charcoal Compact', 7, 'split', { dark: true }, 'bar', {}, 'charcoal', 'heroscn'],
    ['cmp-teal', 'Teal Narrow', 7, 'sidebar', { tone: 'dark', W: 58 }, 'under', {}, 'teal', 'carlito'],
    ['cmp-rose', 'Rose Compact', 7, 'compact', {}, 'dot', {}, 'rose', 'carlito'],
    // Premium
    ['pre-azure', 'Azure Swoosh', 8, 'premium', { decor: 'swoosh', side: 'tint' }, 'prem', {}, 'sky', 'poppins'],
    ['pre-noir', 'Noir Gold', 8, 'premium', { decor: 'wave', head: 'dark', side: 'dark', mainPaper: true, ring: 'highlight' }, 'prem', {}, 'charcoal', 'poppins'],
    ['pre-crystal', 'Blue Crystal', 8, 'premium', { decor: 'shards', side: 'tint' }, 'prem', {}, 'royal', 'carlito'],
    ['pre-ocean', 'Ocean Night', 8, 'premium', { decor: 'diag', side: 'dark', ring: 'highlight' }, 'prem', {}, 'ocean', 'poppins'],
    ['pre-violet', 'Violet Swoosh', 8, 'premium', { decor: 'swoosh', side: 'tint', glow: true }, 'prem', {}, 'purple', 'poppins'],
    ['pre-lime', 'Fresh Green', 8, 'premium', { decor: 'swoosh', side: 'tint' }, 'prem', {}, 'lime', 'carlito'],
    ['pre-exec', 'Executive Gold', 8, 'premium', { decor: 'wave', head: 'dark', side: 'paper', photoRight: true, ring: 'highlight' }, 'prem', {}, 'royal', 'poppins'],
    ['pre-sand', 'Sand Classic', 8, 'premium', { decor: 'cream', side: 'tint' }, 'prem', {}, 'sand', 'carlito'],
    ['pre-midnight', 'Midnight Blue', 8, 'premium', { decor: 'night', side: 'dark' }, 'prem', {}, 'sky', 'poppins'],
    ['pre-teal', 'Teal Tide', 8, 'premium', { decor: 'tide', side: 'tint' }, 'prem', {}, 'teal', 'poppins'],
    ['pre-stripe', 'Navy Stripes', 8, 'premium', { decor: 'stripes', side: 'light' }, 'prem', {}, 'royal', 'carlito'],
    ['pre-royal', 'Royal Purple', 8, 'premium', { decor: 'wave', head: 'dark', side: 'dark', layer: true }, 'prem', {}, 'purple', 'poppins'],
    // Premium, gradient designs
    ['lx-ribbon', 'Orange Ribbon', 8, 'lxRibbon', {}, null, {}, 'ember', 'poppins'],
    ['lx-sunny', 'Sunny Profile', 8, 'lxSunny', {}, null, {}, 'sun', 'poppins'],
    ['lx-sage', 'Sage Circle', 8, 'lxSage', {}, null, {}, 'sage', 'adventor'],
    ['lx-goldtab', 'Gold Tabs', 8, 'lxGoldTab', {}, null, {}, 'charcoal', 'poppins'],
    ['lx-navygold', 'Navy Gold', 8, 'lxNavyGold', {}, null, {}, 'royal', 'carlito'],
    ['lx-emerald', 'Emerald Gold', 8, 'lxEmerald', {}, null, {}, 'emgold', 'josefin'],
    ['lx-arch', 'Black Arch', 8, 'lxArch', {}, null, {}, 'bronze', 'poppins'],
    ['lx-curves', 'Rainbow Curves', 8, 'lxCurves', {}, null, {}, 'royal', 'poppins'],
    ['lx-goldbars', 'Gold Bars', 8, 'lxBarsL', {}, null, {}, 'charcoal', 'carlito'],
    ['lx-orange', 'Orange Banner', 8, 'lxOrange', {}, null, {}, 'ember', 'carlito'],
    ['lx-copper', 'Copper Diagonal', 8, 'lxCopper', {}, null, {}, 'copper', 'poppins'],
    ['lx-octagon', 'Octagon Gold', 8, 'lxOctNoir', {}, null, {}, 'charcoal', 'carlito']
  ];

  // designs where the first and the last name have different colours
  const TWO_TONE = new Set(['executive', 'split', 'pro-sky', 'modern', 'corner', 'mod-green', 'mod-teal', 'mod-sky', 'mod-card',
    'stripe', 'banner', 'cre-rose', 'cre-sunset', 'cre-teal', 'cre-forest', 'sim-slate', 'ele-teal',
    'sidebar', 'two-sky', 'two-orange', 'two-purple', 'hdr-navy', 'hdr-teal', 'hdr-purple', 'cmp-emerald',
    'pre-azure', 'pre-noir', 'pre-crystal', 'pre-ocean', 'pre-violet', 'pre-exec', 'pre-midnight', 'pre-teal', 'pre-royal',
    'lx-ribbon', 'lx-sage', 'lx-navygold', 'lx-goldbars', 'lx-orange', 'lx-copper', 'lx-octagon', 'lx-arch', 'lx-curves', 'lx-emerald']);
  // the typewriter design stays plain text (no icons)
  const NO_ICONS = new Set(['sim-type']);
  const D = {};
  const LIST = [];
  TEMPLATES.forEach(([id, name, cat, fam, opts, head, extra, color, font]) => {
    const t = Object.assign({}, FAMILY[fam](opts), extra);
    if (!t.fixedHeading) { t.heading = HEAD[head].f; t.headH = HEAD[head].h; }
    if (cat === 2) t.dense = { line: 0.92, space: 0.62, head: -2.2 };    // Creative: compact, more on one page
    if (TWO_TONE.has(id)) t.twoTone = true;
    if (NO_ICONS.has(id)) t.noIcons = true;
    D[id] = t;
    LIST.push({ id, name, category: GROUP[CATEGORIES[cat]], color, font, note: GROUP[CATEGORIES[cat]] + ' template' });
  });

  window.CVDesigns = D;
  window.CVDesignList = LIST;
  // Premium is shown first in the category row
  window.CVDesignCategories = ['Premium', 'Professional', 'Modern', 'Creative'];
})();
