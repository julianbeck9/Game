# Crown & Clash — Agenten-Auftragsbuch (Umsetzung des DEVPLAN)

> Zweck: Die in `DEVPLAN.md` beschriebenen Phasen in **einzeln vergebbare, in sich
> geschlossene Tickets** übersetzen. Jedes Ticket ist so geschrieben, dass ein
> Sonnet-Agent es **kalt** (ohne diese Chat-Historie) korrekt umsetzen kann:
> exakte Dateien, Zeilen-Anker, Vorgehen, Akzeptanzkriterien, Verify-Kommando,
> Commit-Text.
>
> Lies zuerst **§0 Netzwerk & Spielregeln** — das gilt für JEDEN Agenten.
> Danach nimm dir GENAU EIN Ticket (die ID steht im Auftrag an dich) und arbeite
> es vollständig ab. Fass keine anderen Tickets an.

---

## §0 · Netzwerk & Spielregeln (für jeden Agenten verbindlich)

### 0.1 Was das ist
Crown & Clash ist ein **privates, nie zu veröffentlichendes** Fan-Hommage-Spiel
(League-of-Legends-Anlehnung). **Aller Text, alle Art, aller Code müssen ORIGINAL
sein** — keine Original-Namen, -Icons, -Zahlen 1:1 übernehmen. Technik:
**Phaser 3 (3.90) + TypeScript + Vite**, mobile-first Web, Deploy via GitHub Pages
nach https://julianbeck9.github.io/Game/.

### 0.2 Umgebung
- Repo: `julianbeck9/Game`. **Arbeitsbranch: `claude/crown-clash-arena-game-pmb2ei`.**
  Alles committen und pushen NUR auf diesen Branch. Kein PR, außer der Mensch
  verlangt es ausdrücklich.
- Node-Projekt im Root. Abhängigkeiten sind installiert (`node_modules` vorhanden).
- `npm run build` = `tsc && vite build`. **`tsconfig.json` hat `noUnusedLocals: true`
  → toter Code bricht den Build.** Kein `console.log`-Müll hinterlassen.
- Renderer: WebGL mit Canvas-Fallback (`?renderer=canvas`). Beide müssen laufen.
- Headless-Treiber: Playwright + Chromium. **Umgebungs-agnostisch** — hardcode keine
  Browser-Pfade. Kanonisches Muster ist `scripts/verify.mjs` (existiert seit S0-1):
  Node-basierter statischer Server (kein `python3` nötig) + Chromium über den
  **bare import** `import pkg from 'playwright'; const { chromium } = pkg;` — Playwright
  findet seinen Browser selbst.
  ```js
  import pkg from 'playwright';            // bare specifier, kein absoluter Pfad
  const { chromium } = pkg;
  const b = await chromium.launch();        // kein executablePath hardcoden
  ```
  Neue Headless-Skripte (S3-1 Matrix, S5-1 Sim) **kopieren dieses Muster aus
  `scripts/verify.mjs`** statt es neu zu erfinden. Ist Chromium in deiner Umgebung
  nicht vorhanden, hol es einmalig mit `npx playwright install chromium` (unter Linux
  ggf. `--with-deps`). `playwright` steht in den devDependencies.

### 0.3 Debug-Handle `window.__CC` (Test-Zugang, Quelle: `src/main.ts:77`)
Nach Boot verfügbar. Damit testest du headless ohne UI-Klicks:
| Aufruf | Wirkung |
|---|---|
| `__CC.run` | aktuelles `RunState` (round, gold, augments, items, flags, memory …) |
| `__CC.goto(n)` | springt direkt in Arena-Runde `n` (stoppt alle Szenen, startet `arena`) |
| `__CC.arena()` | die laufende `ArenaScene` (hat `.player`, `.units`, `.now`, `.champVfx` …) |
| `__CC.grant(id)` | Augment per id in den Run legen (wirkt ab nächstem `goto`) |
| `__CC.grantItem(id)` | Item per id gewähren |
| `__CC.augIds()` | ganzer Augment-Pool mit Fähigkeits-Metadaten (hooks/onUpdate/…) |
| `__CC.champUsesAP(id)` | nutzt dieses Champion-Kit AP? |
| `__CC.scenes()` | aktive Szenen-Keys |

### 0.4 Verify vor jedem Push (Pflicht)
`npm run verify` existiert (Commit `386aadf`, S0-1): baut + bootet headless in WebGL +
Canvas, prüft auf Konsolenfehler und Objekt-Leaks. **`npm run verify` muss grün sein
(Exit 0), bevor du committest/pushst.** Läuft ~20 s. Ergänze pro Ticket zusätzlich die
dort verlangten Assertions/Tests.

Bekannte, **bereits vorbestehende** harmlose Konsolen-Meldung: `Texture key already in
use: champ:*` beim erneuten Betreten der Arena via `goto` — das ist KEIN von dir
verursachter Fehler und `verify` toleriert es. Alles andere in der Konsole ist ein
echter Fehler und bricht `verify`.

**Merge-Check (Pflicht, gegen parallele Agenten):** Parallel-Agenten pushen zwischen
deinem Start und deinem Push. Ein isolierter Verify-Lauf beweist NUR deinen Stand, nicht
den kombinierten. Deshalb: **nach dem finalen `git rebase` IMMER `npm install` und dann
`npm run verify` erneut laufen lassen — auf dem gemergten Baum, direkt vor dem Push.**
`npm install` ist nötig, weil ein Geschwister-Ticket eine neue devDependency (z. B.
`jsdom`, `vitest`) hinzugefügt haben kann, die dein `node_modules` noch nicht hat und
ohne die `verify`/`test` scheinbar grundlos bricht. Erst wenn der Merge-Check grün ist,
pushst du.

