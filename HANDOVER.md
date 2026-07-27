# Crown & Clash — Übergabe & Roadmap

> Stand: 2026-07-27 · Branch `claude/crown-clash-arena-game-pmb2ei` · Repo `julianbeck9/Game`
> Adressat: der Agent, der lokal weiterarbeitet. Lies **Teil 0 komplett**, bevor du irgendetwas anfasst.

---

# TEIL 0 — Wie du arbeitest

## 0.1 Die Prioritätenreihenfolge (vom Besitzer gesetzt, nicht verhandelbar)

```
1. SPASS        ← Diversität, Replayability, Entscheidungen, Build-Vielfalt
2. OPTIK/IMPACT ← Abilities müssen sauber aussehen UND sich wuchtig anfühlen
3. BALANCE      ← kommt zuletzt, weil sie das Falsche zementiert, wenn 1+2 nicht stimmen
```

Wenn du zwischen zwei Aufgaben wählen musst, gewinnt die weiter oben. Ein perfekt
balanciertes langweiliges Spiel ist ein Fehlschlag. Ein unbalanciertes Spiel, in dem
jeder Run anders ist und sich Treffer wuchtig anfühlen, ist auf Kurs.

**„Impact" heißt konkret:** Der Besitzer hat gesagt — *„man muss checken dass es ein
Impact hat außer eine Zahl, das hat man am meisten mit Animationen."* Eine Fähigkeit,
die nur eine Schadenszahl verändert, ist nicht fertig. Sie braucht: Anlauf (Wind-up),
Treffer-Feedback (Screen-Shake/Hit-Stop/Partikel), und eine Form, die zeigt, was sie
trifft.

## 0.2 Mindset: fast alles darf ersetzt werden

Der Besitzer: *„geh davon aus dass alles noch nicht optimal ist … es gibt kaum Sachen
die ich nicht zumindest ein wenig geändert haben will."*

Das heißt für dich: **Wenn ein System im Weg steht, ersetze es, statt es zu polieren.**
Ausdrücklich zur Disposition stehen unter anderem das Augment-Tier-Modell
(Silber/Gold/Prisma), der Shop, das 20-Runden-Format, die HUD-Struktur, der Kunststil.

Nur zwei Dinge gelten als gesetzt, weil sie funktionieren und teuer zu ersetzen wären:

- **Phaser 3** als Engine.
- Die **`AbilitySpec`-Wahrheitsschicht** (`src/champions/types.ts`) — eine Fähigkeit
  deklariert ihre Form (`line`/`circle`/`cone`/`dash`/`self`) als Daten, und Preview,
  VFX, Beschreibung und Bot-KI lesen dieselbe Quelle. Das war der größte Einzelgewinn
  der letzten Session; nicht aufweichen.

## 0.3 ⚠️ Die wichtigste Warnung: Headless-Messungen lügen

Das ist keine theoretische Sorge. In der letzten Session ist es **viermal** passiert:

| Was gemessen wurde | Was rauskam | Was stimmte |
|---|---|---|
| „Welche Augments sind kaputt?" | 44 kaputt | 0 kaputt — alles per Schadens-Delta beurteilt, auch Schilde/Slows/Heilung/Gold |
| `gigantwuchs` Stat-Mismatch | 110 erwartet, 135 gemessen | Isoliert exakt korrekt — Zustand aus der vorherigen Zeile leckte rein |
| „Feuert der Cast-Effekt?" | 0 Effekte | Testfenster zu kurz: Headless-Chromium tickt die Animationsuhr ~⅓ Echtzeit |
| „Wirkt Keen Edge?" | Erst 1288 Schaden bei 0 % Crit, dann 0 | Beide Male Rauschen; erst der dritte Aufbau war belastbar — und deckte einen **echten** Bug auf |

**Regeln, die daraus folgen:**

1. **Ein Messergebnis, das dich überrascht, ist erst mal ein Messfehler.** Prüfe den
   Aufbau, bevor du dem Spiel die Schuld gibst.
2. **Negativkontrolle immer mitlaufen lassen.** „Ohne das Feature passiert X nicht" ist
   die Hälfte des Beweises.
3. **Randomisierte Läufe brauchen Wiederholung.** Map, Squad und Spawns wechseln pro
   `goto()`, es gibt keinen Seed-Hook. Ein Einzelsample entscheidet nichts.
4. **Du kannst jetzt lokal selbst spielen.** Das ist dein größter neuer Vorteil.
   Nutze ihn: Bei allem, was mit Gefühl, Optik oder Lesbarkeit zu tun hat, ist ein
   Screenshot oder ein echter Spieldurchlauf mehr wert als jede Zahl.
5. **`0 FAIL` heißt nicht „alles funktioniert."** Es heißt: nichts konnte als kaputt
   *nachgewiesen* werden. Aktuell sind 52 von 144 Augments schlicht **unbeurteilt**.

