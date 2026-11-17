# Sammenlign, runde 10 (17. november 2026): ændringslog til rapporten

Version B (`?v=d`, js/app-d.js og css/style-d.css). Ændringen bygger direkte på pilottesten med P01 (Kristian, 16. november, bilag 14.2c) og er lavet efter iterationerne i afsnit 9.5. Alle tal er eksempeldata.

Figur: `docs/runde10/Bilagsfigur13_sammenlign_foer_efter.png` (før = commit cdedc33, som P01 testede; efter = runde 10). Enkeltbilleder ligger i samme mappe.

## Fra fund til ændring

| Fund i pilottesten / empirien | Belæg | Ændring i Sammenlign | Princip |
|---|---|---|---|
| Version B gav «for mange ting, jeg skal forholde mig til på én gang» | P01, 20:31–21:14 (afsnit 9.4) | Sammenlign er delt i tre trin – 1 Hvilket valg? 2 Hvad vil du sammenligne? 3 Hvilke områder? – i et panel til venstre. Kortet er fjernet fra Sammenlign. | Shneiderman: overblik → filter → detaljer i trin (afsnit 4.7) |
| Hent data blev rost, fordi valgene «popper op løbende» | P01, 34:16–34:33 | Samme mønster og samme knapper som Hent data (nummererede trin, type → år). Én måde at vælge på to steder. | P6 én funktion ét sted; genkendelighed |
| «Jeg vil bare vide, hvilket år jeg er i her» | P01, 27:42–27:46 | Valget står som et mørkt mærke øverst i svaret («Kommunalvalg 2025» eller «Kommunalvalg 2025 mod 2021») med valgdag(e) ved siden af. | Synlig status (P3) |
| T3 tog 128 sek. og 21 klik i B (25 sek. i A): Ishøj kunne ikke sammenlignes med Ishøj | Afsnit 9.4, figur 21 | Valgmuligheden «Udvikling over tid»: samme sted ved et tidligere valg af samme type. Svaret står i første sætning («9 af 15 mandater – 1 mandat færre end i 2021»). | Opgavebaseret indgang (P1) |
| At sammenligne (29) og at se udvikling over tid (18) er to forskellige formål | Spørgeskema, bilag 14.4c (K200) | Trin 2 skiller dem ad: «Kommuner side om side», «Regioner side om side», «Udvikling over tid». | Brugere skelnes ved, hvad de kommer for (U1) |
| Version A's Sammenlign («Vælg 2–3 områder») gav det bedste T2 | Afsnit 9.4 | 2–3 kommuner eller regioner med «+ Tilføj kommune» og fjern-knap. | Bevar det, der virker (P2) |
| Ugyldige sammenligninger: to ens år, region mod kommune, hele landet mod en kommune | Egen gennemgang 17.11 | Kan ikke vælges: trin 3 viser kun kommuner, kun regioner eller kun tidligere år af samme type. Gamle links rettes automatisk. | Fejlforebyggelse |

## Hvad der er ændret (teknisk)

* Tilstand i adressen: `cm` = `kom` / `reg` / `tid`, `omr`, `omr2`, `omr3`, `valg`, `valg2`. Gamle links (`omr2`, `valg2`) oversættes automatisk.
* Overskriften er «Sammenlign» – ingen sætning med felter i Sammenlign.
* Svaret: valgmærke, én sætning med det vigtigste, et lille kort pr. område (mandater og valgdeltagelse), Mandater/Stemmeandel, Størst først/A–Å, én tabel med en kolonne pr. område og «Forskel» (eller «Ændring» over tid).
* «Hent sammenligningen (Excel)» henter alle 2–3 kolonner.
* Mobil: trinene foldes sammen bag et resumé med «Ret» (fx «Hørsholm og Ishøj · Kommunalvalg 2025»).
* Desktop scroller ikke; på 1280×680 bliver rækkerne tættere, og i de længste lister kan tabellen scrolle internt.
* Søgning i Sammenlign: en kommune eller region kommer med, hvis den passer til valget i trin 2; ellers skifter trin 2.

## Betydning for testopgaverne

* **T2 (Hørsholm og Ishøj):** Sammenlign → «Kommuner side om side» → vælg Hørsholm og Ishøj (der kan søges) → «Hent sammenligningen (Excel)». Siden åbner på «Udvikling over tid» for hele landet, så trin 2 skal vælges.
* **T3 (Ishøj og 2021):** Uændret via Resultater → Ishøj → «Sammenlign med 2021», eller Sammenlign → «Udvikling over tid» → Ishøj. Svaret står i første sætning.
* T1, T4 og T5 er ikke berørt.

## Forslag til tekst i rapporten (afsnit 9.5, efter «Iterationer efter pilottesten»)

> Efter iterationerne var Sammenlign stadig en sætning med fire felter («Sammenlign [område] ved [valg] med [område] ved [valg]»), og den åbnede på samme valg i to områder. Min egen gennemgang viste, at det krævede, at brugeren selv regnede ud, hvordan felterne hang sammen, og at den kunne give ugyldige sammenligninger som en region mod en kommune. Sammenlign blev derfor bygget om efter samme mønster som Hent data, som P01 netop fremhævede, fordi valgene «popper op løbende» (P01, 34:16–34:33): tre trin – hvilket valg, hvad der skal sammenlignes, og hvilke områder – med svaret ved siden af (bilagsfigur 13). Trin 2 skiller de to formål ad, som spørgeskemaet viser (sammenligne 29, udvikling over tid 18), og «Udvikling over tid» løser det, P01 ikke kunne i T3: at sammenligne Ishøj med Ishøj på tværs af to valg. Valget står som et mærke over svaret, så det er tydeligt, hvilket år man ser (P01, 27:42–27:46). Kortet er fjernet fra Sammenlign for at mindske mængden af information på én gang (P01, 20:31–21:14; Shneiderman, 1996). Ændringen er ikke testet med brugere endnu og skal efterprøves med P02 og P03.

Bilagsfigur 13: Sammenlign før pilottesten (til venstre, commit cdedc33) og efter runde 10 (til højre) for T2 og T3. Egen figur, eksempeldata.
