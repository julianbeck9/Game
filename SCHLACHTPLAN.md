# Lyareth — Schlachtplan

> Stand: 2026-10-08. Dieser Plan ersetzt DEVPLAN.md und Teil 3 der HANDOVER als
> **aktuelle Arbeitsgrundlage**. Er wird von vorne bis hinten abgearbeitet, ohne
> nach jedem Schritt anzuhalten. Pro Phase gilt: `npm run verify` grün → Commit →
> Push → drei Zeilen Bericht → nächste Phase.

---

## 1 · Die Design-Philosophie (aus deinen eigenen Sätzen abgeleitet)

| # | Leitsatz | Woher ich das habe |
|---|---|---|
| L1 | **Entscheidungen sind Verben, keine Zahlen.** Ein Pick ändert, *wie* du spielst. Procs und %-Boni zählen nicht als Entscheidung. | „augments die das gameplay stark ändern genauso wie bei den items" · „mehrere Paar Boots geben keinen Sinn" |
| L2 | **Was du siehst, ist was trifft.** Die Hitbox ist die Wahrheit, die Animation zeigt sie. Fähigkeiten sind Objekte in der Welt, keine Kreise. | „orientier dich an Sivir, da ist wirklich ein visueller Bumerang, die anderen sind nur dumme Kreise" · „arbeite mit Hitboxen und leg die Animationen drüber" |
| L3 | **Schaden ist dein Fehler.** Skill statt Stat-Check: jeder Angriff ist lesbar und ausweichbar. Viele lesbare Gegner, seltene schwere Bosse. | „generische Gegner mit sehr lesbaren Attacken … mehr Skill als Stat-Check" · „alle sind melee, also bekommt man immer Schaden" |
| L4 | **Wenig, aber schwer.** Knappe Ressourcen machen jede Wahl gewichtig. | „Health als Pool über den ganzen Run" · „Revive einmalig und stark" · „weniger, aber bedeutendere Augments" |
| L5 | **Spürbar oder nicht vorhanden.** Was man nicht in Sekunden sieht oder fühlt, existiert nicht. | „ich spür noch keine Änderungen" · „Impact außer einer Zahl, das hat man am meisten mit Animationen" |
| L6 | **Der Build ist ein Ziel.** Frühe Picks machen spätere besser; zwei Runs desselben Champions gehen auseinander. | „es gibt keine Builds" |
| L7 | **Eigene Identität.** Weg von League, eigene Champions, eigene Welt. | Roster-Tausch, Name Lyareth |

**Priorität bleibt:** 1. Spaß (L1, L3, L4, L6) → 2. Optik/Impact (L2, L5) → 3. Balance.

---

## 2 · Wo Lyareth im Genre steht

Lyareth ist strukturell **Brotatos Makro-Schleife** (Arena-Wellen, Shop dazwischen)
mit **Hades' Mikro-Schleife** (Action-Kampf mit Dash und Fähigkeiten) und
**Slay the Spires Einsatz** (Lebenspunkte über den ganzen Run).
Die drei Spiele lösen genau die Probleme, die du meldest — mit konkreten Mechaniken:

