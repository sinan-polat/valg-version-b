/* Runde 10: lille, afhængighedsfri .xlsx-skriver til «Hent sammenligningen (Excel)».
   Et rigtigt regneark (ikke CSV) kan have titel, kolonnebredder, fed overskrift, frosne rækker,
   talformater og filtre – så arket er til at læse, når det åbnes.
   Brug: XLSX.blob([{ name, widths, rows, merges, freeze, filter }]) → Blob
   Celle: tal, tekst, null (tom) eller { v, s } hvor s er et stilnavn (se STY) eller { fill:'#RRGGBB' } for en partifarve. */
(function () {
  'use strict';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };

  /* farver og typografi følger prototypen (mørkeblå #0F1E3A, lys #E7EBF3) */
  const NAVY = 'FF0F1E3A', SOFT = 'FFE7EBF3', MUTED = 'FF46536B';
  const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ink = hex => { const L = lum(hex); return (L + 0.05) / (lum('#0F1E3A') + 0.05) > 1.05 / (L + 0.05) ? NAVY : 'FFFFFFFF'; };

  // fonts: 0 normal, 1 fed, 2 titel, 3 grå lille, 4 fed hvid, 5 fed mørk, 6 fed mellem (afsnit)
  const FONTS = [
    '<font><sz val="11"/><color rgb="FF0F1E3A"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="11"/><color rgb="FF0F1E3A"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="16"/><color rgb="FF0F1E3A"/><name val="Calibri"/><family val="2"/></font>',
    `<font><sz val="10"/><color rgb="${MUTED}"/><name val="Calibri"/><family val="2"/></font>`,
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>',
    `<font><b/><sz val="11"/><color rgb="${NAVY}"/><name val="Calibri"/><family val="2"/></font>`,
    '<font><b/><sz val="12"/><color rgb="FF0F1E3A"/><name val="Calibri"/><family val="2"/></font>',
  ];
  const NUMFMTS = { 165: '0.0', 166: '+0;-0;0', 167: '+0.0;-0.0;0.0' };
  // [font, fill('navy'|'soft'|hex|null), border(0 ingen,1 bund,2 top), numFmt, align]
  const STY = {
    text: [0], bold: [1], title: [2], note: [3], section: [6],
    head: [1, 'soft', 1, 0, 'wrapc'], headl: [1, 'soft', 1, 0, 'wrapl'], group: [4, 'navy', 0, 0, 'wrapc'], groupl: [4, 'navy', 0, 0, 'left'],
    int: [0, null, 0, 3], pct: [0, null, 0, 165], dint: [0, null, 0, 166], dpct: [0, null, 0, 167], seat: [1, null, 0, 0],
    tText: [1, null, 2], tInt: [1, null, 2, 3], tPct: [1, null, 2, 165], tSeat: [1, null, 2, 0], tDint: [1, null, 2, 166], tBlank: [1, null, 2],
  };

  function build(sheets) {
    const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    const fillIx = {}; const fillOf = rgb => { if (!(rgb in fillIx)) { fillIx[rgb] = fills.length; fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`); } return fillIx[rgb]; };
    const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']; const xfIx = {};
    const xfOf = (font, fill, border, fmt, align) => {
      const fi = fill === 'navy' ? fillOf(NAVY) : fill === 'soft' ? fillOf(SOFT) : fill ? fillOf('FF' + fill.slice(1).toUpperCase()) : 0;
      const key = [font, fi, border || 0, fmt || 0, align || ''].join('|');
      if (!(key in xfIx)) {
        const al = align === 'center' ? '<alignment horizontal="center" vertical="center"/>' : align === 'left' ? '<alignment horizontal="left" vertical="center"/>'
          : align === 'wrapc' ? '<alignment horizontal="center" vertical="center" wrapText="1"/>' : align === 'wrapl' ? '<alignment horizontal="left" vertical="center" wrapText="1"/>' : '';
        xfIx[key] = xfs.length;
        xfs.push(`<xf numFmtId="${fmt || 0}" fontId="${font}" fillId="${fi}" borderId="${border || 0}" xfId="0"${fmt ? ' applyNumberFormat="1"' : ''}${font ? ' applyFont="1"' : ''}${fi ? ' applyFill="1"' : ''}${border ? ' applyBorder="1"' : ''}${al ? ' applyAlignment="1">' + al + '</xf>' : '/>'}`);
      }
      return xfIx[key];
    };
    const styleOf = c => {
      if (!c || typeof c !== 'object') return 0;
      if (c.fill) return xfOf(ink(c.fill) === NAVY ? 5 : 4, c.fill, 0, 0, 'center');
      const d = STY[c.s || 'text']; return xfOf(d[0], d[1], d[2], d[3], d[4]);
    };

    const sheetXml = sh => {
      const rowsXml = sh.rows.map((row, r) => {
        const ht = (sh.heights || {})[r];
        const cells = (row || []).map((c, ci) => {
          if (c === null || c === undefined || c === '') return '';
          const v = typeof c === 'object' ? c.v : c, s = styleOf(c), ref = colName(ci) + (r + 1), sa = s ? ` s="${s}"` : '';
          if (v === null || v === undefined || v === '') return `<c r="${ref}"${sa}/>`;
          if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${sa}><v>${v}</v></c>`;
          return `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
        }).join('');
        return `<row r="${r + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells}</row>`;
      }).join('');
      const pane = sh.freeze ? `<pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sh.freeze + 1}" sqref="A${sh.freeze + 1}"/>` : '';
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + `<sheetViews><sheetView workbookViewId="0"${sh.grid === false ? ' showGridLines="0"' : ''}${sh.tabSelected ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews>`
        + '<sheetFormatPr defaultRowHeight="15"/>'
        + (sh.widths ? '<cols>' + sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' : '')
        + `<sheetData>${rowsXml}</sheetData>`
        + (sh.filter ? `<autoFilter ref="${sh.filter}"/>` : '')
        + (sh.merges && sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '')
        + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToHeight="0"/></worksheet>';
    };
    const sheetFiles = sheets.map(sheetXml); // bygges før styles, så alle stilarter er registreret

    const files = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>'
        + sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>'
        + (sheets.some(s => s.filter) ? '<definedNames>' + sheets.map((s, i) => s.filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(s.name.slice(0, 31))}'!${s.filter.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}</definedName>` : '').join('') + '</definedNames>' : '')
        + '</workbook>',
      'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
        + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + `<numFmts count="${Object.keys(NUMFMTS).length}">${Object.entries(NUMFMTS).map(([k, v]) => `<numFmt numFmtId="${k}" formatCode="${esc(v)}"/>`).join('')}</numFmts>`
        + `<fonts count="${FONTS.length}">${FONTS.join('')}</fonts>`
        + `<fills count="${fills.length}">${fills.join('')}</fills>`
        + '<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>'
        + `<border><left/><right/><top/><bottom style="thin"><color rgb="${NAVY}"/></bottom><diagonal/></border>`
        + `<border><left/><right/><top style="thin"><color rgb="${NAVY}"/></top><bottom/><diagonal/></border></borders>`
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>`
        + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    };
    sheetFiles.forEach((x, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = x; });
    return zip(files);
  }

  /* ZIP uden komprimering (STORE) – nok til et lille regneark */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    Object.keys(files).forEach(name => {
      const nb = enc.encode(name), data = enc.encode(files[name]), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, dt, true); lh.setUint16(12, dd, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nb, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dt, true); ch.setUint16(14, dd, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nb);
      off += 30 + nb.length + data.length;
    });
    const csize = central.reduce((t, a) => t + a.length, 0), n = Object.keys(files).length;
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, n, true); end.setUint16(10, n, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  window.XLSX = { blob: build, col: colName };
})();
