/* Version D – helt nyt design: «Sætningen».
   Forsiden er én sætning, man udfylder («Jeg vil se mandaterne i Hørsholm ved Kommunalvalg 2025»), og svaret opdateres under den uden sideskift.
   Visuelt sprog: stemmeseddel (bogstav i boks, søjle), blanket (udfyldte felter), Storskærm til valgcaféen.
   Bygger på version C's datalag og live-simulation (app-c.js). ALLE tal og kandidatnavne er EKSEMPELDATA. */
(function () {
  'use strict';
  window.VXD = { init };

  function init(S) {
    const H = window.VH;
    const { h, fmtN, fmtP, sgn, href, log, csv, download, D, KOM, byId, ELS, REG } = H;
    const { LIVE, live, isCounted, simClock, hemicycle, allKV, allFV, FV, KV, PREV, PN } = S;
    const $ = (sel, root) => (root || document).querySelector(sel);
    const FOCKEY = 'valg.minKommune';
    const loadFoc = () => { try { const v = localStorage.getItem(FOCKEY); return v && byId[v] ? v : null; } catch (e) { return null; } };
    const saveFoc = v => { try { if (v) localStorage.setItem(FOCKEY, v); else localStorage.removeItem(FOCKEY); } catch (e) { /* ingen lagring */ } };
    const lowerFirst = t => /^Europa/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1); /* Europa-Parlamentsvalg bevarer stort E */
    const sk = Object.fromEntries(FV.storkredse.map(x => [x.id, x]));
    const komSorted = KOM.slice().sort((a, b) => a.name.localeCompare(b.name, 'da'));
    const DOTS = Object.keys(D.parties);
    const yr = v => +((String((ELS[v] || {}).date || '').match(/\d{4}/) || [0])[0]);
    /* alle valg i data.js: fem typer (folketingsvalg, kommunalvalg, regionsrådsvalg, Europa-Parlamentsvalg, folkeafstemning), nyeste først */
    const { TYPES, TYPE_ORDER, typeOf, elsOfType, seatsAt, isFA, dayDate } = H;
    const ELNAME = Object.fromEntries(Object.keys(ELS).map(v => [v, ELS[v].name]));
    const HAS_CAND = v => v === 'kv2025' || v === 'fv';
    const typeWord = v => lowerFirst(TYPES[typeOf(v)].name);

    /* ---------- områder og resultater ---------- */
    const isKV = v => !!ELS[v];
    const levelOf = id => id === 'land' ? 'land' : sk[id] ? 'storkreds' : byId[id] ? 'kommune' : 'region';
    /* har valget mandater i dette område? (fx ingen ved regionsrådsvalg i en kommune) */
    const hasSeatsHere = (valg, id) => (valg === 'fv' && sk[id]) || seatsAt(valg, levelOf(id));
    const areaSet = (valg, doing) => {
      const base = ['land'].concat(REG.map(r => r.id), komSorted.map(k => k.id));
      if (valg === 'fv' && doing === 'se') return base.concat(FV.storkredse.map(x => x.id));
      return doing === 'hente' ? base.concat(['alle-reg', 'alle-kom']) : base;
    };
    function areaLabel(id) {
      if (id === 'land') return 'hele landet';
      if (id === 'alle-reg') return 'alle regioner';
      if (id === 'alle-kom') return 'alle 98 kommuner';
      if (sk[id]) return sk[id].name;
      const a = H.getArea(id); return a ? (a.type === 'kommune' ? a.short : a.label) : id;
    }
    const areaName = id => { const t = areaLabel(id); return id === 'land' ? 'Hele landet' : t; };
    const areaIn = id => { if (id === 'land') return 'hele landet'; const a = !sk[id] && H.getArea(id); return a && a.type === 'kommune' ? a.short + ' Kommune' : areaLabel(id); };

    /* ét resultat for et område: { rows, seats, turnout, pending, nCounted, nTotal, type } */
    function resultOf(id, valg) {
      if (valg === 'fv' && sk[id]) {
        const m = {}, v = {};
        if (id === 'land') Object.keys(FV.nationalSeats).forEach(p => { const x = FV.nationalSeats[p]; if (x.kreds + x.tillaeg) m[p] = x.kreds + x.tillaeg; });
        else { const x = sk[id]; Object.keys(x.mandates).forEach(p => { m[p] = (m[p] || 0) + x.mandates[p]; }); Object.keys(x.tillaeg || {}).forEach(p => { m[p] = (m[p] || 0) + x.tillaeg[p]; }); }
        if (id === 'land') Object.assign(v, FV.nationalVotes);
        const tv = Object.values(v).reduce((t, n) => t + n, 0);
        const rows = Object.keys(D.parties).filter(p => m[p] || v[p]).map(p => ({ p, name: PN(p), color: D.parties[p].color, votes: id === 'land' ? v[p] || 0 : null, share: id === 'land' && tv ? (v[p] || 0) / tv * 100 : null, m: m[p] || 0, d: null, ds: null }));
        return { rows, seats: rows.reduce((t, r) => t + r.m, 0), turnout: null, pending: false, type: id === 'land' ? 'land' : 'storkreds', nCounted: 0, nTotal: 0, hasM: true };
      }
      const a = H.getArea(id); let list = a.kommuner;
      const liveOn = valg === 'kv2025' && LIVE.on;
      if (liveOn) list = list.filter(k => isCounted(k.id));
      if (!list.length) return { rows: [], seats: 0, turnout: 0, pending: true, type: a.type, nCounted: 0, nTotal: a.kommuner.length, hasM: true };
      const view = { results: {}, kommuner: list };
      /* mandater ligger dér, hvor valget fordeler dem (region/land ved regionsråds-, folketings- og EP-valg) */
      const get = vv => { const r0 = list.length === 1 && a.type === 'kommune' ? list[0].results[vv] : H.aggregate(list, vv); const sb = ELS[vv].seatsBy; return sb && a.type !== 'kommune' ? Object.assign({}, r0, { mandates: Object.assign({}, sb[id] || {}) }) : r0; };
      view.results[valg] = get(valg); if (ELS[valg].prev) view.results[ELS[valg].prev] = get(ELS[valg].prev);
      const rows = H.partyRows(view, valg).map(r => Object.assign(r, { m: r.m || 0 }));
      const R = view.results[valg];
      return { rows, seats: rows.reduce((t, r) => t + r.m, 0), turnout: R.turnout != null ? R.turnout : (R.electorate ? R.cast / R.electorate * 100 : 0), pending: false, type: a.type, nCounted: list.length, nTotal: a.kommuner.length, R, hasM: hasSeatsHere(valg, id) };
    }
    const fvBig = (() => { const o = {}; FV.kredse.forEach(k => k.kom.forEach(id => { o[id] = o[id] || {}; Object.keys(k.votes).forEach(p => { o[id][p] = (o[id][p] || 0) + k.votes[p]; }); })); const r = {}; Object.keys(o).forEach(id => { r[id] = Object.keys(o[id]).reduce((a, b) => o[id][a] > o[id][b] ? a : b); }); return r; })();
    const sortRows = (rows, mode, key) => rows.slice().sort(mode === 'alpha' ? (a, b) => a.p.localeCompare(b.p, 'da') : (a, b) => (b[key] || 0) - (a[key] || 0) || b.m - a.m || a.p.localeCompare(b.p, 'da'));

    /* ---------- tilstand ---------- */
    /* seneste valg med rigtige datoer vælges automatisk (i dag Kommunalvalg 2025) */
    const yearOf = k => +((String(ELS[k].date || '').match(/\d{4}/) || [0])[0]);
    const LATEST = Object.keys(ELS).sort((a, b) => yearOf(b) - yearOf(a))[0] || 'kv2025';
    const DEF = { do: 'se', hv: 'mand', omr: 'land', omr2: null, valg: LATEST, valg2: null, fmt: 'excel', side: null, sort: 'size', cmp: 'stem' };
    const sideOf = st => st.side === 'valgte' && HAS_CAND(st.valg) ? 'valgte' : !hasSeatsHere(st.valg, st.omr) ? 'kort' : (st.side && st.side !== 'valgte' ? st.side : (['ft', 'ep'].includes(typeOf(st.valg)) && st.omr === 'land' ? 'prikker' : 'kort'));
    let ST = Object.assign({}, DEF);
    let current = null; // { pick }
    function normalize(st, changed, old) {
      if (!['se', 'sammenlign', 'hente'].includes(st.do)) st.do = 'se';
      if (!ELNAME[st.valg]) st.valg = LATEST;
      if (!areaSet(st.valg, st.do).includes(st.omr)) st.omr = 'land';
      if (!['mand', 'stem', 'valgte'].includes(st.hv)) st.hv = 'mand';
      if (st.hv === 'valgte' && !HAS_CAND(st.valg)) st.hv = 'mand';
      /* mandater kun hvor valget fordeler dem; folkeafstemning har kun ja og nej; storkredse kun mandater */
      if (isFA(st.valg)) st.hv = 'stem';
      else if (st.hv === 'mand' && !hasSeatsHere(st.valg, st.omr)) st.hv = 'stem';
      else if (st.hv === 'stem' && sk[st.omr]) st.hv = 'mand';
      if (st.do === 'sammenlign') {
        const set = areaSet(st.valg, 'sammenlign');
        if (!st.omr2 || !set.includes(st.omr2)) st.omr2 = st.omr === 'land' ? 'region-hovedstaden' : 'land';
        /* runde 10: skifter man valgtype på den ene side, følger den anden side med til samme type.
           Var begge sider samme valg (to områder), bliver de ved med at være det; ellers vælges nærmeste valg af typen –
           ældre på anden side (Kommunalvalg 2025 → Kommunalvalg 2021), nyere på første side. */
        if (old && old.do === 'sammenlign' && isKV(st.valg2) && typeOf(st.valg) !== typeOf(st.valg2) && (changed === 'valg' || changed === 'valg2')) {
          const near = (v, older) => { const l = elsOfType(typeOf(v)), i = l.indexOf(v); return (older ? l[i + 1] : l[i - 1]) || (older ? l[i - 1] : l[i + 1]) || v; }; /* listen er nyeste først; findes intet i den retning, tages nabovalget på den anden side */
          if (changed === 'valg') st.valg2 = old.valg2 === old.valg ? st.valg : near(st.valg, true);
          else st.valg = old.valg2 === old.valg ? st.valg2 : near(st.valg2, false);
        }
        if (!isKV(st.valg2) || isFA(st.valg2) !== isFA(st.valg)) st.valg2 = st.valg; /* ja/nej kan ikke sammenlignes med partier */
        /* samme område to gange giver kun mening ved to forskellige valg (pilottest 16.11: «Ishøj med Ishøj») */
        if (st.omr2 === st.omr && st.valg2 === st.valg) {
          if (changed === 'valg2' && old && old.valg2 !== st.valg2 && typeOf(old.valg2) === typeOf(st.valg)) st.valg = old.valg2;
          else if (changed === 'valg' && old && old.valg !== st.valg && typeOf(old.valg) === typeOf(st.valg2)) st.valg2 = old.valg;
          else st.valg2 = ELS[st.valg].prev || elsOfType(typeOf(st.valg)).find(v => v !== st.valg);
        }
      }
      if (!['excel', 'csv'].includes(st.fmt)) st.fmt = 'excel';
      if (st.hv === 'valgte') st.side = 'valgte'; /* gamle links: «de valgte» er nu en fane til højre */
      if (st.side && !['kort', 'prikker', 'valgte'].includes(st.side)) st.side = null;
      return st;
    }
    function fromQuery(q) {
      const st = Object.assign({}, DEF);
      ['do', 'hv', 'omr', 'omr2', 'valg', 'valg2', 'fmt', 'side', 'sort', 'cmp'].forEach(k => { if (q && q[k]) st[k] = q[k]; });
      return normalize(st);
    }
    function toHash(st) {
      const p = new URLSearchParams();
      p.set('do', st.do); p.set('omr', st.omr); p.set('valg', st.valg);
      if (st.do === 'se' && st.hv !== 'mand') p.set('hv', st.hv);
      if (st.do === 'sammenlign') { p.set('omr2', st.omr2); p.set('valg2', st.valg2); }
      if (st.do === 'hente' && st.fmt !== 'excel') p.set('fmt', st.fmt);
      return '#/?' + p.toString();
    }

    /* ---------- små byggeklodser ---------- */
    /* valgfelt i sætningen (v9): knap + eget panel med søgning, grupper og tastaturstyring */
    const fold = t => String(t).toLowerCase().replace(/aa/g, 'å').normalize('NFD').replace(/[̀-ͯ]/g, '');
    const cleanT = t => String(t).replace(/\s*\(eksempel\)$/, '');
    let popOpen = null;
    function closePop(back) {
      if (!popOpen) return; const { pop, bd, btn, onDoc, onWin } = popOpen; popOpen = null;
      document.removeEventListener('mousedown', onDoc, true); window.removeEventListener('resize', onWin); window.removeEventListener('scroll', onWin, true);
      pop.remove(); if (bd) bd.remove(); btn.setAttribute('aria-expanded', 'false'); if (back && btn.isConnected) btn.focus();
    }
    window.addEventListener('hashchange', () => closePop(false));
    function slot(label, groups, val, on, key) {
      let txt = '';
      groups.forEach(g => g.items.forEach(([v, t]) => { if (v === val) txt = t; }));
      const chev = '<svg class="chev" viewBox="0 0 12 8" aria-hidden="true" focusable="false"><path d="M1.5 1.5 6 6l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      const btn = h('button', { type: 'button', class: 'slot', 'data-k': key, 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': `${label}: ${cleanT(txt)}. Tryk for at ændre` }, h('span', { class: 'sl-t' }, cleanT(txt)));
      btn.insertAdjacentHTML('beforeend', chev);
      const open = (startAt) => {
        if (popOpen && popOpen.btn === btn) { closePop(true); return; }
        closePop(false);
        const all = groups.reduce((n, g) => n + g.items.length, 0), withSearch = all > 10;
        let grp = groups;
        const foc = loadFoc();
        if ((key === 'omr' || key === 'omr2' || key === 'hk') && foc && foc !== val && groups.some(g => g.items.some(([v]) => v === foc))) grp = [{ label: 'Din kommune', items: [[foc, byId[foc].name]] }].concat(groups);
        const lid = 'sp-' + key, mobile = matchMedia('(max-width:600px)').matches;
        const list = h('ul', { class: 'sp-list', role: 'listbox', id: lid, 'aria-label': label, tabindex: withSearch ? null : '-1' });
        const inp = withSearch ? h('input', { type: 'text', class: 'sp-q', placeholder: 'Skriv for at søge …', 'aria-label': 'Søg i ' + label.toLowerCase(), role: 'combobox', 'aria-controls': lid, 'aria-expanded': 'true', 'aria-autocomplete': 'list', autocomplete: 'off' }) : null;
        const pop = h('div', { class: 'slotpop' + (mobile ? ' sheet' : '') }, mobile ? h('div', { class: 'sp-head' }, h('strong', {}, label), h('button', { type: 'button', class: 'sp-x', 'aria-label': 'Luk', onclick: () => closePop(true) }, '×')) : null, inp, list);
        let opts = [], act = 0;
        const paint = () => {
          const q = inp ? fold(inp.value.trim()) : '';
          list.innerHTML = ''; opts = []; let n = 0;
          grp.forEach((g, gi) => {
            const items = g.items.filter(([, t]) => !q || fold(t).includes(q));
            if (!items.length) return;
            if (g.label) list.append(h('li', { class: 'sp-g', role: 'presentation' }, g.label));
            items.forEach(([v, t]) => { const li = h('li', { role: 'option', id: `${lid}-${n++}`, class: 'sp-o', 'data-v': v, 'aria-selected': String(v === val) }, h('span', {}, t)); li.addEventListener('mousedown', e => e.preventDefault()); li.addEventListener('click', () => choose(v)); li.addEventListener('mousemove', () => setAct(opts.indexOf(li))); list.append(li); opts.push(li); });
          });
          if (!opts.length) list.append(h('li', { class: 'sp-empty', role: 'presentation' }, 'Ingen match – prøv et andet navn'));
          setAct(q ? 0 : Math.max(0, opts.findIndex(o => o.dataset.v === val)));
        };
        const setAct = (i, mid) => { if (!opts.length) return; act = Math.max(0, Math.min(opts.length - 1, i)); opts.forEach((o, j) => o.classList.toggle('act', j === act)); const o = opts[act]; (inp || list).setAttribute('aria-activedescendant', o.id); if (mid) list.scrollTop = Math.max(0, o.offsetTop - list.clientHeight / 2 + o.offsetHeight / 2); else o.scrollIntoView({ block: 'nearest' }); };
        const choose = v => { closePop(false); if (v !== val) on(v); else btn.focus(); };
        const onKey = e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAct(act + 1); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAct(act - 1); }
          else if (e.key === 'Home' && !inp) { e.preventDefault(); setAct(0); }
          else if (e.key === 'End' && !inp) { e.preventDefault(); setAct(opts.length - 1); }
          else if (e.key === 'Enter' || (e.key === ' ' && !inp)) { e.preventDefault(); if (opts[act]) choose(opts[act].dataset.v); }
          else if (e.key === 'Escape') { e.preventDefault(); closePop(true); }
          else if (e.key === 'Tab') closePop(false);
        };
        (inp || list).addEventListener('keydown', onKey);
        if (inp) inp.addEventListener('input', paint);
        let bd = null;
        if (mobile) { bd = h('div', { class: 'sp-back' }); bd.addEventListener('click', () => closePop(true)); document.body.append(bd); }
        document.body.append(pop);
        const place = () => { if (mobile) return; const r = btn.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight; let x = Math.min(r.left, innerWidth - pw - 12), y = r.bottom + 6; if (y + ph > innerHeight - 8 && r.top - ph - 6 > 8) y = r.top - ph - 6; pop.style.left = Math.max(8, x) + 'px'; pop.style.top = y + 'px'; };
        paint(); place(); if (opts[act]) setAct(act, true);
        const onDoc = e => { if (!pop.contains(e.target) && !btn.contains(e.target)) closePop(false); };
        const onWin = e => { if (e && e.type === 'scroll' && pop.contains(e.target)) return; closePop(false); };
        document.addEventListener('mousedown', onDoc, true); window.addEventListener('resize', onWin); window.addEventListener('scroll', onWin, true);
        popOpen = { pop, bd, btn, onDoc, onWin };
        btn.setAttribute('aria-expanded', 'true');
        if (startAt === 'last') setAct(opts.length - 1);
        (inp || list).focus();
      };
      btn.addEventListener('click', () => open());
      btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); open(); } else if (e.key === 'ArrowUp') { e.preventDefault(); open('last'); } });
      const wrap = [btn];
      if (/\(eksempel\)$/.test(txt)) wrap.push(h('span', { class: 'slot-note' }, 'eksempeldata'));
      return wrap.length > 1 ? h('span', { class: 'slotw' }, wrap) : btn;
    }
    /* valgfeltet: ét felt («Folketingsvalg 2026»), der åbner et panel med typerne til venstre og årene til højre.
       Man peger på en type og klikker på et år – 2 klik i stedet for 4 (feedback 17.11). */
    function valgSlot(label, cur, on, key) {
      const chev = '<svg class="chev" viewBox="0 0 12 8" aria-hidden="true" focusable="false"><path d="M1.5 1.5 6 6l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      const btn = h('button', { type: 'button', class: 'slot', 'data-k': key, 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': `${label}: ${ELNAME[cur]}. Tryk for at ændre` }, h('span', { class: 'sl-t' }, ELNAME[cur]));
      btn.insertAdjacentHTML('beforeend', chev);
      const open = () => {
        if (popOpen && popOpen.btn === btn) { closePop(true); return; }
        closePop(false);
        const mobile = matchMedia('(max-width:600px)').matches;
        let tSel = typeOf(cur);
        const tl = h('ul', { class: 'vp-t', role: 'listbox', 'aria-label': 'Type valg', tabindex: '0' });
        const yl = h('ul', { class: 'vp-y', role: 'listbox', 'aria-label': 'År', tabindex: '0' });
        const yLab = v => h('span', {}, h('b', {}, String(yr(v))), h('small', {}, ELS[v].short ? ELS[v].short : dayDate(v).replace(/ \d{4}$/, '')));
        const paintY = () => {
          yl.innerHTML = ''; yl.setAttribute('aria-label', TYPES[tSel].name + ': år');
          elsOfType(tSel).forEach((v, i) => { const li = h('li', { role: 'option', id: `vp-${key}-y${i}`, class: 'sp-o' + (v === cur ? ' cur' : ''), 'data-v': v, 'aria-selected': String(v === cur) }, yLab(v)); li.addEventListener('click', () => choose(v)); yl.append(li); });
        };
        const paintT = () => { [...tl.children].forEach(li => { const on2 = li.dataset.t === tSel; li.classList.toggle('act', on2); li.setAttribute('aria-selected', String(on2)); }); tl.setAttribute('aria-activedescendant', `vp-${key}-t${TYPE_ORDER.indexOf(tSel)}`); paintY(); };
        TYPE_ORDER.forEach((t, i) => { const li = h('li', { role: 'option', id: `vp-${key}-t${i}`, class: 'sp-o', 'data-t': t }, TYPES[t].name, h('span', { class: 'vp-n', 'aria-hidden': 'true' }, String(elsOfType(t).length))); li.addEventListener('mouseenter', () => { if (tSel !== t) { tSel = t; paintT(); } }); li.addEventListener('click', () => { tSel = t; paintT(); yl.focus(); setY(0); }); tl.append(li); });
        let ya = 0;
        const setY = i => { const os = [...yl.children]; if (!os.length) return; ya = Math.max(0, Math.min(os.length - 1, i)); os.forEach((o, j) => o.classList.toggle('act', j === ya)); yl.setAttribute('aria-activedescendant', os[ya].id); };
        const choose = v => { closePop(false); if (v !== cur) on(v); else btn.focus(); };
        tl.addEventListener('keydown', e => { const i = TYPE_ORDER.indexOf(tSel);
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); tSel = TYPE_ORDER[Math.max(0, Math.min(TYPE_ORDER.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; paintT(); }
          else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); yl.focus(); setY(Math.max(0, elsOfType(tSel).indexOf(cur))); }
          else if (e.key === 'Escape') { e.preventDefault(); closePop(true); } });
        yl.addEventListener('keydown', e => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setY(ya + (e.key === 'ArrowDown' ? 1 : -1)); }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); tl.focus(); }
          else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const o = yl.children[ya]; if (o) choose(o.dataset.v); }
          else if (e.key === 'Escape') { e.preventDefault(); closePop(true); }
          else if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); tl.focus(); } });
        tl.addEventListener('keydown', e => { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); yl.focus(); setY(Math.max(0, elsOfType(tSel).indexOf(cur))); } });
        const pop = h('div', { class: 'slotpop vpop' + (mobile ? ' sheet' : ''), role: 'dialog', 'aria-label': label },
          mobile ? h('div', { class: 'sp-head' }, h('strong', {}, label), h('button', { type: 'button', class: 'sp-x', 'aria-label': 'Luk', onclick: () => closePop(true) }, '×')) : null,
          h('div', { class: 'vp-cols' }, h('div', {}, h('p', { class: 'vp-h' }, 'Type'), tl), h('div', {}, h('p', { class: 'vp-h' }, 'År'), yl)));
        let bd = null;
        if (mobile) { bd = h('div', { class: 'sp-back' }); bd.addEventListener('click', () => closePop(true)); document.body.append(bd); }
        document.body.append(pop); paintT();
        if (!mobile) { const r = btn.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight; let x = Math.min(r.left, innerWidth - pw - 12), y = r.bottom + 6; if (y + ph > innerHeight - 8 && r.top - ph - 6 > 8) y = r.top - ph - 6; pop.style.left = Math.max(8, x) + 'px'; pop.style.top = y + 'px'; }
        const onDoc = e => { if (!pop.contains(e.target) && !btn.contains(e.target)) closePop(false); };
        const onWin = e => { if (e && e.type === 'scroll' && pop.contains(e.target)) return; closePop(false); };
        document.addEventListener('mousedown', onDoc, true); window.addEventListener('resize', onWin); window.addEventListener('scroll', onWin, true);
        popOpen = { pop, bd, btn, onDoc, onWin };
        btn.setAttribute('aria-expanded', 'true');
        yl.focus(); setY(Math.max(0, elsOfType(tSel).indexOf(cur)));
      };
      btn.addEventListener('click', () => open());
      btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); open(); } });
      return btn;
    }
    const areaGroups = (valg, doing) => [{ items: [['land', 'hele landet']].concat(doing === 'hente' ? [['alle-reg', 'alle regioner'], ['alle-kom', 'alle 98 kommuner']] : []) },
        { label: doing === 'hente' ? 'Kommunerne i en region' : 'Regioner', items: REG.map(r => [r.id, r.name]) }]
      .concat(valg === 'fv' && doing === 'se' ? [{ label: 'Storkredse (folketingsvalg)', items: FV.storkredse.map(x => [x.id, x.name]) }] : [], [{ label: 'Kommuner', items: komSorted.map(k => [k.id, k.name]) }]);
    const lumOf = hex => { const n = parseInt(String(hex).replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((t, v, i) => t + v * [0.2126, 0.7152, 0.0722][i], 0); };
    const inkOn = c => { const L = lumOf(c), cw = 1.05 / (L + 0.05), ci = (L + 0.05) / (lumOf('#0F1E3A') + 0.05); return ci > cw ? '#0F1E3A' : '#fff'; };
    const letter = (p, cls) => { const c = (D.parties[p] && D.parties[p].color) || '#0F1E3A'; return h('span', { class: 'box ' + (cls || ''), style: `--pc:${c};--pt:${inkOn(c)}`, 'aria-hidden': 'true' }, D.parties[p] && D.parties[p].answer ? p.charAt(0) : p); };
    const dlt = (v, unit) => v == null ? '' : v === 0 ? '±0' : sgn(unit === 'pp' ? Math.round(v * 10) / 10 : v) + (unit === 'pp' ? ' pp' : '');

    /* stemmesedlen: rækker med bogstav i boks, navn, søjle og tal */
    function ballot(rows, metric, sortMode, opts) {
      opts = opts || {};
      const key = metric === 'stem' ? 'share' : 'm';
      const list = sortRows(rows.filter(r => metric === 'stem' ? r.share != null : true), sortMode, key);
      const max = Math.max(1, ...list.map(r => r[key] || 0));
      return h('ol', { class: 'ballot' + (opts.big ? ' big' : ''), 'aria-label': metric === 'stem' ? 'Stemmeandel pr. parti' : 'Mandater pr. parti' }, list.map(r => {
        const val = metric === 'stem' ? fmtP(r.share) : String(r.m);
        const delta = metric === 'stem' ? dlt(r.ds, 'pp') : dlt(r.d);
        const unit = metric === 'stem' ? '' : r.m === 1 ? ' mandat' : ' mandater';
        return h('li', { class: 'row', title: `${r.p} – ${r.name}` },
          letter(r.p),
          h('span', { class: 'mid' }, h('span', { class: 'pn' }, r.name), h('span', { class: 'bar' }, h('i', { style: `width:${Math.max(1.5, (r[key] || 0) / max * 100)}%;background-color:${r.color}` }))),
          h('strong', { class: 'val' }, val, h('span', { class: 'unit' }, unit)),
          h('span', { class: 'dl' + (delta && r.d != null && metric !== 'stem' ? (r.d > 0 ? ' up' : r.d < 0 ? ' dn' : '') : ''), 'aria-label': delta ? 'Ændring ' + delta : null }, delta));
      }));
    }
    /* resultatlisten med mandater OG stemmeandel på hver række – intet at skifte imellem (runde 8) */
    function ballotBoth(rows, sortMode, hasM, hasPrev) {
      const key = hasM ? 'm' : 'share';
      const list = sortRows(rows.filter(r => r.share != null || r.m), sortMode, key);
      const max = Math.max(1e-9, ...list.map(r => r[key] || 0));
      const sb = (t, mode, cls) => h('button', { type: 'button', class: 'sbtn ' + (cls || ''), 'aria-pressed': String(sortMode === mode), title: mode === 'alpha' ? 'Sortér A–Å' : 'Sortér efter størrelse', onclick: () => { ST.sort = mode; drawAnswer(); } }, t, h('span', { class: 'sarr', 'aria-hidden': 'true' }, sortMode === mode ? '▾' : ''));
      const head = h('div', { class: 'bhead' + (hasM ? '' : ' nom'), role: 'group', 'aria-label': 'Sortér partierne' }, h('span', {}), sb('Parti', 'alpha'), hasM ? sb('Mandater', 'size', 'r') : null, hasM ? h('span', { class: 'r' }, 'Stemmer') : sb('Andel', 'size', 'r'), h('span', { class: 'r' }, hasPrev ? 'Ændring' : ''));
      const ol = h('ol', { class: 'ballot both' + (hasM ? '' : ' nom'), 'aria-label': hasM ? 'Mandater og stemmeandel pr. parti' : 'Stemmeandel pr. parti' }, list.map(r => {
        const d = hasM ? dlt(r.d) : dlt(r.ds, 'pp'), dv = hasM ? r.d : r.ds;
        return h('li', { class: 'row', title: `${r.p} – ${r.name}` }, letter(r.p),
          h('span', { class: 'mid' }, h('span', { class: 'pn' }, r.name), h('span', { class: 'bar' }, h('i', { style: `width:${Math.max(1.5, (r[key] || 0) / max * 100)}%;background-color:${r.color}` }))),
          hasM ? h('strong', { class: 'val' }, String(r.m), h('span', { class: 'unit' }, r.m === 1 ? ' mandat' : ' mandater')) : null,
          h('span', { class: 'shr' }, r.share != null ? fmtP(r.share) : '–'),
          h('span', { class: 'dl' + (dv != null && d ? (dv > 0 ? ' up' : dv < 0 ? ' dn' : '') : ''), 'aria-label': d ? 'Ændring ' + d : null }, d));
      }));
      return h('div', { class: 'bboth' }, head, ol);
    }
    /* to områder ved siden af hinanden */
    function compareRows(A, B, metric, sortMode, la, lb) {
      const abs = metric === 'mand' && A.seats === B.seats;
      const ps = {}; A.rows.forEach(r => { ps[r.p] = r; }); B.rows.forEach(r => { if (!ps[r.p]) ps[r.p] = r; });
      const val = (R, p) => { const r = R.rows.find(x => x.p === p); if (!r) return 0; return metric === 'stem' ? r.share || 0 : abs ? r.m : (R.seats ? r.m / R.seats * 100 : 0); };
      const show = v => abs ? String(v) : fmtP(v), diff = v => abs ? dlt(v) : dlt(v, 'pp');
      const all = Object.keys(ps).map(p => ({ p, name: PN(p), color: D.parties[p].color, a: val(A, p), b: val(B, p), m: Math.max(val(A, p), val(B, p)) }));
      const list = sortMode === 'alpha' ? all.sort((x, y) => x.p.localeCompare(y.p, 'da')) : all.sort((x, y) => y.m - x.m);
      const max = Math.max(1, ...list.map(r => r.m));
      return { list, el: h('ol', { class: 'ballot cmp', 'aria-label': 'Sammenligning pr. parti' }, list.map(r => h('li', { class: 'row', tabindex: '0', title: `${la}: ${show(r.a)} · ${lb}: ${show(r.b)}`, 'aria-label': `${r.name}: ${la} ${show(r.a)}, ${lb} ${show(r.b)}, forskel ${diff(r.a - r.b)}` }, letter(r.p),
        h('span', { class: 'mid' }, h('span', { class: 'pn' }, r.name),
          h('span', { class: 'bar a' }, h('i', { style: `width:${Math.max(1, r.a / max * 100)}%;background-color:${r.color}` })),
          h('span', { class: 'bar b' }, h('i', { style: `width:${Math.max(1, r.b / max * 100)}%;background-color:${r.color}` }))),
        h('span', { class: 'val2', 'aria-hidden': 'true' }, h('strong', { class: Math.abs(r.a - r.b) < (abs ? 1 : 0.05) ? '' : r.a > r.b ? 'up' : 'dn' }, diff(r.a - r.b)), h('small', { class: 'peek' }, `${show(r.a)} · ${show(r.b)}`))))), abs };
    }

    /* ---------- svar-tekst («lede») ---------- */
    function ledeSe(id, valg, R) {
      const where = areaIn(id), top = R.rows.slice().sort((a, b) => b.m - a.m || (b.votes || 0) - (a.votes || 0))[0];
      if (R.pending) return `${areaIn(id)} er ikke optalt endnu. Resultatet vises, så snart kommunen er talt op.`;
      if (!top) return `Der er ingen tal for ${where} ved ${lowerFirst(ELNAME[valg])}.`;
      if (isFA(valg)) {
        const ja = (R.rows.find(r => r.p === 'JA') || {}).share || 0, nej = 100 - ja;
        return (id === 'land' ? `${ja > 50 ? 'Ja' : 'Nej'} vandt med ${fmtP(Math.max(ja, nej))} af stemmerne.` : `I ${where} stemte ${fmtP(ja)} ja og ${fmtP(nej)} nej.`) + (R.turnout ? ` Valgdeltagelsen var ${fmtP(R.turnout)}.` : '');
      }
      if (!R.hasM) {
        let t = `${PN(top.p)} fik flest stemmer i ${where} med ${fmtP(top.share)}${top.ds != null && ELS[valg].prev ? `, ${Math.abs(top.ds) < 0.05 ? 'det samme som' : `${Math.abs(top.ds).toFixed(1).replace('.', ',')} procentpoint ${top.ds > 0 ? 'mere' : 'mindre'} end`} ved ${lowerFirst(ELNAME[ELS[valg].prev])}` : ''}.`;
        if (R.turnout) t += ` Valgdeltagelsen var ${fmtP(R.turnout)}.`;
        return t;
      }
      const running = valg === 'kv2025' && LIVE.on && LIVE.n < KOM.length;
      let t = running && R.type !== 'kommune' ? `Optællingen er i gang: ${R.nCounted} af ${R.nTotal} kommuner er optalt. Foreløbigt er ${PN(top.p)} største parti i ${where} med ${top.m} af ${R.seats} mandater.` : `${PN(top.p)} er største parti i ${where} med ${top.m} af ${R.seats} mandater${top.share != null ? ` (${fmtP(top.share)} af stemmerne)` : ''}${!running && top.d != null && ELS[valg].prev ? (top.d === 0 ? ', det samme som ved ' : `, ${Math.abs(top.d)} ${Math.abs(top.d) === 1 ? 'mandat' : 'mandater'} ${top.d > 0 ? 'flere' : 'færre'} end ved `) + lowerFirst(ELS[ELS[valg].prev].name) : ''}.`;
      const gain = R.rows.filter(r => r.d != null).sort((a, b) => b.d - a.d)[0];
      if (gain && gain.d > 0 && gain.p !== top.p) t += ` Størst fremgang: ${PN(gain.p)} (${sgn(gain.d)} ${gain.d === 1 ? 'mandat' : 'mandater'} siden ${lowerFirst(ELS[ELS[valg].prev].name)}).`;
      if (R.turnout) t += ` Valgdeltagelsen var ${fmtP(R.turnout)}.`;
      return t;
    }
    /* sammenligning på stemmer, når mindst én side ikke har mandater (eller ved folkeafstemning) */
    function ledeCmpVotes(A, B, pa, pb) {
      const sh = (R, p) => { const r = R.rows.find(x => x.p === p); return r && r.share != null ? r.share : 0; };
      const top = R => R.rows.slice().sort((x, y) => (y.votes || 0) - (x.votes || 0))[0];
      let t;
      if (isFA(ST.valg)) t = `Ja fik ${fmtP(sh(A, 'JA'))} ${pa} og ${fmtP(sh(B, 'JA'))} ${pb}.`;
      else { const tA = top(A), tB = top(B); t = tA.p === tB.p ? `${PN(tA.p)} fik flest stemmer begge steder: ${fmtP(tA.share)} ${pa} og ${fmtP(sh(B, tA.p))} ${pb}.` : `${PN(tA.p)} fik flest stemmer ${pa} (${fmtP(tA.share)}), mens ${PN(tB.p)} fik flest ${pb} (${fmtP(tB.share)}).`; }
      if (A.turnout && B.turnout) t += ` Valgdeltagelsen var ${fmtP(A.turnout)} ${pa} og ${fmtP(B.turnout)} ${pb}.`;
      return t;
    }
    /* pa/pb er hele udtryk som «i Ishøj Kommune» eller «ved kommunalvalg 2021» */
    function ledeCmp(A, B, pa, pb, where) {
      const top = R => R.rows.slice().sort((x, y) => y.m - x.m || (y.votes || 0) - (x.votes || 0))[0];
      const mOf = (R, p) => { const r = R.rows.find(x => x.p === p); return r ? r.m : 0; };
      const shOf = (R, p) => { const r = R.rows.find(x => x.p === p); return r && r.share != null ? r.share : 0; };
      const tA = top(A), tB = top(B), mand = n => n === 1 ? 'mandat' : 'mandater';
      let t;
      if (where) {
        const mb = mOf(B, tA.p), d = tA.m - mb;
        t = tA.p === tB.p ? `${PN(tA.p)} fik flest mandater i ${where} ved begge valg: ${tA.m} ${pa} mod ${mb} ${pb}${d === 0 ? ', altså lige mange.' : `, altså ${Math.abs(d)} ${mand(Math.abs(d))} ${d > 0 ? 'flere' : 'færre'}.`}`
          : `${PN(tA.p)} fik flest mandater ${pa} (${tA.m}), mens ${PN(tB.p)} fik flest ${pb} (${tB.m}).`;
      } else t = tA.p === tB.p ? `${PN(tA.p)} er største parti begge steder: ${tA.m} af ${A.seats} mandater ${pa} og ${tB.m} af ${B.seats} ${pb}.`
        : `${PN(tA.p)} er største parti ${pa} med ${tA.m} af ${A.seats} mandater, og ${PN(tB.p)} er største parti ${pb} med ${tB.m} af ${B.seats}.`;
      const ps = [...new Set(A.rows.concat(B.rows).map(r => r.p))];
      const big = ps.map(p => ({ p, a: shOf(A, p), b: shOf(B, p) })).sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b))[0];
      if (big && Math.abs(big.a - big.b) >= 0.1) t += ` Største forskel i stemmeandel: ${PN(big.p)} (${fmtP(big.a)} ${pa} mod ${fmtP(big.b)} ${pb}).`;
      if (A.turnout && B.turnout) t += ` Valgdeltagelsen var ${fmtP(A.turnout)} ${pa} og ${fmtP(B.turnout)} ${pb}.`;
      return t;
    }

    /* ---------- hent data ---------- */
    function exportRows(id, valg, agg) {
      const out = [];
      const add = (nm, reg, k) => { const m = seatsAt(valg, k.type || 'kommune'); H.partyRows(k, valg).sort((a, b) => b.m - a.m || b.votes - a.votes).forEach(r => out.push([nm, reg, r.p, r.name, r.votes, +r.share.toFixed(2), m ? r.m : '', m && r.d != null ? r.d : '', r.ds == null ? '' : +r.ds.toFixed(2)])); };
      if (id === 'alle-kom') KOM.slice().sort((a, b) => a.name.localeCompare(b.name, 'da')).forEach(k => add(k.name, k.region, k));
      else if (id === 'alle-reg') REG.forEach(r => add(r.name, r.name, H.getArea(r.id)));
      else if (!agg && id.startsWith('region-')) H.getArea(id).kommuner.slice().sort((a, b) => a.name.localeCompare(b.name, 'da')).forEach(k => add(k.name, k.region, k));
      else { const a = H.getArea(id); add(areaLabel(id) === 'hele landet' ? 'Hele landet' : a.type === 'kommune' ? a.short : a.label, a.type === 'kommune' ? a.region : '', a); }
      return out;
    }
    const HEAD = ['Område', 'Region', 'Parti', 'Partinavn', 'Stemmer', 'Andel (%)', 'Mandater', 'Ændring i mandater', 'Ændring i andel (procentpoint)'];

    /* ============================ KORTET (v8) ============================
       Bygger på det skematiske kort i geo.js (som A/B også bruger, derfor uændret)
       og lægger valg.dk-farver, zoom, infoboks og animationer ovenpå (Web Animations API). */
    const RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const MS = { key: null, vb: null, r: {}, counted: null, sel: null };
    const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const regOfKom = id => (byId[id] ? GEO.regionId(byId[id]) : null);
    function bigOf(k, valg) { const V = k.results[valg].votes; return Object.keys(V).reduce((x, y) => V[y] > V[x] ? y : x); }
    function fancyMap(opts, a, b, cmp) {
      const valg = ST.valg;
      const zoom = cmp ? null : (a && a.startsWith('region-') ? a : (a && byId[a] ? regOfKom(a) : null));
      const svg = GEO.renderMap(Object.assign({}, opts, zoom ? { region: zoom } : {}));
      svg.classList.add('dmap2');
      svg.querySelectorAll('title').forEach(t => t.remove());
      svg.querySelectorAll('g.reg').forEach(g => { g.setAttribute('fill', '#DCE5E9'); g.setAttribute('stroke', '#9FB1BF'); g.setAttribute('stroke-width', '1'); });
      svg.querySelectorAll('g.reg path[fill]').forEach(p => p.setAttribute('fill', '#DCE5E9'));
      const circles = [...svg.querySelectorAll('circle.bub')];
      circles.forEach(c => { if (c.classList.contains('pending')) { c.setAttribute('fill', '#fff'); c.setAttribute('fill-opacity', '1'); c.setAttribute('stroke', '#B6B5B5'); } else { c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', '1'); } });
      const byC = Object.fromEntries(circles.map(c => [c.dataset.id, c]));
      /* markering af valgte områder */
      const ringG = document.createElementNS('http://www.w3.org/2000/svg', 'g'); ringG.setAttribute('class', 'rings'); svg.append(ringG);
      const mkC = (attrs) => { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); Object.entries(attrs).forEach(([k, v]) => c.setAttribute(k, v)); return c; };
      const marks = [];
      [[a, '#26323F'], [b, '#C33030']].forEach(([id, col]) => {
        if (!id || id === 'land' || id.startsWith('alle')) return;
        if (id.startsWith('region-')) { const g = svg.querySelector(`[data-region="${id}"]`); if (g) { g.setAttribute('stroke', col); g.setAttribute('stroke-width', '2.4'); g.classList.add('on'); } return; }
        const c = byC[id]; if (!c) return;
        c.parentNode.append(c); c.setAttribute('fill-opacity', '1');
        const ring = mkC({ cx: c.getAttribute('cx'), cy: c.getAttribute('cy'), r: (+c.getAttribute('r') + 3).toFixed(1), fill: 'none', stroke: col, 'stroke-width': '2', class: 'selring' });
        ringG.append(ring); marks.push([id, c, ring, col]);
      });
      /* infoboks ved hover */
      const wrap = h('div', { class: 'mapwrap' }, svg);
      const tip = h('div', { class: 'maptip', hidden: '' });
      wrap.append(tip);
      /* ---- zoom, flyt og kommunenavne (pilottest 16.11: kortet var for udetaljeret, og man kunne ikke finde sin egen kommune) ---- */
      const SVGNS = 'http://www.w3.org/2000/svg', FULL = [0, 0, GEO.W, GEO.H], AR = GEO.H / GEO.W, MINW = GEO.W / 14;
      const ukey = valg + '|' + (cmp ? 'c' : 's');
      const vb0 = svg.getAttribute('viewBox').split(' ').map(Number);
      let cur = vb0.slice();
      const selIds = new Set([a, b].filter(id => id && byId[id]));
      if (MS.user && MS.userKey === ukey) {
        cur = MS.user.slice();
        const first = [...selIds][0], c0 = first && byC[first];
        if (c0) { const x = +c0.getAttribute('cx'), y = +c0.getAttribute('cy'); if (x < cur[0] || x > cur[0] + cur[2] || y < cur[1] || y > cur[1] + cur[3]) cur = [x - cur[2] / 2, y - cur[3] / 2, cur[2], cur[3]]; }
        svg.setAttribute('viewBox', cur.map(n => n.toFixed(2)).join(' '));
      }
      const lblG = document.createElementNS(SVGNS, 'g'); lblG.setAttribute('class', 'klabels'); svg.append(lblG);
      const lbls = circles.map(c => { const k = byId[c.dataset.id]; if (!k) return null; const t = document.createElementNS(SVGNS, 'text'); t.setAttribute('class', 'klabel'); t.textContent = k.name; lblG.append(t); return { c, k, t, cx: +c.getAttribute('cx'), cy: +c.getAttribute('cy') }; }).filter(Boolean);
      const scaleNow = () => { const r = svg.getBoundingClientRect(); return r.width && r.height ? Math.min(r.width / cur[2], r.height / cur[3]) : 1; };
      const zoomF = () => FULL[2] / cur[2];
      function paintLabels() {
        if (!svg.isConnected) return;
        const sc = scaleNow(), fs = 11.5 / sc, show = zoomF() >= 1.9, placed = [];
        svg.classList.toggle('zoomed', show);
        lbls.slice().sort((x, y) => (selIds.has(y.k.id) - selIds.has(x.k.id)) || (+y.c.getAttribute('r') - +x.c.getAttribute('r'))).forEach(L => {
          const sel = selIds.has(L.k.id), r = +L.c.getAttribute('r');
          const inView = L.cx >= cur[0] && L.cx <= cur[0] + cur[2] && L.cy >= cur[1] && L.cy <= cur[1] + cur[3];
          if (!(sel || (show && inView))) { L.t.setAttribute('display', 'none'); return; }
          const x = L.cx + r + 2.5 / sc, y = L.cy + fs * .36, box = [x - 1 / sc, y - fs, x + L.k.name.length * fs * .56, y + fs * .2];
          if (!sel && placed.some(q => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1])) { L.t.setAttribute('display', 'none'); return; }
          placed.push(box); L.t.removeAttribute('display');
          L.t.setAttribute('x', x.toFixed(2)); L.t.setAttribute('y', y.toFixed(2)); L.t.setAttribute('font-size', fs.toFixed(2)); L.t.setAttribute('stroke-width', (3.2 / sc).toFixed(2));
          L.t.classList.toggle('sel', sel);
        });
      }
      /* boblerne skrumper, når man zoomer, så tætte områder som København kan skilles ad */
      const baseR = Object.fromEntries(circles.map(c => [c.dataset.id, +c.getAttribute('r') / (zoom ? GEO.ZOOM_SCALE : 1)]));
      function applyR() {
        const k = Math.min(1, Math.pow(zoomF(), -.62)), sc = svg.isConnected ? scaleNow() : 0;
        circles.forEach(c => { let r = baseR[c.dataset.id] * k; if (sc) r = Math.max(r, 3.4 / sc); c.setAttribute('r', r.toFixed(2)); });
        marks.forEach(([id, c, ring]) => ring.setAttribute('r', (+c.getAttribute('r') + (sc ? 3 / sc : 3 * k)).toFixed(2)));
      }
      const zin = h('button', { type: 'button', class: 'mz', 'aria-label': 'Zoom ind', title: 'Zoom ind', onclick: () => zoomBy(.6) }, '+');
      const zout = h('button', { type: 'button', class: 'mz', 'aria-label': 'Zoom ud', title: 'Zoom ud', onclick: () => zoomBy(1 / .6) }, '−');
      function setVB(x, y, w) {
        const cxm = x + w / 2, cym = y + w * AR / 2;
        w = Math.max(MINW, Math.min(FULL[2], w)); const hh = w * AR;
        const cx2 = Math.max(0, Math.min(FULL[2], cxm)), cy2 = Math.max(0, Math.min(FULL[3], cym));
        cur = [cx2 - w / 2, cy2 - hh / 2, w, hh];
        if (w >= FULL[2] - .01) cur = FULL.slice();
        svg.setAttribute('viewBox', cur.map(n => n.toFixed(2)).join(' '));
        MS.user = cur.slice(); MS.userKey = ukey; MS.vb = svg.getAttribute('viewBox');
        svg.style.touchAction = zoomF() > 1.05 ? 'none' : 'pan-y';
        zin.disabled = cur[2] <= MINW + .01; zout.disabled = cur[2] >= FULL[2] - .01;
        applyR(); paintLabels();
      }
      const zoomBy = f => setVB(cur[0] + cur[2] * (1 - f) / 2, cur[1] + cur[3] * (1 - f) / 2, cur[2] * f);
      const toSvg = (cx, cy) => { const m = svg.getScreenCTM(); if (!m) return { x: cur[0] + cur[2] / 2, y: cur[1] + cur[3] / 2 }; const p = svg.createSVGPoint(); p.x = cx; p.y = cy; return p.matrixTransform(m.inverse()); };
      wrap.addEventListener('wheel', e => {
        if (window.innerWidth <= 900 && !e.ctrlKey) return;
        e.preventDefault(); tip.hidden = true;
        const pt = toSvg(e.clientX, e.clientY), f = e.deltaY < 0 ? .8 : 1.25;
        setVB(pt.x - (pt.x - cur[0]) * f, pt.y - (pt.y - cur[1]) * f, cur[2] * f);
      }, { passive: false });
      let drag = null, moved = false;
      svg.addEventListener('pointerdown', e => { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, v: cur.slice(), id: e.pointerId }; moved = false; });
      svg.addEventListener('pointermove', e => {
        if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!moved && Math.hypot(dx, dy) < 5) return;
        if (!moved) { moved = true; try { svg.setPointerCapture(drag.id); } catch (er) { /* ignorer */ } wrap.classList.add('drag'); tip.hidden = true; }
        const sc = scaleNow(); setVB(drag.v[0] - dx / sc, drag.v[1] - dy / sc, drag.v[2]);
      });
      const endDrag = () => { drag = null; wrap.classList.remove('drag'); };
      svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);
      svg.addEventListener('click', e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
      const quick = (t, lab, f, on) => h('button', { type: 'button', class: 'mq', title: lab, 'aria-label': lab, 'aria-pressed': on ? 'true' : 'false', onclick: f }, t);
      const [kx, ky] = GEO.P(55.69, 12.43);
      wrap.append(h('div', { class: 'mapzoom', role: 'group', 'aria-label': 'Zoom på kortet' }, zin, zout),
        h('div', { class: 'mapquick', role: 'group', 'aria-label': 'Hurtig zoom' },
          /* knapperne skifter også området, så tallene til venstre altid passer til kortet (bugrapport 17.11) */
          quick('Region Hovedstaden', 'Vis Region Hovedstaden', () => { log('map-zoom', 'kbh'); if (opts.onRegion) opts.onRegion('region-hovedstaden'); else setVB(kx - 38, ky - 38 * AR, 76); }, (cmp ? b : a) === 'region-hovedstaden'),
          quick('Hele Danmark', 'Vis hele landet', () => { log('map-zoom', 'alt'); if (opts.onLand) opts.onLand(); else setVB(0, 0, FULL[2]); }, (cmp ? b : a) === 'land')));
      zin.disabled = cur[2] <= MINW + .01; zout.disabled = cur[2] >= FULL[2] - .01; svg.style.touchAction = zoomF() > 1.05 ? 'none' : 'pan-y';
      applyR();
      requestAnimationFrame(() => { applyR(); paintLabels(); });
      if (window.ResizeObserver) { const ro = new ResizeObserver(() => { if (!svg.isConnected) { ro.disconnect(); return; } paintLabels(); }); ro.observe(wrap); }
      circles.forEach(c => {
        const k = byId[c.dataset.id]; if (!k) return;
        const show = () => {
          const pending = c.classList.contains('pending'), R = k.results[valg], p = bigOf(k, valg);
          tip.innerHTML = '';
          tip.append(h('strong', {}, k.name), pending ? h('span', { class: 'tp-m' }, 'Ikke optalt endnu') : h('span', { class: 'tp-p' }, letter(p, 'sm'), h('span', {}, PN(p))),
            !pending && R && isFA(valg) ? h('span', { class: 'tp-m' }, `Ja ${fmtP(R.votes.JA / R.valid * 100)} · nej ${fmtP(R.votes.NEJ / R.valid * 100)}`) : null, !pending && R ? h('span', { class: 'tp-m' }, `Valgdeltagelse ${fmtP(R.turnout)}`) : null);
          const wr = wrap.getBoundingClientRect(), cr = c.getBoundingClientRect();
          tip.hidden = false;
          const tw = tip.offsetWidth, th = tip.offsetHeight;
          let x = cr.left - wr.left + cr.width / 2 - tw / 2, y = cr.top - wr.top - th - 10;
          x = Math.max(4, Math.min(wr.width - tw - 4, x)); if (y < 4) y = cr.bottom - wr.top + 10;
          tip.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`;
          wrap.classList.add('hov'); c.classList.add('hot');
        };
        const hide = () => { tip.hidden = true; wrap.classList.remove('hov'); c.classList.remove('hot'); };
        c.addEventListener('mouseenter', show); c.addEventListener('mouseleave', hide);
      });
      /* animationer */
      const key = valg + '|' + (cmp ? 'c' : 's');
      const newVB = svg.getAttribute('viewBox'), newR = Object.fromEntries(circles.map(c => [c.dataset.id, +c.getAttribute('r')]));
      const counted = new Set(KOM.filter(k => !opts.counted || opts.counted(k.id)).map(k => k.id));
      if (!RM) {
        if (MS.key !== key) {
          const [vx, vy, vw, vh] = newVB.split(' ').map(Number), mx = vx + vw / 2, my = vy + vh / 2;
          circles.forEach(c => { const dx = +c.getAttribute('cx') - mx, dy = +c.getAttribute('cy') - my, dist = Math.sqrt(dx * dx + dy * dy) / Math.max(vw, vh);
            c.animate([{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 560, delay: 80 + dist * 900, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'backwards' }); });
          svg.querySelectorAll('g.reg').forEach((g, i) => g.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: i * 60, easing: 'ease-out', fill: 'backwards' }));
        } else if (MS.vb && MS.vb !== newVB) {
          const from = MS.vb.split(' ').map(Number), to = newVB.split(' ').map(Number), oldR = MS.r, t0 = performance.now(), D0 = 720;
          svg.setAttribute('viewBox', MS.vb);
          circles.forEach(c => { const r0 = oldR[c.dataset.id]; if (r0) c.setAttribute('r', r0); });
          const step = now => { const t = Math.min(1, (now - t0) / D0), e = easeIO(t);
            svg.setAttribute('viewBox', from.map((v, i) => (v + (to[i] - v) * e).toFixed(2)).join(' '));
            circles.forEach(c => { const r0 = oldR[c.dataset.id], r1 = newR[c.dataset.id]; if (r0 && r1) c.setAttribute('r', (r0 + (r1 - r0) * e).toFixed(2)); });
            marks.forEach(([id, c, ring]) => ring.setAttribute('r', (+c.getAttribute('r') + 3).toFixed(2)));
            if (t < 1 && svg.isConnected) requestAnimationFrame(step); };
          requestAnimationFrame(step);
        }
        if (MS.key === key && MS.counted) counted.forEach(id => { if (!MS.counted.has(id) && byC[id]) {
          const c = byC[id]; c.animate([{ transform: 'scale(.3)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 650, easing: 'ease-out' });
          const rip = mkC({ cx: c.getAttribute('cx'), cy: c.getAttribute('cy'), r: c.getAttribute('r'), fill: 'none', stroke: c.getAttribute('fill'), 'stroke-width': '2', class: 'ripple' });
          ringG.append(rip); rip.animate([{ transform: 'scale(1)', opacity: .9 }, { transform: 'scale(3.2)', opacity: 0 }], { duration: 1100, easing: 'ease-out' }).onfinish = () => rip.remove();
        } });
        const selKey = (a || '') + '|' + (b || '');
        if (MS.sel !== selKey) marks.forEach(([id, c, ring, col]) => {
          const ping = mkC({ cx: c.getAttribute('cx'), cy: c.getAttribute('cy'), r: ring.getAttribute('r'), fill: 'none', stroke: col, 'stroke-width': '2', class: 'ripple' });
          ringG.append(ping); ping.animate([{ transform: 'scale(1)', opacity: .8 }, { transform: 'scale(2.6)', opacity: 0 }], { duration: 1200, delay: 250, iterations: 2, easing: 'ease-out', fill: 'backwards' }).onfinish = () => ping.remove();
        });
        MS.sel = selKey;
      }
      MS.key = key; MS.vb = newVB; MS.r = newR; MS.counted = counted;
      /* forklaring */
      const cnt = {}; KOM.forEach(k => { if (counted.has(k.id)) { const p = bigOf(k, valg); cnt[p] = (cnt[p] || 0) + 1; } });
      const legend = h('div', { class: 'maplegend' }, h('span', { class: 'ml-t' }, isFA(valg) ? 'Flest stemmer i kommunen' : 'Største parti i kommunen'),
        Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x]).slice(0, 5).map(p => h('span', { class: 'ml-i', title: PN(p) }, letter(p, 'sm'), h('b', {}, String(cnt[p])))),
        h('span', { class: 'ml-s' }, h('i', { class: 'ml-c1' }), h('i', { class: 'ml-c2' }), 'størrelse = antal vælgere · klik for at vælge · rul eller brug + for at zoome'));
      return h('div', { class: 'mapbox' }, wrap, legend);
    }

    /* ============================ FORSIDEN ============================ */
    const H1 = { se: 'Hvordan gik valget?', sammenlign: 'Sammenlign områder og valg', hente: 'Hent valgtal som fil' };
    function home(q) {
      document.title = 'valg.dk – prototype (version D)';
      ST = fromQuery(q);
      const el = h('div', { class: 'dpage' });
      const sentenceBox = h('div', { class: 'sent-wrap' });
      let hentStage = 0, shownStage = 0;
      const answer = h('section', { class: 'dans', 'aria-labelledby': 'dh-lede' });
      const say = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
      let liveSay = 0;

      function setHash() { try { history.replaceState(null, '', toHash(ST)); } catch (e) { /* ignorer */ } markNav(); }
      function update(changed, patch) {
        const old = Object.assign({}, ST);
        Object.assign(ST, patch); const prev = ST.valg;
        normalize(ST, changed, old);
        if (ST.do === 'hente') { if (old.do !== 'hente') hentStage = 0; else if (changed === 'valg') hentStage = Math.max(hentStage, 1); else if (changed === 'omr' || changed === 'fmt') hentStage = 2; }
        if (ST.omr && byId[ST.omr] && changed === 'omr') saveFoc(ST.omr);
        setHash(); log('sentence', JSON.stringify(ST));
        const autoKey = ST.do === 'sammenlign' && old.do === 'sammenlign' ? (old.valg2 !== ST.valg2 && changed !== 'valg2' ? 'valg2' : old.valg !== ST.valg && changed !== 'valg' ? 'valg' : null) : null;
        drawSentence(changed, autoKey); drawAnswer();
        say.textContent = `Viser ${ST.do === 'se' ? 'resultat' : ST.do === 'sammenlign' ? 'sammenligning' : 'dataudtræk'} for ${areaIn(ST.omr)}.` + (autoKey ? ` ${autoKey === 'valg2' ? 'Andet' : 'Første'} valg er skiftet til ${ELNAME[ST[autoKey]]}.` : '');
        if (prev !== ST.valg) log('valgskift', ST.valg);
      }
      current = { pick: id => { if (ST.do === 'sammenlign') update('omr2', { omr2: id }); else update('omr', { omr: id }); }, setDo: d => update('do', { do: d }) };

      /* ---- sætningen ---- */
      function drawSentence(focusKey, autoKey) {
        sentenceBox.innerHTML = '';
        /* alle valg, grupperet efter type – feltet får søgning, fordi der er mere end ti */
        /* valget er to felter i sætningen: først typen (5 valg), så året (højst 7) – Hicks lov frem for én liste med 24 valg */
        const yLabel = v => String(yr(v)) + (ELS[v].short ? ' · ' + ELS[v].short : '');
        const valgSlots = (lab, key, cur, set) => [valgSlot(lab, cur, set, key)];
        /* runde 8: overskriften er selve spørgsmålet – «Hvordan gik [Folketingsvalg 2026] i [hele landet]?».
           Se/sammenlign/hent vælges i headeren, og mandater og stemmer står side om side i svaret, så der ikke er felter at klikke sig igennem. */
        const t1 = $('#dh1', el); t1.innerHTML = '';
        const parts = [];
        if (ST.do === 'se') parts.push('Hvordan gik ', ...valgSlots('Valg', 'valg', ST.valg, v => update('valg', { valg: v })), ' i ', slot('Område', areaGroups(ST.valg, 'se'), ST.omr, v => update('omr', { omr: v }), 'omr'));
        /* sammenligningen står fast på to linjer – én for hver side – så den aldrig skifter form */
        else if (ST.do === 'sammenlign') parts.push(h('span', { class: 'hl' }, 'Sammenlign ', slot('Første område', areaGroups(ST.valg, 'sammenlign'), ST.omr, v => update('omr', { omr: v }), 'omr'), ' ved ', ...valgSlots('Første valg', 'valg', ST.valg, v => update('valg', { valg: v })), ' '),
          h('span', { class: 'hl' }, 'med ', slot('Andet område', areaGroups(ST.valg, 'sammenlign'), ST.omr2, v => update('omr2', { omr2: v }), 'omr2'), ' ved ', ...valgSlots('Andet valg', 'valg2', ST.valg2, v => update('valg2', { valg2: v }))));
        if (ST.do === 'hente') t1.textContent = H1.hente;
        else {
          if (ST.do === 'se') parts.push(h('span', { style: 'white-space:nowrap' }, parts.pop(), '?')); /* tegnet følger sidste felt og står aldrig alene på en linje */
          t1.append(h('span', { class: 'hsent' + (ST.do === 'sammenlign' ? ' two' : '') }, parts));
        }
        fitSentence();
        document.title = H1[ST.do] + ' – valg.dk prototype (version D)';
        if (autoKey && !RM) { const a = $(`[data-k="${autoKey}"]`, t1); if (a) a.animate([{ boxShadow: '0 0 0 0 rgba(0,130,62,.75)' }, { boxShadow: '0 0 0 12px rgba(0,130,62,0)' }], { duration: 900, iterations: 2, easing: 'ease-out' }); }
        if (focusKey) { const f = $(`[data-k="${focusKey}"]`, t1); if (f) { f.focus(); if (!RM) f.animate([{ transform: 'scale(1.08)', boxShadow: '0 0 0 0 rgba(220,206,117,.95)' }, { transform: 'scale(1)', boxShadow: '0 0 0 10px rgba(220,206,117,0)' }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' }); } }
      }

      /* sætningen står altid på én linje på store skærme: er den for lang, bliver skriften lidt mindre i stedet for at
         springe til to linjer og skubbe alt andet ned (feedback 17.11). På mobil må den gerne bryde. */
      function fitSentence() {
        const t1 = $('#dh1', el), p = t1 && t1.querySelector('.hsent'); if (!p) { if (t1) t1.style.fontSize = ''; return; }
        t1.style.fontSize = ''; p.style.whiteSpace = '';
        if (matchMedia('(max-width:900px)').matches) return;
        p.style.whiteSpace = 'nowrap';
        const avail = t1.clientWidth; if (!avail) return;
        const wide = () => Math.max(...[...p.querySelectorAll(':scope > .hl')].map(x => x.getBoundingClientRect().width), p.getBoundingClientRect().width * (p.classList.contains('two') ? 0 : 1));
        let fs = parseFloat(getComputedStyle(t1).fontSize), guard = 80;
        while (wide() > avail + 1 && fs > 22 && guard--) { fs -= 0.5; t1.style.fontSize = fs + 'px'; }
        if (wide() > avail + 1) p.style.whiteSpace = ''; /* kan den ikke stå på én linje, må den bryde */
      }

      /* ---- svaret ---- */
      const mapHolder = h('div', { class: 'dmap' });
      function paintMap(root) {
        const cmp = ST.do === 'sammenlign';
        const onKom = id => { log('map', id); if (cmp) update('omr2', { omr2: id }); else update('omr', { omr: id }); };
        const opts = { valg: ST.valg, metric: 'party', borders: true, counted: ST.valg === 'kv2025' ? isCounted : null, onSelect: onKom, onRegion: rid => { log('map', rid); if (cmp) update('omr2', { omr2: rid }); else update('omr', { omr: rid }); }, onLand: () => { log('map', 'land'); if (cmp) update('omr2', { omr2: 'land' }); else update('omr', { omr: 'land' }); } };
        root.append(fancyMap(opts, ST.omr, cmp ? ST.omr2 : null, cmp), h('p', { class: 'mapnote' }, cmp ? 'Klik på en kommune for at skifte det andet område.' : 'Klik på en kommune eller region for at se dens resultat.'));
      }
      function seatsOf(R) { const seats = []; R.rows.slice().sort((a, b) => b.m - a.m).forEach(r => { for (let i = 0; i < r.m; i++) seats.push({ p: r.p, title: `${r.p} – ${r.name}` }); }); return seats; }

      function drawAnswer() {
        answer.innerHTML = '';
        const A = ST.do === 'hente' ? { rows: [], pending: false, type: 'hente' } : resultOf(ST.omr, ST.valg);
        const lede = h('p', { class: 'lede', id: 'dh-lede' });
        const setLede = t => { const m = String(t).match(/^(.+?[.!?])(\s+[\s\S]*)?$/); lede.innerHTML = ''; if (m && m[2]) lede.append(h('span', {}, m[1]), h('span', { class: 'more' }, m[2])); else lede.textContent = t; };
        const left = h('div', { class: 'dleft' }), right = h('div', { class: 'dright' });
        const grid = h('div', { class: 'dgrid' }, left, right);
        const sortSeg = (extra) => h('div', { class: 'seg2', role: 'group', 'aria-label': 'Sortér partierne' }, [['size', 'Størst først'], ['alpha', 'A–Å']].map(([v, t]) => h('button', { type: 'button', 'aria-pressed': String(ST.sort === v), onclick: () => { ST.sort = v; drawAnswer(); } }, t)), extra || null);

        if (ST.do === 'se') {
          setLede(ledeSe(ST.omr, ST.valg, A));
          if (A.pending) left.append(h('div', { class: 'empty' }, h('strong', {}, 'Optælles stadig'), h('span', {}, 'Resultatet kommer, så snart kommunen er talt op.')));
          else {
            const pv = ELS[ST.valg].prev;
            const cmpPrev = pv ? h('a', { class: 'dbtn small ghost cmpprev', href: toHash({ do: 'sammenlign', omr: ST.omr, valg: ST.valg, omr2: ST.omr, valg2: pv }), onclick: () => log('sammenlign-forrige', ST.omr) }, `Sammenlign med ${yr(pv)}`) : null;
            const what = isFA(ST.valg) ? 'Resultatet' : A.hasM ? 'Mandater og stemmer' : 'Stemmer';
            const why = isFA(ST.valg) ? (ELS[ST.valg].question || '') : !A.hasM ? `Ved ${typeWord(ST.valg)} fordeles mandaterne ${typeOf(ST.valg) === 'rv' ? 'i regionerne' : 'for hele landet'}, ikke i ${levelOf(ST.omr) === 'kommune' ? 'den enkelte kommune' : 'den enkelte region'} – derfor ser du stemmerne her.` : '';
            /* sortering sker ved at klikke på kolonneoverskrifterne – én række knapper mindre, så listen kan stå uden scroll */
            left.append(h('div', { class: 'bcapline' }, h('p', { class: 'bcap' }, h('strong', {}, `${what} ved ${lowerFirst(ELNAME[ST.valg])}`), pv ? ` · ændring siden ${yr(pv)}` : ''), cmpPrev),
              ...(why ? [h('p', { class: 'bcap why' }, why)] : []),
              ballotBoth(A.rows, ST.sort, A.hasM, !!pv));
          }
          {
            const tabs = h('div', { class: 'seg2', role: 'group', 'aria-label': 'Vis til højre' }, [['kort', 'Kort']].concat(A.hasM ? [['prikker', 'Mandatfordeling']] : [], HAS_CAND(ST.valg) ? [['valgte', 'De valgte']] : []).map(([v, t]) => h('button', { type: 'button', 'aria-pressed': String(sideOf(ST) === v), onclick: () => { ST.side = v; drawAnswer(); } }, t)));
            const host = h('div', { class: 'dview' });
            if (sideOf(ST) === 'valgte' && !A.pending) host.append(h('p', { class: 'bcap' }, h('strong', {}, `De valgte i ${areaIn(ST.omr)}`), ' · flest personlige stemmer først'), electedList(ST.omr, ST.valg));
            else if (sideOf(ST) === 'prikker' && !A.pending) host.append(h('div', { class: 'dots' }, hemicycle(seatsOf(A), { label: 'Mandatfordeling: ' + A.rows.filter(r => r.m).sort((a, b) => b.m - a.m).map(r => `${r.p} ${r.m}`).join(', ') })));
            else paintMap(host);
            right.append(h('div', { class: 'ctl right' }, tabs), host);
          }
        } else if (ST.do === 'sammenlign') {
          const B = resultOf(ST.omr2, ST.valg2), sameArea = ST.omr === ST.omr2, sameValg = ST.valg === ST.valg2;
          /* året står altid ved hver side, så man ved, hvilket valg man ser (pilottest 16.11) */
          const la = sameValg ? areaName(ST.omr) : sameArea ? ELNAME[ST.valg] : `${areaName(ST.omr)} · ${yr(ST.valg)}`;
          const lb = sameValg ? areaName(ST.omr2) : sameArea ? ELNAME[ST.valg2] : `${areaName(ST.omr2)} · ${yr(ST.valg2)}`;
          const pa = sameValg ? 'i ' + areaIn(ST.omr) : sameArea ? 'ved ' + lowerFirst(ELNAME[ST.valg]) : `i ${areaIn(ST.omr)} ved ${lowerFirst(ELNAME[ST.valg])}`;
          const pb = sameValg ? 'i ' + areaIn(ST.omr2) : sameArea ? 'ved ' + lowerFirst(ELNAME[ST.valg2]) : `i ${areaIn(ST.omr2)} ved ${lowerFirst(ELNAME[ST.valg2])}`;
          if (A.pending || B.pending) { setLede('Et af områderne er ikke optalt endnu. Sammenligningen vises, når begge er talt op.'); left.append(h('div', { class: 'empty' }, h('strong', {}, 'Optælles stadig'), h('span', {}, 'Vælg et område, der er optalt, eller afslut simulationen.'))); }
          else {
            const bothM = A.hasM && B.hasM && !isFA(ST.valg), metric = bothM ? ST.cmp : 'stem', c = compareRows(A, B, metric, ST.sort, la, lb);
            setLede(bothM ? ledeCmp(A, B, pa, pb, sameArea ? areaIn(ST.omr) : null) : ledeCmpVotes(A, B, pa, pb));
            const mseg = bothM ? h('div', { class: 'seg2', role: 'group', 'aria-label': 'Sammenlign på' }, [['stem', 'Stemmer'], ['mand', 'Mandater']].map(([v, t]) => h('button', { type: 'button', 'aria-pressed': String(ST.cmp === v), onclick: () => { ST.cmp = v; drawAnswer(); } }, t))) : null;
            left.append(h('div', { class: 'ctl' }, mseg, sortSeg()), h('div', { class: 'cmp-key' }, h('span', { class: 'k a' }, la + ' (øverst)'), h('span', { class: 'k b' }, lb), h('span', { class: 'kn' }, (metric === 'stem' ? 'Forskel i stemmeandel' : c.abs ? 'Forskel i mandater' : 'Forskel i andel af mandaterne'), h('span', { class: 'kn-tip' }, ' · peg på en række for at se begge tal'))), c.el);
          }
          const host = h('div', { class: 'dview' }); paintMap(host); right.append(host);
        } else {
          const ids = ST.omr, rows = exportRows(ids, ST.valg), running = ST.valg === 'kv2025' && LIVE.on && LIVE.n < KOM.length;
          const scope = ids === 'land' ? 'land' : ids === 'alle-reg' ? 'reg' : ids === 'alle-kom' ? 'kom' : ids.startsWith('region-') ? 'regkom' : 'en';
          const desc = ids === 'land' ? 'én række for hvert parti i hele landet' : ids === 'alle-kom' ? 'én række for hvert parti i hver af de 98 kommuner' : ids === 'alle-reg' ? 'én række for hvert parti i hver af de fem regioner' : scope === 'regkom' ? `én række for hvert parti i hver af de ${H.getArea(ids).kommuner.length} kommuner i ${areaIn(ids)}` : 'én række for hvert parti i ' + areaIn(ids);
          const stage = hentStage; /* 0: kun valget · 1: + hvilke tal · 2: + format, knap og forhåndsvisning (Kristian: «meget tal på én gang») */
          setLede(stage === 0 ? 'Vælg først, hvilket valg du vil hente tal fra.' : stage === 1 ? `Vælg nu, hvilke tal fra ${lowerFirst(ELNAME[ST.valg])} du vil have.` : `Du får én fil med ${fmtN(rows.length)} rækker: ${desc}.`);
          const refocus = sel => requestAnimationFrame(() => { const f = answer.querySelector(sel); if (f) f.focus(); });
          const opt = (k, t, sub, on, pressed) => sub === '' ? h('button', { type: 'button', 'data-opt': k, 'aria-pressed': String(pressed), onclick: () => { if (!['excel', 'csv'].includes(k)) hentStage = 2; on(); refocus(`[data-opt="${k}"]`); } }, t) : h('button', { type: 'button', class: 'opt', 'data-opt': k, 'aria-pressed': String(pressed), onclick: () => { if (!['excel', 'csv'].includes(k)) hentStage = 2; on(); refocus(`[data-opt="${k}"]`); } }, h('strong', {}, t), h('small', {}, sub));
          const firstReg = REG[REG.findIndex(r => r.id === 'region-hovedstaden')] || REG[0];
          const TAL = { land: 'Ét samlet tal pr. parti.', reg: 'Ét tal pr. parti pr. region.', kom: 'Ét tal pr. parti pr. kommune – til statistik.', regkom: 'Ét tal pr. parti pr. kommune i regionen.', en: 'Kun tallene for kommunen. Tryk på feltet, og skriv kommunens navn.' };
          const step1 = h('div', { class: 'seg2 wrap tal', role: 'group', 'aria-label': 'Hvilke tal?' },
            opt('land', 'Hele landet', '', () => update('omr', { omr: 'land' }), stage > 1 && scope === 'land'),
            opt('reg', '5 regioner', '', () => update('omr', { omr: 'alle-reg' }), stage > 1 && scope === 'reg'),
            opt('kom', '98 kommuner', '', () => update('omr', { omr: 'alle-kom' }), stage > 1 && scope === 'kom'),
            opt('regkom', 'Kommunerne i en region', '', () => update('omr', { omr: scope === 'regkom' ? ids : firstReg.id }), stage > 1 && scope === 'regkom'),
            opt('en', 'Én kommune', '', () => update('omr', { omr: scope === 'en' ? ids : (loadFoc() || 'horsholm') }), stage > 1 && scope === 'en'));
          let sub1 = null;
          if (stage > 1 && (scope === 'regkom' || scope === 'en')) {
            const items = scope === 'regkom' ? REG.map(r => [r.id, r.name]) : komSorted.map(k => [k.id, k.name]);
            /* runde 10: kommunen vælges i et felt med søgning (98 kommuner er for mange at scrolle i); regionen er stadig en almindelig liste */
            let sel;
            if (scope === 'en') { sel = slot('Kommune', [{ items }], ids, v => { update('omr', { omr: v }); refocus('#hsel'); }, 'hk'); sel.id = 'hsel'; sel.classList.add('dsel', 'ksel'); }
            else { sel = h('select', { class: 'dsel', id: 'hsel' }, items.map(([v, t]) => { const o = h('option', { value: v }, t); if (v === ids) o.selected = true; return o; })); sel.addEventListener('change', () => { update('omr', { omr: sel.value }); refocus('#hsel'); }); }
            sub1 = h('div', { class: 'subpick' }, h('label', { for: 'hsel' }, scope === 'regkom' ? 'Region' : 'Kommune'), sel);
          }
          const tNow = typeOf(ST.valg);
          const step2 = h('div', { class: 'vsteps' },
            h('div', { class: 'seg2 wrap', role: 'group', 'aria-label': 'Type valg' }, TYPE_ORDER.map(t => h('button', { type: 'button', 'data-opt': 't-' + t, 'aria-pressed': String(tNow === t), onclick: () => { update('valg', { valg: tNow === t ? ST.valg : elsOfType(t)[0] }); refocus(`[data-opt="t-${t}"]`); } }, TYPES[t].name))),
            h('div', { class: 'seg2 wrap', role: 'group', 'aria-label': TYPES[tNow].name + ': hvilket år?' }, elsOfType(tNow).map(v => h('button', { type: 'button', 'data-opt': 'v-' + v, 'aria-pressed': String(stage > 0 && ST.valg === v), 'aria-label': ELNAME[v], onclick: () => { hentStage = Math.max(hentStage, 1); update('valg', { valg: v }); refocus(`[data-opt="v-${v}"]`); } }, String(yr(v))))));
          const step3 = h('div', { class: 'seg2', role: 'group', 'aria-label': 'Hvilket format?' },
            opt('excel', 'Excel', '', () => update('fmt', { fmt: 'excel' }), ST.fmt === 'excel'),
            opt('csv', 'CSV', '', () => update('fmt', { fmt: 'csv' }), ST.fmt === 'csv'));
          const fmtHint = ST.fmt === 'excel' ? 'Åbner direkte i dansk Excel. Eksempeldata.' : 'Til R, Python eller SPSS. Eksempeldata.';
          const stepEl = (n, t, ...kids) => h('section', { class: 'hstep' }, h('h3', {}, h('span', { class: 'hn', 'aria-hidden': 'true' }, String(n)), t), ...kids);
          const btn = h('button', { class: 'dbtn hbtn', type: 'button', disabled: running ? '' : null, onclick: () => {
            const text = ST.fmt === 'excel' ? csv(HEAD, rows) : csv(HEAD, rows, { sep: ',', dec: '.' });
            download(`valg-${ids}-${ST.valg}.csv`, text); say.textContent = 'Filen er hentet.'; btn.classList.add('done'); btn.querySelector('.bl').textContent = 'Filen er hentet'; log('hent', ids + ' ' + ST.valg);
          } }, h('span', { class: 'bl' }, `Hent ${ST.fmt === 'excel' ? 'Excel-filen' : 'CSV-filen'}`), h('span', { class: 'bs' }, `${fmtN(rows.length)} rækker · ${HEAD.length} kolonner`));
          left.append(h('div', { class: 'hent2' }, stepEl(1, 'Hvilket valg?', step2, stage === 0 ? h('p', { class: 'hhint' }, 'Vælg type og derefter år.') : null),
            stage > 0 ? stepEl(2, 'Hvilke tal?', step1, h('div', { class: 'hrow' }, sub1, h('p', { class: 'hhint' }, stage > 1 ? TAL[scope] : 'Vælg, hvor detaljeret filen skal være.'))) : null,
            stage > 1 ? stepEl(3, 'Hvilket format?', h('div', { class: 'hrow' }, step3, btn, h('span', { class: 'hhint' }, fmtHint))) : null,
            stage > 1 && running ? h('p', { class: 'warn-note' }, 'Optællingen kører (simulation). Hent først filen, når den er afsluttet, så den ikke indeholder halve tal.') : null));
          /* det nye trin glider stille frem, så man ser, hvad der kom til */
          if (stage > shownStage && !RM) { const st = left.querySelectorAll('.hstep, .hgo'); [...st].slice(stage === 1 ? 1 : 2).forEach(x => x.classList.add('reveal')); }
          shownStage = stage;
          if (stage < 2) {
            right.append(h('div', { class: 'preview pv-wait' }, h('p', { class: 'pv-h' }, h('strong', {}, 'Sådan ser filen ud')),
              h('div', { class: 'pv-empty' }, h('span', {}, stage === 0 ? 'Når du har valgt valg og tal, ser du her, hvad filen kommer til at indeholde.' : 'Vælg, hvilke tal du vil have, så ser du filen her.'))));
            answer.append(lede, grid, strip(A)); return;
          }
          /* forhåndsvisning: kun de kolonner, der skal læses, ingen vandret scroll, og et samlet overblik øverst */
          const areas = [...new Set(rows.map(r => r[0]))];
          const sumV = rows.reduce((t, r) => t + r[4], 0), sumM = rows.reduce((t, r) => t + (+r[6] || 0), 0), noM = rows.every(r => r[6] === '');
          const chg = v => v === '' || v == null ? '' : (v > 0 ? '+' : v < 0 ? '−' : '±') + fmtN(Math.abs(v));
          const tot = h('div', { class: 'pv-tot' },
            h('div', {}, h('b', {}, fmtN(rows.length)), h('span', {}, 'rækker i filen')),
            h('div', {}, h('b', {}, fmtN(areas.length)), h('span', {}, areas.length === 1 ? 'område' : 'områder')),
            h('div', {}, h('b', {}, fmtN(sumV)), h('span', {}, 'stemmer i alt')),
            noM ? h('div', {}, h('b', {}, '–'), h('span', {}, 'ingen mandater her')) : h('div', {}, h('b', {}, fmtN(sumM)), h('span', {}, 'mandater i alt')));
          let table, cap;
          if (areas.length === 1) {
            cap = `Alle ${fmtN(rows.length)} partier i ${rows[0] ? rows[0][0] : ''}`;
            table = h('table', { class: 'pv pv2 one' },
              h('thead', {}, h('tr', {}, ['Parti', 'Stemmer', 'Andel', 'Mandater', 'Ændring'].map((t, i) => h('th', { scope: 'col', class: i ? 'num' : '' }, t)))),
              h('tbody', {}, rows.map(r => h('tr', {}, h('td', { class: 'pv-p' }, letter(r[2], 'sm'), h('span', {}, r[3])), h('td', { class: 'num' }, fmtN(r[4])), h('td', { class: 'num' }, fmtP(r[5], 1)), h('td', { class: 'num' }, h('b', {}, r[6] === '' ? '–' : String(r[6]))), h('td', { class: 'num pv-d' + (r[7] > 0 ? ' up' : r[7] < 0 ? ' dn' : '') }, chg(r[7]))))),
              h('tfoot', {}, h('tr', {}, h('th', { scope: 'row' }, 'I alt'), h('td', { class: 'num' }, fmtN(sumV)), h('td', { class: 'num' }, '100 %'), h('td', { class: 'num' }, h('b', {}, noM ? '–' : String(sumM))), h('td', {}, ''))));
          } else {
            const perAll = areas.map(a => { const l = rows.filter(r => r[0] === a), b = l.slice().sort((x, y) => (+y[6] || 0) - (+x[6] || 0) || y[4] - x[4])[0]; return { a, n: l.length, v: l.reduce((t, r) => t + r[4], 0), m: l.reduce((t, r) => t + (+r[6] || 0), 0), big: b }; });
            const per = perAll, rest = 0;
            cap = `Overblik over de ${fmtN(areas.length)} områder – filen har én række pr. parti i hvert område`;
            table = h('table', { class: 'pv pv2' },
              h('thead', {}, h('tr', {}, ['Område', 'Største parti', 'Stemmer', 'Mandater'].map((t, i) => h('th', { scope: 'col', class: i > 1 ? 'num' : '' }, t)))),
              h('tbody', {}, per.map(x => h('tr', {}, h('td', {}, x.a), h('td', { class: 'pv-p' }, x.big ? letter(x.big[2], 'sm') : null, h('span', {}, x.big ? (noM ? fmtP(x.big[5]) : `${x.big[6]} af ${x.m}`) : '')), h('td', { class: 'num' }, fmtN(x.v)), h('td', { class: 'num' }, h('b', {}, noM ? '–' : String(x.m))))), rest > 0 ? h('tr', { class: 'pv-more' }, h('td', { colspan: '4' }, `… og ${fmtN(rest)} ${rest === 1 ? 'område' : 'områder'} mere i filen`)) : null),
              h('tfoot', {}, h('tr', {}, h('th', { scope: 'row' }, 'I alt'), h('td', {}, ''), h('td', { class: 'num' }, fmtN(sumV)), h('td', { class: 'num' }, h('b', {}, noM ? '–' : String(sumM))))));
          }
          right.append(h('div', { class: 'preview' }, h('p', { class: 'pv-h' }, h('strong', {}, 'Sådan ser filen ud'), ' · ' + cap),
            tot,
            h('div', { class: 'pv-box', tabindex: '0', role: 'region', 'aria-label': 'Forhåndsvisning af filen – kan scrolles' }, table),
            h('p', { class: 'pv-n' }, `Filen har ${HEAD.length} kolonner: ${HEAD.join(', ')}. Ændring er målt i forhold til forrige valg af samme type.`)));
        }
        answer.append(lede, grid, strip(A));
        requestAnimationFrame(fitBallot);
      }
      /* forsiden må ikke scrolle (feedback 17.11): passer listen ikke, bliver rækkerne tættere – først uden søjler, så mindre skrift */
      function fitBallot() {
        /* runde 10: knækker status-linjen under svaret (knapperne ryger ned på en ny linje), bruges knappernes korte tekster */
        answer.querySelectorAll('.dstrip').forEach(s => { s.classList.remove('short', 'shorter'); const a = s.querySelector('.acts'), t = s.firstElementChild, wraps = () => a && t && a !== t && a.offsetTop > t.offsetTop + 4; if (wraps()) s.classList.add('short'); if (wraps()) s.classList.add('shorter'); });
        answer.querySelectorAll('.ballot.both, .ballot.cmp').forEach(ol => {
          ol.classList.remove('tight', 'tighter');
          if (matchMedia('(max-width:900px)').matches) return;
          if (ol.scrollHeight > ol.clientHeight + 1) ol.classList.add('tight');
          if (ol.scrollHeight > ol.clientHeight + 1) ol.classList.add('tighter');
        });
      }

      /* ---- status og handlinger under svaret ---- */
      function strip(A) {
        const total = KOM.length, running = ST.valg === 'kv2025' && LIVE.on, done = running && LIVE.n >= total;
        const status = h('div', { class: 'status' });
        if (running && !done) {
          status.append(h('span', { class: 'tag live' }, h('i', { class: 'pulse' }), LIVE.paused ? 'Pause' : 'Live (simulation)'), h('span', { class: 'st-t' }, h('strong', {}, `${LIVE.n} af ${total} kommuner`), ` optalt · kl. ${simClock()}`), h('span', { class: 'track', 'aria-hidden': 'true' }, h('i', { style: `width:${LIVE.n / total * 100}%` })));
          const q = Math.floor(LIVE.n / total * 4); if (q > liveSay) { liveSay = q; say.textContent = `${LIVE.n} af ${total} kommuner er optalt.`; }
        } else {
          status.append(h('span', { class: 'tag final' }, done ? 'Simulation slut' : 'Endeligt resultat'),
            h('span', { class: 'st-t' }, ST.do === 'sammenlign' && ST.valg2 !== ST.valg ? `Valgdage ${ELS[ST.valg].date} og ${ELS[ST.valg2].date} · Afsender: Valg.dk (prototype)` : `Valgdag ${dayDate(ST.valg).toLowerCase()} · Afsender: Valg.dk (prototype)`));
        }
        const acts = h('div', { class: 'acts' });
        const mk = (t, f, cls) => h('button', { class: 'dbtn small ' + (cls || ''), type: 'button', onclick: f }, t);
        if (ST.valg === 'kv2025' && ST.do !== 'hente') {
          if (!running) acts.append(mk(h('span', {}, h('span', { class: 'lg' }, 'Se valgaftens optælling (simulation)'), h('span', { class: 'sh' }, 'Valgaften (simulation)')), () => { liveSay = 0; live.start(); }, 'ghost'));
          else { if (!done) acts.append(mk(LIVE.paused ? 'Fortsæt' : 'Pause', live.pause, 'ghost'), mk('Spring til slut', live.skip, 'ghost opt')); acts.append(mk('Afslut', live.stop, 'ghost')); }
        }
        if (ST.do === 'sammenlign' && !A.pending) {
          const B = resultOf(ST.omr2, ST.valg2);
          if (!B.pending) acts.append(h('button', { class: 'dbtn small', type: 'button', onclick: () => {
            const tag = v => r => [ELNAME[v]].concat(r);
            const rows = exportRows(ST.omr, ST.valg, true).map(tag(ST.valg)).concat(exportRows(ST.omr2, ST.valg2, true).map(tag(ST.valg2)));
            download(`sammenligning-${ST.omr}-${ST.valg}-${ST.omr2}-${ST.valg2}.csv`, csv(['Valg'].concat(HEAD), rows)); say.textContent = 'Filen med sammenligningen er hentet.'; log('hent', 'sammenligning ' + ST.omr + ' ' + ST.valg + ' ' + ST.omr2 + ' ' + ST.valg2);
          } }, h('span', {}, h('span', { class: 'lg' }, 'Hent sammenligningen (Excel)'), h('span', { class: 'sh' }, 'Hent (Excel)'))));
        }
        if (ST.do === 'se' && !A.pending) {
          const to = sk[ST.omr] ? '#/storkreds/' + ST.omr : H.resultHref(ST.omr, ST.valg);
          const nm = ST.omr === 'land' ? 'hele landet' : areaLabel(ST.omr);
          acts.append(h('a', { class: 'dbtn small', href: to }, h('span', { class: 'lg' }, 'Hele resultatet for ' + nm), h('span', { class: 'sh' }, 'Hele resultatet')));
        }
        return h('div', { class: 'dstrip' }, status, acts);
      }

      /* ---- valgte ---- */
      function electedList(id, valg) {
        let pool;
        if (valg === 'fv') pool = allFV.filter(x => x.elected && (id === 'land' || x.sk === id));
        else { const a = H.getArea(id), ids = new Set(a.kommuner.map(k => k.id)); pool = allKV.filter(x => x.elected && ids.has(x.kom) && (valg !== 'kv2025' || isCounted(x.kom))); }
        pool = pool.sort((a, b) => b.votes - a.votes);
        if (!HAS_CAND(valg)) return h('div', { class: 'empty' }, h('strong', {}, `Ingen kandidatdata for ${ELNAME[valg]}`), h('span', {}, 'Kandidaterne i prototypen hører kun til Kommunalvalg 2025 og Folketingsvalg 2026.'));
        if (!pool.length) return h('div', { class: 'empty' }, h('strong', {}, 'Ingen valgt endnu'), h('span', {}, 'Optællingen er lige begyndt.'));
        const shown = pool.slice(0, 40);
        return h('div', { class: 'elected' }, h('ol', { class: 'ballot ev' }, shown.map(x => h('li', { class: 'row' }, letter(x.p),
          h('span', { class: 'mid' }, h('a', { class: 'pn', href: x.href }, x.name), h('span', { class: 'sub' }, x.t === 'kv' ? `${x.komName} Kommune · ${PN(x.p)}` : `${x.kredsName} · ${PN(x.p)}`)),
          h('strong', { class: 'val' }, fmtN(x.votes), h('span', { class: 'unit' }, ' stemmer'))))), pool.length > shown.length ? h('p', { class: 'mapnote' }, `Viser de ${shown.length} med flest stemmer af ${fmtN(pool.length)}. Se alle under «Kandidater og kredse».`) : null);
      }

      /* ---- sammensætning ---- */
      const finder = S.searchBox({ placeholder: 'Kommune, kandidat eller parti', id: 'dq', onKommune: id => { finder.inp.value = ''; current.pick(id); } });
      finder.form.classList.add('dfind');
      /* på mobil er headerens faner skjult – her står de i stedet som en fast fanerække */
      const mtabs = h('nav', { class: 'mtabs', 'aria-label': 'Vælg visning' }, [['se', 'Resultater'], ['sammenlign', 'Sammenlign'], ['hente', 'Hent data']].map(([k, t]) => h('a', { href: '#/?do=' + k, 'data-d': k, 'aria-current': ST.do === k ? 'page' : null, onclick: e => { e.preventDefault(); update('do', { do: k }); mtabs.querySelectorAll('a').forEach(a => { if (a.dataset.d === ST.do) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }); markNav(); } }, t)));
      el.append(mtabs);
      el.append(h('div', { class: 'dtop' }, h('div', { class: 'dtitle' }, h('h1', { id: 'dh1' }, 'Hvordan gik valget?'), h('div', { class: 'dfind-wrap' }, h('label', { class: 'or', for: 'dq' }, 'eller søg'), finder.form)),
      ), answer, say);
      let fitT = null; window.addEventListener('resize', () => { if (!el.isConnected) return; clearTimeout(fitT); fitT = setTimeout(() => { fitSentence(); fitBallot(); }, 80); });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (el.isConnected) fitSentence(); });
      drawSentence(); drawAnswer(); setHash();
      const sub = () => { if (!el.isConnected) { LIVE.subs.delete(sub); return; } drawAnswer(); };
      LIVE.subs.add(sub);
      return el;
    }

    /* ============================ STORSKÆRM ============================ */
    function tvPage(q) {
      document.title = 'Storskærm – valg.dk prototype';
      const wantFoc = (q && q.omr && byId[q.omr]) ? q.omr : (loadFoc() || 'horsholm');
      let kom = byId[wantFoc] ? wantFoc : KOM[0].id;
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const SCENES = [
        { id: 'mand', t: 'Mandater i hele landet', draw: root => { const R = resultOf('land', 'kv2025'); root.append(sceneHead(R, 'byrådsmandater'), h('div', { class: 'tv-ballot' }, ballot(R.rows.filter(r => r.m).sort((a, b) => b.m - a.m).slice(0, 8), 'mand', 'size', { big: true }))); } },
        { id: 'kort', t: 'Største parti i hver kommune', draw: root => { const svg = GEO.renderMap({ valg: 'kv2025', metric: 'party', counted: isCounted, onSelect: () => {}, onRegion: () => {} }); root.append(h('div', { class: 'tv-map' }, svg), h('div', { class: 'tv-legend' }, legendKey())); } },
        { id: 'kom', t: () => areaIn(kom), draw: root => { const R = resultOf(kom, 'kv2025'); if (R.pending) root.append(h('p', { class: 'tv-wait' }, areaIn(kom) + ' er ikke optalt endnu …')); else root.append(h('p', { class: 'tv-lede' }, ledeSe(kom, 'kv2025', R)), h('div', { class: 'tv-ballot' }, ballot(R.rows.filter(r => r.m).sort((a, b) => b.m - a.m).slice(0, 8), 'mand', 'size', { big: true }))); } },
        { id: 'valgte', t: () => 'Valgt i ' + areaIn(kom), draw: root => {
          if (!isCounted(kom)) { root.append(h('p', { class: 'tv-wait' }, areaIn(kom) + ' er ikke optalt endnu …')); return; }
          const R = resultOf(kom, 'kv2025'), rank = {}; R.rows.slice().sort((a, b) => b.m - a.m).forEach((r, i) => { rank[r.p] = i; });
          const pool = allKV.filter(x => x.elected && x.kom === kom).sort((a, b) => rank[a.p] - rank[b.p] || b.votes - a.votes);
          root.append(h('p', { class: 'tv-lede' }, h('strong', {}, String(pool.length)), ' byrådsmedlemmer, sorteret efter parti og personlige stemmer'),
            h('ol', { class: 'tv-names' + (pool.length > 31 ? ' many' : '') }, pool.map(x => h('li', {}, letter(x.p, 'sm'), h('span', { class: 'nm' }, x.name), h('small', {}, fmtN(x.votes))))));
        } },
      ];
      function legendKey() { const cnt = {}; KOM.forEach(k => { if (isCounted(k.id)) { const p = H.biggest(k, 'kv2025'); cnt[p] = (cnt[p] || 0) + 1; } }); return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 6).map(p => h('span', { class: 'lg-i' }, letter(p, 'sm'), h('b', {}, String(cnt[p])), h('small', {}, cnt[p] === 1 ? 'kommune' : 'kommuner'))); }
      function sceneHead(R, unit) { return h('p', { class: 'tv-lede' }, h('strong', {}, fmtN(R.seats)), ' ' + unit + (LIVE.on && LIVE.n < KOM.length ? ' fordelt indtil nu' : ' fordelt')); }
      let idx = 0, paused = reduce, t0 = Date.now(); const DUR = 12000;
      const stage = h('div', { class: 'tv-stage', 'aria-live': 'off' }), title = h('h1', { class: 'tv-title' }), dots = h('div', { class: 'tv-dots', role: 'group', 'aria-label': 'Vælg billede' });
      const stat = h('span', { class: 'tv-stat' }), clock = h('span', { class: 'tv-clock' }), bar = h('i', {});
      function draw() {
        const sc = SCENES[idx]; title.textContent = typeof sc.t === 'function' ? sc.t() : sc.t; stage.innerHTML = ''; stage.className = 'tv-stage sc-' + sc.id; sc.draw(stage);
        dots.innerHTML = ''; SCENES.forEach((s, i) => dots.append(h('button', { type: 'button', 'aria-pressed': String(i === idx), 'aria-label': typeof s.t === 'function' ? s.t() : s.t, onclick: () => go(i) })));
        stat.textContent = LIVE.on ? (LIVE.n >= KOM.length ? 'Simulation slut' : `LIVE (simulation) · ${LIVE.n}/${KOM.length} kommuner`) : 'Endeligt resultat · eksempeldata';
        clock.textContent = LIVE.on ? 'kl. ' + simClock() : '';
      }
      const go = i => { idx = (i + SCENES.length) % SCENES.length; t0 = Date.now(); draw(); };
      const ppBtn = h('button', { class: 'dbtn small ghost', type: 'button', onclick: () => { paused = !paused; t0 = Date.now(); ppBtn.textContent = paused ? 'Fortsæt visning' : 'Sæt visningen på pause'; } }, paused ? 'Fortsæt visning' : 'Sæt visningen på pause');
      const liveBtn = h('button', { class: 'dbtn small ghost', type: 'button', onclick: () => { if (!LIVE.on) live.start(); else live.stop(); } }, 'Start/stop optælling (simulation)');
      const fsBtn = h('button', { class: 'dbtn small ghost', type: 'button', onclick: () => { const d = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else if (d.requestFullscreen) d.requestFullscreen(); } }, 'Fuld skærm');
      const komSel = h('select', { id: 'tvkom', class: 'tv-sel' }, komSorted.map(k => { const o = h('option', { value: k.id }, k.name); if (k.id === kom) o.selected = true; return o; }));
      komSel.addEventListener('change', () => { kom = komSel.value; saveFoc(kom); log('tv-kommune', kom); draw(); });
      const root = h('div', { class: 'tvpage' },
        h('div', { class: 'tv-top' }, h('span', { class: 'tv-brand' }, 'valg.dk ', h('small', {}, 'prototype · eksempeldata')), stat, clock, h('span', { class: 'tv-pick' }, h('label', { for: 'tvkom' }, 'Kommune'), komSel), h('a', { class: 'dbtn small ghost', href: '#/' }, 'Luk storskærm')),
        h('div', { class: 'tv-main' }, title, stage), h('div', { class: 'tv-bot' }, dots, h('span', { class: 'tv-prog', 'aria-hidden': 'true' }, bar), ppBtn, liveBtn, fsBtn,
          h('span', { class: 'tv-keys' }, 'Piletaster skifter billede · mellemrum pauser · Esc lukker')));
      const sub = () => { if (!root.isConnected) { LIVE.subs.delete(sub); return; } draw(); };
      LIVE.subs.add(sub);
      const timer = setInterval(() => { if (!root.isConnected) { clearInterval(timer); document.removeEventListener('keydown', key); return; } if (paused) { bar.style.width = '0'; return; } const p = (Date.now() - t0) / DUR; bar.style.width = Math.min(100, p * 100) + '%'; if (p >= 1) go(idx + 1); }, 200);
      function key(e) { if (!root.isConnected || /SELECT|INPUT/.test(document.activeElement.tagName)) return; if (e.key === 'ArrowRight') go(idx + 1); else if (e.key === 'ArrowLeft') go(idx - 1); else if (e.key === ' ' && !/BUTTON|A/.test(document.activeElement.tagName)) { e.preventDefault(); ppBtn.click(); } else if (e.key === 'Escape' && !document.fullscreenElement) location.hash = '#/'; }
      document.addEventListener('keydown', key);
      draw();
      return root;
    }

    /* ============================ HEADER OG NAVIGATION ============================ */
    /* menuen i D: ordnet efter formål (rapportens F4), samme rækkefølge som hovedmenuen */
    window.VXD.drawer = () => {
      const lk = (hr, t, d) => h('a', { href: hr, class: 'dl' }, h('strong', {}, t), d ? h('small', {}, d) : null);
      const grp = (t, ...links) => h('section', { class: 'dgrp' }, t ? h('h3', {}, t) : null, h('div', { class: 'dlinks' }, links));
      return [S.closeBtn(), h('h2', { class: 'layer-h' }, 'Menu'),
        grp(null,
          lk('#/?do=se', 'Resultater', 'Mandater og stemmer for landet, en region eller din kommune'),
          lk('#/?do=sammenlign', 'Sammenlign', 'To områder side om side'),
          lk('#/?do=hente', 'Hent data', 'Valgtal som Excel- eller CSV-fil i tre trin'),
          lk(href('/kredse', { valg: 'fv' }), 'Kandidater og kredse', 'Hvem stillede op, og hvem blev valgt')),
        grp('Mere',
          lk('#/?do=se&hv=valgte', 'Hvem er valgt ind?', 'De valgte med flest personlige stemmer'),
          lk('#/storskaerm', 'Storskærm', 'Til valgcaféen og projektoren'),
          lk('#/metode', 'Hvordan fordeles mandaterne?', 'Forklaret uden fagsprog')),
        grp('Om valg.dk', lk('#/om-valg', 'Om valg.dk'), lk('#/tilgaengelighed', 'Tilgængelighedserklæring'), lk('#/privatliv', 'Privatlivspolitik'), lk('#/sitemap', 'Sitemap'))];
    };
    const bn = $('.proto-banner'); if (bn) bn.innerHTML = '<span class="lg">Prototype til bachelorprojekt – ikke den officielle Valg.dk. Alle tal er eksempeldata.</span><span class="sh">Prototype – ikke officiel · eksempeldata</span>';
    const hdrIn = $('.site-header .in');
    const navD = h('nav', { class: 'nav-d', 'aria-label': 'Hovedmenu' },
      [['#/?do=se', 'Resultater', 'se', 'M3 20V10M9 20V4M15 20v-8M21 20V8'], ['#/?do=sammenlign', 'Sammenlign', 'sammenlign', 'M7 7h13m0 0-4-4m4 4-4 4M17 17H4m0 0 4-4m-4 4 4 4'], ['#/?do=hente', 'Hent data', 'hente', 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14'], ['#/kredse', 'Kandidater og kredse', 'kredse', 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 20a5.5 5.5 0 0 1 11 0m-.5-1a5.5 5.5 0 0 1 8.5-3.5']].map(([hr, t, k, ic]) => {
        const a = h('a', { href: hr, 'data-d': k }, t);
        a.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ic}"/></svg>`);
        /* står man allerede på forsiden, skifter fanen kun tilstand – område og valg bevares */
        if (k !== 'kredse') a.addEventListener('click', e => { const raw = location.hash.replace(/^#/, '') || '/'; if (current && current.setDo && (raw === '/' || raw.startsWith('/?')) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); current.setDo(k); markNav(); } });
        return a;
      }));
    hdrIn.insertBefore(navD, $('.hdr-tools', hdrIn));
    $('.hdr-tools', hdrIn).prepend(h('a', { class: 'hdr-btn tvlink', href: '#/storskaerm' }, 'Storskærm'));
    function markNav() {
      const raw = location.hash.replace(/^#/, '') || '/', path = raw.split('?')[0], seg = path.split('/').filter(Boolean)[0] || '';
      let on = '';
      if (seg === '') on = ST.do; else if (['resultat', 'valg', 'parti', 'find'].includes(seg)) on = 'se'; else if (seg === 'sammenlign') on = 'sammenlign'; else if (seg === 'data') on = 'hente'; else if (['kredse', 'storkreds', 'kreds', 'kandidat'].includes(seg)) on = 'kredse';
      navD.querySelectorAll('a').forEach(a => { if (a.dataset.d === on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    }

    Object.assign(window.VX, {
      home,
      afterRender: () => {
        S.baseAfterRender();
        const raw = location.hash.replace(/^#/, '') || '/', isHome = raw === '/' || raw.startsWith('/?');
        document.body.classList.toggle('tv', raw.startsWith('/storskaerm'));
        if (!isHome) document.body.classList.remove('dfree');
        if (raw.startsWith('/storskaerm')) document.body.classList.remove('fit');
        S.setKommuneHook(isHome && current ? current.pick : null);
        markNav();
        document.querySelectorAll('.crumbs a, nav[aria-label="Brødkrumme"] a, .crumb a').forEach(a => { if (a.textContent.trim() === 'Find resultat') a.textContent = 'Resultater'; });
        document.querySelectorAll('.kpis .stat .val').forEach(v => v.classList.toggle('long', v.textContent.trim().length > 12));
      },
    });
    /* én funktion ét sted: de ældre sider for find, sammenlign og hent data peger på forsidens tilstande */
    window.VX.routes = Object.assign({}, window.VX.routes, {
      storskaerm: (parts, q) => tvPage(q),
      find: (parts, q) => home(Object.assign({}, q, { do: 'se' })),
      sammenlign: (parts, q) => home(Object.assign({}, q, { do: 'sammenlign' })),
      data: (parts, q) => home(Object.assign({}, q, { do: 'hente' })),
    });
  }
})();
