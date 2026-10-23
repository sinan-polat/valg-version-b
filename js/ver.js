/* Version til A/B-test: ?v=a = nuværende struktur (valgtype først), ?v=b = opgavebaseret struktur (standard i testpanelet ?test=1), ?v=c = nyt design med valgaften, kredse og kandidater, ?v=d = helt nyt design («Sætningen», standard for alle andre besøg).
   Valget huskes i fanen (sessionStorage), så det følger deltageren gennem hele testen. */
(function () {
  var v = null;
  try {
    v = new URLSearchParams(location.search).get('v');
    if (v === 'a' || v === 'b' || v === 'c' || v === 'd') sessionStorage.setItem('valgVer', v); else v = sessionStorage.getItem('valgVer');
  } catch (e) {}
  var test = false; try { test = new URLSearchParams(location.search).has('test'); } catch (e) {}
  // standard = d (nyeste design). Testpanelet (?test=1) uden version giver b, så A/B-testen er uændret.
  window.VVER = v === 'a' ? 'a' : v === 'b' ? 'b' : v === 'c' ? 'c' : v === 'd' ? 'd' : test ? 'b' : 'd';
})();