## 0.4 Der Benchmark-Loop (so „gewinnst" du gegen die Referenzspiele)

Du kannst Hades/Skul/Echoes nicht spielen. Deshalb misst du dich an einer **geschriebenen
Rubrik**, die aus ihnen abgeleitet ist (Teil 2), plus harten Sim-Zahlen.

**Nach jedem abgeschlossenen Block:**

1. `npm run verify` grün.
2. Rubrik in `BENCHMARK.md` neu bewerten (0–5 pro Kriterium, mit **einer Zeile
   Begründung je Wertung** — eine Zahl ohne Begründung ist wertlos).
3. Sim-KPIs messen und in `BENCHMARK.md` fortschreiben (Zeitreihe, nicht überschreiben).
4. **Ehrlich sein.** Wenn eine Wertung sinkt, schreib das hin. Der Wert des Dokuments
   liegt darin, dass man ihm glauben kann.

Der Besitzer will außerdem **gelegentlich selbst gegenspielen** — wenn du einen Block
fertig hast, der das Spielgefühl betrifft, frag aktiv nach einem Playtest.

## 0.5 Arbeitsdisziplin (aus der letzten Session, hat sich bewährt)

- **Jeder Fix bringt seinen Test mit** — den, der ihn gefunden hätte.
- **Nichts löschen, was schön ist.** Pensionieren statt löschen (`retired.ts`-Muster).
  Der Besitzer legt ausdrücklich Wert darauf, dass die Sprites der ausgeblendeten
  Champions erhalten bleiben.
- **Kommentare erklären das WARUM**, nicht das WAS. Besonders bei allem, was
  gegenintuitiv aussieht.
- **Commit-Sprache Englisch, Doku/Chat Deutsch.** (So ist der Bestand.)
- Der Modell-Identifier gehört **nirgendwo** ins Repo.

---

# TEIL 1 — Was ist Crown & Clash (Ist-Zustand)

## 1.1 Das Spiel in drei Sätzen

Ein Arena-Roguelike als Web-Spiel: Du wählst einen Champion, kämpfst durch 20 Runden
gegen KI-Squads, und wählst zwischen den Runden Augments und kaufst Items. Ein Leben —
verlierst du eine Runde, ist der Run vorbei. Es ist eine **Fan-Hommage an League of
Legends**: Champion-Namen und Kit-Konzepte sind angelehnt, aller Code und alle Art sind
original.

**Status:** späte Alpha. Die Systeme stehen, die Spieltiefe fehlt.

## 1.2 Technik

| | |
|---|---|
| Engine | Phaser 3.90, WebGL mit Canvas-Fallback (`?renderer=canvas`) |
| Sprache | TypeScript, `noUnusedLocals: true` (toter Code bricht den Build) |
| Build | Vite |
| Auflösung | 1920×1080, `Phaser.Scale.FIT` — mobile-first gedacht, Touch + WASD/Maus |
| Deploy | GitHub Pages → https://julianbeck9.github.io/Game/ |
| Tests | Vitest (reine Logik) + Playwright headless |

**Kommandos:**

```bash
npm run dev       # Vite-Devserver
npm run build     # tsc && vite build
npm run test      # Vitest
npm run verify    # build + test + Headless-Boot in WebGL & Canvas + Leak-Check
npm run matrix    # Wirkungs-Matrix über alle Augments (dauert ~15 min)
```

`npm run verify` ist das Pflicht-Gate vor jedem Push.

## 1.3 Repo-Struktur

