#!/usr/bin/env python3
"""
Tilføjer EKSEMPELDATA for Kommunalvalg 2017 og 2013 til js/data.js.

Tallene for Kommunalvalg 2025 og 2021 røres ikke, så testopgaverne T1-T5 har de
samme svar som før. De ældre valg bygges ud fra hver kommunes tal i 2021, skubbet
i retning af et landsgennemsnit for det pågældende år og tilsat lidt tilfældig
variation. Mandater fordeles med d'Hondt, så summen altid er byrådets størrelse.
Afstemningsområderne får samme navne som i 2021, og deres tal summerer til
kommunens. Alt er opdigtet til prototypen og er IKKE officielle valgresultater.

Kør fra projektmappen:  python3 tools/add_older_elections.py
Scriptet kan køres flere gange; det erstatter blot 2017 og 2013.
"""
import hashlib
import json
import random
import re
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "js" / "data.js"

# Landsgennemsnitlige basisandele (eksempel) og valgdeltagelse pr. valg
BASE_2021 = {"A": 24, "B": 6, "C": 11, "D": 3, "F": 9, "I": 3, "K": 2, "O": 7, "V": 22, "Ø": 7, "Å": 3}
OLDER = {
    "kv2017": {
        "name": "Kommunalvalg 2017", "date": "21. november 2017", "prev": "kv2013",
        "turnout_shift": 3.4, "electorate_factor": 0.975,
        "base": {"A": 32, "B": 5, "C": 9, "D": 1, "F": 6, "I": 3, "K": 0.6, "O": 9, "V": 23, "Ø": 6, "Å": 3},
    },
    "kv2013": {
        "name": "Kommunalvalg 2013", "date": "19. november 2013", "prev": None,
        "turnout_shift": 4.5, "electorate_factor": 0.955,
        "base": {"A": 29, "B": 5, "C": 8.5, "F": 5.5, "I": 2.5, "K": 0.6, "O": 10, "V": 27, "Ø": 7},
    },
}


def rng(*parts):
    h = hashlib.md5("|".join(parts).encode()).hexdigest()
    return random.Random(int(h[:12], 16))


def dhondt(votes, seats):
    got = {p: 0 for p in votes}
    for _ in range(seats):
        best = max(votes, key=lambda p: (votes[p] / (got[p] + 1), votes[p]))
        got[best] += 1
    return got


def split_int(total, weights, r):
    """Fordel et heltal efter vægte, så summen passer præcist."""
    s = sum(weights) or 1
    raw = [total * w / s for w in weights]
    out = [int(x) for x in raw]
    rest = total - sum(out)
    order = sorted(range(len(raw)), key=lambda i: (raw[i] - out[i], r.random()), reverse=True)
    for i in order[:rest]:
        out[i] += 1
    return out


def build(k, eid, cfg):
    R21 = k["results"]["kv2021"]
    r = rng(k["id"], eid)
    base = cfg["base"]
    # andele: kommunens 2021-profil skubbet mod årets landsgennemsnit
    shares = {}
    for p in base:
        s21 = R21["votes"].get(p, 0) / R21["valid"] * 100 if R21["valid"] else 0
        ref = BASE_2021.get(p, base[p])
        if s21 > 0:
            val = s21 * (base[p] / ref) ** 0.85
        else:
            val = base[p] * r.uniform(0.5, 1.1)
        shares[p] = max(0.2, val * r.uniform(0.86, 1.14))
    tot = sum(shares.values())
    shares = {p: v / tot for p, v in shares.items()}

    electorate = int(round(R21["electorate"] * cfg["electorate_factor"] * r.uniform(0.985, 1.015)))
    turnout = min(88.0, max(48.0, R21["turnout"] + cfg["turnout_shift"] + r.uniform(-2.2, 2.2)))
    cast = int(round(electorate * turnout / 100))
    valid = int(round(cast * r.uniform(0.986, 0.993)))
    parties = list(shares)
    vlist = split_int(valid, [shares[p] for p in parties], r)
    votes = dict(zip(parties, vlist))
    mandates = dhondt(votes, k["seats"])

    # afstemningsområder: samme navne som 2021, tal der summerer til kommunen
    areas21 = R21["areas"]
    ew = [a["electorate"] * r.uniform(0.96, 1.04) for a in areas21]
    a_el = split_int(electorate, ew, r)
    a_cast = split_int(cast, [e * r.uniform(0.95, 1.05) for e in a_el], r)
    a_valid = split_int(valid, a_cast, r)
    per_party = {}
    for p in parties:
        w = []
        for a, c in zip(areas21, a_cast):
            local = (a["votes"].get(p, 0) / a["valid"]) if a["valid"] and a["votes"].get(p) else shares[p]
            w.append(c * (0.5 * local + 0.5 * shares[p]) * r.uniform(0.9, 1.1))
        per_party[p] = split_int(votes[p], w, r)
    areas = []
    for i, a in enumerate(areas21):
        av = {p: per_party[p][i] for p in parties}
        areas.append({"id": a["id"], "name": a["name"], "electorate": a_el[i], "cast": max(a_cast[i], sum(av.values())),
                      "valid": sum(av.values()), "votes": av})
    return {"electorate": electorate, "cast": cast, "valid": valid, "turnout": round(turnout, 1),
            "votes": votes, "mandates": mandates, "areas": areas}


def main():
    src = DATA.read_text(encoding="utf-8")
    m = re.search(r"window\.DATA\s*=\s*(\{.*\})\s*;?\s*$", src, re.S)
    data = json.loads(m.group(1))
    els = data["elections"]
    els["kv2021"]["prev"] = "kv2017"
    for eid, cfg in OLDER.items():
        els[eid] = {"name": cfg["name"], "date": cfg["date"], "prev": cfg["prev"]}
        for k in data["kommuner"]:
            k["results"][eid] = build(k, eid, cfg)
    # rækkefølge: nyeste først
    data["elections"] = {e: els[e] for e in ["kv2025", "kv2021", "kv2017", "kv2013"]}
    data["meta"]["older"] = "Kommunalvalg 2017 og 2013 er tilføjet af tools/add_older_elections.py (eksempeldata)"
    head = src[: m.start()]
    DATA.write_text(head + "window.DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    land = {e: sum(k["results"][e]["votes"].get("A", 0) for k in data["kommuner"]) for e in data["elections"]}
    print("Tilføjet kv2017 og kv2013 for", len(data["kommuner"]), "kommuner. Stemmer til A:", land)


if __name__ == "__main__":
    main()