| Spiel | Mechanik | Was sie löst | Für Lyareth |
|---|---|---|---|
| **Hades** | Segen hängen an einem Slot (Angriff/Spezial/Dash …). Ein zweiter Segen für denselben Slot *ersetzt* den ersten. | Jede Wahl ist eine Gabelung, kein Stapeln (L1) | Slot-Augments |
| **Hades** | Duo-Segen: belohnt die Kombination zweier Götter | Build hat ein Ziel (L6) | Pfad-Kreuzungen |
| **Hades** | Jeder Gegnerangriff hat einen Anlauf; man sieht die Tür-Belohnung vorher | Schaden ist vermeidbar (L3); du steuerst den Build | Wind-ups, Belohnungs-Vorschau |
| **Brotato** | Waffenklassen mit Set-Boni bei 2/3/4/5/6 Teilen | Jedes Item zählt in eine Richtung (L6) | Pfade |
| **Brotato** | Charaktere mit harten Nachteilen, die den Build ab Minute 1 lenken | Champions spielen sich grundverschieden | Champion-Lanes |
| **Vampire Survivors** | Evolution: Waffe + passives Item → neue Waffe, Rezept bekannt | Der Moment, in dem der Build zündet (L5, L6) | Evolutionen |
| **Isaac** | Items ändern die *Form* des Angriffs; 3 Teile eines Sets → sichtbare Verwandlung | Verben statt Zahlen (L1) | Pfad-Stufe 6 |
| **Slay the Spire** | Elite-Kämpfe optional, riskant, besser belohnt; Rast: heilen *oder* aufwerten | Wenig, aber schwer (L4) | Elite-Runden, Heil-Entscheidung |
| **Doom (2016) / Hades** | Angriffs-Tokens: nur 2–3 Gegner dürfen gleichzeitig angreifen | Viele Gegner, trotzdem fair (L3) | Token-System |
| **Risk of Rain 2** | Proc-Stapeln („bei Treffer: Extraschaden") | **Gegenbeispiel** — genau das, was du nicht willst | Procs pensionieren |

---

## 3 · Ehrliche Rückschau: was ich falsch gemacht habe

1. **Ich habe die Builds abgeschaltet.** Im Juli stieg die Build-Achse im Benchmark
   von 24 auf 54 Punkte, weil jeder der 8 League-Champions **4 sich widersprechende
   Augment-Lanes** bekam (61 Champion-Augments, Muster: Karthus „Präzision gegen
   Zone"). Im August habe ich den Pool durch 21 generische Augments ersetzt und den
   Roster getauscht — **die neuen 8 Champions haben null eigene Augments.** Das ist
   wörtlich „mit den neuen Charakteren viel schlechter" und „es gibt keine Builds".
2. **Code ≠ Bildschirm.** `ranged: true` stand im Code, aber die Animations-Config
   fehlte → alle 8 stürmten mit weißem Schwert los. Der Sim maß den alten Roster,
   der Hitbox-Check prüfte nichts. Ich habe „steht im Code" mit „sieht man" verwechselt.
3. **Optik vor Spaß.** Vom 30.07. bis 09.08. gingen Kamera, Sound, Licht, UI und
   Partikel vor (Priorität 2), während Priorität 1 stillstand und dann einbrach.
4. **Breite statt Tiefe, wieder.** DEVPLAN U1 hat das am 18.07. benannt. Danach:
   Augment-Pool viermal ersetzt, Roster dreimal. Jeder Neustart setzt Tiefe auf null.
5. **Schaden war strukturell unvermeidbar.** Alle 6 Gegnertypen haben einen
   Grundangriff ohne Vorwarnung, 4 davon treffen im Nahkampf *sofort*. Dazu 5–9
   Gegner pro Runde und ein HP-Pool über den ganzen Run → Nahkämpfer bluten
   zwangsläufig aus. Das widerspricht L3 direkt und erklärt Median Runde 2.
6. **Häppchen statt Plan.** Du musstest „weiter" drücken. Ab jetzt nicht mehr.

**Was gut ist und bleibt:** AbilitySpec-Wahrheitsschicht + Hitbox-Check (= L2),
RuleFlags (Augments als Daten), Impact-Modell, HP-Pool, Mini-Boss-Takt, die jetzt
ehrlichen Messwerkzeuge, die neuen Gegner-Silhouetten.

**Bereits erledigt (08.10.):** Animations-Config für alle 8 Champions; Fernkämpfer
reichen 540–580, Gegner-Autos nur noch 370–430 (`scripts/rangecheck.mjs` beweist es
mit Gegenkontrolle); Gegner haben eigene Silhouetten statt gleicher Kreise
(`scripts/bestiary.mjs`).

---

## 4 · Der Plan

Reihenfolge nach Priorität, mit einer Ausnahme: **Phase 1 zuerst**, weil man Builds
nicht erleben kann, wenn man in Runde 2 stirbt — und weil unvermeidbarer Schaden
ein Spaß-Problem ist (L3), kein Balance-Problem.

### Phase 1 — Schaden ist dein Fehler · L3, L4

| # | Was | Fertig, wenn |
|---|---|---|
| 1.1 | **Gegner-Nahkampf mit Anlauf**: ~350 ms sichtbarer Bogen am Boden, Schaden nur im Bogen am Ende. Kein Sofortschaden mehr. | Neuer `dodgecheck`: Spieler tritt während des Anlaufs zurück → 0 Schaden. Gegenkontrolle: bleibt stehen → Schaden. |
| 1.2 | **Angriffs-Tokens**: höchstens 3 Gegner greifen gleichzeitig an, die anderen positionieren sich. | Sim zählt gleichzeitige Angriffe ≤ 3. |
| 1.3 | **Gegner-Schüsse lesbar**: größer, klar gefärbt, ausweichbar (bleibt ungelenkt). | Screenshot im Getümmel. |
| 1.4 | **Grob-Tuning auf Spielbarkeit** (kein Feinschliff): Gegnerzahl/HP-Kurve so, dass Läufe die Mitte erreichen. | Sim-Median ≥ Runde 8 über alle 8 Champions. |

### Phase 2 — Champions als Objekte (Sivir-Standard) · L2, L5, L7

| # | Was | Fertig, wenn |
|---|---|---|
| 2.1 | Jede Signatur-Fähigkeit wird ein sichtbares Objekt mit Flugzeit: Tessalys Harpune fliegt und zieht, Aerens Pfeile fliegen, Sunnas Glefe steckt sichtbar im Boden, Kips Turm steht, Mirelles Sumpf blubbert. | Keine Fähigkeit besteht nur aus einem Sofort-Strich oder Ring. |
| 2.2 | Hitbox = Objekt: `hitboxcheck` misst auch reisende Treffer. | `hitboxcheck` grün für alle 8. |
| 2.3 | Klappentext + Tipp aus dem Champion-Pack in den Auswahlbildschirm. | Sichtbar im Screenshot. |

### Phase 3 — Builds · L1, L6 (das Herzstück)

| # | Was | Vorbild | Fertig, wenn |
|---|---|---|---|
| 3.1 | **Champion-Lanes für die neuen 8**: je 2–3 Lanes à 3 Augments, die sich widersprechen. Muster aus `augments/champions/*.ts`. | Brotato-Charaktere, eigene Juli-Lanes | Jeder Champion hat ≥ 6 eigene Augments, mindestens eine bewusste Wette (ohne Build wertlos). |
| 3.2 | **Pfade**: die 5 Tags (Blut/Sturm/Arkan/Ward/Bruch) werden tragend. Jedes Item und Augment trägt 1–2. Stufe 2: Werte-Schub · Stufe 4: Regeländerung · Stufe 6: sichtbare Verwandlung. | Brotato-Sets, Isaac-Transformationen | HUD zeigt Pfad-Fortschritt; Karten zeigen „+1 Sturm (3/4)". |
| 3.3 | **Evolutionen**: jeder Champion hat 2 Rezepte (Fähigkeit + Pfad 4 oder Schlüssel-Item) → Fähigkeit wird zu etwas anderem. Rezepte stehen im Champion- und Shop-Bildschirm. | Vampire Survivors | Sim: in 40–70 % der Läufe, die Runde 10 erreichen, zündet eine Evolution. |
| 3.4 | **Slot-Augments**: ein Augment pro Auto/Q/E/Dash/Passiv; ein zweites ersetzt das erste. | Hades-Segen | Pick-Karte zeigt „ersetzt: X". |
| 3.5 | **Items entprocen**: 28 von 42 Items sind „bei Treffer: Extraschaden". Neu: Basis-Items = Werte + Pfad (billig, füttern Sets), Kern-Items = Regeländerung (teuer). Procs pensionieren. | Gegenbeispiel Risk of Rain | 0 reine Proc-Items im Shop. |
| 3.6 | **Angebote lenken**: Picks ~50 % auf eigene Pfade/Lanes, 1 Wildcard. Shop: Sperren + Reroll. | Brotato, Slay the Spire | Sim: zwei Läufe desselben Champions landen messbar in verschiedenen Pfaden. |

### Phase 4 — Run-Struktur · L4, L6

| # | Was | Vorbild |
|---|---|---|
| 4.1 | **Belohnungs-Vorschau**: nach jeder Runde wählst du, was als Nächstes kommt (Augment / Item / Gold / Heilung). | Hades-Türen |
| 4.2 | **Optionale Elite-Runden**: härter, dafür Prisma-Belohnung. | Slay the Spire |
| 4.3 | **Heilen oder Aufwerten**: Heilung kostet eine Aufwertung. | Slay-the-Spire-Rast |

### Phase 5 — Gegner mit Charakter · L3, L5

| # | Was |
|---|---|
| 5.1 | Elite-Affixe statt nur mehr HP: Schildträger, Teleport, Zorn — sichtbar am Gegner. |
| 5.2 | Jeder Gegnertyp hat eine Signatur-Attacke mit eigener Telegraph-Form. |
| 5.3 | Treffer-Blitz, Todes-Pop, Silhouetten-Feinschliff. |

### Phase 6 — Balance · zuletzt

| # | Was |
|---|---|
| 6.1 | Sim pro Champion und pro Pfad; kein Pfad dominiert. |
| 6.2 | Winrate-Spread < 20 Prozentpunkte. |
| 6.3 | Benchmark komplett neu bewerten (BENCHMARK.md, Messung 009). |

---

## 5 · Arbeitsregeln

- **Durcharbeiten.** Kein Halt zwischen Schritten. Bericht nur am Phasenende, drei Zeilen.
- **Das Spiel fragen, nicht den Code.** Jede „funktioniert"-Aussage braucht eine
  Messung am laufenden Spiel **mit Gegenkontrolle**. Werkzeuge lesen die
  Konfiguration aus dem Spiel (`champIds()`), nie eine abgetippte Liste.
- **Screenshot vor/nach** bei allem Sichtbaren.
- **Keine Assets.** Sprites und Art machst du.
- **Kein Neustart mehr.** Ab jetzt Tiefe auf dem Bestand. Pensionieren statt löschen.
- **Keine neuen Procs.** Weder als Augment noch als Item.
- **Playtest-Bitte** nach Phase 1 und nach Phase 3 — Gefühl kannst nur du beurteilen.