```
src/
  main.ts                 Phaser-Bootstrap + window.__CC Debug-Handle
  config.ts               GAME_W/H, COLORS, ABILITIES (Dash-CD/Distanz), UNIT_SCALE
  core/
    combat.ts             Combat-Interface — der Vertrag zwischen Szene und allem darunter
    events.ts             EventBus + EventMap (autoHit, abilityCast, abilityHit, critHit …)
    stats.ts              StatBlock: get(stat) = (base + flat) × (1 + pct)
    run.ts                RunState (Runde, Gold, Augments, Items, Flags, memory)
    geometry.ts           Kollision, Arena-Clamping, Terrain
    bakedPaint.ts         Eingebackene Kollisionsdaten der 9 Maps (24px-Raster)
    balance.ts            localStorage-Overrides aus dem Admin-Tuner
  entities/
    Unit.ts               Basis: HP, Schild, Bewegung, Kollision
    Player.ts             Spieler: Kit-Aufrufe, Cooldowns, Dash, Auto-Attack
    Enemy.ts              Bot-Gehirn: Range-Keeping, Dodging, telegrafierte Fähigkeiten
    enemies.ts            Gegner-Konfigurationen + dressAsRival (Champion-Skins)
    Projectile.ts         Geschosse inkl. Bumerang-Rückflug
  champions/
    types.ts              ChampionDef + AbilitySpec ← die Wahrheitsschicht
    kits.ts               Alle 26 Kits (Stats, fireQ/castE/onDash, Beschreibungen)
    registry.ts           Champion-Liste
    championConfig.ts     Animations- und VFX-Tuning pro Champion
    AnimatedChampion.ts   Prozedurale Sprite-Animation (idle/walk/attack/cast/hurt)
    ChampionVfx.ts        VFX-Layer, hört auf Champion-Events
    abilityVfx.ts         Leitet VFX-Geometrie aus AbilitySpec ab
    rivalKits.ts          Fähigkeiten der Gegner-Champions
  augments/
    types.ts              AugmentDef (hooks, statMods, ruleFlags, champion, powerMult)
    silber/gold/prisma.ts Der generische Pool
    champions/sivir.ts    ← DAS MUSTER für Champion-Augments
    retired.ts            42 pensionierte Augments mit Begründung
    offers.ts             Angebots-Rollen, Tier-Gating
    AugmentManager.ts     Aktivierung, Hook-Bindung, power()
    eligibility.ts        Champion-/Stat-Gating
  items/
    registry.ts           Item-Katalog (Items sind technisch AugmentDefs mit Kosten)
    stars.ts              Item-Schmieden ★1→★3
  scenes/                 Menu, Arena, Pick, Shop, Build, Editor, Admin, End
scripts/
  verify.mjs              Das Sicherheitsnetz
  effect-matrix.mjs       Wirkungs-Matrix (rollen-geroutet)
DEVPLAN.md                Ältere Meta-Analyse (historisch, teils überholt)
AGENT_TASKS.md            Ticket-Board der letzten Session (teils erledigt)
BUGS.md                   Bug-Register B1–B7
effect-matrix.json        Letztes Matrix-Ergebnis
```

## 1.4 Das Debug-Handle `window.__CC`

Nach Boot verfügbar, dein Zugang zu allem:

| Aufruf | Wirkung |
|---|---|
| `__CC.run` | RunState (Runde, Gold, Augments, Items, Flags, memory) |
| `__CC.goto(n)` | direkt in Arena-Runde `n` springen |
| `__CC.arena()` | die laufende ArenaScene (`.player`, `.units`, `.projectiles`, `.bus`, `.now`) |
| `__CC.reset()` | frischer Run |
| `__CC.grant(id)` | Augment gewähren |
| `__CC.grantItem(id)` / `forgeItem(id)` | Item gewähren / schmieden |
| `__CC.augIds()` | ganzer Pool mit Metadaten + Beschreibung |
| `__CC.champUsesAP(id)` | skaliert das Kit mit AP? |

## 1.5 Wie ein Champion-Augment gebaut wird (das Sivir-Muster)

`src/augments/champions/sivir.ts` ist die Referenz. Kernidee:

- Ein Augment ändert **was eine Fähigkeit tut**, nicht wie groß eine Zahl ist.
- Es hängt an den **bestehenden Combat-Events** (`abilityCast`, `abilityHit`, `autoHit`,
  `dashStart`, `critHit`) — `kits.ts` bleibt unangetastet und lesbar.
- `champion: 'sivir'` sorgt dafür, dass es nur diesem Champion angeboten wird.
- Sie sind in **Build-Lanes** organisiert, die einander widersprechen:

```
Blade   — die Q trägt den Run          (Fan Throw, Backhand, Twin Cast)
On-Hit  — die Autos tragen, Q füttert  (Quickdraw, Whetstone)
Crit    — wertlos ohne Crit-Chance     (Keen Edge, Hot Streak)
Ward    — der Spell Shield wird Waffe  (Warding Wave)
Roam    — der Dash wird Waffe          (Blade Storm, Ricochet Edge)
```

**Die Crit-Lane ist Absicht:** Keen Edge und Hot Streak tun **nichts** ohne im Shop
gekaufte Crit-Chance. Damit ist der Pick eine Wette auf einen Build, kein Gratis-Upgrade.
Empirisch belegt: 100 % Crit ohne Keen Edge → 0 Crits in 8 Q-Treffern; Keen Edge bei 0 %
Crit → 0 in 23; Keen Edge bei 100 % → 28 in 28.

**Die Falle, die dabei auftrat** (wird dir genauso passieren): Keen Edge würfelte den
Crit zuerst in der augment-eigenen Klingen-Spawn-Funktion. Die erzeugt aber nur
*Augment*-Klingen — Sivirs echte Q läuft über `kits.ts` und ging komplett daran vorbei.
Das Augment tat ohne ein zweites Blade-Augment schlicht **nichts**. Lehre: **Hänge
Champion-Augments an Events, die der Basis-Kit auch feuert**, nicht an deine eigenen
Hilfsfunktionen.

## 1.6 Was in der letzten Session passiert ist

Chronologisch die relevanten Commits (alle auf dem Branch, alle mit grünem `verify`):

