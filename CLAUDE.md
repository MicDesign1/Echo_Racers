# Animalian: Echo Racers — Claude Code Instructions

You are helping build **Animalian: Echo Racers**, a creature-powered racing game and
sequel to Animalian Manor, set in the same universe. New repo, separate from
animalian-manor. Vibecoded by two kids aged 10–12 (Scarlet: character design and
aesthetics; Gray: kinetic, mechanical gameplay) with adult supervision.

## What This Project Is

The player travels through a portal to the island where the first Animalian came into
being. An ancient civilization (the Wardens) left behind resonance technology —
machines that only work when an Animalian is bonded to them. The creature riding in
the vehicle IS the engine. Players race the Trial Circuits to unseal the island and
reach Uncle Argon, who is stranded there by an ancient artefact.

## Tech Stack

- **Framework:** React (Vite), plain JavaScript
- **Rendering:** Pseudo-3D sprite-scaling racer (OutRun/Slipstream technique — road
  drawn as projected segments on HTML5 Canvas 2D). **No Three.js, no 3D engines, no
  external game libraries.**
- **Data storage:** localStorage, namespaced per profile
- **Hosting:** Cloudflare Pages (deploy paths are CASE-SENSITIVE)
- Local path: E:\KID GAME\Echo_Racers

## Current Status

STATUS: Playable racing game with full competitive loop — grid start with countdown, 3-lap races vs AI rivals (roster data-driven, 8-racer support planned), verified live placement, place-first HUD, finish-line marker, results screen, per-track persistence; time-trial behind RACE.mode flag. Minimal auto-attack combat live: proximity/bump-triggered creature attacks with cooldown, symmetric for all racers, speed-penalty + wobble effects with full visual telegraphing — no types/stats/HP yet (next). Opponent rendering regression-tested by scripts/verify-opponents-render.mjs — run after ANY projection, draw-order, or car-layout change. Chassis are placeholder vector art awaiting sprites. Not yet built: typed attacks + HP/spinout, once-per-race special perk, vehicle/creature selection, multi-track themes, roadside allies (blocked on lore), menus, hub world.

## Narrative Rules — CRITICAL

- The **Sequel Story Bible (Sections 1–3)** is the ONLY source of narrative truth.
  If `Animalian_Sequel_Story_Bible_S1-3.docx` is present in the repo, treat it as
  READ-ONLY canon to consult — never edit it, never extend it.
- NEVER invent story content, character names, item names, place names, or lore. If a
  task needs a detail that isn't in the Bible or already in the codebase, STOP and
  flag it in the session summary as "narrative decision needed." All narrative
  decisions are resolved in the Claude.ai project conversation, never in Claude Code.
- Canon from Game 1: the Masked Man escaped; six types (Ember, Tide, Thorn, Storm,
  Phantom, Iron); legendary dual-types Genesis (Storm/Ember), Rekron (Ember/Iron —
  spelling locked), RZ (Iron/Tide).

## Art Direction — CRITICAL

Victorian naturalist meets ancient Atlantean craftsmanship. Brass, silver, verdigris
copper, river-worn stone, warm parchment skies. Machines glow with soft "resonance light"

**Vehicles are all-metal Warden hovercraft:** brushed silver, brass, verdigris copper
accents. Stone appears only in environments, never on vehicles.

## Color Palette (carried over from Game 1)

| Name      | Hex     | Use                     |
| --------- | ------- | ----------------------- |
| Cream     | #FFF8E7 | Backgrounds, highlights |
| Aged Gold | #C49A3C | Badges, accents         |
| Walnut    | #5C3A1E | Headers, UI bars        |
| Brass     | #8B6914 | Buttons, frames, hinges |

## Typography

- **Display:** Cinzel
- **Body:** Crimson Text / Georgia

## Creature System (carried over from Game 1)

Six types: Ember, Tide, Thorn, Storm, Phantom, Iron.

- Standard type advantage: 1.5x / disadvantage 0.75x
- Phantom: 1.25x vs all / 0.75x taken from all
- Iron: neutral (no advantage/disadvantage either way)
- Legendary dual-types exist: Genesis (Storm/Ember), Rekron (Ember/Iron), RZ (Iron/Tide)

### Card stats → racing stats

| Card stat | Racing meaning        |
| --------- | --------------------- |
| SPD       | Speed / acceleration  |
| ATK       | Attack power          |
| DEF       | Hull toughness        |
| HP        | Damage before spinout |

## Sprite Conventions

- Individual frames only, never sprite sheets
- 512px WebP with alpha, bottom-center aligned, into `public/sprites/`
- Vehicle frame set per craft: rear straight, slight-left, slight-right, hard-left,
  hard-right
- Vehicles support runtime tinting: keep resonance-glow pixels in a distinct color
  range from hull metal so glow and hull can be recolored independently

## Tone & Safety Rails

- Wholesome, never scary.
- Damage slows racers but never eliminates them; vehicles mend after races. No death,
  no explosions-as-destruction.

## Workflow Rules

- ONE change at a time. All changes must be scoped and non-destructive — do not touch
  visual design or working functionality outside the explicit scope of the request.
- End every session with a summary; wait for confirmation before the next change.
- Verify repo state by READING actual files. Never assume.
- Build/lint success ≠ runtime correctness — test the real scenario (run the game,
  drive the road).
- Use `git add -A` for commits.
- Keep tuning constants centralized in `src/data/tuning.js` so game feel can be
  iterated easily. No magic numbers scattered in components.

## COMBAT DESIGN: 
Attacks are automatic — the bonded creature attacks rival racers within range or on bump, governed by a per-creature cooldown. No attack button. All racers' creatures follow the same auto-attack rules. Exception: a once-per-race special move, triggered manually, available as an equippable car perk (future customization system). Roadside wild animalians are allied to one specific rival racer and attack other racers (including NPCs) near their stretch of track — sometimes, not always. Who that rival is = narrative decision, resolve from the Story Bible before naming.