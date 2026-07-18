# Crown & Clash — Entwicklungsplan: Alpha → „richtiges Spiel"

> Stand: 2026-07-18 · Basis: Code-Audit des tatsächlichen Repos (Root Causes verifiziert, nicht vermutet).
> Kontext: Privates Fan-Projekt, Phaser 3 + TS + Vite, 1 Entwickler + Claude, Deploy via GitHub Pages.

---

## Teil 1 — Meta-Analyse: Warum ist „alles bei 80 %"?

Das ist keine Ansammlung von Einzelbugs. Es sind **sechs systemische Ursachen**, die jede
für sich ganze Bug-Klassen erzeugen. Wer die Einzelbugs fixt, ohne die Ursachen zu fixen,
spielt Whack-a-Mole für immer.

### U1 · Content-Breite schlägt System-Tiefe
26 Champions × 4 Fähigkeiten, 144 Augments, ~30 Items, 9 Maps, 8 Gegner-Archetypen —
gebaut auf Systeme, die nie gehärtet wurden. Jede Content-Einheit **multipliziert** die
Bug-Oberfläche eines weichen Systems. Das ist der klassische Alpha-Tod: Das Spiel wird
breiter statt fertiger.

### U2 · Es gibt keine deklarative Wahrheit über Gameplay
Eine Fähigkeit *ist* im Code nur eine opake Funktion (`fireQ`-Closure). Nirgends steht
maschinenlesbar: „Das ist ein Kreis mit Radius 200" oder „Linie, 760 Reichweite, 26 breit".
Folge: Das UI **kann gar nicht wissen**, was eine Ability tut →
- Aim-Preview zeichnet für alles denselben Pfeil (`ArenaScene.ts:1034` — hartkodierte
  Pfeilform, Länge `qRange`, feste Breite — auch für Selbst-AoEs wie Zacs Q),
- Kit-Beschreibungen sind von Hand getippte Strings, deren Zahlen vom Code wegdriften,
- Smart-Cast und Bot-KI raten statt zu wissen.

### U3 · Wirtschafts-Flows ohne Invarianten
Offers/Trades/Transmute mutieren geteilten Run-State ohne durchgesetzte Regeln.
Beispiele für Regeln, die gelten *sollten*, aber nirgends geprüft werden:
„Ein Gold→Prisma-Trade liefert **nur** Prisma", „Ein Consumable **verschwindet** nach
Gebrauch", „Slots ≤ 6", „Gold ≥ 0". Der Code bricht die erste Regel sogar absichtlich
(Fallback in `offers.ts:50`).

