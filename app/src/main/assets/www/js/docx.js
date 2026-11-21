/* (v4.97) Word download: the CV as an editable .docx (Word, Google Docs, WPS ...).
   Built here in the app with no extra library: plain WordprocessingML in a small ZIP (stored, no compression). */
window.RichDocx = (function () {
  'use strict';
  const enc = new TextEncoder();
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {                                   // files: [[name, Uint8Array]]
    const parts = [], central = []; let off = 0;
    for (const [name, data] of files) {
      const nm = enc.encode(name), crc = crc32(data), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true);
      parts.push(new Uint8Array(h.buffer), nm, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), nm);
      off += 30 + nm.length + data.length;
    }
    const csize = central.reduce((s, a) => s + a.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  const x = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const run = (t, o) => { o = o || {};
    return '<w:r><w:rPr>' + (o.b ? '<w:b/>' : '') + (o.c ? '<w:color w:val="' + o.c + '"/>' : '') + (o.sz ? '<w:sz w:val="' + o.sz + '"/>' : '') + '</w:rPr><w:t xml:space="preserve">' + x(t) + '</w:t></w:r>'; };
  const par = (runs, o) => { o = o || {};
    return '<w:p><w:pPr>' + (o.bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : '') +
      '<w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after == null ? 60 : o.after) + '"/>' +
      (o.border ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="' + o.border + '"/></w:pBdr>' : '') +
      (o.tabR ? '<w:tabs><w:tab w:val="right" w:pos="9638"/></w:tabs>' : '') + '</w:pPr>' + runs + '</w:p>'; };

  function build(cv, opts) {
    opts = opts || {};
    const t = opts.t || (s => s), A = (opts.accent || '1A5FE8').replace('#', ''), range = opts.range || (() => '');
    const lines = s => String(s || '').split(/\n+/).map(l => l.replace(/^\s*[-•*▪▸✓★–]\s*/, '').trim()).filter(Boolean);
    let b = '';
    const head = h => { b += par(run(t(h).toUpperCase(), { b: true, c: A, sz: 22 }), { before: 240, after: 80, border: 'C9D6EE' }); };
    b += par(run(cv.fullName || [cv.firstName, cv.lastName].filter(Boolean).join(' '), { b: true, sz: 44 }), { after: 20 });
    if (cv.title) b += par(run(cv.title, { c: A, sz: 26 }), { after: 120 });
    const contact = [cv.phone, cv.email, cv.address, cv.linkedin, cv.website].filter(Boolean);
    if (contact.length) b += par(run(contact.join('  |  '), { sz: 19, c: '444444' }), { after: 40 });
    const pers = [['Nationality', cv.nationality], ['Date of birth', cv.dob && opts.date ? opts.date(cv.dob) : cv.dob], ['Age', !cv.dob && cv.age], ['Gender', cv.gender], ['Marital status', cv.marital], ['Passport no.', cv.passport], ['Driving licence', cv.licence]].filter(p => p[1]);
    if (pers.length) b += par(pers.map((p, i) => (i ? run('   ') : '') + run(t(p[0]) + ': ', { b: true, sz: 19 }) + run(p[1], { sz: 19 })).join(''), { after: 40 });
    const hide = new Set((cv.theme && cv.theme.hide) || []);
    const order = ((cv.theme && cv.theme.order) || ['summary', 'experience', 'education', 'skills', 'languages', 'certificates', 'achievements', 'awards', 'projects', 'hobbies', 'custom', 'references']);
    const entry = (title, date, sub, body) => {
      b += par(run(title, { b: true, sz: 22 }) + (date ? '<w:r><w:tab/></w:r>' + run(date, { sz: 19, c: '555555' }) : ''), { before: 120, after: 20, tabR: true });
      if (sub) b += par(run(sub, { sz: 19, c: A }), { after: 40 });
      lines(body).forEach(l => { b += par(run(l, { sz: 20 }), { bullet: true, after: 20 }); });
    };
    const S = {
      summary: () => { if (!cv.summary) return; head('Profile'); b += par(run(cv.summary, { sz: 20 })); },
      experience: () => { const L = (cv.experience || []).filter(e => e.title || e.company); if (!L.length) return; head('Work experience');
        L.forEach(e => entry(e.title, range(e.start, e.end, e.current), [e.company, e.location].filter(Boolean).join(', '), e.duties)); },
      education: () => { const L = (cv.education || []).filter(e => e.degree || e.school); if (!L.length) return; head('Education');
        L.forEach(e => { entry(e.degree || e.school, range(e.start, e.end, e.current), e.degree ? [e.school, e.location].filter(Boolean).join(', ') : e.location, e.details); if (e.summary) b += par(run(e.summary, { sz: 20 })); }); },
      skills: () => { const L = (cv.skills || []).filter(Boolean); if (!L.length) return; head('Skills'); b += par(run(L.join('  •  '), { sz: 20 })); },
      languages: () => { const L = (cv.languages || []).filter(l => l && l.name); if (!L.length) return; head('Languages');
        b += par(L.map((l, i) => (i ? run('   •   ') : '') + run(l.name, { b: true, sz: 20 }) + (l.level ? run(' (' + t(l.level) + ')', { sz: 20, c: '555555' }) : '')).join('')); },
      certificates: () => { const L = (cv.certificates || []).filter(c => c.name); if (!L.length) return; head('Certificates and training');
        L.forEach(c => { entry(c.name, c.year, c.issuer, ''); if (c.summary) b += par(run(c.summary, { sz: 20 })); }); },
      achievements: () => { const L = lines(cv.achievements); if (!L.length) return; head('Achievements'); L.forEach(l => { b += par(run(l, { sz: 20 }), { bullet: true, after: 20 }); }); },
      awards: () => { const L = lines(cv.awards); if (!L.length) return; head('Awards & Honors'); L.forEach(l => { b += par(run(l, { sz: 20 }), { bullet: true, after: 20 }); }); },
      projects: () => { const L = lines(cv.projects); if (!L.length) return; head('Projects'); L.forEach(l => { b += par(run(l, { sz: 20 }), { bullet: true, after: 20 }); }); },
      hobbies: () => { const L = lines(cv.hobbies); if (!L.length) return; head('Hobbies'); b += par(run(L.join('  •  '), { sz: 20 })); },
      custom: () => (cv.custom || []).forEach(c => { if (!c.title && !(c.items || []).length) return; head(c.title || 'More'); (c.items || []).forEach(l => { b += par(run(l, { sz: 20 }), { bullet: true, after: 20 }); }); }),
      references: () => { if (!cv.references) return; head('References'); b += par(run(cv.references, { sz: 20 })); }
    };
    order.forEach(k => { if (!hide.has(k) && S[k]) S[k](); });

    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + W + '><w:body>' + b +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1134" w:bottom="1000" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>';
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ' + W + '><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:color w:val="1E2433"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>';
    const numbering = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ' + W + '><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="240"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>';
    const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    const drels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>';
    return zip([['[Content_Types].xml', enc.encode(types)], ['_rels/.rels', enc.encode(rels)], ['word/document.xml', enc.encode(doc)],
      ['word/_rels/document.xml.rels', enc.encode(drels)], ['word/styles.xml', enc.encode(styles)], ['word/numbering.xml', enc.encode(numbering)]]);
  }
  return { build };
})();
