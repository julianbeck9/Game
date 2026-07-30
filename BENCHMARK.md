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

## Messung 002 — 2026-07-27 (erster echter Spieldurchlauf)

**Kontext:** Erste lokale Session. Code unverändert gegenüber Messung 001 (Commit
`8a6e1ed`) — **alle Änderungen an dieser Tabelle kommen aus Beobachtung, nicht aus
neuem Code.** Gespielt wurde Sivir über den normalen Ablauf (Menü → Start-Shop →
Runde 1–3 → Pick → Shop) plus 12 kurze Kontrollläufe über die Runden 1–6.

**Erhoben von:** Claude, per Playwright-gesteuertem Spieldurchlauf mit echten
Eingaben (WASD, Q/E/Space, Mausziel) und Screenshots an jedem Szenenwechsel.

> ⚠️ **Belastbarkeit dieser Messung — bitte mitlesen.**
> Der In-App-Browser war in dieser Session nicht sichtbar; ohne Kompositing feuert
> `requestAnimationFrame` **gar nicht**, das Spiel steht still. Gespielt wurde daher in
> **headless Chromium mit 26 Frames/s statt 60**.
> Folge: **Wucht und Spielgefühl sind hier nicht ehrlich bewertbar** — Hit-Stop, Shake und
> Animationsfluss lassen sich bei 26 fps nicht beurteilen. Diese Kriterien (B2, teilweise
> C4) stehen unverändert aus Messung 001 und sind unten als *unverifiziert* markiert statt
> geraten. Optik, Lesbarkeit, Textinhalt, HUD-Inhalt und Verhalten der Gegner-KI sind
> dagegen aus Standbildern und Zustandsdaten sehr wohl beurteilbar — dort stehen die
> Änderungen. **Ein Playtest durch den Besitzer ersetzt B2/C4 sofort durch etwas
> Belastbares.**
>
> **Korrektur (nachgemessen in Messung 003):** Hier stand ursprünglich, die Spieluhr laufe
> headless auf ⅓ Echtzeit — das ist **falsch**, und die entsprechende Warnung in
> HANDOVER §0.3 gilt so nicht. Direkt gemessen: die Arena-Uhr rückt in 12 000 ms Wandzeit
> um genau 12 000 ms vor. Niedrig ist nur die *Framerate* (26 statt 60), und `dt` wird erst
> ab 50 ms gekappt — bei 38 ms pro Frame greift die Deckelung nicht. **Zeitmessungen wie
> Rundendauer sind damit gültig**, nur eben in gröberen Schritten simuliert. Betroffen ist
> allein alles, was pro Frame wahrgenommen wird.

### A · Build-Vielfalt & Entscheidungen (×3)

| # | Kriterium | 001 | **002** | Begründung |
|---|---|---|---|---|
| A1 | Pick verändert das Spielen | 2 | **2** | Bestätigt am konkreten Angebot in Runde 2: *Bitter Cold* (+21 % auf bestehende Slows), *Daring* (künftige Angebote ein Tier höher), *Free Run* (+70 % Speed außerhalb des Kampfes). Keiner der drei ändert, wie Sivir gespielt wird |
| A2 | Picks, die ohne Build wertlos sind | 2 | **2** | Unverändert — aber mit wichtiger Beobachtung: *Bitter Cold* ist für Sivir tot, weil ihr Kit **keinen Slow** enthält. Das ist ein **versehentlich** toter Pick, nicht die gewollte Build-Wette wie bei Keen Edge. Zählt nicht als Erfüllung des Kriteriums |
| A3 | Zwei Runs fühlen sich verschieden an | 1 | **1** | Unverändert. Evidenz dünn (ein Teil-Run + 12 Kurzläufe), aber der Pool ist derselbe generische |
| A4 | „Build geht online"-Moment | 0 | **0** | Nichts dergleichen beobachtet |
| A5 | Synergien erzeugen Kettenreaktionen | 1 | **1** | Unverändert |
| A6 | Champions grundverschieden | 2 | **2** | *Unverifiziert* — nur Sivir gespielt. Wert aus 001 übernommen, nicht neu belegt |

### B · Optik & Impact (×2)

