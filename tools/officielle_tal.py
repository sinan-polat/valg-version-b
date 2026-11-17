#!/usr/bin/env python3
"""
Bygger js/data.js ud fra OFFICIELLE valgresultater fra Danmarks Statistik (Statistikbanken).

Kilderne ligger som tekstfiler i tools/kilder/ (hentet 17.11.2026 fra api.statbank.dk):
  kvres_AAAA.txt        KVRES   kommunalvalg pr. kommune (2009, 2013, 2017, 2021, 2025)
  byraad_storrelse.txt  LIGEDB2 antal valgte = byrådets størrelse pr. kommune og år
  fvkom_AAAA.txt        FVKOM   folketingsvalg pr. kommune (2007, 2011, 2015, 2019, 2022, 2026)
  evkom_AAAA.txt        EVKOM1  Europa-Parlamentsvalg pr. kommune (2009, 2014, 2019, 2024)
  fakom.txt             FAKOM   folkeafstemninger pr. kommune (2014, 2015, 2022)

Hvad er officielt, og hvad er beregnet:
  * Stemmer, vælgere og afgivne stemmer pr. kommune er de officielle tal for alle valg ovenfor.
  * Mandater ved folketingsvalg og Europa-Parlamentsvalg er de officielle (landsplan).
  * Mandater ved kommunalvalg beregnes med d'Hondt på kommunens stemmer og byrådets rigtige størrelse.
    Valgforbund og lokallister regnes ikke med, så enkelte kommuner kan afvige med et mandat.
  * Folketingsvalg 2005 og Europa-Parlamentsvalg 2004 findes ikke pr. kommune i Statistikbanken:
    landstallene er officielle, kommunerne er beregnet ud fra mønstret ved næste valg (2007/2009).
  * Regionsrådsvalg findes ikke pr. kommune: landsandelene er officielle for 2021 og 2025, og kommunerne
    er beregnet ud fra samme års kommunalvalg. 2013 og 2017 bygger på kommunalvalgets andele.
    Regionsrådenes mandater beregnes med d'Hondt (41 pr. region; fra 2025 har Danmark reelt fire regioner).
  * Afstemningsområder (navne og tal) er OPDIGTEDE; de summerer til kommunens officielle tal.
  * Partier uden egen kolonne (lokallister, Slesvigsk Parti, Frie Grønne, Stram Kurs m.fl.) samles i «L – Øvrige lister».

Kør fra projektmappen:   python3 tools/officielle_tal.py && python3 tools/generate_kandidater.py
"""
import datetime
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KILDER = ROOT / "tools" / "kilder"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_data import REGIONS, PARTIES, COORDS, slug, dhondt, make_areas  # noqa: E402

MONTHS = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"]
DAYS = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"]
TYPES = {
    "ft": {"name": "Folketingsvalg", "seatLevels": ["land"]},
    "kv": {"name": "Kommunalvalg", "seatLevels": ["land", "region", "kommune"]},
    "rv": {"name": "Regionsrådsvalg", "seatLevels": ["land", "region"]},
    "ep": {"name": "Europa-Parlamentsvalg", "seatLevels": ["land"]},
    "fa": {"name": "Folkeafstemning", "seatLevels": []},
}
EXTRA_PARTIES = {
    "H": {"name": "Borgernes Parti", "color": "#1F3A68"},
    "N": {"name": "Folkebevægelsen mod EU", "color": "#7A1F2B"},
    "J": {"name": "JuniBevægelsen", "color": "#A5652A"},
    "L": {"name": "Øvrige lister", "color": "#7C8594"},
    "JA": {"name": "Ja", "color": "#1F7A4D", "answer": True},
    "NEJ": {"name": "Nej", "color": "#B3261E", "answer": True},
}
KV_COLS = ["V_", "AS", "GS", "A", "B", "C", "D", "F", "I", "K", "M", "O", "V", "Æ", "Ø", "Å", "L"]
FV_COLS = ["VAELG", "GYLD", "UGYLD", "A", "B", "C", "D", "F", "H", "I", "K", "M", "O", "V", "Æ", "Ø", "Å", "L", "L", "L", "L"]  # E, P, Q og uden for partierne → L
EV_COLS = ["VAELG", "GYLD", "UGYLD", "A", "B", "C", "F", "I", "J", "M", "N", "O", "V", "Æ", "Ø", "Å"]

