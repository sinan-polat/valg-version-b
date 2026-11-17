#!/usr/bin/env python3
"""
Tilføjer EKSEMPELDATA for alle fem valgtyper, som valg.dk dækker, til js/data.js:

  Folketingsvalg      2026 (= prototypens eksisterende folketingsvalg med kandidater), 2022, 2019, 2015, 2011, 2007, 2005
  Kommunalvalg        2025, 2021, 2017, 2013 (findes i forvejen) + 2009
  Regionsrådsvalg     2025, 2021, 2017, 2013
  Europa-Parlamentsvalg 2024, 2019, 2014, 2009, 2004
  Folkeafstemning     2022, 2015, 2014

Navne, datoer og spørgsmål til folkeafstemningerne er de rigtige (fra valg.dk). ALLE TAL er
opdigtede eksempeltal til prototypen, bygget ud fra hver kommunes profil i de eksisterende
eksempeldata og skubbet mod et landsgennemsnit pr. valg. De er IKKE officielle resultater.
Folkeafstemningerne får samme udfald (ja/nej) som de rigtige, så eksemplet ikke vildleder.

Mandater ligger dér, hvor valget fordeler dem:
  kommunalvalg      i hver kommune (d'Hondt), summeret til region og land
  regionsrådsvalg   41 i hver region (d'Hondt), summeret til land – ingen i kommunerne
  folketingsvalg    175 i hele landet (største brøk, 2 %-spærregrænse) – ingen i regioner/kommuner
  Europa-Parlament  hele landet er én valgkreds (d'Hondt) – ingen i regioner/kommuner
  folkeafstemning   ingen mandater, kun ja og nej
Forenkling: regionerne er de fem nuværende ved alle valg (ved regionsrådsvalg 2025 blev
Hovedstaden og Sjælland til Region Østdanmark).

Kør fra projektmappen:  python3 tools/add_all_elections.py   (kan køres flere gange)
Kræver at tools/add_older_elections.py er kørt (kv2017 og kv2013 findes).
"""
import datetime
import hashlib
import json
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "js" / "data.js"
KAND = ROOT / "js" / "kandidater.js"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from add_older_elections import build as build_kv, dhondt, split_int  # noqa: E402

TYPES = {
    "ft": {"name": "Folketingsvalg", "seatLevels": ["land"]},
    "kv": {"name": "Kommunalvalg", "seatLevels": ["land", "region", "kommune"]},
    "rv": {"name": "Regionsrådsvalg", "seatLevels": ["land", "region"]},
    "ep": {"name": "Europa-Parlamentsvalg", "seatLevels": ["land"]},
    "fa": {"name": "Folkeafstemning", "seatLevels": []},
}
MONTHS = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"]
DAYS = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"]