### 0.5 Git-Flow (exakt so)
```bash
# 1) committe deine Arbeit lokal (Message-Format siehe unten)
git add -A && git commit

# 2) hol den aktuellen Remote-Stand (Geschwister-Agenten haben evtl. gepusht)
git fetch origin claude/crown-clash-arena-game-pmb2ei
git rebase origin/claude/crown-clash-arena-game-pmb2ei

# 3) MERGE-CHECK auf dem kombinierten Baum (§0.4) — nicht überspringen
npm install               # zieht neue devDeps der Geschwister-Tickets (jsdom/vitest/…)
npm run verify            # muss grün sein (Exit 0); vor S0-1 ersatzweise: npx tsc --noEmit

# 4) erst jetzt pushen (bei Netzfehler 2s,4s,8s,16s Backoff, max 4 Versuche)
git push -u origin claude/crown-clash-arena-game-pmb2ei
```
Wenn der Merge-Check nach dem Rebase rot wird, obwohl dein isolierter Lauf grün war,
liegt es fast immer an (a) einer fehlenden devDependency eines Geschwister-Tickets
(→ `npm install`) oder (b) einem echten inhaltlichen Konflikt zweier Änderungen
(→ auflösen, nicht wegdrücken). Push nie einen roten Merge-Check.
Commit-Message-Format (Betreff = imperativ, kurz):
```
<Ticket-ID>: <was du getan hast>

<1–3 Sätze warum / was der Test prüft>

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Q2sumdcSvQPXDz97q98dgF
```
**Der Modell-Identifier `claude-fable-5`/`claude-opus-4-8` darf NIRGENDWO im Repo
auftauchen** (nicht in Commits, Code, Kommentaren, Doku). Nur im Chat.

### 0.6 Definition of Done (jedes Ticket)
1. Funktioniert im Spiel (headless verifiziert). 2. Automatischer Check existiert und
ist grün. 3. Beschreibung = Verhalten (wo betroffen). 4. Preview = Wirkung (wo
betroffen). 5. **0 Konsolenfehler** in WebGL UND Canvas. 6. `tsc` sauber, kein toter
Code. 7. Commit + Push auf den Branch.

### 0.7 Content-Freeze
Bis Stage 2 (Wirkungs-Matrix) abgenommen ist: **kein neuer Champion, kein neues
Augment, keine neue Map.** Du härtest bestehende Systeme, du baust nichts Neues dazu.
Ausnahme: die Test-/Tooling-Dateien, die die Tickets ausdrücklich verlangen.

### 0.8 Wenn du blockierst
Wenn ein Akzeptanzkriterium nicht erfüllbar ist ohne eine Entscheidung, die über dein
Ticket hinausgeht (z. B. Design-Frage), **rate nicht** — schreib deinen Befund als
Notiz in `BUGS.md` (Format siehe S0-2), committe NUR diese Notiz nicht mit deinem
Feature-Commit vermischt, und beende sauber mit klarer Statusmeldung.

---

## §1 · Ticket-Board (Reihenfolge & Abhängigkeiten)

```
Stage 0 (Fundament, MUSS zuerst):
  S0-1  npm run verify (Netz aufsetzen)      ✅ FERTIG (386aadf) ── blockiert alles danach
  S0-2  BUGS.md + Vitest-Setup                       ── Basis für alle Tests

Stage 0.2 (Wirtschaft, hängt an S0-1 + S0-2):
  S1-1  B1  Trade zeigt falsche Tiers                (offers.ts)
  S1-2  B2  Transmute verschwindet nicht + MAX_AUGMENTS (gold/prisma/run/helpers)
  S1-3  B4  Reroll-Repro + Invariantentests          (offers/PickScene)
  S1-4  State-Hygiene: localStorage-Versionierung    (0.3)

Stage 1 (Ability-Wahrheitsschicht, hängt an S0-1):
  S2-1  AbilitySpec-Typ + 3 Piloten (Zac/Lux/Ashe)  ✅ FERTIG (3a38801)
  S2-2  Preview-Renderer aus Spec                     (ArenaScene) — fixt B3  ← jetzt startklar
  S2-3  AbilitySpec auf alle 26 Champions ausrollen
  S2-4  Beschreibungs-Generator aus Spec              — fixt B6

Stage 2 (Wirkungs-Audit, hängt an S0-2 + S2-*):
  S3-1  Wirkungs-Harness "wirkt wie beschrieben"      (PASS/FAIL-Matrix)
  S3-2  rote Augments fixen oder streichen
  S3-3  Item-/Gold-Invarianten

Stage 3 (Game Feel, hängt an S2-*/S3-*):
  S4-1  Treffer-Feedback + HUD-Wahrheit (Buffs mit Restdauer)
  S4-2  Performance-Pass (Every-Frame-Redraw messen → cachen)

Stage 4 (Balance als Messung, hängt an S0-1 + S3-1):
  S5-1  Sim-Harness (Winrate/Rundendauer/Pick-Winrate)
  S5-2  silver=1× / gold=1.5× / prisma=2× Normalisierung mit Zahlen

Stage 5 (Freeze-Ende):
  S6-1  Sterne-/Upgrade-System (Design nötig — B5)
```
**Parallelisierbar:** S1-* und S2-* berühren verschiedene Dateien und können parallel
laufen, sobald S0-1/S0-2 stehen. Innerhalb einer Gruppe: sequenziell, um Merge-Konflikte
zu vermeiden.

---

## Stage 0 — Fundament

