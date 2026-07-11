# Crown & Clash

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
| Q — Klingenwurf | Tippen = Quick-Cast in Blickrichtung, Halten+Ziehen = zielen | Q (zielt zur Maus) |
| E — Königsruf | Tippen | E |
| Phasenschritt (Dash) | Tippen | Leertaste |

## Run-Struktur

R1 Häscher · R2 Schütze · R3 Wächter · **R4 Usurpator (Mini-Boss)** ·
R5–7 Duos (ab R6 auch mit dem **Hexer**: Fluchzonen + Blink) + Arena-Modifikator
(Feuerring / Heilblumen / Bruchzone / Blitzsturm) · **R8 Usurpator (Finale)**.
Runden-Niederlagen kosten Leben (−15/−25/−40) aus einem Pool von 100;
bei 0 ist der Run vorbei.

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