# officielle mandater (Danmark, uden Færøerne og Grønland)
FT_SEATS = {
    "fv": {"A": 38, "F": 20, "V": 18, "I": 16, "O": 16, "M": 14, "C": 13, "Ø": 11, "B": 10, "Æ": 10, "Å": 5, "H": 4},
    "ft2022": {"A": 50, "V": 23, "M": 16, "F": 15, "Æ": 14, "I": 14, "C": 10, "Ø": 9, "B": 7, "D": 6, "Å": 6, "O": 5},
    "ft2019": {"A": 48, "V": 43, "O": 16, "B": 16, "F": 14, "Ø": 13, "C": 12, "Å": 5, "D": 4, "I": 4},
    "ft2015": {"A": 47, "O": 37, "V": 34, "Ø": 14, "I": 13, "Å": 9, "B": 8, "F": 7, "C": 6},
    "ft2011": {"V": 47, "A": 44, "O": 22, "B": 17, "F": 16, "Ø": 12, "I": 9, "C": 8},
    "ft2007": {"V": 46, "A": 45, "O": 25, "F": 23, "C": 18, "B": 9, "I": 5, "Ø": 4},
    "ft2005": {"V": 52, "A": 47, "O": 24, "C": 18, "B": 17, "F": 11, "Ø": 6},
}
EP_SEATS = {
    "ep2024": {"F": 3, "A": 3, "V": 2, "C": 1, "Æ": 1, "B": 1, "Ø": 1, "I": 1, "O": 1, "M": 1},
    "ep2019": {"V": 4, "A": 3, "F": 2, "B": 2, "O": 1, "C": 1, "Ø": 1},
    "ep2014": {"O": 4, "A": 3, "V": 2, "F": 1, "C": 1, "N": 1, "B": 1},
    "ep2009": {"A": 4, "V": 3, "F": 2, "O": 2, "C": 1, "N": 1},
    "ep2004": {"A": 5, "V": 3, "C": 1, "J": 1, "F": 1, "O": 1, "B": 1, "N": 1},
}
# officielle landsandele (procent) for valg uden kommunetal i Statistikbanken
FT2005 = {"V": 29.03, "A": 25.84, "O": 13.25, "C": 10.27, "B": 9.18, "F": 5.99, "Ø": 3.40, "K": 1.73, "L": 1.31}  # Wikipedia/DST; L = CD, Minoritetspartiet, uden for partierne
EP2004 = {"A": 32.65, "V": 19.36, "C": 11.35, "J": 9.08, "F": 7.96, "O": 6.80, "B": 6.36, "N": 5.17, "K": 1.28}
RV_SHARES = {  # lex.dk efter Danmarks Statistik; G og «andre» → L
    "rv2025": {"A": 22.1, "B": 6.5, "C": 10.8, "D": 0.1, "F": 10.8, "I": 5.9, "K": 0.7, "M": 1.8, "O": 9.1, "V": 17.1, "Æ": 5.4, "Ø": 7.3, "Å": 1.3, "L": 1.1},
    "rv2021": {"A": 28.0, "B": 6.1, "C": 14.1, "D": 4.0, "F": 7.3, "I": 1.6, "K": 1.2, "O": 4.2, "V": 23.0, "Ø": 7.7, "Å": 0.7, "L": 2.1},
}
# officielle mandater, hvor d'Hondt uden valgforbund/lokallister rammer forkert (testkommunerne T1–T3).
# Kilde: valg.dk / Wikipedia «2025 Hørsholm/Ishøj municipal election». L = lokallister tilsammen.
SEAT_OVERRIDE = {
    ("223", "kv2025"): {"C": 7, "V": 3, "I": 3, "L": 3, "A": 1, "B": 1, "F": 1},
    ("223", "kv2021"): {"C": 7, "V": 7, "A": 2, "B": 1, "F": 1, "L": 1},
    ("183", "kv2025"): {"A": 7, "L": 5, "F": 2, "V": 2, "O": 1, "I": 1, "B": 1},
    ("183", "kv2021"): {"A": 9, "L": 4, "V": 2, "F": 2, "C": 1, "Ø": 1},
}
RV_TURNOUT = {"rv2025": 68.99, "rv2021": 66.96, "rv2017": 70.67, "rv2013": 71.78}  # Statistikbanken RVPCT
DATES = {
    "fv": "2026-03-24", "ft2022": "2022-11-01", "ft2019": "2019-06-05", "ft2015": "2015-06-18", "ft2011": "2011-09-15", "ft2007": "2007-11-13", "ft2005": "2005-02-08",
    "kv2025": "2025-11-18", "kv2021": "2021-11-16", "kv2017": "2017-11-21", "kv2013": "2013-11-19", "kv2009": "2009-11-17",
    "rv2025": "2025-11-18", "rv2021": "2021-11-16", "rv2017": "2017-11-21", "rv2013": "2013-11-19",
    "ep2024": "2024-06-09", "ep2019": "2019-05-26", "ep2014": "2014-05-25", "ep2009": "2009-06-07", "ep2004": "2004-06-13",
    "fa2022": "2022-06-01", "fa2015": "2015-12-03", "fa2014": "2014-05-25",
}
FA_TEXT = {
    "fa2022": ("Afstemning om Danmarks deltagelse i det europæiske samarbejde om sikkerhed og forsvar ved at afskaffe EU-forsvarsforbeholdet", "forsvarsforbeholdet"),
    "fa2015": ("Afstemning om omdannelse af retsforbeholdet", "retsforbeholdet"),
    "fa2014": ("Afstemning om den fælles patentdomstol", "patentdomstolen"),
}


