# Lyareth

Ein rundenbasierter 1v1-Arena-Roguelike für den mobilen Browser (Landscape,
Touch-first — läuft auch am Desktop). Du bist ein verbannter König: Kämpf dich
durch 8 eskalierende Runden, wähl nach jeder Runde eines von drei **Augmenten**
und hol dir die Krone vom **Usurpator** zurück.

## Spielen

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # Produktions-Build nach dist/
npm run preview  # dist/ lokal serven
```

## Steuerung

| Eingabe | Mobil | Desktop |
|---|---|---|
| Bewegen | linker Daumen: Floating-Joystick | WASD |
| Auto-Angriff | automatisch aufs nächste Ziel | automatisch |
| Q — Klingenwurf (Bumerang) | Tippen = aufs nächste Ziel, Halten+Ziehen = zielen | Q (zielt zur Maus) |
| E — Königsruf (Nova + Buff) | Tippen | E |
| Phasenschritt (Dash, schneidet durch Gegner) | Tippen | Leertaste |

**Das Kit:** Q ist eine Bumerang-Klinge (trifft auf Hin- und Rückweg, dreht an
Säulen/Arenarand um). E stößt eine goldene Nova aus (Schaden + Rückstoß) und
lädt die nächsten 3 Autos auf (+60% Schaden, heilen). Der Dash phast durch
Gegner und schneidet sie dabei.

## Run-Struktur

**12 Runden, 3 Leben.** R1–4 Solo-Archetypen (Häscher, Schütze, Hexer,
Wächter) · R5 erstes Duo · **R6 Usurpator (Mini-Boss)** · R7–9 Duos ·
R10–11 Trios · **R12 Usurpator (Finale)**. Ab R5 gibt es pro Runde einen
zufälligen Arena-Modifikator (Feuerring / Heilblumen / Bruchzone / Blitzsturm).
Eine verlorene Runde kostet ein Herz, **es geht trotzdem in die nächste Runde**
— nur das Finale muss wirklich gewonnen werden. Augment-Wahl nach jeder Runde,
Sieg oder Niederlage.

Der Usurpator trägt eigene, **sichtbare Augmente** (2 im Mini-, 4 im Finalkampf)
— sie stehen zu Rundenbeginn oben im HUD.

## Architektur (src/)

- `core/events.ts` — typisierter EventBus: Der Kampfkern **emittiert** nur,
  Augmente **abonnieren** nur.
- `core/stats.ts` — Stat-Pipeline: `(base + Σflat) × (1 + Σpct)`, keine
  direkten Stat-Mutationen, auch für Bots (Slows, Bruchzone).
- `augments/registry.ts` — alle 30 Augmente als Daten + Hooks. Augment #31
  hinzufügen = ein Eintrag hier, nie Kampfcode anfassen.
- `augments/types.ts` — Tags (`Blut/Sturm/Arkan/Ward/Bruch`), Tiers
  (Silber/Gold/Prisma) und **Rule Flags** (`noAutoAttacks`, `prismaSlots`,
  `burnForever`, …): Der Kern prüft Flags, nie Augment-Identität.
- `core/combat.ts` — die Combat-API, die Entities/Augmente nutzen dürfen
  (dealDamage, addBurn, addHazard, spawnDecoy, …). Implementiert von
  `scenes/ArenaScene.ts`.
- `entities/Enemy.ts` — gemeinsames Bot-Hirn: Range-Keeping, Strafing,
  Skillshot-Dodge mit Reaktionszeit, telegrafierte Fähigkeiten, Rückzug.
  Archetypen sind Konfigurationen in `entities/enemies.ts`.
- Kein Backend, keine Persistenz, keine externen Assets — alles generierte
  Primitives + synthetisierte SFX.

## Test-Hooks

`window.__CC` (nur Debug/Tests): `run` (Live-Run-State), `scenes()`,
`goto(runde)`, `grant(augmentId)`, `arena()`.
