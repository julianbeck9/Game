# Crown & Clash — Art Direction Brief (Quality Pass)

> **Every agent working on the look of this game reads this first and works
> inside it.** Eight agents optimising independently produce eight visual
> directions that fight each other; a coherent look is a shared decision, not an
> emergent one. If you think this brief is wrong, say so in your report — do not
> quietly deviate from it.

## The reference, and what we actually take from each

| Game | What we take | What we do NOT copy |
|---|---|---|
| **Hades** | Readability under chaos: the player is always findable, enemy tells are always legible, everything else is allowed to be busy. Rich rim-lighting. Punchy, chunky VFX with strong silhouettes. | Its hand-painted 2D art budget. We cannot draw that. |
| **Enter the Gungeon** | Impact language: chunky hit-stop, screen-shake grammar, muzzle flashes, debris, shell casings. Tiny sprites that still read because of contrast and animation. | Its bullet-hell density. Our combat is ability-driven. |
| **Skul** | Snappy character animation with real anticipation and follow-through; heavy squash/stretch. Silhouette-first character design. | Its side-on perspective. |

## Non-negotiables

1. **Readability beats beauty.** If an effect makes the player, an enemy, or a
   telegraph harder to find, it is wrong no matter how good it looks alone. The
   first real playtest of this game lost track of the player repeatedly — that
   failure must never return.
2. **Top-down, ~30° tilt.** The maps are painted at a fixed isometric-ish angle.
   Everything you add must sit in that perspective: shadows land down-and-right,
   light comes from up-and-left, verticality is faked with shadow and scale.
3. **The palette is the map's.** Maps carry the colour identity (Shurima sand,
   Freljord ice, Void purple, Noxus blood). Gameplay elements must read against
   *all* of them — never trust a single-colour marker to have contrast, always
   pair it with a dark keyline. A gold ring is invisible on Shurima; that bug is
   already in the history of this repo.
4. **Gameplay colour language is fixed:**
   - Player + player abilities: **gold** `#ffc832`, always with white/dark keyline
   - Enemies + enemy damage: **red** `#e03c3c`
   - Enemy telegraphs (danger, will hurt you): **red, animated fill**
   - Healing / earned resource: **green** `#66dd66`
   - Shields: **cyan-blue**
   - Magic damage numbers: **gold**; physical: **white**; true: **violet**
5. **Motion has weight.** Nothing snaps linearly. Anticipation before a heavy
   action, follow-through after it, and easing everywhere (`Back`, `Cubic`,
   `Quad`). Constant-velocity movement is the tell of an unfinished game.
6. **60fps budget.** This runs in a browser on mobile too. Prefer pooled
   objects, baked textures and a few strong effects over many weak ones. If an
   effect costs more than ~1ms/frame it needs to justify itself.

## Technical ground rules

- **Phaser 3 stays.** Not up for discussion — it is the one thing the handover
  fixes as permanent along with the AbilitySpec layer.
- **No new runtime dependencies** without saying so explicitly in your report.
  Anything added must survive `npm run verify` and work in **both** WebGL and
  Canvas renderers (verify checks both; Canvas has no shaders — degrade
  gracefully, never crash).
- **`AbilitySpec` is the truth layer.** An ability declares its shape as data
  (`line`/`circle`/`cone`/`dash`/`self`) in `src/champions/types.ts`, and the
  preview, the VFX and the description all read that same source. Never
  hard-code a shape in a VFX; read the spec.
- **Hitboxes are sacred.** `UNIT_SCALE` in `src/config.ts` drives both sprite
  and hitbox. Do not change it to solve a readability problem — solve it with
  contrast, outline and shadow instead.
- **Comments explain WHY**, not what. Especially anything counter-intuitive.

## What "done" means here

The bar set by the owner is: a critic comparing against the reference *cannot
name a remaining qualitative gap*. Be honest — a critic that says "looks good"
without naming what is still missing has failed at its job, and so has a builder
who declares victory on a screenshot that still looks like a prototype.