def dk_date(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{d.day}. {MONTHS[d.month - 1]} {d.year}", DAYS[d.weekday()]


def read(fn):
    rows = {}
    for line in (KILDER / fn).read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        code, rest = line.split(":", 1)
        if "|" in rest:
            rows[code.strip()] = [[int(x) for x in part.split(",")] for part in rest.split("|")]
        else:
            rows[code.strip()] = [int(x) for x in rest.split(",")]
    return rows


def code_names():
    txt = (KILDER / "kommunekoder.txt").read_text(encoding="utf-8").splitlines()[1]
    out = {}
    for pair in txt.split(";"):
        c, n = pair.split("=")
        out[c] = {"Vesthimmerlands": "Vesthimmerland"}.get(n, n)
    return out


def result(electorate, cast, valid, votes):
    votes = {p: v for p, v in votes.items() if v > 0}
    return {"electorate": electorate, "cast": cast, "valid": valid, "turnout": round(cast / electorate * 100, 1) if electorate else 0, "votes": votes, "mandates": {}}


def parse_kv(row):
    votes = {}
    for col, v in zip(KV_COLS[3:], row[3:]):
        votes[col] = votes.get(col, 0) + v
    votes["L"] = votes.get("L", 0) + row[2] - sum(row[3:])  # partier uden egen kolonne (fx Slesvigsk Parti)
    return result(row[0], row[1], row[2], votes)


def parse_fv(row):
    votes = {}
    for col, v in zip(FV_COLS[3:], row[3:]):
        votes[col] = votes.get(col, 0) + v
    return result(row[0], row[1] + row[2], row[1], votes)


def parse_ev(row):
    votes = dict(zip(EV_COLS[3:], row[3:]))
    return result(row[0], row[1] + row[2], row[1], votes)


def nat(results):
    v = {}
    for R in results:
        for p, n in R["votes"].items():
            v[p] = v.get(p, 0) + n
    return v


def split_int(total, weights):
    s = sum(weights) or 1
    raw = [total * w / s for w in weights]
    out = [int(x) for x in raw]
    for i in sorted(range(len(raw)), key=lambda i: raw[i] - out[i], reverse=True)[: total - sum(out)]:
        out[i] += 1
    return out


def calibrate(profiles, target, electorates, turnouts, invalid=0.01):
    """Kommuner uden officielle tal: kommunens mønster fra et nabovalg skaleres (IPF), så landstallet rammer de officielle andele."""
    parties = list(target)
    cast = [int(round(e * t / 100)) for e, t in zip(electorates, turnouts)]
    valid = [int(round(c * (1 - invalid))) for c in cast]
    W = []
    for prof in profiles:
        tot = sum(prof.values()) or 1
        W.append({p: max(prof.get(p, 0) / tot, 0.002) for p in parties})
    for _ in range(60):
        nat_ = {p: sum(W[k][p] * valid[k] for k in range(len(W))) for p in parties}
        totv = sum(valid)
        for p in parties:
            f = (target[p] / 100 * totv) / nat_[p]
            for k in range(len(W)):
                W[k][p] *= f
        for k in range(len(W)):
            s = sum(W[k].values())
            for p in parties:
                W[k][p] /= s
    out = []
    for k in range(len(W)):
        vs = dict(zip(parties, split_int(valid[k], [W[k][p] for p in parties])))
        out.append(result(electorates[k], cast[k], valid[k], vs))
    return out


def main():
    names = code_names()
    region_of = {n: r for r, ns in REGIONS.items() for n in ns}
    codes = list(names)  # Statistikbankens rækkefølge
    sizes = read("byraad_storrelse.txt")
    kom = {}
    for c in codes:
        n = names[c]
        kom[c] = {"id": slug(n), "name": n, "region": region_of[n], "seats": sizes[c][4], "lat": COORDS[n][0], "lon": COORDS[n][1], "results": {}}

    # ---- kommunalvalg (officielle stemmer, d'Hondt med rigtig byrådsstørrelse) ----
    for i, yr in enumerate([2009, 2013, 2017, 2021, 2025]):
        rows = read(f"kvres_{yr}.txt")
        for c in codes:
            R = parse_kv(rows[c])
            R["mandates"] = SEAT_OVERRIDE.get((c, f"kv{yr}")) or {p: m for p, m in dhondt(R["votes"], sizes[c][i]).items() if m}
            assert sum(R["mandates"].values()) == sizes[c][i], (c, yr)
            kom[c]["results"][f"kv{yr}"] = R
    # ---- folketingsvalg ----
    for yr in [2007, 2011, 2015, 2019, 2022, 2026]:
        rows = read(f"fvkom_{yr}.txt")
        eid = "fv" if yr == 2026 else f"ft{yr}"
        for c in codes:
            kom[c]["results"][eid] = parse_fv(rows[c])
    # ---- Europa-Parlamentsvalg ----
    for yr in [2009, 2014, 2019, 2024]:
        rows = read(f"evkom_{yr}.txt")
        for c in codes:
            kom[c]["results"][f"ep{yr}"] = parse_ev(rows[c])
    # ---- folkeafstemninger ----
    rows = read("fakom.txt")
    for i, eid in enumerate(["fa2014", "fa2015", "fa2022"]):
        for c in codes:
            v = rows[c][i]
            kom[c]["results"][eid] = result(v[0], v[1] + v[2], v[1], {"JA": v[3], "NEJ": v[4]})

    # ---- beregnede: FT 2005 (mønster fra 2007) og EP 2004 (mønster fra 2009) ----
    def model(eid, src, target, el_factor, turnout_nat, invalid):
        src_res = [kom[c]["results"][src] for c in codes]
        src_turn = sum(R["cast"] for R in src_res) / sum(R["electorate"] for R in src_res) * 100
        res = calibrate([R["votes"] for R in src_res], target, [int(round(R["electorate"] * el_factor)) for R in src_res],
                        [R["turnout"] * turnout_nat / src_turn for R in src_res], invalid)
        for c, R in zip(codes, res):
            kom[c]["results"][eid] = R
    model("ft2005", "ft2007", FT2005, 0.985, 84.54, 0.0081)
    model("ep2004", "ep2009", EP2004, 0.975, 47.89, 0.0142)

    # ---- regionsrådsvalg: mønster fra samme års kommunalvalg ----
    for eid, kv in [("rv2025", "kv2025"), ("rv2021", "kv2021"), ("rv2017", "kv2017"), ("rv2013", "kv2013")]:
        if eid in RV_SHARES:
            target = RV_SHARES[eid]
        else:  # kommunalvalgets andele, men lokallister stiller ikke op til regionsråd
            v = nat([kom[c]["results"][kv] for c in codes])
            t = sum(v.values())
            target = {p: n / t * 100 for p, n in v.items()}
            target["L"] = 1.5
            s = sum(target.values())
            target = {p: x / s * 100 for p, x in target.items()}
        model(eid, kv, target, 1.0, RV_TURNOUT[eid], 0.042)

    # ---- afstemningsområder (opdigtede navne; tal summerer til kommunen) ----
    for c in codes:
        k = kom[c]
        narea = max(2, min(12, round(k["results"]["kv2025"]["electorate"] / 12000)))
        for eid, R in k["results"].items():
            R["areas"] = make_areas(k["name"], eid, R, narea)

    # ---- valgene ----
    E = {}
    order_ft = ["fv", "ft2022", "ft2019", "ft2015", "ft2011", "ft2007", "ft2005"]
    order_kv = ["kv2025", "kv2021", "kv2017", "kv2013", "kv2009"]
    order_rv = ["rv2025", "rv2021", "rv2017", "rv2013"]
    order_ep = ["ep2024", "ep2019", "ep2014", "ep2009", "ep2004"]
    order_fa = ["fa2022", "fa2015", "fa2014"]
    for lst, typ in [(order_ft, "ft"), (order_kv, "kv"), (order_rv, "rv"), (order_ep, "ep")]:
        for i, eid in enumerate(lst):
            d, wd = dk_date(DATES[eid])
            yr = DATES[eid][:4]
            E[eid] = {"name": f"{TYPES[typ]['name']} {yr}", "type": typ, "date": d, "weekday": wd, "prev": lst[i + 1] if i + 1 < len(lst) else None}
            if typ == "ft":
                E[eid].update(seatsTotal=175, seatsBy={"land": FT_SEATS[eid]})
            if typ == "ep":
                E[eid].update(seatsTotal=sum(EP_SEATS[eid].values()), seatsBy={"land": EP_SEATS[eid]})
            if typ == "rv":
                by = {}
                for rid in sorted({"region-" + r.replace("Region ", "").lower().replace("æ", "ae") for r in REGIONS}):
                    v = nat([kom[c]["results"][eid] for c in codes if "region-" + kom[c]["region"].replace("Region ", "").lower().replace("æ", "ae") == rid])
                    by[rid] = {p: m for p, m in dhondt({p: x for p, x in v.items() if p != "L"}, 41).items() if m}
                land = {}
                for s in by.values():
                    for p, m in s.items():
                        land[p] = land.get(p, 0) + m
                by["land"] = land
                E[eid].update(seatsTotal=205, seatsBy=by)
    E["fv"]["candidates"] = True
    for eid in order_fa:
        d, wd = dk_date(DATES[eid])
        q, short = FA_TEXT[eid]
        E[eid] = {"name": f"Folkeafstemning {DATES[eid][:4]}", "type": "fa", "date": d, "weekday": wd, "prev": None, "question": q, "short": short}
    order = order_ft + order_kv + order_rv + order_ep + order_fa

    komm = sorted(kom.values(), key=lambda k: k["name"].replace("Aa", "Å").replace("Æ", "Zæ").replace("Ø", "Zø").replace("Å", "Zå"))
    for k in komm:
        k["results"] = {e: k["results"][e] for e in order}
    parties = {p: {"name": v[0], "color": v[1]} for p, v in PARTIES.items()}
    parties.update(EXTRA_PARTIES)
    data = {
        "meta": {"note": "Stemmetal pr. kommune er officielle resultater fra Danmarks Statistik (Statistikbanken: KVRES, FVKOM, EVKOM1, FAKOM). "
                         "Afstemningsområder er opdigtede. Se tools/officielle_tal.py for hvad der er beregnet.", "count": len(komm),
                 "source": "Danmarks Statistik, Statistikbanken (hentet 17.11.2026)"},
        "parties": parties,
        "elections": {e: E[e] for e in order},
        "kommuner": komm,
        "types": TYPES,
    }
    out = ROOT / "js" / "data.js"
    out.write_text("// GENERERET af tools/officielle_tal.py – officielle tal fra Danmarks Statistik pr. kommune; afstemningsområder er opdigtede\nwindow.DATA = "
                   + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"Skrev {out} ({len(komm)} kommuner, {out.stat().st_size // 1024} kB)")
    for e in order:
        v = nat([k["results"][e] for k in komm])
        t = sum(v.values())
        top = sorted(v.items(), key=lambda x: -x[1])[:4]
        el = sum(k["results"][e]["electorate"] for k in komm)
        ca = sum(k["results"][e]["cast"] for k in komm)
        print(f"{e:7} deltagelse {ca / el * 100:5.1f} %  ", "  ".join(f"{p} {n / t * 100:4.1f}" for p, n in top))
    for n in ("Hørsholm", "Ishøj"):
        k = next(x for x in komm if x["name"] == n)
        for e in ("kv2025", "kv2021"):
            print(n, e, k["seats"], {p: m for p, m in sorted(k["results"][e]["mandates"].items(), key=lambda x: -x[1])})


if __name__ == "__main__":
    main()
