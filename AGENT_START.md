# Start-Prompt für den lokalen Agenten

> Kopiere den Block unten als erste Nachricht an den Agenten, der lokal weiterarbeitet.

---

```
Du übernimmst die Weiterentwicklung von Crown & Clash, einem Arena-Roguelike
(Phaser 3 + TypeScript + Vite). Der Code liegt lokal, du kannst das Spiel im
Browser wirklich spielen — nutze das.

SCHRITT 1 — Lies in dieser Reihenfolge, vollständig:
  1. HANDOVER.md   ← Teil 0 ist verbindlich, besonders §0.3 (Messungen lügen)
  2. BENCHMARK.md  ← dein Bewertungsmaßstab und Startpunkt
  3. BUGS.md       ← Bug-Register
Danach überfliege: src/augments/champions/sivir.ts (das Muster für alles Weitere),
src/champions/types.ts (AbilitySpec) und scripts/effect-matrix.mjs.

SCHRITT 2 — Spiel das Spiel:
  npm i && npm run dev
Spiel einen vollständigen Run zu Ende. Schreib danach deine drei größten
Ärgernisse in BUGS.md — Dinge, die in keinem Dokument stehen. Das ist deine
erste Lieferung.

SCHRITT 3 — Korrigiere BENCHMARK.md Messung 001.
Die Wertungen zu Optik, Gefühl und Lernkurve stammen aus einem Code-Audit ohne
echten Playtest. Trag als "Messung 002" ein, was du nach dem Spielen wirklich
siehst — auch wenn es schlechter ausfällt.

SCHRITT 4 — Dann arbeite die Roadmap in HANDOVER.md Teil 3 der Reihe nach ab,
beginnend mit M2 (Sim-Harness).

DIE PRIORITÄTEN (vom Besitzer gesetzt, nicht verhandelbar):
  1. SPASS        — Diversität, Replayability, echte Entscheidungen
  2. OPTIK/IMPACT — Abilities sauber UND wuchtig; Animationen tragen den Impact
  3. BALANCE      — zuletzt
Bei Konflikt gewinnt die obere.

ARBEITSWEISE:
- Fast alles darf ersetzt statt poliert werden. Gesetzt sind nur Phaser und
  die AbilitySpec-Schicht.
- "Lieber weniger gute als viele schlechte" — im Zweifel streichen und
  vertiefen, nicht hinzufügen.
- Nichts löschen, was schön ist: pensionieren statt löschen (retired.ts-Muster).
  Die Sprites der ausgeblendeten Champions bleiben erhalten.
- Jeder Fix bringt den Test mit, der ihn gefunden hätte.
- npm run verify muss vor jedem Commit grün sein.
- Nach jedem Block: BENCHMARK.md neu bewerten und den Besitzer aktiv nach einem
  Playtest fragen.
- Wenn eine Messung dich überrascht, ist sie erst mal falsch. Prüfe den Aufbau,
  bevor du dem Spiel die Schuld gibst. Das ist in der Vorsession viermal
  passiert und hat jedes Mal zu falschen Schlüssen geführt.

Frag nach, wenn etwas unklar ist, statt zu raten.
```

---

## Wenn du mehrere Agenten parallel laufen lässt

Das hat in der Vorsession funktioniert, mit zwei Regeln:

1. **Disjunkte Dateien.** Git serialisiert die Pushes von selbst — der zweite Agent
   *muss* rebasen. Solange zwei Agenten verschiedene Dateien anfassen, ist das harmlos.
   `package.json` ist die häufigste Kollisionsstelle.
2. **Merge-Check ist Pflicht.** Nach dem Rebase: `npm install && npm run verify` auf dem
   *kombinierten* Baum, erst dann pushen. In der Vorsession meldeten zwei Agenten „grün",
   aber der gemeinsame Stand war rot — einer hatte eine devDependency angekündigt und nie
   eingetragen.