# eksempel-landsandele (procent) og valgdeltagelse – kun partier, der stillede op det år
FT = {
    "ft2022": ("2022-11-01", 84, {"A": 27, "V": 13.5, "M": 9, "F": 8.5, "Æ": 8, "I": 8, "C": 5.5, "Ø": 5, "B": 4, "D": 3.5, "Å": 3.3, "O": 2.7, "K": 0.5}),
    "ft2019": ("2019-06-05", 84.5, {"A": 26, "V": 23, "O": 9, "B": 8.5, "F": 7.5, "Ø": 7, "C": 6.5, "Å": 3, "D": 2.4, "I": 2.4, "K": 1.7}),
    "ft2015": ("2015-06-18", 86, {"A": 26, "O": 21, "V": 19.5, "Ø": 7.8, "I": 7.5, "Å": 4.8, "B": 4.6, "F": 4.2, "C": 3.4, "K": 0.8}),
    "ft2011": ("2011-09-15", 87.5, {"V": 26.5, "A": 25, "O": 12.3, "B": 9.5, "F": 9.2, "Ø": 6.7, "I": 5, "C": 4.9, "K": 0.8}),
    "ft2007": ("2007-11-13", 86.5, {"V": 26, "A": 25.5, "O": 14, "F": 13, "C": 10.4, "B": 5.1, "I": 2.8, "Ø": 2.2, "K": 0.9}),
    "ft2005": ("2005-02-08", 84.5, {"V": 29, "A": 26, "O": 13.3, "C": 10.3, "B": 9.2, "F": 6, "Ø": 3.4, "K": 1.7}),
}
EP = {
    "ep2024": ("2024-06-09", 58, 15, {"F": 17.5, "A": 15.5, "V": 14.5, "C": 9, "Æ": 7.4, "B": 7, "Ø": 7, "I": 7, "O": 6.4, "M": 5.9, "Å": 2.7}),
    "ep2019": ("2019-05-26", 66, 14, {"V": 23.5, "A": 21.5, "F": 13, "O": 10.8, "B": 10, "C": 6.2, "Ø": 5.5, "N": 3.7, "Å": 3.4, "I": 2.2}),
    "ep2014": ("2014-05-25", 56, 13, {"O": 26.5, "A": 19, "V": 16.7, "F": 11, "C": 9, "N": 8, "B": 6.5, "I": 2.9}),
    "ep2009": ("2009-06-07", 59.5, 13, {"A": 21.5, "V": 20, "F": 16, "O": 15.3, "C": 12.7, "N": 7.2, "B": 4.3, "J": 2.4, "I": 0.6}),
    "ep2004": ("2004-06-13", 48, 14, {"A": 32.5, "V": 19.5, "C": 11.3, "J": 9.1, "F": 8, "O": 6.8, "B": 6.4, "N": 5.2, "K": 1.3}),
}
FA = {
    "fa2022": ("2022-06-01", 66, 67, "Afstemning om Danmarks deltagelse i det europæiske samarbejde om sikkerhed og forsvar ved at afskaffe EU-forsvarsforbeholdet"),
    "fa2015": ("2015-12-03", 72, 47, "Afstemning om omdannelse af retsforbeholdet"),
    "fa2014": ("2014-05-25", 56, 62.5, "Afstemning om den fælles patentdomstol"),
}
FA_SHORT = {"fa2022": "forsvarsforbeholdet", "fa2015": "retsforbeholdet", "fa2014": "patentdomstolen"}
RV = {"rv2025": ("2025-11-18", "kv2025"), "rv2021": ("2021-11-16", "kv2021"), "rv2017": ("2017-11-21", "kv2017"), "rv2013": ("2013-11-19", "kv2013")}
KV2009 = {"name": "Kommunalvalg 2009", "date": "17. november 2009", "prev": None, "turnout_shift": 1.0, "electorate_factor": 0.94,
          "base": {"A": 30.5, "V": 25, "F": 14.5, "C": 11, "O": 8, "B": 4.4, "Ø": 2.3, "I": 1, "K": 0.5}}
NEW_PARTIES = {"N": {"name": "Folkebevægelsen mod EU", "color": "#7A1F2B"},
               "J": {"name": "JuniBevægelsen", "color": "#A5652A"},
               "JA": {"name": "Ja", "color": "#1F7A4D", "answer": True},
               "NEJ": {"name": "Nej", "color": "#B3261E", "answer": True}}


def rng(*parts):
    return random.Random(int(hashlib.md5("|".join(parts).encode()).hexdigest()[:12], 16))


