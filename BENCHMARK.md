# Crown & Clash — Benchmark

> Wie gut ist das Spiel, gemessen an Hades / Skul / Vampire Survivors / LoL?
> Regeln stehen in `HANDOVER.md` §0.4. Kurzfassung:
>
> - Nach **jedem** abgeschlossenen Block neu bewerten.
> - Jede Wertung braucht **eine Begründungszeile**. Eine Zahl ohne Begründung ist wertlos.
> - **Nicht überschreiben** — neue Messung unten anhängen, damit die Zeitreihe sichtbar bleibt.
> - **Ehrlich sein.** Sinkt eine Wertung, schreib das hin. Der Wert dieses Dokuments liegt
>   allein darin, dass man ihm glauben kann.
> - Wertung 0–5, **5 = so gut wie das Referenzspiel**.

---

## Messung 001 — 2026-07-27 (Ausgangspunkt)

**Kontext:** Ende der Remote-Session. Systeme gehärtet (B1–B6 gefixt), Sivir als erster
Champion mit Build-Lanes, 42 Augments pensioniert. Spieltiefe fehlt weitgehend.

**Erhoben von:** Claude (Code-Audit + Headless-Messungen). ⚠️ **Ohne echten Playtest** —
die Wertungen zu Gefühl und Optik sind daher Schätzungen und beim ersten lokalen
Spieldurchlauf zu korrigieren.

### A · Build-Vielfalt & Entscheidungen (×3)

| # | Kriterium | Wert | Begründung |
|---|---|---|---|
| A1 | Pick verändert das Spielen, nicht nur Zahlen | **2** | Nur Sivir hat Kit-verändernde Augments; die anderen 25 Champions bekommen ausschließlich generische Procs |
| A2 | Picks, die ohne Build wertlos sind | **2** | Existiert exakt zweimal (Keen Edge, Hot Streak), beide bei Sivir |
| A3 | Zwei Runs fühlen sich verschieden an | **1** | Ohne champion-spezifische Picks konvergiert fast jeder Run auf dieselben starken Generics |
| A4 | Spürbarer „Build geht online"-Moment | **0** | Existiert nicht — keine Evolution, kein Schwellenwert, keine Verwandlung |
| A5 | Synergien erzeugen Kettenreaktionen | **1** | Fast alles addiert sich nur; einzige echte Kette ist die Speed-Lane (hastwerk→windvorteil→stepptaenzer) |
| A6 | Champions spielen sich grundverschieden | **2** | Kits unterscheiden sich auf dem Papier, aber alle laufen auf „Q zielen + Autos" hinaus |

### B · Optik & Impact (×2)

| # | Kriterium | Wert | Begründung |
|---|---|---|---|
| B1 | Eigener, wiedererkennbarer Effekt je Fähigkeit | **2** | 13 von 26 Champions hatten gar keine castVfx; die abgeleiteten sind Platzhalter |
| B2 | Treffer fühlen sich wuchtig an | **1** | Kein Hit-Stop, kaum Partikel, Shake nur vereinzelt konfiguriert |
| B3 | Man sieht sofort, was einen getroffen hat | **2** | Telegraphs existieren, aber Schadensquelle ist im Getümmel nicht lesbar |
| B4 | Gegner-Telegraphs eindeutig und einheitlich | **3** | Handgezeichnet pro Fähigkeit, dadurch uneinheitlich — aber vorhanden und meist klar |
| B5 | HUD zeigt Build-Zustand auf einen Blick | **1** | Aktive Buffs unsichtbar, keine Synergie-Anzeige, Build nur im Extra-Screen |
| B6 | Kunststil konsistent | **3** | 16-bit-Maps + 64px-Champions passen zusammen; VFX fallen stilistisch ab |

### C · Progression & Lernkurve (×2)

| # | Kriterium | Wert | Begründung |
|---|---|---|---|
| C1 | Neuer Spieler versteht die Grundlagen | **1** | Kein Onboarding, keine Erklärung, keine Tooltips beim ersten Einsatz |
| C2 | Gründe, nochmal zu spielen | **0** | Keine Meta-Progression, keine Unlocks, keine Statistik-Historie |
| C3 | Schwierigkeit steigt spürbar | **2** | Runden-Skalierung existiert, aber ohne erkennbare Dramaturgie |
| C4 | Können schlägt Glück | **2** | Skillshots belohnen Zielen, aber Augment-Glück dominiert das Ergebnis |
| C5 | Niederlagen fühlen sich fair an | **2** | Ein nachweislich unausweichlicher Gegner-Dash wurde gerade gefixt; die übrigen Fähigkeiten sind **ungeprüft** |

### D · Korrektheit & Handwerk (×1)

| # | Kriterium | Wert | Begründung |
|---|---|---|---|
| D1 | Beschreibung = Wirkung | **4** | Kit-Texte werden generiert (B6 gefixt); Item-/Augment-Texte noch handgetippt |
| D2 | Jedes Augment nachweislich wirksam | **2** | 92 PASS / 0 FAIL / **52 unbeurteilt** — die Abdeckung fehlt, nicht die Funktion |
| D3 | Winrates im Zielkorridor | **1** | Nie gemessen — Sim-Harness existiert nicht |
| D4 | Keine Konsolenfehler, keine Leaks | **5** | `npm run verify` grün in WebGL + Canvas, Leak-Check aktiv |

### Gesamtscore

```
A: (2+2+1+0+1+2) =  8 × 3 = 24
B: (2+1+2+3+1+3) = 12 × 2 = 24
C: (1+0+2+2+2)   =  7 × 2 = 14
D: (4+2+1+5)     = 12 × 1 = 12
                          -------
                      GESAMT 74 / 275   (27 %)
```

**Schwächste Achse: A4 (0) und C2 (0)** — es gibt weder einen Moment, in dem der Build
zündet, noch einen Grund, den nächsten Run zu starten. Das sind laut Recherche genau die
zwei Dinge, die das Genre trägt.

---

## Sim-KPIs

| KPI | Ziel | Messung 001 |
|---|---|---|
| Pick-Diversität | > 80 % | **nicht gemessen** |
| Auto-Pick-Rate | < 3× | **nicht gemessen** |
| Build-Streuung | > 60 % | **nicht gemessen** |
| Winrate-Spread | < 20 pp | **nicht gemessen** |
| Rundendauer (Median) | 30–60 s | **nicht gemessen** |
| Treffer-frei-Quote | 0 < x < 30 % | **nicht gemessen** |
| Ungenutzt-Quote | 0 | **nicht gemessen** |

> Alle sieben sind blind, weil `scripts/sim.mjs` nie geliefert wurde. **Das ist der
> Grund, warum M2 in der Roadmap vor allem anderen Inhaltlichen steht.**

---

## Messung 002 — (nächster Agent trägt hier ein)

Vorlage: Kontext · Erhoben von · Tabellen A–D mit Begründungen · Gesamtscore ·
Sim-KPIs · **Was sich gegenüber der Vormessung verändert hat und warum.**