| Commit | Inhalt |
|---|---|
| `000881b` | DEVPLAN.md: Meta-Analyse der Kernprobleme |
| `e56a1f6` | AGENT_TASKS.md: Ticket-Board für Sub-Agenten |
| `386aadf` | **`npm run verify`** — das Sicherheitsnetz (Build + Boot + Leak-Check) |
| `3a38801` | **`AbilitySpec`-Typ** + 3 Pilot-Champions |
| `919f202` | BUGS.md + Vitest |
| `7fc9f11` | **B1** gefixt: Gold→Prisma-Trade lieferte Silber/Gold |
| `6039837` | **B3** gefixt: Aim-Preview zeichnet die echte Form statt immer eines Pfeils |
| `53716a0` | **B4** gefixt: Reroll-Sackgasse (Button war stumm statt deaktiviert) |
| `98cd9ef` | **B2** gefixt: Transmute verbraucht sich, `MAX_AUGMENTS` durchgesetzt |
| `d3f138f` | AbilitySpec auf **alle 26** Champions |
| `a57eb87` | **B6** gefixt: Kit-Beschreibungen werden generiert statt getippt |
| `a5dd01a` | **Effekt-Matrix rollen-geroutet** — die „44 kaputten Augments" waren ein Messfehler |
| `6510fec` | **Sterne-System** (B5): Items auf ★2/★3 schmieden + Shop-Panel |
| `c92c36e` | Cast-VFX aus AbilitySpec; 13 von 26 Champions hatten **gar keine** |
| `4daf849` | **Alle VFX richtungsecht** — vorher flogen sie immer waagerecht |
| `8fc2cc7` | Unterbrochene Casts verlieren ihren Effekt nicht mehr |
| `b77b87f` | Rivalen deklarieren Formen → sichtbare, korrekt große Gegner-Casts |
| `8920b59` | Sivir-Augments, Einheiten ~18 % kleiner, Doppel-Projektil gefixt |
| `8b08535` | **31 Stat-Stick-Augments pensioniert** |
| `1a00f1e` | **Gegner-Dash dodgebar**, Dash-CD 5 s→3,2 s, Sivir-Build-Lanes |
| `9556f22` | **11 weitere Augments pensioniert** (keine Entscheidung) |

## 1.7 Bug-Register (Stand)

| # | Symptom | Status |
|---|---|---|
| B1 | Gold→Prisma-Trade zeigte Silber/Gold | ✅ gefixt |
| B2 | Transmute verschwand nicht | ✅ gefixt |
| B3 | Pfeil statt echter Ability-Form | ✅ gefixt |
| B4 | Reroll lieferte nichts, stumm | ✅ gefixt |
| B5 | „Das mit den Sternen funktioniert nicht" | ✅ gebaut (Item-Schmieden) |
| B6 | Beschreibungen ≠ Wirkung | ✅ gefixt (generiert) |
| B7 | „Viele Augments funktionieren nicht" | ⚠️ **war ein Messfehler** — 92 PASS / 0 FAIL / **52 unbeurteilt** |

## 1.8 Bekannte offene Probleme (nicht gefixt!)

1. **Modul-Zustand leckt zwischen Runs.** `newRun()` setzt den RunState zurück, aber
   modul-globale Variablen in den Augment-Dateien (`let taktschlagLock`, Zähler etc.)
   überleben ihn. Das hat in der Matrix zu einem Phantom-Bug geführt. **Echter Bug,
   ungefixt.**
2. **52 Augments sind unbeurteilt** — davon 29 ohne passende Messvorrichtung.
3. **`applyBalance()` legt Browser-Overrides über frisch gebackene Werte.** Wer im Admin
   tunt und dann backt, sieht veraltete Zahlen, bis der Store geleert wird.
4. **Keine Ton-Ebene** außer minimalen SFX.
5. **Kein Onboarding.** Ein neuer Spieler bekommt keinerlei Erklärung.
6. **Ein neuerer Map-Export wurde nie eingebacken** — ging bei einem Modellwechsel
   verloren, der Besitzer muss ihn erneut exportieren.

## 1.9 Zahlen zum Ist-Zustand

```
Champions:      26 im Code (davon 8 als aktiver Roster geplant, siehe Teil 3)
Augments:       112 aktiv (40 Silber / 36 Gold / 36 Prisma) + 10 Sivir-spezifisch
                42 pensioniert (retired.ts)
Items:          ~30, mit ★1–★3-Schmieden
Maps:           9, eingebackene Kollision
Tests:          8 Dateien, 54 Tests
Runden:         20 + Endlosmodus, 1 Leben
```

---

# TEIL 2 — Design-Referenz & Rubrik

## 2.1 Was die Recherche ergeben hat