### S0-1 · `npm run verify` — das wiederholbare Sicherheitsnetz  ✅ ERLEDIGT (Commit `386aadf`)
**Phase:** DEVPLAN 0.1 · **Abhängig von:** nichts · **blockiert:** alles danach.
> Umgesetzt: `scripts/verify.mjs` nutzt einen **Node-HTTP-Server** (kein `python3`) und
> `import 'playwright'` (kein hardcodierter Browser-Pfad). Das ist das kanonische Muster
> für alle weiteren Headless-Skripte. Die Beschreibung unten ist der ursprüngliche Auftrag
> und nur noch historisch.

**Ziel:** Ein Kommando, das vor jedem Push läuft und rot wird, wenn irgendwas
strukturell kaputt ist. Ersetzt die verlorene Einmal-Harness durch etwas Dauerhaftes.

**Dateien:**
- `package.json` (Scripts) — anlegen: `"verify"`.
- neu: `scripts/verify.mjs` (Playwright-Boot-Check).

**Umsetzung:**
1. `scripts/verify.mjs` schreiben. Es soll:
   - `dist/` via `python3 -m http.server 4196 --directory dist` bedienen (als
     Child-Prozess starten, am Ende killen). Voraussetzung: vorher wurde gebaut.
   - Chromium headless starten (Pfad + Import aus §0.2).
   - Für `renderer ∈ {webgl, canvas}`:
     - Seite `http://localhost:4196/index.html?renderer=<r>` laden,
     - `await pg.waitForFunction(() => !!window.__CC, null, {timeout:20000})`,
     - `pageerror`- und `console`-Fehler sammeln,
     - `__CC.goto(1)` → 1 Runde ~2 s laufen lassen (Bot spielt),
     - Objekt-Leak-Check: `scene.children.list.length` am Anfang vs. Ende nach
       Abklingen der VFX (Toleranz definieren, z. B. Ende ≤ Anfang + 40),
     - bei irgendeinem gesammelten Fehler ODER Leak: **Exit-Code 1**.
   - Am Ende Zusammenfassung ausgeben und mit korrektem Exit-Code beenden.
   - Orientierung: `/home/user/Game` hatte einen funktionierenden Prototyp unter
     `scratchpad/animtest.mjs` (falls nicht mehr da: aus §0.2/§0.3 neu bauen).
2. `package.json` erweitern:
   ```json
   "scripts": {
     "dev": "vite",
     "build": "tsc && vite build",
     "preview": "vite preview",
     "verify": "npm run build && node scripts/verify.mjs"
   }
   ```
3. `.gitignore` prüfen: `dist/` darf ruhig ignoriert sein — `verify` baut es frisch.

**Akzeptanzkriterien:**
- `npm run verify` läuft durch, Exit 0 auf sauberem `main`.
- Ein absichtlich eingebauter `throw` in `main.ts` lässt `verify` mit Exit 1 fehlschlagen
  (danach zurücknehmen — nur als Selbsttest).
- Läuft in < 90 s.

**Verify:** `npm run verify` → Exit 0. Selbsttest wie oben.

**Commit:** `S0-1: add npm run verify (build + headless boot + leak check, webgl+canvas)`

---

### S0-2 · `BUGS.md` + Vitest für pure Logik
**Phase:** DEVPLAN 0.1 / Leitprinzip 5 · **Abhängig von:** nichts.

**Ziel:** (a) EIN Ort, an dem Bugs leben (Symptom→Repro→Root-Cause→Fix+Test).
(b) Ein Unit-Test-Runner für die dependency-armen Logikmodule (`offers`, `run`,
Wirtschaft), damit die Stage-0.2-Tickets ihre Invariantentests ablegen können.

**Dateien:**
- neu: `BUGS.md`.
- `package.json`: Vitest als devDependency + Script `"test": "vitest run"`,
  `verify` um `npm run test` erweitern (`build && test && node scripts/verify.mjs`).
- neu: `test/` (oder `src/**/*.test.ts` — wähle EINE Konvention, dokumentiere sie).
- ggf. `vitest.config.ts` (jsdom NICHT nötig — reine Logik; Umgebung `node`).

**Umsetzung:**
1. `BUGS.md` mit Kopf + Tabellen-Template anlegen:
   ```
   # BUGS — Symptom · Repro · Root Cause · Fix · Test
   | ID | Symptom | Repro (Schritte/Handle) | Root Cause + Ort | Status | Fix-Commit | Test |
   ```
   Die verifizierten B1–B7 aus `DEVPLAN.md §Teil 2` als erste Zeilen eintragen.
2. Vitest installieren (`npm i -D vitest`). **Kein** Netz für Tests — nur pure Importe.
   Achtung: Module, die Phaser importieren, sind NICHT unit-testbar. Teste nur Module
   ohne Phaser-Import (z. B. `core/run.ts`, `augments/offers.ts`, `augments/eligibility.ts`).
   Prüfe per Import-Graph, ob ein Modul Phaser zieht, bevor du es testest.
3. Einen Smoke-Test schreiben: `run.newRun()` liefert `gold===350`, `augments.length===0`;
   `addAugment` erhöht `tagCounts`. Das beweist, dass der Runner die Module lädt.

**Akzeptanzkriterien:**
- `npm run test` grün, mind. 1 echter Test.
- `BUGS.md` enthält B1–B7 mit Ort + Status `open`.
- `npm run verify` schließt den Test-Schritt ein.

**Verify:** `npm run test` grün; `npm run verify` grün.

**Commit:** `S0-2: add BUGS.md board + vitest for pure logic modules`

---

## Stage 0.2 — Wirtschafts-Korrektheit

### S1-1 · B1 — Gold→Prisma-Trade zeigt fälschlich Gold/Silber
**Phase:** DEVPLAN 0.2 · **Abhängig von:** S0-1, S0-2.