def dk_date(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{d.day}. {MONTHS[d.month - 1]} {d.year}", DAYS[d.weekday()]


def region_id(k):
    return "region-" + k["region"].replace("Region ", "").lower().replace("æ", "ae")


def nat_shares(kom, eid):
    v = {}
    for k in kom:
        for p, n in k["results"][eid]["votes"].items():
            v[p] = v[p] + n if p in v else n
    t = sum(v.values())
    return {p: n / t * 100 for p, n in v.items()}


def party_result(k, eid, prof, ref, base, turnout_nat, kv_turn_nat, el_factor, r):
    """Én kommunes tal: profil fra et eksisterende kommunalvalg, skubbet mod årets landsandele."""
    P = k["results"][prof]
    shares = {}
    for p, b in base.items():
        loc = P["votes"].get(p, 0) / P["valid"] * 100 if P["valid"] else 0
        if loc > 0 and ref.get(p):
            val = b * (loc / ref[p]) ** 0.8
        else:
            val = b * r.uniform(0.6, 1.3)
        shares[p] = max(0.05, val * r.uniform(0.88, 1.12))
    tot = sum(shares.values())
    electorate = int(round(P["electorate"] * el_factor * r.uniform(0.985, 1.015)))
    turnout = min(93.0, max(35.0, turnout_nat + (P["turnout"] - kv_turn_nat) * 0.55 + r.uniform(-1.8, 1.8)))
    cast = int(round(electorate * turnout / 100))
    valid = int(round(cast * r.uniform(0.982, 0.993)))
    parties = list(shares)
    votes = dict(zip(parties, split_int(valid, [shares[p] / tot for p in parties], r)))
    return {"electorate": electorate, "cast": cast, "valid": valid, "turnout": round(turnout, 1), "votes": votes, "mandates": {}}


def largest_remainder(votes, seats, threshold=2.0):
    tot = sum(votes.values())
    ok = {p: v for p, v in votes.items() if v / tot * 100 >= threshold}
    s = sum(ok.values())
    q = {p: v * seats / s for p, v in ok.items()}
    got = {p: int(x) for p, x in q.items()}
    for p in sorted(q, key=lambda p: q[p] - got[p], reverse=True)[: seats - sum(got.values())]:
        got[p] += 1
    return {p: n for p, n in got.items() if n}


def sum_votes(list_):
    v = {}
    for R in list_:
        for p, n in R["votes"].items():
            v[p] = v.get(p, 0) + n
    return v


def fv_per_kommune(data, fv):
    """Prototypens folketingsvalg (2026) ligger pr. opstillingskreds; her fordeles det på kommuner."""
    byid = {k["id"]: k for k in data["kommuner"]}
    out = {k["id"]: {"electorate": 0, "cast": 0, "valid": 0, "votes": {}, "mandates": {}} for k in data["kommuner"]}
    for kr in fv["kredse"]:
        ks = [i for i in kr["kom"] if i in byid]
        if not ks:
            continue
        w = [byid[i]["results"]["kv2025"]["electorate"] for i in ks]
        r = rng(kr["id"], "fv")
        parts = {f: split_int(kr[f], w, r) for f in ("electorate", "cast", "valid")}
        pv = {p: split_int(n, w, r) for p, n in kr["votes"].items()}
        for j, i in enumerate(ks):
            o = out[i]
            for f in parts:
                o[f] += parts[f][j]
            for p in pv:
                o["votes"][p] = o["votes"].get(p, 0) + pv[p][j]
    for i, o in out.items():
        if not o["electorate"]:
            raise SystemExit(f"Kommune uden opstillingskreds i folketingsvalget: {i}")
        o["valid"] = sum(o["votes"].values())
        o["cast"] = max(o["cast"], o["valid"])
        o["turnout"] = round(o["cast"] / o["electorate"] * 100, 1)
    return out


def main():
    src = DATA.read_text(encoding="utf-8")
    m = re.search(r"window\.DATA\s*=\s*(\{.*\})\s*;?\s*$", src, re.S)
    data = json.loads(m.group(1))
    ksrc = KAND.read_text(encoding="utf-8")
    km = re.search(r"(window\.KAND\s*=\s*)(\{.*\})(\s*;?\s*)$", ksrc, re.S)
    kand = json.loads(km.group(2))
    kom = data["kommuner"]
    els = {e: v for e, v in data["elections"].items() if e.startswith("kv") and e != "kv2009"}
    for k in kom:  # gør scriptet gentageligt
        k["results"] = {e: v for e, v in k["results"].items() if e in els}
    for p, v in NEW_PARTIES.items():
        data["parties"][p] = v
    kv_turn = {e: sum(k["results"][e]["cast"] for k in kom) / sum(k["results"][e]["electorate"] for k in kom) * 100 for e in els}
    ref21 = nat_shares(kom, "kv2021")
    E = {}

    # ---- folketingsvalg ----
    fv = kand["fv"]
    fv["name"], fv["date"] = "Folketingsvalg 2026", "24. marts 2026"
    fvk = fv_per_kommune(data, fv)
    for k in kom:
        k["results"]["fv"] = fvk[k["id"]]
    d, wd = dk_date("2026-03-24")
    E["fv"] = {"name": "Folketingsvalg 2026", "type": "ft", "date": d, "weekday": wd, "prev": "ft2022", "seatsTotal": fv["seats"],
               "seatsBy": {"land": {p: x["kreds"] + x["tillaeg"] for p, x in fv["nationalSeats"].items() if x["kreds"] + x["tillaeg"]}},
               "candidates": True}
    ids = list(FT)
    for i, (eid, (iso, turn, base)) in enumerate(FT.items()):
        d, wd = dk_date(iso)
        yr = int(iso[:4])
        prof = "kv2021" if yr >= 2019 else "kv2017" if yr >= 2015 else "kv2013"
        ref = nat_shares(kom, prof)
        for k in kom:
            k["results"][eid] = party_result(k, eid, prof, ref, base, turn, kv_turn[prof], 1.0 - (2026 - yr) * 0.004, rng(k["id"], eid))
        E[eid] = {"name": f"Folketingsvalg {yr}", "type": "ft", "date": d, "weekday": wd, "prev": ids[i + 1] if i + 1 < len(ids) else None,
                  "seatsTotal": 175, "seatsBy": {"land": largest_remainder(sum_votes([k["results"][eid] for k in kom]), 175)}}

    # ---- kommunalvalg 2009 ----
    for k in kom:
        k["results"]["kv2009"] = build_kv(k, "kv2009", KV2009)
    for e in ["kv2025", "kv2021", "kv2017", "kv2013"]:
        yr = int(e[2:])
        d, wd = dk_date({2025: "2025-11-18", 2021: "2021-11-16", 2017: "2017-11-21", 2013: "2013-11-19"}[yr])
        E[e] = dict(els[e], type="kv", date=d, weekday=wd)
    E["kv2013"]["prev"] = "kv2009"
    d, wd = dk_date("2009-11-17")
    E["kv2009"] = {"name": "Kommunalvalg 2009", "type": "kv", "date": d, "weekday": wd, "prev": None}

    # ---- regionsrådsvalg ----
    rids = list(RV)
    for i, (eid, (iso, kv)) in enumerate(RV.items()):
        d, wd = dk_date(iso)
        ref = nat_shares(kom, kv)
        base = dict(ref)
        for k in kom:
            k["results"][eid] = party_result(k, eid, kv, ref, base, kv_turn[kv] - 1.3, kv_turn[kv], 1.0, rng(k["id"], eid))
        by = {}
        for rid in sorted({region_id(k) for k in kom}):
            v = sum_votes([k["results"][eid] for k in kom if region_id(k) == rid])
            by[rid] = {p: n for p, n in dhondt(v, 41).items() if n}
        land = {}
        for s in by.values():
            for p, n in s.items():
                land[p] = land.get(p, 0) + n
        by["land"] = land
        E[eid] = {"name": f"Regionsrådsvalg {iso[:4]}", "type": "rv", "date": d, "weekday": wd, "prev": rids[i + 1] if i + 1 < len(rids) else None,
                  "seatsTotal": 205, "seatsBy": by}

    # ---- Europa-Parlamentsvalg ----
    eids = list(EP)
    for i, (eid, (iso, turn, seats, base)) in enumerate(EP.items()):
        d, wd = dk_date(iso)
        yr = int(iso[:4])
        prof = "kv2021" if yr >= 2019 else "kv2013"
        ref = nat_shares(kom, prof)
        for k in kom:
            k["results"][eid] = party_result(k, eid, prof, ref, base, turn, kv_turn[prof], 1.0 - (2026 - yr) * 0.004, rng(k["id"], eid))
        v = sum_votes([k["results"][eid] for k in kom])
        E[eid] = {"name": f"Europa-Parlamentsvalg {yr}", "type": "ep", "date": d, "weekday": wd, "prev": eids[i + 1] if i + 1 < len(eids) else None,
                  "seatsTotal": seats, "seatsBy": {"land": {p: n for p, n in dhondt(v, seats).items() if n}}}

    # ---- folkeafstemninger ----
    for eid, (iso, turn, ja, q) in FA.items():
        d, wd = dk_date(iso)
        for k in kom:
            r = rng(k["id"], eid)
            P = k["results"]["kv2021"]
            electorate = int(round(P["electorate"] * r.uniform(0.97, 1.01)))
            t = min(90.0, max(40.0, turn + (P["turnout"] - kv_turn["kv2021"]) * 0.6 + r.uniform(-2, 2)))
            cast = int(round(electorate * t / 100))
            valid = int(round(cast * r.uniform(0.975, 0.99)))
            js = min(85.0, max(25.0, ja + r.uniform(-7, 7)))
            nj = int(round(valid * js / 100))
            k["results"][eid] = {"electorate": electorate, "cast": cast, "valid": valid, "turnout": round(t, 1),
                                 "votes": {"JA": nj, "NEJ": valid - nj}, "mandates": {}}
        E[eid] = {"name": f"Folkeafstemning {iso[:4]}", "type": "fa", "date": d, "weekday": wd, "prev": None, "question": q, "short": FA_SHORT[eid]}

    order = ["fv"] + list(FT) + ["kv2025", "kv2021", "kv2017", "kv2013", "kv2009"] + list(RV) + list(EP) + list(FA)
    data["elections"] = {e: E[e] for e in order}
    data["types"] = TYPES
    data["meta"]["older"] = ("Alle valg ud over Kommunalvalg 2025 og 2021 er tilføjet af tools/add_older_elections.py og "
                             "tools/add_all_elections.py (eksempeldata). Navne, datoer og spørgsmål er de rigtige; tallene er opdigtede.")
    DATA.write_text(src[: m.start()] + "window.DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    KAND.write_text(ksrc[: km.start()] + km.group(1) + json.dumps(kand, ensure_ascii=False, separators=(",", ":")) + km.group(3), encoding="utf-8")
    for e in order:
        sb = data["elections"][e].get("seatsBy", {}).get("land")
        print(e, data["elections"][e]["weekday"], data["elections"][e]["date"], "mandater:", sum(sb.values()) if sb else "-",
              "stemmer:", sum(sum(k["results"][e]["votes"].values()) for k in kom))


if __name__ == "__main__":
    main()