**Zum Kernproblem „Upgrades sind langweilig":** Die Community benennt exakt das Muster,
das Crown & Clash hatte — *„+10% damage, +10 HP, +10% movement speed"* wird explizit als
Langeweile-Ursache genannt. Als Gegenbeispiele gelten Risk of Rain, Isaac, Noita,
Gungeon und Hades, wo **jedes Item eine eigene Identität mit Spezialeffekt** hat. Das
Ideal sind Kombinationen mit *„unerwarteter Kettenreaktion"* statt gestapelter Boni.
([ResetEra-Diskussion](https://www.resetera.com/threads/im-starting-to-feel-that-stat-based-meta-progression-is-starting-to-ruin-roguelites-generally-speaking.1509337/))

**Zu Hades:** Über 300 einzigartige Boon-Kombinationen, Duo- und Legendary-Boons, die
Runs transformieren. Entscheidend: Boons sind **an einen konkreten Slot gebunden**
(Attack/Special/Cast/Dash) und ihre Stärke ist **kontextabhängig** — sie zählt durch
Synergie mit dem aktuellen Build, nicht durch die rohe Zahl. Dazu das
**Aspekt-System**: Upgrades sind auf die konkrete Waffe zugeschnitten.
([Choost Games](https://choostgames.com/blog/hades-best-builds/), [TheGamer](https://www.thegamer.com/best-hades-builds-weapons-boons/))

**Zur Power-Fantasy-Kurve:** Der Genre-Konsens lautet — *„die Power-Kurve muss sitzen:
schwach am Anfang, überwältigend am Ende, mit einem klaren Wendepunkt, an dem der Build
online geht."* Vampire Survivors liefert diesen Moment über **Waffen-Evolutionen**,
Brotato über den Shop-Moment, an dem die Synergien greifen.
([Choost Games](https://choostgames.com/blog/vampire-survivors-evolution-chart/), [Summer Engine](https://www.summerengine.com/blog/games-like-vampire-survivors))

> **Offen:** Eine belastbare Skul-spezifische Quelle fehlt (Suchlimit erreicht). Aus
> Spielkenntnis: Skuls Kern ist der **Kopftausch** — zwei Schädel gleichzeitig, jeder mit
> eigenem Moveset, jederzeit wechselbar, mit Swap-Angriff als Bindeglied. Das ist eine
> ganz andere Achse als Hades (nicht „Upgrade", sondern „zweites komplettes Kit").
> **Der Agent soll das nachrecherchieren**, bevor er Skul-Mechaniken adaptiert.

## 2.2 Die Rubrik (das ist dein Benchmark)

Bewertung 0–5 je Kriterium. **5 = so gut wie das Referenzspiel.** Jede Wertung braucht
eine Begründungszeile. Die Startwerte unten sind meine ehrliche Einschätzung des
Ist-Zustands.

### A · Build-Vielfalt & Entscheidungen (Gewicht ×3 — Priorität 1)

| # | Kriterium | Referenz | Ist | Ziel |
|---|---|---|---|---|
| A1 | Ein Pick verändert, **wie du spielst**, nicht nur Zahlen | Hades-Boons | 2 | 5 |
| A2 | Es gibt Picks, die **ohne den passenden Build wertlos** sind | LoL-Items | 2 | 4 |
| A3 | Zwei Runs mit demselben Champion fühlen sich verschieden an | Hades | 1 | 4 |
| A4 | Es gibt einen spürbaren Moment, an dem der **Build online geht** | Vampire Survivors | 0 | 4 |
| A5 | Synergien erzeugen **Kettenreaktionen**, nicht nur Addition | Isaac/Gungeon | 1 | 4 |
| A6 | Champions spielen sich **grundverschieden** | LoL | 2 | 5 |

### B · Optik & Impact (Gewicht ×2 — Priorität 2)

| # | Kriterium | Ist | Ziel |
|---|---|---|---|
| B1 | Jede Fähigkeit hat einen **eigenen, wiedererkennbaren** Effekt | 2 | 5 |
| B2 | Treffer fühlen sich **wuchtig** an (Shake, Hit-Stop, Partikel) | 1 | 4 |
| B3 | Man **sieht sofort**, was einen getroffen hat und warum | 2 | 4 |
| B4 | Gegner-Telegraphs sind eindeutig und einheitlich | 3 | 5 |
| B5 | UI/HUD zeigt den Build-Zustand **auf einen Blick** | 1 | 4 |
| B6 | Kunststil ist konsistent | 3 | 4 |

### C · Progression & Lernkurve (Gewicht ×2)

| # | Kriterium | Ist | Ziel |
|---|---|---|---|
| C1 | Ein neuer Spieler versteht die Grundlagen ohne Anleitung | 1 | 4 |
| C2 | Es gibt Gründe, **nochmal** zu spielen (Unlocks, Ziele) | 0 | 4 |
| C3 | Schwierigkeitskurve über einen Run steigt spürbar | 2 | 4 |
| C4 | Man wird durch **Können** besser, nicht nur durch Glück | 2 | 5 |
| C5 | Niederlagen fühlen sich **fair** an (kein unvermeidbarer Schaden) | 2 | 5 |

### D · Korrektheit & Handwerk (Gewicht ×1 — Priorität 3)

| # | Kriterium | Ist | Ziel |
|---|---|---|---|
| D1 | Beschreibung = tatsächliche Wirkung | 4 | 5 |
| D2 | Jedes Augment ist nachweislich wirksam | 2 | 5 |
| D3 | Champion-Winrates liegen im Zielkorridor | 1 | 4 |
| D4 | Keine Konsolenfehler, keine Leaks | 5 | 5 |

**Gesamtscore = Σ (Wertung × Gewicht).** Aktuell ≈ **73 / 275**. Das ist der Startpunkt.

## 2.3 Messbare Sim-KPIs

Ergänzend zur Rubrik, aus dem Headless-Harness:

| KPI | Definition | Ist | Ziel |
|---|---|---|---|
| **Pick-Diversität** | Anteil der Augments, die in 100 Sim-Runs mind. 1× gewählt werden | unbekannt | > 80 % |
| **Auto-Pick-Rate** | Häufigstes Augment / Median-Augment | unbekannt | < 3× |
| **Build-Streuung** | Anteil Run-Paare mit < 30 % Augment-Überlappung | unbekannt | > 60 % |
| **Winrate-Spread** | max − min Winrate über den Roster | unbekannt | < 20 pp |
| **Rundendauer** | Median Sekunden pro Runde | unbekannt | 30–60 s |
| **Treffer-frei-Quote** | Anteil Runden, die ein perfekter Bot ohne Treffer schafft | unbekannt | > 0, aber < 30 % |
| **Ungenutzt-Quote** | Augments mit 0 Picks in 100 Runs | unbekannt | 0 |

> Die meisten stehen auf „unbekannt", weil `scripts/sim.mjs` **nie geliefert wurde**.
> Das ist P0-Arbeit (siehe M2).

---

# TEIL 3 — Roadmap

Drei Stufen: **MUSS** (ohne das ist es kein gutes Spiel) · **SOLLTE** (hebt es deutlich)
· **OPTIMAL** (Feinschliff). Innerhalb jeder Stufe ist die Reihenfolge bindend.

---

## STUFE 1 — MUSS

### M1 · Lokale Umgebung & Spiel-Loop für dich selbst
**Warum zuerst:** Alles danach hängt davon ab, dass du das Spiel *sehen* kannst.

- Lokal starten (`npm i && npm run dev`), im echten Browser spielen.
- Screenshot-Workflow etablieren: Du sollst bei jeder optischen Änderung ein Bild
  ansehen, nicht nur Zahlen lesen.
- Prüfen, ob `npm run verify` und `npm run matrix` lokal laufen (Chromium ggf. per
  `npx playwright install chromium`).

**Abnahme:** Du hast einen vollen Run gespielt und kannst drei konkrete Ärgernisse
benennen, die in keinem Dokument stehen.

---

### M2 · Sim-Harness (`scripts/sim.mjs`)
**Warum:** Ohne ihn sind 7 der KPIs blind, und du kannst Build-Vielfalt nicht messen —
das Kernkriterium der Priorität 1.

- Bot spielt N komplette Runs mit zufälligen Picks.
- Ausgabe: Winrate/Champion, Rundendauer, **Pick-Häufigkeit je Augment**,
  Build-Überlappung zwischen Runs, ungenutzte Augments.
- ≥ 200 Runs reproduzierbar, Ergebnis als JSON im Repo.
- **Achtung:** Der bestehende Bot ist schwach. Wenn er zu schlecht spielt, misst du
  seine Inkompetenz statt deiner Balance. Lieber erst den Bot brauchbar machen.

**Abnahme:** `npm run sim` füllt alle Sim-KPIs in `BENCHMARK.md`.

---

### M3 · Roster auf 8 Champions eindampfen
**Entschieden mit dem Besitzer.** Aktive 8:

| Champion | Archetyp | Rolle im Roster |
|---|---|---|
| **Sivir** | Marksman | fertig, dient als Muster |
| **Lux** | Burst-Mage | lange Linien-Skillshots, AP |
| **Fizz** | Assassin | Untargetable-Dash, rein/raus |
| **Zac** | Tank/Engage | Blobs zum Einsammeln = **verdiente Heilung** |
| **Blitzcrank** | Utility | Hook zieht Gegner heran — mechanisch einzigartig |
| **Karthus** | Zonen-Caster | Flächen legen statt zielen |
| **Warwick** | Bruiser | Lifesteal, trägt die Sustain-Lane |
| **Master Yi** | On-Hit DPS | Angriffsgeschwindigkeit statt Fähigkeiten |

**Wichtig: Die anderen 18 werden NUR AUSGEBLENDET, nicht gelöscht.** Der Besitzer mag
die Sprites. Flag in der Registry, Kits und Assets bleiben unangetastet, Zurückholen ist
eine Zeile. (Alistar wurde bewusst verworfen: Sein LoL-Wert ist Peel für Verbündete —
die es im Solo-Spiel nicht gibt.)

**Abnahme:** Nur die 8 erscheinen im Menü; ein Test beweist, dass die anderen 18 im Code
intakt sind.

---

### M4 · Champion-Augments für die 7 verbleibenden
**Der größte Einzelblock — und der größte Hebel für Priorität 1.**

Pro Champion **8–10 Augments über 4–5 Build-Lanes**, nach dem Sivir-Muster. Regeln:

1. Jedes Augment ändert **was eine Fähigkeit tut**.
2. Mindestens **zwei pro Champion sind ohne den passenden Build wertlos** (wie Keen Edge).
3. Lanes müssen einander **widersprechen** — es darf keine Liste geben, die man immer nimmt.
4. Hänge sie an Events, die auch der Basis-Kit feuert (siehe die Falle in 1.5).
5. Jedes bekommt eine Wirkungs-Assertion in der Matrix.

**Karthus ist bereits durchdacht** (mit dem Besitzer abgestimmt):

> **Q · Lay Waste** — kleiner Kreis (r≈90) am Cursor, Reichweite ≈700, zündet nach
> 0,35 s, kurzer CD (≈1,2 s). Du zielst dorthin, wo der Gegner *gleich* ist. Trifft er
> nur **einen** Gegner: deutlich mehr Schaden → Präzision schlägt Spam.
> **E · Defile** — Aura an/aus, zieht Gegnern Leben ab, **kostet dich selbst etwas**.
> **Dash · Spectral Slide** — Blink mit brennender Spur.
> **Passiv · Death Defied** — bei tödlichem Schaden castest du **4 s weiter, bevor du
> stirbst** (1×/Run). Der beste Roguelike-Moment im Kit.
> **Lanes:** Präzision · Zone · Defile · Letztes Gefecht.

**Reihenfolge-Vorschlag** (erst die mechanisch verschiedensten, damit Lanes früh divergieren):
Karthus → Blitzcrank → Fizz → Zac → Lux → Master Yi → Warwick.

**Abnahme:** 8 Champions × ≥8 Augments; Sim zeigt Build-Streuung > 60 %.

---

### M5 · Kampf-Design: Treffer müssen vermeidbar sein
**Vom Besitzer explizit gefordert:** *„es muss möglich sein einen kompletten Run (bei
perfekter Spielweise) ohne Treffer zu schaffen, aber das sollte schwer sein."*

Teilweise erledigt: Der Gegner-Dash sprang auf die **Live-Position** des Spielers und war
mathematisch unausweichlich (420 ms Telegraph, 126 px Fluchtweg, 150 px Radius). Jetzt:
gemerkter Zielpunkt, 520 ms, Radius 130. Dash-CD 5 s → 3,2 s.

**Noch zu tun:**
- **Jede** Gegner-Fähigkeit auf Vermeidbarkeit prüfen: Telegraph-Zeit × Movespeed muss
  größer sein als der Trefferradius. Als Tabelle dokumentieren.
- Bot-Verhalten prüfen: Kein Gegner darf sich unangekündigt heranteleportieren.
- Dann: **HP hoch, Heilung knapp** (ebenfalls gefordert). Heilung soll **verdient**
  werden — Zacs Blobs sind das Vorbild. Das verschiebt die Rundenlänge stark, deshalb
  eigener Schritt mit Messung.

**Abnahme:** Vermeidbarkeits-Tabelle vollständig; ein skript-gesteuerter „perfekter
Spieler" schafft mindestens eine frühe Runde ohne Treffer.

---

### M6 · Impact & Ability-Optik
**Priorität 2 des Besitzers**, und der Punkt, an dem sich Arbeit am schnellsten auszahlt.

- **Hit-Stop** bei schweren Treffern (Frames einfrieren) — der billigste Wuchtgewinn.
- **Treffer-Feedback vereinheitlichen**: Flash, Partikel, Zahl, Shake nach Schadenshöhe.
- **Jede Fähigkeit der 8 Champions** bekommt einen wiedererkennbaren Effekt.
  Aktuell: 13 von 26 Champions hatten **gar keine** `castVfx`; die abgeleiteten sind ein
  Platzhalter, kein Ziel.
- **Wind-up-Animationen**: Der Spieler soll sehen, dass etwas Großes kommt.
- Kunststil darf sich ändern — der Besitzer ist offen für „mehr Tiefe".

**Abnahme:** Rubrik B1/B2/B3 ≥ 4, belegt mit Screenshots vorher/nachher.

---

### M7 · Modul-Zustand-Leck schließen
**Echter, bekannter Bug.** Augment-Dateien halten Zustand in modul-globalen Variablen,
die `newRun()` überleben. Zwei Runs können sich beeinflussen.

- Alle modul-globalen Variablen in `augments/**` finden.
- Nach `run.memory` oder eine Per-Run-Registry verschieben.
- Test: zwei aufeinanderfolgende Runs mit demselben Augment liefern identische Werte.

---

## STUFE 2 — SOLLTE

### S1 · Augment-Pool auf Identität trimmen (Rest)
42 sind pensioniert, aber **52 sind noch unbeurteilt** und viele generische Procs sind
gerade so „okay". Maßstab: *Ändert der Pick eine Entscheidung?* Wenn nein → schärfen oder
pensionieren. Ziel: lieber 60 sehr gute als 112 mittelmäßige.

**Beobachtung fürs Protokoll:** Die Mobility-Gruppe ist die **stärkste** im Pool — dort
existiert bereits eine funktionierende Speed-Lane (`hastwerk` → `windvorteil` →
`stepptaenzer`) und mit `bodenstaendig` („Dash deaktiviert, dafür +25 % Amp") ein echter
Trade-off. **Das ist das Qualitätsniveau, an dem sich der Rest messen soll.**

### S2 · Meta-Progression (leichtgewichtig)
Vom Besitzer gewählt: *Mischung aus voll und leicht, eher leicht.*

- Champion- und Augment-**Unlocks** (schaltet Inhalt frei, nicht Macht).
- Statistik-Seite: beste Runs, Lieblings-Builds, Erfolge.
- **Keine** permanenten Stat-Boosts — genau die Kritik, die die Recherche an
  Stat-Meta-Progression aufzeigt.
- Speicherstand versioniert (siehe die `applyBalance`-Falle in 1.8).

### S3 · UI/HUD-Überarbeitung
- Aktive Buffs **mit Restdauer** sichtbar.
- Build-Übersicht auf einen Blick: Was habe ich, was synergiert?
- Augment-Karten zeigen ihre **Lane**, damit Build-Richtungen lesbar sind.
- Schadenszahlen lesbar gestaffelt.

### S4 · Onboarding & Lernkurve
- Erste Runde als geführte Einführung.
- Fähigkeiten-Erklärung beim ersten Einsatz.
- Klarere Signale, warum man gestorben ist.

### S5 · Wirkungs-Matrix vervollständigen
Die 52 unbeurteilten messbar machen. Neue Rollen-Rigs für die 29 „unclassified".
Danach `matrix` in `verify` einhängen.

### S6 · Audio
Treffer, Casts, Tod, Pick-Momente. Ton trägt Impact mindestens so stark wie Optik.

---

## STUFE 3 — OPTIMAL

### O1 · Balance als Messung
Erst wenn 1+2 stehen. Sim-Winrates → Zielkorridor. Der Admin-Tuner bleibt das
Feinwerkzeug.

### O2 · Skul-artiger zweiter Mechanik-Layer
*Erst nachrecherchieren* (siehe 2.1). Denkbar: ein zweiter Champion pro Run, zwischen dem
man wechselt. Das wäre ein **großer** Eingriff und sollte erst nach M4 bewertet werden.

### O3 · IP-Ablösung
Der Besitzer hat „noch offen" gewählt — aktuell privat. Falls Veröffentlichung: **alle**
Champion-Namen, Ability-Namen und erkennbaren Designs müssen original werden. Als
geschlossener Block planen, damit er jederzeit ziehbar ist.

### O4 · Mehr Content auf gehärteten Systemen
Weitere Champions aus den 18 eingemotteten reaktivieren — dann als Datenblatt statt als
neue Fehlerquelle. Neue Maps, Endlos-Tiefe, Boss-Varianten.

---

# TEIL 4 — Erste Schritte für dich, konkret

```
1. Lies Teil 0 nochmal. Besonders 0.3.
2. npm i && npm run dev  → spiel einen vollen Run.
3. Schreib deine drei größten Ärgernisse in BUGS.md.
4. Lege BENCHMARK.md an: Rubrik aus 2.2, Startwerte eintragen, Datum.
5. Beginne M2 (Sim-Harness) — ohne ihn fliegst du bei Priorität 1 blind.
6. Danach M3 (Roster) und M4 (Karthus als erster neuer Champion).
7. Nach jedem Block: verify + Rubrik neu bewerten + beim Besitzer nach Playtest fragen.
```

**Wenn du unsicher bist, was der Besitzer will:** Er hat eine klare Linie — *„lass uns
weniger gute haben als viele schlechte."* Im Zweifel: streichen, schärfen, vertiefen.
Nicht hinzufügen.

---

# TEIL 5 — Offene Entscheidungen

| # | Frage | Status |
|---|---|---|
| 1 | Veröffentlichung → IP-Ablösung? | **offen**, aktuell privat |
| 2 | Skul-artiger Champion-Wechsel? | offen, erst nach M4 bewerten |
| 3 | Kunststil beibehalten oder wechseln? | offen, Besitzer ist offen für Änderung |
| 4 | Runden-Format (20 + Endlos) beibehalten? | zur Disposition |
| 5 | Augment-Tiers (Silber/Gold/Prisma) beibehalten? | zur Disposition |
| 6 | Neuester Map-Export | **muss der Besitzer erneut exportieren** |