### U4 · Kein Sicherheitsnetz
Einziger automatischer Check: `tsc`. Typen fangen keine Verhaltensfehler. Die
Augment-Harness (die bewies, dass alle 144 „feuern") war ein Einmal-Werkzeug, kein
wiederholbarer Test. Regressions landen stumm — deshalb fühlt sich das Spiel an, als
würde es unter einem zerfallen, während man baut.

### U5 · Feedback-Rate ≪ Änderungsrate
Riesige Feature-Commits, seltene Playtests. Bugs akkumulieren schneller, als sie
gefunden werden. (Deine Bug-Liste kam als Prosa-Nachricht — es gibt keinen Ort, wo
Bugs leben, priorisiert werden und abgehakt werden.)

### U6 · Drei ungeordnete State-Schichten
localStorage (Balance-Overrides, Map-Edits) + Live-Mutation der Registries + Run-State.
Hat uns schon zweimal gebissen (Map-Edits v1/v2-Migration; Editor-Doppel-Expansion).
Aktive Falle: `applyBalance()` legt Browser-Overrides **über** frisch gebakte Werte —
wer im Admin tunt und dann bakt, sieht veraltete Werte, bis der Store geleert wird.

---

## Teil 2 — Verifizierter Ist-Zustand (deine Meldungen, mit Root Cause)

| # | Symptom (deine Meldung) | Verifizierter Root Cause | Ort | Aufwand |
|---|---|---|---|---|
| B1 | „Gold→Prisma-Trade zeigt auch Gold und Silber" | Doppelt: (a) Fallback ignoriert die `tiers`-Vorgabe komplett, wenn der Pool leer ist; (b) der Pool IST oft leer, weil das `prismaSlots`-Cap (`ownedPrisma < flags.prismaSlots`) auch für erzwungene Prisma-Rolls gilt | `augments/offers.ts:36,50` | S |
| B2 | „Transmute gold bleibt einfach und verschwindet nicht" | `Transmute: Prisma/Chaos/Silver` feuern einmal (memory-Flag), rufen aber nie `removeAugment(self)` → toter Slot für den Rest des Runs. Dazu: `addAugment` prüft `MAX_AUGMENTS` nicht (Transmute kann >6 erzeugen) und mid-combat gegrantete Augments bekommen Hooks erst nächste Runde | `augments/gold.ts:773`, `prisma.ts:924/939`, `core/run.ts:60` | S–M |
| B3 | „Pfeil ziehen, aber Ability ist ein Kreis / Pfeil ≠ Projektil" | Ein einziger hartkodierter Pfeil für alle 26 Q-Fähigkeiten; keine Shape-Daten am Kit (siehe U2) | `ArenaScene.ts:1034`, `champions/types.ts` | M (Descriptor-Layer) |
| B4 | „Ausgewählte Augments kommen nach Reroll nicht mehr" | Noch kein exakter Repro. Strukturkandidaten: stiller `null`-Return beim Reroll, `fits()`/`owns()`-Filter, Tier-Band-Wechsel zwischen Offer und Reroll. Braucht Repro + Invariantentests (Teil von P0.2) | `offers.ts`, `PickScene.ts:73` | ? |
| B5 | „Das mit den Sternen funktioniert nicht" | Es **existiert kein Sterne-/Upgrade-System im Code** — nur das ★-Icon der Goldenen Spatel. Das ist kein Bug, sondern ein fehlendes/nie gebautes Feature bzw. UI, das etwas suggeriert. Entscheidung nötig: bauen oder Erwartung entfernen | `items/registry.ts:871` (einziger Treffer) | Design + M |
| B6 | „Champions sind anders beschrieben, als sie funktionieren" | Beschreibungen sind freie Strings mit von Hand duplizierten Zahlen (`kits.ts` `info` vs. Effekt-Code). Drift ist strukturell garantiert (U2) | `champions/kits.ts` | M (Generator) |
| B7 | „Viele Augments funktionieren nicht" | Harness bewies: alle 144 *feuern ohne Crash*. Aber „feuert" ≠ „hat den beschriebenen, spürbaren Effekt in richtiger Höhe". Es fehlt die Wirkungs-Assertion pro Augment | `augments/*` | M–L |

Die Muster dahinter: B1/B2/B4 = U3 (Invarianten fehlen), B3/B6 = U2 (keine deklarative
Wahrheit), B7 = U4 (kein Netz), B5 = fehlendes Feature, das wie ein Bug wirkt.

---

## Teil 3 — Der Plan

### Leitprinzipien (nicht verhandelbar, sonst wird's nichts)

1. **Content-Freeze** bis Phase 2 abgenommen ist. Kein neuer Champion, kein neues
   Augment, keine neue Map. Jeder neue Content auf weichen Systemen ist geliehene Zeit.
2. **Definition of Done** für alles: funktioniert im Spiel ✚ automatischer Check
   existiert ✚ Beschreibung = Verhalten ✚ Preview = Wirkung ✚ 0 Konsolenfehler.
3. **Single Source of Truth**: Zahlen und Formen leben als Daten. UI, Tooltip, Preview
   und KI *lesen* dieselbe Quelle — nichts wird doppelt getippt.
4. **Jeder Bugfix bringt den Test mit**, der ihn gefunden hätte.
5. **BUGS.md als einziger Bug-Eingang**: Symptom → Repro → Root Cause → Fix + Test.
   Prosa-Meldungen werden dort einsortiert, nichts geht mehr verloren.
6. **Playtest-Ritus**: pro Arbeitsblock 3 volle Runs; Top-5-Ärgernisse schlagen
   jede geplante Arbeit.

### Phase 0 · Fundament & Blutung stoppen

**0.1 Wiederholbares Sicherheitsnetz** — Vitest für pure Logik (offers, run,
Wirtschaft; die Module sind fast dependency-frei, das ist billig) + den bestehenden
Playwright-Headless-Harness zu `npm run verify` machen: tsc, build, Boot in WebGL +
Canvas, 1 Runde Autoplay, 0 Fehler, keine Objekt-Leaks. Läuft vor jedem Push.

**0.2 Wirtschafts-Korrektheit** (fixt B1, B2, B4):
- Tier-Fallback ersetzen durch ehrliches Verhalten: Pool leer → Meldung/alternatives
  Angebot, niemals stilles Tier-Downgrade. `prismaSlots`-Cap gilt nicht für erzwungene
  Trades (oder Trade-Button ist disabled, wenn das Cap voll ist — sichtbar, nicht stumm).
- Transmute-Augments konsumieren sich nach Wirkung (`removeAugment(self)`), granten
  sofort mit Hook-Bindung, respektieren Slots.
- Reroll-Invarianten als Unit-Tests: Ergebnis-Tier ∈ erlaubte Tiers, kein Besitz-Duplikat,
  kein stilles No-Op (wenn Pool leer → Button disabled).

**0.3 State-Hygiene**: Ein Versionsschema für alle localStorage-Keys, Validierung beim
Laden, Admin-Knopf „Alles zurücksetzen". Beim Einbaken von Balance-Exports wird der
Browser-Store mitversioniert (sonst überdeckt er die gebakten Werte — aktive Falle).

### Phase 1 · Die Ability-Wahrheitsschicht (größter Einzelhebel)

Ein `AbilitySpec` pro Slot, deklariert neben dem Effekt-Code in `kits.ts`:

```ts
q: { kind: 'circle', radius: 200, at: 'self' }            // Zac
q: { kind: 'line', range: 760, width: 26, speed: 1000 }   // Lux
q: { kind: 'cone', range: 520, angle: 40 }                // Ashe Volley
```

Vier Konsumenten, eine Quelle:
1. **Aim-Preview** rendert die echte Form: Linie mit echter Breite/Reichweite, Kreis am
   Cursor mit echtem Radius, Kegel, Selbst-Ring. (Fixt B3 vollständig.)
2. **Smart-Cast/Reichweiten-Ring** nutzt dieselben Zahlen.
3. **Beschreibungs-Generator**: Kit-Texte werden aus Spec + `rs()`-Zahlentabellen
   *generiert* statt getippt → B6 kann strukturell nicht mehr passieren.
4. **Bot-KI** liest die Specs zum Dodgen und für Rival-Casts.

Abnahme: Screenshot-Durchlauf aller 26 Champions — Preview-Form ≙ tatsächliche
Trefferzone; Kit-Screen zeigt generierte Texte.

### Phase 2 · Wirkungs-Audit: Augments & Items

Harness ausbauen von „crasht nicht" zu „wirkt wie beschrieben": pro Augment eine
maschinelle Assertion (Stat X ändert sich um Y / Event Z feuert / DPS-Delta gegen
Dummy > 0). Output: **PASS/FAIL-Matrix über alle 144**. Rot wird gefixt oder gestrichen
(streichen ist erlaubt! 100 gute Augments > 144 halbe). Matrix läuft danach in `verify` —
ein Augment kann nie wieder stumm brechen. Gleiche Behandlung für Items inkl.
Gold-Invarianten (Kauf/Verkauf/Refund, Gold ≥ 0).

### Phase 3 · Game Feel & Lesbarkeit

Erst jetzt, auf korrekten Systemen: Treffer-Feedback vereinheitlichen, HUD-Wahrheit
(aktive Buffs mit Restdauer sichtbar), Tod-/Sieg-Flow, Telegraph-Konsistenz der Gegner,
Animation-Feintuning (System steht seit dem Handoff), Performance-Pass (der
Every-Frame-Graphics-Redraw ist der Hauptverdächtige — erst messen, dann cachen).

### Phase 4 · Balance als Messung, nicht Gefühl

Sim-Harness: Headless-Autoruns (Bot spielt N Runden mit zufälligen Picks) →
Winrate pro Champion, Rundendauer, Pick-Winrate pro Augment. Dann die
silver = 1× / gold = 1.5× / prisma = 2×-Normalisierung **mit Zahlen**. Der
Admin-Tuner bleibt das Feintuning-Werkzeug; Exports werden regelmäßig eingebakt
(mit Store-Versionierung aus 0.3).

### Phase 5 · Content & Meta (Freeze-Ende)

Sterne-/Upgrade-System richtig designen (falls gewollt — B5 ist eine Design-Entscheidung),
Endless-Tiefe, Stats/Records, Onboarding-Runde, Audio-Pass. Und dann erst: neuer
Content — jetzt auf gehärteten Systemen, wo ein neuer Champion ein Datenblatt ist
statt einer neuen Bug-Quelle.

### Meilensteine (checkbar, in Reihenfolge)

- **M-A „Ehrliche Wirtschaft"**: Alle Pick/Trade/Shop-Invarianten grün, B1/B2/B4 zu.
- **M-B „Ehrliche Previews"**: 26/26 Previews decken sich mit der Wirkung, Texte generiert.
- **M-C „Grüne Matrix"**: 100 % der verbleibenden Augments/Items mit Wirkungs-Assertion.
- **M-D „Fühlt sich fertig an"**: Feel-Pass abgenommen (Playtest-Urteil, kein Test).
- **M-E „Messbar balanced"**: Champion-Winrate-Spread < definierter Korridor im Sim.

### Risiken

| Risiko | Gegenmittel |
|---|---|
| localStorage-Altlasten maskieren Fixes (schon 2× passiert) | 0.3 State-Hygiene, Store-Versionierung bei jedem Bake |
| Ein-Personen-Feedback skaliert nicht | Phase-4-Sim als „Ersatzspieler", BUGS.md-Disziplin |
| **Scope-Kriechen** (das Kernrisiko dieses Projekts) | Content-Freeze + Meilenstein-Gates; neuer Content nur nach M-C |
| „Fixt sich beim Neuschreiben"-Reflex | Nein. Systeme härten, nicht neu bauen — der Code ist strukturell gesund genug |

### Empfohlene nächste 3 Schritte (konkret)

1. **P0.2 Wirtschafts-Fixes** (B1 + B2 sind lokalisiert, je < 1 h inkl. Test) — sofortiger,
   spürbarer Qualitätssprung im Meta-Loop.
2. **P0.1 `npm run verify`** aufsetzen, damit Schritt 1 nie wieder kaputtgeht.
3. **P1 AbilitySpec** für 3 Pilot-Champions (Zac = circle, Lux = line, Ashe = cone),
   Preview-Renderer dafür, dann mechanisch auf alle 26 ausrollen.