**Root Cause (verifiziert):** In `src/augments/offers.ts`:
- `rollOneOffer` (ab Zeile 33) hat einen **Fallback (Zeile 50–53)**, der bei leerem Pool
  auf `AUGMENTS.filter(...)` **ohne jede Tier-Bedingung** ausweicht → er ignoriert das
  erzwungene `opts.tiers` komplett.
- Der Pool wird bei einem Gold→Prisma-Trade oft leer, weil `prismaAllowed`
  (Zeile 36: `(opts.allowPrisma ?? true) && ownedPrisma < run.flags.prismaSlots`) auch
  für einen **erzwungenen** Trade gilt. Ist das Prisma-Cap voll, fällt jedes Prisma raus,
  Pool leer → Fallback → plötzlich Silber+Gold in einem „Prisma"-Trade.

Trade-Aufruf zum Nachvollziehen: `PickScene.ts:246` bzw. `:280`
`rollOneOffer(round, exclude, { tiers: [this.tradeTo], allowPrisma: this.tradeTo === 'prisma' })`.

**Umsetzung (`src/augments/offers.ts`):**
1. `RollOpts` (Zeile 21) um ein Flag erweitern: `forced?: boolean` — „dies ist ein
   erzwungener Trade, halte dich strikt an `tiers`".
2. Beim Trade-Aufruf in `PickScene.ts` (beide Stellen, `:246` und `:280`) `forced: true`
   mitgeben.