| # | Kriterium | 001 | **002** | Begründung |
|---|---|---|---|---|
| B1 | Eigener Effekt je Fähigkeit | 2 | **2** | Sivirs Q ist sichtbar eigen (rotierende Klinge, Rückflug, Kreuz-Blitz beim Treffer). Bleibt bei 2, weil nur ein Champion gesehen |
| B2 | Treffer fühlen sich wuchtig an | 1 | **1** | ⚠️ *unverifiziert* — bei 26 statt 60 Ticks/s sind Hit-Stop und Shake nicht beurteilbar. Wert unverändert aus 001 übernommen |
| B3 | Man sieht sofort, was einen getroffen hat | 2 | **1 ↓** | **Verschlechtert nach Beobachtung.** Die Champions sind auf 1600×900 nur ~28 px hoch und verschwinden regelrecht in den sehr detailreichen, kontraststarken Karten (Void-Map: leuchtende Blitze, Freljord: Eiszacken). Ich habe die eigene Figur in den Screenshots wiederholt suchen müssen. Schadenszahlen existieren (z. B. „41"), sind aber genauso klein |
| B4 | Gegner-Telegraphs eindeutig | 3 | **3** | Bestätigt — der rote Telegraph-Kreis war in jedem Kampfbild das **am besten lesbare** Element überhaupt. Klar der stärkste Punkt der Kampfoptik |
| B5 | HUD zeigt Build-Zustand | 1 | **1** | Bestätigt: HUD zeigt Runde, Gold, Kartenname, 3 Fähigkeiten-Buttons. Kein Buff, keine Restdauer, kein Build-Zustand |
| B6 | Kunststil konsistent | 3 | **3** | Die Karten sind hervorragend und untereinander stimmig. Der Bruch liegt zwischen gemalter High-Detail-Karte und einfachem Pixel-Sprite — das hält die Wertung bei 3 |

### C · Progression & Lernkurve (×2)

| # | Kriterium | 001 | **002** | Begründung |
|---|---|---|---|---|
| C1 | Neuer Spieler versteht die Grundlagen | 1 | **1** | Bestätigt: kein Onboarding. Verschärfend: die Kit-Texte enthalten zu 97 % interne Regieanweisungen („[blue shield outline]", B10) — der einzige Erklärtext, den es gibt, verwirrt zusätzlich. Dass Autoangriffe **nur im Stehen** feuern, wird nirgends gesagt |
| C2 | Gründe, nochmal zu spielen | 0 | **0** | Unverändert |
| C3 | Schwierigkeit steigt spürbar | 2 | **2** | Gegnerzahl skaliert messbar (r1–2: 1 Gegner, r3: 2, r5–6: 3). Dramaturgie darüber hinaus nicht erkennbar |
| C4 | Können schlägt Glück | 2 | **2** | *Unverifiziert* bei ⅓-Uhr. Wert aus 001 übernommen |
| C5 | Niederlagen fühlen sich fair an | 2 | **1 ↓** | **Verschlechtert.** Neuer Befund B9: in 7 von 12 Kontrollläufen blieb mindestens ein Gegner weit außerhalb seiner Reichweite **bewegungslos** stehen (6× exakt 0 px in 20 s), 2× hing die Runde vollständig. Die Runde endet erst, wenn alle Gegner tot sind — der Spieler **muss** also auf das Terrain des Gegners laufen. Dort starb Sivir aus dem Stand in 16 s von 185 auf 0 HP. Bei einem Leben pro Run ist das keine faire Niederlage, sondern eine erzwungene |

### D · Korrektheit & Handwerk (×1)

| # | Kriterium | 001 | **002** | Begründung |
|---|---|---|---|---|
| D1 | Beschreibung = Wirkung | 4 | **3 ↓** | Die *Zahlen* stimmen weiterhin (B6-Fix trägt, `describe.ts` generiert aus `spec.q`). Aber 97 von 100 Fähigkeitstexten liefern interne VFX-Notizen an den Spieler aus (B10), und der Shop bietet AP-Items an rein-AD-Champions an (B11) — die Karte verspricht dort etwas, das dieser Champion nicht einlösen kann |
| D2 | Jedes Augment nachweislich wirksam | 2 | **2** | Unverändert (92 PASS / 0 FAIL / 52 unbeurteilt) — diese Session hat nichts daran gemessen |
| D3 | Winrates im Zielkorridor | 1 | **1** | Unverändert — Sim-Harness weiterhin nicht gebaut (M2) |
| D4 | Keine Konsolenfehler, keine Leaks | 5 | **5** | **Unabhängig bestätigt:** 0 Konsolenfehler und 0 `pageerror` über den kompletten Spieldurchlauf, 12 Kontrollläufe und 3 Diagnoseläufe |

### Gesamtscore

```
A: (2+2+1+0+1+2) =  8 × 3 = 24   (=)
B: (2+1+1+3+1+3) = 11 × 2 = 22   (24 -> 22)
C: (1+0+2+2+1)   =  6 × 2 = 12   (14 -> 12)
D: (3+2+1+5)     = 11 × 1 = 11   (12 -> 11)
                          -------
                      GESAMT 69 / 275   (25 %)     vorher 74 / 275 (27 %)
```

**Was sich verändert hat und warum:** Der Score **sinkt um 5 Punkte** — ohne dass eine
Zeile Code schlechter geworden wäre. Messung 001 war ein Code-Audit; sie konnte nicht
sehen, dass die Figuren in den Karten untergehen (B3), dass Gegner sich festfahren und
Runden hängen lassen (C5) und dass fast jeder Fähigkeitstext interne Notizen ausliefert
(D1). Das ist genau der Effekt, den §0.4 erwartet: die erste ehrliche Messung fällt
schlechter aus als die geschätzte.

**Unverändert stärkster Punkt:** D4 (5) und die Kartenkunst. **Schwächste Achse bleibt A**
mit 8/30 — und A4/C2 stehen weiter auf 0.

**Drei neue Bugs aus dieser Session:** B9 (Gegner-Deadlock, gravierend), B10
(VFX-Regieanweisungen im Spielertext), B11 (AP-Items für AD-Champions) — Details in
`BUGS.md`.

### Sim-KPIs — Messung 002

| KPI | Ziel | 001 | **002** |
|---|---|---|---|
| Pick-Diversität | > 80 % | nicht gemessen | **nicht gemessen** (M2 offen) |
| Auto-Pick-Rate | < 3× | nicht gemessen | **nicht gemessen** (M2 offen) |
| Build-Streuung | > 60 % | nicht gemessen | **nicht gemessen** (M2 offen) |
| Winrate-Spread | < 20 pp | nicht gemessen | **nicht gemessen** (M2 offen) |
| Rundendauer (Median) | 30–60 s | nicht gemessen | **nicht belastbar** — bei ⅓-Uhr sinnlos zu extrapolieren |
| Treffer-frei-Quote | 0 < x < 30 % | nicht gemessen | **nicht gemessen** |
| Ungenutzt-Quote | 0 | nicht gemessen | **nicht gemessen** |
| *(neu)* **Deadlock-Quote** | 0 % | — | **17 %** (2/12 Läufe hingen vollständig; 58 % hatten mindestens einen bewegungslosen Fern-Gegner) |

> Die sieben ursprünglichen KPIs bleiben blind — `scripts/sim.mjs` ist weiterhin nicht
> gebaut. **Wichtig für M2:** Der neue Deadlock-Befund (B9) heißt, dass ein Sim-Lauf ohne
> Timeout-Abbruch an genau dieser Stelle hängen bleibt. B9 gehört vor oder mit M2 gefixt,
> sonst misst die Harness Hänger statt Balance.

---

## Messung 003 — 2026-07-30 (nach B9/B10/B11)

**Kontext:** Erster Code-Block dieser Session. Gefixt: **B9** (Gegner-Deadlock — echte
Navigation per Flow-Field, Begehbarkeits-Prüfung inkl. `air`-Layer, Spawn-Validierung,
Wedge-Restnetz), **B10** (VFX-Regieanweisungen im Spielertext), **B11** (AP-Items für
AD-Champions). Neu gefunden und offen: **B12** (Start-Shop bietet fast nur Stiefel).
Nebenbei reparierte Werkzeuge: `npm run verify` lief lokal überhaupt nicht durch (4 von 8
Testdateien starben an Vitests fest verdrahtetem 60-s-Worker-Timeout, weil
`champions/registry.ts` Phaser als *Wert* importierte, obwohl nur der Typ gebraucht wird).

**Erhoben von:** Claude. Rubrik-Werte nur dort geändert, wo diese Session etwas belegt
hat; alles andere steht unverändert aus Messung 002 — inklusive der ⚠️-Einschränkung
dort, dass headless bei 26 statt 60 Ticks/s **keine** ehrliche Aussage über Wucht und
Spielgefühl erlaubt (B2, C4 weiterhin *unverifiziert*).

### Geänderte Kriterien

| # | Kriterium | 002 | **003** | Begründung |
|---|---|---|---|---|
| C5 | Niederlagen fühlen sich fair an | 1 | **3 ↑** | Die erzwungene Niederlage ist weg. Gegner navigieren jetzt um Geometrie herum, statt sich festzufahren: 8/8 Verify-Läufe grün (vorher fielen 2/6 bzw. 2/5 durch), 0 Deadlocks in zwei unabhängigen 18er-Serien, und ein gescripteter Run kommt in Runde 3 zu einem Ergebnis statt 3,5 Minuten zu hängen. **Nicht 4 oder 5**, weil der andere Teil von M5 offen bleibt: die Vermeidbarkeits-Tabelle über alle Gegner-Fähigkeiten existiert nicht, und aus dem Stand sterben ist weiterhin schnell |
| D1 | Beschreibung = Wirkung | 3 | **4 ↑** | B10 gefixt: 0 von 100 Fähigkeitstexten enthalten noch interne Klammern (Test über alle 26 Champions). B11 gefixt: der Shop bietet keine AP-only-Items mehr an rein-AD-Champions. Kein 5, weil Item- und Augment-Texte weiter handgetippt sind |
| D2 | Jedes Augment nachweislich wirksam | 2 | **2** | unverändert — diese Session hat daran nichts gemessen |
| D3 | Winrates im Zielkorridor | 1 | **2 ↑** | Erstmals **überhaupt** gemessen (`npm run sim`, 40 Läufe): echte Winrates gibt es noch nicht, weil kein Lauf gewonnen wird, aber der Proxy „Median erreichte Runde" streut von 2 (Lux) bis 13 (Master Yi) — Faktor 6,5. Kein 3, weil die Zahl vom Bot mitbestimmt wird und je Champion nur 5 Läufe dahinterstehen |
| D4 | Keine Konsolenfehler, keine Leaks | 5 | **5** | gehalten, jetzt mit strengerem Gate: `verify` prüft zusätzlich, dass kein Gegner ausserhalb seiner Reichweite stehen bleibt |

### Gesamtscore

```
A: (2+2+1+0+1+2) =  8 × 3 = 24   (=)
B: (2+1+1+3+1+3) = 11 × 2 = 22   (=)
C: (1+0+2+2+3)   =  8 × 2 = 16   (12 -> 16)
D: (4+2+2+5)     = 13 × 1 = 13   (11 -> 13)
                          -------
                      GESAMT 75 / 275   (27 %)     vorher 69 / 275 (25 %)
```

**Was sich verändert hat und warum:** +6 Punkte aus C5, D1 und D3 — also ausschliesslich
aus Korrektheit und Messbarkeit, **nicht** aus Spieltiefe. **Achse A steht unverändert bei
8/30**, A4 und C2 weiterhin auf 0. Das ist zu erwarten: dieser Block war Reparatur und
Werkzeugbau, kein Inhalt. Der Score liegt damit knapp über Messung 001 (74) — aber es ist
jetzt eine *gemessene* 75 statt einer geschätzten 74, und die Systeme darunter halten.

**Für M2 wichtig:** Der Blocker ist weg. Ein Sim-Lauf hängt nicht mehr an Runde-3-artigen
Deadlocks, die KPI-Messung kann also gebaut werden, ohne Hänger statt Balance zu messen.

### Sim-KPIs — Messung 003 (erstmals gemessen)

`scripts/sim.mjs` existiert jetzt (`npm run sim`). Der gescriptete Spieler
(`src/core/autopilot.ts`) spielt über dieselben drei Bedienelemente wie ein Mensch
(Bewegungsvektor, `castQ`/`castE` mit Zielrichtung, `dash`) — er kann also nichts, was
ein Spieler nicht könnte. Tempo kommt von `__CC.stepMs`, das Phasers eigene
Step-Funktion mit synthetischer Uhr treibt (~40× schneller als Echtzeit).

**Basis: 40 Läufe, 8 Champions × 5, 210 Runden, 0 Konsolenfehler.**

| KPI | Ziel | **003** | Belastbar? |
|---|---|---|---|
| Pick-Diversität | > 80 % | **65 %** (73 von 112 Augments mind. 1× gewählt) | Teilweise — weiterhin nach unten verzerrt, weil die Hälfte der Läufe vor Runde 4 endet |
| Auto-Pick-Rate | < 3× | **4,5×** | ja — und **über Ziel**: das häufigste Augment wird 4,5× so oft genommen wie der Median |
| Build-Streuung | > 60 % | **97 %** | ⚠️ **wertlos** — Builds bestehen aus 2–4 Augments, da überlappt fast nichts. Der Wert wird erst aussagekräftig, wenn Läufe 6/6 Slots füllen |
| Winrate-Spread | < 20 pp | **0 pp** | ⚠️ **wertlos** — der Spread ist 0, weil **kein einziger Lauf gewonnen wurde**. Ein „erfülltes" Ziel ohne jede Aussage |
| Rundendauer (Median) | 30–60 s | **17 s** | ja — und **klar unter Ziel**, gut halb so lang wie gewollt |
| Treffer-frei-Quote | 0 < x < 30 % | **nicht gemessen** | Vorrichtung fehlt noch (gehört zu M5) |
| Ungenutzt-Quote | 0 | **39 von 112** | siehe Pick-Diversität |
| **Deadlock-Quote** | 0 % | **0 %** | ja (0/15 und 0/10 auswertbare Läufe, 8/8 Verify grün) |
| *(neu)* **Hänger-Runden** | 0 % | **5,2 %** (11 von 210) | Runden, die der Bot in 90 s Spielzeit nicht räumen konnte — **nicht** B9, sondern Bot-Schwäche |

> ⚠️ **Die wichtigste Zahl steht nicht in der Tabelle: kein Lauf wurde gewonnen,
> Median Runde 3, weitester Lauf Runde 19.** Damit gilt weiter die Warnung aus HANDOVER M2 — *„wenn er zu schlecht
> spielt, misst du seine Inkompetenz statt deiner Balance."* Winrate-KPIs sind deshalb
> vorerst nicht verwendbar, und Pick-Diversität ist nach unten verzerrt. Verwendbar sind
> **Rundendauer**, **Auto-Pick-Rate** und die **Deadlock-/Hänger-Quoten**.
>
> **Stepper gegen Echtzeit geprüft** (`npm run sim -- --validate`, 4 Läufe je Modus):
> Median-Rundendauer 7 000 ms gesteppt vs. 6 283 ms in Echtzeit → **10 % Drift**, identische
> Median-Runde (3), Überlebensquote 85 % vs. 73 %. Für Rundendauer und Pick-Abdeckung
> brauchbar; **für Balance-Entscheidungen ist die Stichprobe zu klein** — vor O1 gehört das
> mit deutlich mehr Läufen wiederholt.
>
> **Nächster Schritt für M2 ist damit nicht mehr die Harness, sondern der Bot.** Erst wenn
> der Autopilot Runde 20 überhaupt erreichen kann, tragen Winrate und Pick-Diversität eine
> Aussage.
>
> **Was den Bot bisher gebessert hat** (jeweils gemessen): Der Harness kaufte anfangs
> **gar nichts** ein — der Bot ging mit hunderten ungenutztem Gold und null Items in
> Runde 5. Das war kein Balance-Befund, sondern ein Handicap, das kein Spieler hinnähme.
> Mit Einkaufen stieg der Median von Runde 3 auf 5 und das Maximum von 9 auf 15; mit
> zusätzlich besserem Zielen (schwächstes Ziel in Reichweite statt nächstem),
> Hazard-Vermeidung und Rückzug bei wenig HP stieg das Maximum auf 19 und die
> Pick-Diversität von 40 % auf 65 %.
>
> ### 🔴 Erster echter Balance-Befund: die Champion-Spreizung ist gewaltig
>
> Auch ohne Winrates ist „bis zu welcher Runde kommt dieser Champion" ein brauchbarer
> Proxy — und der streut um mehr als das Sechsfache:
>
> | Champion | Median erreichte Runde |
> |---|---|
> | **Master Yi** | **13** |
> | Warwick | 6 |
> | Blitzcrank | 5 |
> | Sivir · Fizz · Zac · Karthus | 3 |
> | **Lux** | **2** |
>
> Master Yi kommt mit demselben Bot rund **6,5× so weit wie Lux**. Bei je 5 Läufen ist das
> noch keine belastbare Winrate, aber die Größenordnung ist zu groß für Rauschen — und es
> ist die erste Zahl, die zu D3 überhaupt etwas sagt. Für O1 (Balance) gehört das mit
> deutlich mehr Läufen je Champion wiederholt.

---

## Messung 004 — 2026-07-30 (M3 Roster + M4 Karthus)

**Kontext:** Erster Inhalts-Block dieser Session, nicht mehr Reparatur.
**M3:** Roster auf 8 Champions eingedampft, die anderen 18 **ausgeblendet, nicht gelöscht**
(Kits, Sprites, Specs unverändert; ein Test beweist es). Auswahlbildschirm neu gesetzt.
**M4 (1 von 7):** Karthus vollständig auf das mit dem Besitzer abgestimmte Design gebaut
und 11 Champion-Augments über 4 Lanes dazu.

**Erhoben von:** Claude. Headless wie zuvor — die ⚠️-Einschränkung aus Messung 002 gilt
unverändert (B2, C4 bleiben *unverifiziert*, dafür braucht es einen Playtest).

### Geänderte Kriterien

| # | Kriterium | 003 | **004** | Begründung |
|---|---|---|---|---|
| A1 | Pick verändert das Spielen | 2 | **3 ↑** | Karthus' Augments ändern, *was eine Fähigkeit tut*: Perfect Pitch macht Lay Waste bei genau einem Ziel stärker und bei mehreren schwächer, Cold Read verlangt zwei Casts auf dasselbe Ziel, Scorched Earth macht aus dem Dash ein Zonenwerkzeug. **Kein 4**, weil erst 2 der 8 Champions solche Picks haben — 6 bekommen weiterhin nur generische Procs |
| A2 | Picks, die ohne Build wertlos sind | 2 | **3 ↑** | Unbroken Hymn und Black Lung tun **nichts**, solange Defile aus bleibt — dieselbe bewusste Wette wie Keen Edge bei Sivir, jetzt zum zweiten Mal und in einer anderen Achse (Stance statt Shop-Stat) |
| A3 | Zwei Runs fühlen sich verschieden an | 1 | **2 ↑** | Für Karthus gibt es jetzt 4 Lanes, die sich widersprechen (Präzision will genau ein Ziel, Zone will viele). Nur +1, weil das für 6 Champions weiterhin nicht gilt |
| A5 | Synergien erzeugen Kettenreaktionen | 1 | **2 ↑** | Cold Read markiert und der *nächste* Q auf dasselbe Ziel zündet; Encore verwandelt die 4 Sekunden nach dem Todesstoß in die stärkste Phase des Runs. Echte Ketten statt Addition, aber bisher nur bei einem Champion |
| A6 | Champions spielen sich grundverschieden | 2 | **3 ↑** | Karthus spielt sich nachweislich anders: gezielte Kreise mit Zündverzögerung statt Auto-Ziel, eine Aura als Dauer-Entscheidung mit Selbstkosten, und ein Passiv, das den Todesstoß in eine 4-Sekunden-Zugabe verwandelt |
| C5 | Niederlagen fühlen sich fair an | 3 | **3** | unverändert. B9 hat in dieser Session **einmal in 13 Läufen** noch zugeschlagen; dagegen steht jetzt eine Leine (siehe unten), aber die Vermeidbarkeits-Tabelle aus M5 fehlt weiter |

### Gesamtscore

```
A: (3+3+2+0+2+3) = 13 × 3 = 39   (24 -> 39)
B: (2+1+1+3+1+3) = 11 × 2 = 22   (=)
C: (1+0+2+2+3)   =  8 × 2 = 16   (=)
D: (4+2+2+5)     = 13 × 1 = 13   (=)
                          -------
                      GESAMT 90 / 275   (33 %)     vorher 75 / 275 (27 %)
```

**Was sich verändert hat und warum:** +15 Punkte, **alle aus Achse A** — zum ersten Mal in
dieser Zeitreihe bewegt sich die Priorität 1 des Besitzers statt nur die Korrektheit.
Ursache ist ausschliesslich Karthus: ein zweiter Champion mit widersprüchlichen Lanes
hebt A1/A2/A3/A5/A6 je um einen Punkt.

**Ehrlich zur Grenze dieser Wertung:** Das ist eine Aussage über das *System*, nicht über
den Roster. 2 von 8 Champions haben Tiefe, 6 nicht. Wenn M4 für die restlichen 6 nicht
kommt, ist diese 39 zu hoch angesetzt — dann fällt A wieder. **A4 steht weiter auf 0**
(kein „Build geht online"-Moment) und **C2 auf 0** (kein Grund für den nächsten Run); das
bleiben die zwei schwächsten Punkte des ganzen Dokuments.

### Nachgemessen in diesem Block

- **Death Defied funktioniert wie entworfen** (headless, mit Negativkontrolle): tödlicher
  Treffer → 1 HP, am Leben, immun für 4 s; ein zweiter Treffer währenddessen tut nichts;
  nach 4,5 s tot; im nächsten Run wieder verfügbar; innerhalb eines Runs nur einmal.
  Sivir (ohne `onLethal`) stirbt beim ersten Treffer sofort.
- **Karthus im Sim:** Rundendauer fiel von 34 s auf 17 s, nachdem der gescriptete Spieler
  die Zündverzögerung vorhält und Defile als Stance behandelt. Er kommt trotzdem nur bis
  Runde 1–3 — mit 190 max HP und einer Aura, die eigenes Leben kostet, ist er ein
  Glaskanonen-Champion, den der Bot schlecht spielt. **Das ist Bot-Schwäche, keine
  Balance-Aussage** — dieselbe Stelle, an der auch Lux (Median Runde 2) hängt.
- **B9-Restfall geschlossen:** Ein Gegner, der alle sieben Ausweichrichtungen durchprobiert
  hat, ohne Boden gutzumachen, wird jetzt auf einen erreichbaren Platz versetzt. Sichtbarer
  Sprung, aber besser als ein toter Run.

---

## Messung 005 — 2026-07-30 (M4 Blitzcrank)

**Kontext:** Zweiter Champion aus M4. Rocket Grab ist jetzt ein echter Skillshot statt
einer Ziel-Automatik, dazu 9 Champion-Augments über 4 Lanes (Hook · Fist · Field · Grit).

### Geänderte Kriterien

| # | Kriterium | 004 | **005** | Begründung |
|---|---|---|---|---|
| A6 | Champions spielen sich grundverschieden | 3 | **4 ↑** | Blitzcrank ist der erste Champion, dessen stärkste Taste den Gegner **bewegt** statt ihm zu schaden — und der Haken kann jetzt danebengehen. Damit gibt es drei klar unterschiedliche Spielweisen (Marksman · Zonen-Caster · Haken-Zieher) statt „Q zielen + Autos" |
| C4 | Können schlägt Glück | 2 | **3 ↑** | Zwei der acht Champions haben jetzt eine Taste, die man **verfehlen** kann und deren Treffer den Run trägt: Karthus' Zündverzögerung und Blitzcranks Haken. Vorher zielte man zwar, aber die wichtigsten Effekte trafen automatisch. Noch *unverifiziert* im Gefühl (26 fps), aber die Mechanik ist belegt: `onDash` sucht das erste Ziel im Korridor, ein Fehlschuss kostet trotzdem den Cooldown |

### Gesamtscore

```
A: (3+3+2+0+2+4) = 14 × 3 = 42   (39 -> 42)
B: (2+1+1+3+1+3) = 11 × 2 = 22   (=)
C: (1+0+2+3+3)   =  9 × 2 = 18   (16 -> 18)
D: (4+2+2+5)     = 13 × 1 = 13   (=)
                          -------
                      GESAMT 95 / 275   (35 %)     vorher 90 / 275 (33 %)
```

**Stand M4: 3 von 8 Champions** (Sivir, Karthus, Blitzcrank) haben Lanes; 5 fehlen
(Fizz, Zac, Lux, Master Yi, Warwick). **A4 und C2 stehen weiterhin auf 0** — daran hat
diese Session nichts geändert, und sie bleiben die zwei schwächsten Punkte des Dokuments.

**Sim:** Blitzcrank kommt bis Runde 9 (Median 3,5), Rundendauer 18 s, 0 Konsolenfehler.