3. In `rollOneOffer`:
   - Wenn `opts.forced`: das `prismaSlots`-Cap NICHT auf die geforderten Tiers anwenden.
     Konkret: `prismaAllowed = opts.forced ? (opts.tiers?.includes('prisma') ?? false)
     : ((opts.allowPrisma ?? true) && ownedPrisma < run.flags.prismaSlots)`.
   - **Fallback (Zeile 50) so ändern, dass er `tiers` respektiert:** Der Fallback darf die
     Tier-Bedingung NICHT droppen. Erlaubt ist nur, den *Tag-Bias* oder die Prisma-40%-Logik
     zu lockern — niemals das Tier-Band. Wenn nach Tier-Filter wirklich nichts übrig ist,
     gib **`null`** zurück (ehrliches „leer") statt eines Tier-Downgrades.
4. Aufrufer, die `null` bekommen können, müssen das sichtbar machen (siehe S1-3 für den
   Button-Disable). Für dieses Ticket reicht: `null` wird korrekt nach oben gereicht.

**Akzeptanzkriterien / Tests (Vitest, `offers.test.ts`):**
- Bei `rollOneOffer(round, excl, { tiers:['prisma'], forced:true })` ist das Ergebnis
  **immer** `tier==='prisma'` ODER `null` — nie `silber`/`gold`. (Über viele Iterationen +
  bei vollem `prismaSlots`-Cap prüfen.)
- Bei `{ tiers:['gold'], forced:true }` nur `gold` oder `null`.
- Ohne `forced` bleibt bisheriges Verhalten (Tag-Bias, Prisma-Cap) erhalten.
- `npm run verify` grün.
- `BUGS.md`: B1 → Status `fixed`, Fix-Commit + Testname eintragen.

**Commit:** `S1-1: honor forced trade tiers in rollOneOffer (fix B1 gold->prisma pollution)`

---

### S1-2 · B2 — Transmute verschwindet nicht + `MAX_AUGMENTS` ungeschützt
**Phase:** DEVPLAN 0.2 · **Abhängig von:** S0-1, S0-2.

**Root Cause (verifiziert):**
- `Transmute: Prisma` (`gold.ts:773`), `Transmute: Chaos` (`prisma.ts:924`),
  `Transmute: Silver` (`prisma.ts:939`) feuern **einmal** über ein `memory`-Flag
  (`transmutPrismaDone`/`chaosDone`/`tsilberDone`) in `onCombatInit`, rufen aber **nie**
  `removeAugment(self.id)` → der Transmute-Slot bleibt für den ganzen Run belegt und tot.
- `run.addAugment` (`run.ts:60`) und `grantRandomAugment` (`helpers.ts:18`) sowie der
  direkte `push` in `transmutSilber`/`transmutChaos` prüfen **`MAX_AUGMENTS` (=6) nicht** →
  Transmute kann über das Limit hinaus granten.
- Mid-Combat gegrantete Augments binden ihre Hooks u. U. erst nächste Runde.

**Umsetzung:**
1. Ein sauberes Verbrauchs-Muster für alle drei Transmutes. Da `onCombatInit(ctx)` läuft
   und `self` das Augment ist, nach dem Granten:
   - erst die neuen Augments granten (bestehende `grantRandomAugment`/`SILBER`-Logik),
   - dann `removeAugment('<self-id>')` aufrufen (Import aus `core/run`).
   - Das `memory`-Flag kann entfallen, sobald das Augment sich selbst entfernt (es ist dann
     im nächsten Combat nicht mehr da). Prüfe: Wird `onCombatInit` mehrfach pro Combat
     aufgerufen? Falls ja, Flag als Idempotenz-Schutz behalten UND trotzdem `removeAugment`.
2. `MAX_AUGMENTS` durchsetzen. Zentral in `run.addAugment` (`run.ts:60`):
   ```ts
   export function addAugment(def: AugmentDef): boolean {
     if (run.augments.length >= MAX_AUGMENTS) return false;   // voll → nichts tun
     run.augments.push(def); ...
     return true;
   }
   ```
   **Achtung:** `addAugment` wird an mehreren Stellen aufgerufen (PickScene, main-Handle).
   Rückgabewert einführen, ohne bestehende Aufrufer zu brechen — Aufrufer, die den
   Boolean ignorieren, funktionieren weiter; PickScene sollte bei `false` den Pick
   ablehnen (Karte bleibt, Meldung „Augment-Slots voll"). Prüfe jeden Aufrufer.
   `grantRandomAugment` und die Transmute-`push`-Stellen ebenso auf das Limit prüfen
   (bei voll: nicht granten, ggf. `announce('Slots voll')`).
3. Konsistenz: Die drei Transmutes granten unterschiedlich (Helper vs. direkter `push`).
   Vereinheitliche auf `grantRandomAugment` bzw. eine gemeinsame `grantSpecific`-Hilfe,
   damit Tag-Counts/Flags/Limit an EINER Stelle gepflegt werden.

**Akzeptanzkriterien / Tests:**
- Nach Auslösen eines Transmute ist das Transmute-Augment **nicht mehr** in
  `run.augments`, und die gewährten Augments sind da (bis zum 6er-Limit).
- `run.augments.length` überschreitet **nie** 6, auch bei Transmute-Kette. (Vitest)
- Headless (`__CC.grant('transmutprisma'); __CC.goto(2)`): Slot wird frei, ein Prisma
  ist dazugekommen, 0 Konsolenfehler.
- `BUGS.md`: B2 → `fixed`.

**Commit:** `S1-2: transmute augments consume themselves + enforce MAX_AUGMENTS (fix B2)`

---

### S1-3 · B4 — Reroll-Repro + Invariantentests + ehrliches „leer"
**Phase:** DEVPLAN 0.2 · **Abhängig von:** S0-2, ideal nach S1-1.

**Ziel:** Den gemeldeten Reroll-Bug reproduzieren („wenn du Augments ausgewählt hast und
rerollst kommen die nicht mehr"), dann mit Invarianten absichern. Symptomkandidaten
(DEVPLAN B4): stiller `null`-Return, `fits()`/`owns()`-Filter, Tier-Band-Wechsel.

**Relevante Orte:**
- `PickScene.rerollSlot` (`PickScene.ts:73`): `rollOneOffer(this.offerRound, this.excludeSet())`.
  Bei `null` gibt es **stumm auf** (`if (!def) return;`) → Karte bleibt unverändert, Nutzer
  glaubt „geht nicht". Finde `excludeSet()` in derselben Datei und prüfe, was es ausschließt.
- Reroll ist pro Karte nur **einmal** erlaubt (`cur.rerolled`, `used` in `makeCard:327`).
- `rollOffers`/`rollOneOffer` in `offers.ts`.

**Umsetzung:**
1. **Erst reproduzieren, dann fixen.** Baue einen Vitest, der die reale Beschwerde
   nachstellt: viele Augments besitzen (Pool fast leer) → Reroll → beobachte `null`.
   Halte den exakten Repro in `BUGS.md` unter B4 fest.
2. Fix je nach Befund:
   - Wenn Ursache = stiller `null`: Reroll-Button **deaktivieren/ausgrauen**, wenn kein
     valides Angebot mehr existiert (sichtbar, nicht stumm). Nie eine Karte scheinbar
     „verschwinden" lassen.
   - Wenn Ursache = Tier-Band-Wechsel zwischen Offer und Reroll: `offerRound`/`tiers`
     zwischen initialem Roll und Reroll konsistent halten (derselbe Tier-Kontext).
3. **Invarianten als Vitest** (`offers.test.ts` erweitern):
   - Reroll-Ergebnis-Tier ∈ erlaubte Tiers der Runde.
   - Reroll liefert nie ein bereits besessenes Augment (`owns`-Filter greift).
   - Reroll liefert nie ein bereits angezeigtes Offer-Duplikat (exclude greift).
   - Bei leerem Pool: Ergebnis ist `null` UND der aufrufende Code disabled den Button
     (im Scene-Test bzw. per Logik-Extraktion prüfbar).

**Akzeptanzkriterien:**
- Repro in `BUGS.md` dokumentiert, danach `fixed`.
- Reroll fühlt sich nie „kaputt" an: entweder neues valides Angebot oder klar
  deaktivierter Button.
- Neue Invariantentests grün, `npm run verify` grün.

**Commit:** `S1-3: reproduce + fix reroll dead-end, add reroll invariants (fix B4)`

---

### S1-4 · State-Hygiene: localStorage-Versionierung
**Phase:** DEVPLAN 0.3 / U6 · **Abhängig von:** S0-1.

**Ziel:** Die aktive Falle entschärfen — Browser-Overrides (`applyBalance()`,
Map-Edits) überdecken frisch gebakte Werte. Ein Versionsschema + Validierung + Reset.

**Umsetzung:**
1. Alle `localStorage`-Keys finden (`grep -rn "localStorage" src`). Für jeden Store:
   - festes Key-Präfix + **Schema-Version** (`cc:balance:v3`, `cc:maps:v2` …),
   - beim Laden: Version prüfen; unbekannt/alt → verwerfen (nicht migrieren-raten),
   - Validierung der geladenen Struktur, bevor sie angewandt wird.
2. Beim **Einbaken** von Balance-/Map-Exports die Store-Version **mit erhöhen**, sodass
   alte Browser-Overrides nach einem Bake automatisch verworfen werden (kein „veraltete
   Werte bis Store geleert"-Effekt mehr).
3. Admin-Knopf **„Alles zurücksetzen"** (löscht alle `cc:*`-Keys) im Admin/Debug-UI.

**Akzeptanzkriterien:**
- Nach einem simulierten Bake (Version hochgezählt) werden vorhandene alte Overrides
  beim nächsten Laden verworfen; gebakte Werte sind sichtbar.
- Kaputter Store-Inhalt bootet trotzdem sauber (Fallback auf Defaults, 0 Fehler).
- Reset-Knopf leert alle `cc:*`-Keys.
- `npm run verify` grün.

**Commit:** `S1-4: version + validate all localStorage stores, add reset button (U6)`

---

## Stage 1 — Ability-Wahrheitsschicht

### S2-1 · `AbilitySpec`-Typ + 3 Piloten (Zac / Lux / Ashe)  ✅ ERLEDIGT (Commit `3a38801`)
**Phase:** DEVPLAN Phase 1 · **Abhängig von:** S0-1. **Größter Einzelhebel.**
> Umgesetzt: `AbilityShape`/`spec` in `types.ts`; Piloten gesetzt — Zac circle/radius 200
> self, Lux line/range 700/width 24, Ashe cone/range 620/angle 32. **Folge-Ticket S2-2
> (Preview-Renderer) liest genau dieses `spec.q` — kann jetzt starten.**

**Ziel:** Eine **deklarative Wahrheit** über die Form jeder Ability, neben dem Effekt-Code.
Vier Konsumenten (Preview, Reichweiten-Ring, Beschreibungs-Generator, Bot-KI) lesen sie.

**Umsetzung (`src/champions/types.ts`):**
1. Neuen Typ definieren:
   ```ts
   export type AbilityShape =
     | { kind: 'line';   range: number; width: number; speed?: number }
     | { kind: 'circle'; radius: number; at: 'self' | 'cursor'; range?: number }
     | { kind: 'cone';   range: number; angle: number }   // angle in Grad
     | { kind: 'dash';   range: number }
     | { kind: 'self' };                                   // reiner Selbst-Buff, keine Zielform
   ```
2. `ChampionDef` um optionale Spezifikationen erweitern (nicht `AbilityInfo` ersetzen —
   das bleibt für Namen/Text):
   ```ts
   spec?: { q?: AbilityShape; e?: AbilityShape; dash?: AbilityShape };
   ```
   Optional halten, damit nicht-migrierte Champions den Build nicht brechen.
3. In `src/champions/kits.ts` die **drei Piloten** mit korrekten Zahlen aus ihrem
   tatsächlichen Effekt-Code befüllen (nachschlagen, nicht raten — die Zahlen im
   `fireQ`/`castE`-Body sind die Wahrheit):
   - **Zac** (Selbst-AoE): `q: { kind:'circle', radius:<echt>, at:'self' }`.
   - **Lux** (Linien-Skillshot): `q: { kind:'line', range:<echt=qRange?>, width:<echt>, speed:<echt> }`.
   - **Ashe** (Kegel/Volley): `q: { kind:'cone', range:<echt>, angle:<echt> }`.
   Die Zahlen müssen mit dem übereinstimmen, was der Effekt-Code wirklich trifft — miss
   das notfalls headless nach (`__CC.arena()`, Q casten, Trefferzone beobachten).

**Akzeptanzkriterien:**
- `tsc` sauber; die 3 Piloten haben `spec.q` mit Zahlen == Effekt-Realität.
- Ein Vitest/Assertion: für die 3 Piloten ist `spec.q` gesetzt und `range/radius > 0`.
- **Kein** Verhaltenswechsel im Spiel (nur Daten dazu). `npm run verify` grün.

**Commit:** `S2-1: add declarative AbilitySpec type + wire Zac/Lux/Ashe pilots`

---

### S2-2 · Preview-Renderer aus `AbilitySpec` — fixt B3
**Phase:** DEVPLAN Phase 1 · **Abhängig von:** S2-1.

**Root Cause B3 (verifiziert):** `ArenaScene.ts:~1034` (`if (this.aimPreview)`) zeichnet für
**alle** Q-Fähigkeiten denselben hartkodierten Pfeil (Strip + Linie + Pfeilspitze, Länge
`qRange`, feste Breite) — auch für Kreis-/Selbst-AoEs.

**Umsetzung (`src/scenes/ArenaScene.ts`):**
1. Den Aim-Preview-Block so umbauen, dass er `champ.spec?.q` liest und **nach `kind`
   verzweigt**:
   - `line`: Rechteck/Strip mit echter `width` und `range`, in Aim-Richtung.
   - `circle` + `at:'self'`: Ring mit `radius` um den Spieler.
   - `circle` + `at:'cursor'`: Ring mit `radius` an der Cursor-/Aim-Zielposition
     (geklemmt auf `range`).
   - `cone`: Kreissektor mit `angle`/`range`.
   - `dash`: Richtungslinie bis `range`.
   - `self`/kein Spec: keine oder minimale Anzeige.
2. **Fallback:** Wenn `spec.q` fehlt (noch nicht migrierte Champions), das bisherige
   Pfeil-Verhalten beibehalten — so bleibt S2-2 unabhängig von S2-3 mergebar.
3. Farben/Alpha der bestehenden Preview-Ästhetik beibehalten.

**Akzeptanzkriterien:**
- Zac zeigt einen **Ring** (kein Pfeil), Lux eine **Linie** in echter Breite, Ashe einen
  **Kegel**. Headless-Screenshot-Vergleich oder visuelle Prüfung dokumentieren.
- Nicht-migrierte Champions unverändert (Pfeil-Fallback).
- 0 Konsolenfehler WebGL+Canvas, `npm run verify` grün.
- `BUGS.md`: B3 → `fixed` (für die 3 Piloten; voll grün nach S2-3).

**Commit:** `S2-2: render aim preview from AbilitySpec shape (fix B3 for pilots)`

---

### S2-3 · `AbilitySpec` auf alle 26 Champions ausrollen
**Phase:** DEVPLAN Phase 1 · **Abhängig von:** S2-1, S2-2.

**Ziel:** `spec.q` (und wo sinnvoll `spec.e`/`spec.dash`) für **alle** Champions in
`kits.ts` befüllen, mit Zahlen == Effekt-Realität. Danach greift der Preview-Renderer
für alle.

**Umsetzung:**
1. Champion für Champion durchgehen. Für jeden: `fireQ`/`castE`/`onDash` lesen, die echten
   Zahlen (Reichweite, Breite/Radius, Winkel, Projektil-Speed) extrahieren, in `spec`
   eintragen. Bei Unsicherheit headless nachmessen.
2. Wo eine Q wirklich formlos ist (reiner Selbst-Buff ohne Zielzone): `{ kind:'self' }`.
3. Danach im Preview-Renderer (S2-2) den Pfeil-Fallback nur noch als Sicherheitsnetz
   behalten; Ziel ist, dass er nie mehr greift.

**Akzeptanzkriterien:**
- **26/26** Champions haben ein `spec.q`. Ein Vitest zählt das ab und schlägt fehl, wenn
  einer fehlt.
- Stichprobe (mind. 6 quer über melee/ranged/AoE): Preview-Form deckt sich mit der
  tatsächlichen Trefferzone (headless: casten, Treffer vs. Ring vergleichen).
- `npm run verify` grün; `BUGS.md`: B3 → voll `fixed`.

**Commit:** `S2-3: populate AbilitySpec for all 26 champions, preview covers full roster`

---

### S2-4 · Beschreibungs-Generator aus Spec + Zahlentabellen — fixt B6
**Phase:** DEVPLAN Phase 1 · **Abhängig von:** S2-3.

**Root Cause B6:** Kit-Texte (`ChampionDef.info.*.desc`) sind handgetippte Strings mit
duplizierten Zahlen → driften vom Code weg.

**Umsetzung:**
1. Die `rs(a,b,c,d)`-Rundenskalierung (im Kit-Code verwendet) als Datenquelle greifbar
   machen. Wo eine Q z. B. `rs(50,70,90,110)` Schaden macht, soll der Text diese Tabelle
   **lesen**, nicht wiederholen.
2. Einen Generator schreiben, der aus `spec` + den Zahlentabellen den Anzeige-Text baut
   (z. B. „Linie, 760 Reichweite, 26 breit — 50/70/90/110 Schaden je nach Runde").
   Der Kit-Viewer (Menü) und der In-Round-Ability-Viewer zeigen den **generierten** Text.
3. Handgetippte `desc`-Strings nur noch für den *Flavor*-Teil; alle **Zahlen** kommen aus
   der Quelle. Wo eine Zahl noch dupliziert ist, entfernen.

**Akzeptanzkriterien:**
- Ändert man eine Zahl im Effekt-Code (Testfall), ändert sich der angezeigte Text
  automatisch mit (Vitest gegen den Generator).
- Kein sichtbarer Zahlendrift mehr in Stichprobe von 6 Champions.
- `npm run verify` grün; `BUGS.md`: B6 → `fixed`.

**Commit:** `S2-4: generate kit descriptions from AbilitySpec + scaling tables (fix B6)`

---

## Stage 2 — Wirkungs-Audit

### S3-1 · Wirkungs-Harness „wirkt wie beschrieben" (PASS/FAIL-Matrix)
**Phase:** DEVPLAN Phase 2 · **Abhängig von:** S0-2.

**Ziel:** Die Harness von „crasht nicht" zu „hat den beschriebenen, spürbaren Effekt in
richtiger Höhe" heben. Output: PASS/FAIL über alle 144 Augments, danach Teil von `verify`.

**Umsetzung:**
1. Headless-Assertion pro Augment. Muster: Referenz-Run ohne Augment vs. Run mit Augment
   (`__CC.grant(id); __CC.goto(r)`), gegen einen Dummy-Gegner, und prüfe die **erwartete
   Wirkung**:
   - Stat-Augment: `player.stats.get(stat)` ändert sich um erwarteten Betrag.
   - Proc/On-Hit: das Event feuert / DPS-Delta gegen Dummy > Schwelle.
   - Regel-Flag: `run.flags.<x>` gesetzt.
   Nutze `__CC.augIds()` (liefert hooks/onUpdate/statMods/ruleFlags/needs) um pro Augment
   die passende Assertion-Klasse zu wählen.
2. Ergebnis als Matrix ausgeben (`scripts/effect-matrix.mjs` → JSON + Konsolentabelle):
   `id · tier · erwartete Wirkung · gemessen · PASS/FAIL`.
3. In `verify` einhängen (nach Stage-2-Abnahme): FAIL = Exit 1.

**Akzeptanzkriterien:**
- Matrix deckt 100 % des Augment-Pools ab (kein „skip" ohne Grund).
- Jede FAIL-Zeile nennt Grund (kein Effekt / falsche Höhe / Event fehlt).
- Läuft reproduzierbar; als `npm run matrix` verfügbar.

**Commit:** `S3-1: effect-assertion harness (PASS/FAIL matrix over all augments)`

---

### S3-2 · Rote Augments fixen oder streichen
**Phase:** DEVPLAN Phase 2 · **Abhängig von:** S3-1.

**Ziel:** Jede FAIL-Zeile der Matrix auflösen: entweder korrekt implementieren oder
**streichen** (100 gute > 144 halbe — Streichen ist ausdrücklich erlaubt, via `isDeleted`
in `core/balance`).

**Umsetzung:** Batchweise (~20). Pro Augment: Root Cause finden, Fix ODER `isDeleted`
setzen + aus Angeboten nehmen. Jeder Fix bekommt seine Matrix-Zeile auf PASS.

**Akzeptanzkriterien:** Matrix am Ende 100 % PASS (gestrichene zählen nicht mehr mit).
`npm run verify` inkl. Matrix grün. `BUGS.md`: B7 → `fixed`.

**Commit:** `S3-2: resolve all failing augments (fix or cut), matrix fully green (fix B7)`

---

### S3-3 · Item-/Gold-Invarianten
**Phase:** DEVPLAN Phase 2 · **Abhängig von:** S3-1.

**Ziel:** Kauf/Verkauf/Refund korrekt, `gold ≥ 0` immer, Slots respektiert.

**Umsetzung:** Vitest gegen `run.ts` (`addItem`/`sellItem`) + Item-Effekt-Assertions
analog S3-1. Invarianten: nach Kauf `gold` == vorher − cost (nie < 0, Kauf bei zu wenig
Gold unmöglich); Verkauf refundet 70 % und baut Flags korrekt neu (`recomputeDerived`).

**Akzeptanzkriterien:** Invariantentests grün; Item-Wirkungs-Matrix grün; in `verify`.

**Commit:** `S3-3: item effect matrix + gold invariants (buy/sell/refund, gold>=0)`

---

## Stage 3 — Game Feel

### S4-1 · Treffer-Feedback + HUD-Wahrheit
**Phase:** DEVPLAN Phase 3 · **Abhängig von:** S2-*/S3-*.

**Ziel:** Einheitliches Treffer-Feedback; aktive Buffs **mit Restdauer** im HUD sichtbar;
Tod-/Sieg-Flow; Telegraph-Konsistenz der Gegner. Kein neuer Content — nur Lesbarkeit.

**Akzeptanzkriterien:** Playtest-Urteil (3 volle Runs) + HUD zeigt alle aktiven Buffs
korrekt mit Timer; `npm run verify` grün.

**Commit:** `S4-1: unify hit feedback + show active buffs with remaining duration`

---

### S4-2 · Performance-Pass (erst messen, dann cachen)
**Phase:** DEVPLAN Phase 3 · **Abhängig von:** S4-1.

**Ziel:** Hauptverdächtiger ist der Every-Frame-`Graphics`-Redraw. **Erst messen**
(Frame-Zeit-Profiling headless/Chromium), dann gezielt cachen (statische Geometrie in
RenderTexture, Redraw nur bei Änderung). Keine Blind-Optimierung.

**Akzeptanzkriterien:** Gemessene Frame-Zeit-Verbesserung dokumentiert (vorher/nachher),
Verhalten unverändert, `npm run verify` grün.

**Commit:** `S4-2: cache static arena geometry, cut per-frame graphics redraw`

---

## Stage 4 — Balance als Messung

### S5-1 · Sim-Harness (Winrate / Rundendauer / Pick-Winrate)
**Phase:** DEVPLAN Phase 4 · **Abhängig von:** S0-1, S3-1.

**Ziel:** Headless-Autoruns: Bot spielt N Runden mit zufälligen Picks → Winrate pro
Champion, mittlere Rundendauer, Pick-Winrate pro Augment. Der „Ersatzspieler".

**Umsetzung:** `scripts/sim.mjs` — nutzt `__CC.goto`/`grant`, spielt automatisiert,
aggregiert über viele Seeds, gibt CSV/JSON aus.

**Akzeptanzkriterien:** Reproduzierbare Statistik über ≥ 200 simulierte Runden; als
`npm run sim` verfügbar.

**Commit:** `S5-1: headless balance sim (per-champion winrate, round length, pick winrate)`

---

### S5-2 · Normalisierung silver=1× / gold=1.5× / prisma=2×
**Phase:** DEVPLAN Phase 4 / Task #21 · **Abhängig von:** S5-1.

**Ziel:** Die Tier-Wertigkeit **mit Zahlen** aus dem Sim durchsetzen, in Batches von ~20.
Admin-Tuner bleibt Feintuning; Exports werden mit Store-Versionierung (S1-4) eingebakt.

**Akzeptanzkriterien:** Sim zeigt Champion-Winrate-Spread im definierten Korridor;
Batch-Änderungen dokumentiert; `npm run verify` + `npm run sim` grün.

**Commit:** `S5-2: normalize augment power by tier from sim data (batch <n>)`

---

## Stage 5 — Freeze-Ende

### S6-1 · Sterne-/Upgrade-System (Design-Entscheidung — B5)
**Phase:** DEVPLAN Phase 5 · **Abhängig von:** M-C erreicht (Matrix grün).

**Wichtig:** B5 ist **kein Bug**, sondern ein **fehlendes Feature**. Im Code existiert nur
das ★-Icon der Goldenen Spatel (`items/registry.ts:871`) — kein Sterne-/Upgrade-System.
**Dieses Ticket braucht zuerst eine Design-Entscheidung des Menschen:** bauen (was genau
sollen Sterne tun?) oder die Erwartung/das Icon entfernen. **Nicht ohne diese Vorgabe
starten** — sonst raten. Bis dahin: in `BUGS.md` unter B5 als `needs-design` markieren.

**Commit (erst nach Design-Freigabe):** `S6-1: <implementiertes Sterne-System / oder: remove star affordance>`

---

## §Anhang · Schnell-Checkliste je Agent
1. §0 gelesen? Branch korrekt? 2. NUR mein Ticket? 3. Zahlen aus dem Code, nicht geraten?
4. Test/Assertion mitgeliefert? 5. `npm run verify` grün (WebGL+Canvas, 0 Fehler)?
6. `tsc` sauber, kein toter Code? 7. `BUGS.md` aktualisiert (falls betroffen)?
8. Commit-Trailer korrekt, Modell-ID nirgends im Repo? 9. Auf den Branch gepusht?
