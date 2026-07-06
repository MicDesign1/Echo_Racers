# Animalian: Echo Racers — Claude Code Instructions

You are helping build **Animalian: Echo Racers**, a creature-powered racing game and
sequel to Animalian Manor, set in the same universe. New repo, separate from
animalian-manor.

## What This Project Is
The player travels through a portal to the island where the first Animalian came into
being. An ancient civilization (the Wardens) left behind resonance technology —
machines that only work when an Animalian is bonded to them. The creature riding in
the vehicle IS the engine. Players race the Trial Circuits to unseal the island and
reach Uncle Argon.

## Tech Stack
- **Framework:** React (Vite), plain JavaScript
- **Rendering:** Pseudo-3D sprite-scaling racer (OutRun/Slipstream technique — road
  drawn as projected segments on HTML5 Canvas 2D). **No Three.js, no 3D engines, no
  external game libraries.**
- **Data storage:** localStorage, namespaced per profile
- **Hosting:** Cloudflare Pages

## Art Direction — CRITICAL
Victorian naturalist meets ancient Atlantean craftsmanship. Brass, silver, verdigris
copper, river-worn stone, warm parchment skies. Machines glow with soft warm
"resonance light."

**NEVER USE:** electric, neon, futuristic, chrome, sci-fi, high-tech, digital, cyber,
hologram, laser.

## Color Palette (carried over from Game 1)
| Name | Hex | Use |
|------|-----|-----|
| Cream | #FFF8E7 | Backgrounds, highlights |
| Aged Gold | #C49A3C | Badges, accents |
| Walnut | #5C3A1E | Headers, UI bars |
| Brass | #8B6914 | Buttons, frames, hinges |

## Typography
- **Display:** Cinzel
- **Body:** Crimson Text / Georgia

## Creature System (carried over from Game 1)
Six types: Ember, Tide, Thorn, Storm, Phantom, Iron.
- Standard type advantage: 1.5x / disadvantage 0.75x
- Phantom: 1.25x vs all / 0.75x taken from all
- Iron: neutral (no advantage/disadvantage either way)
- Legendary dual-types exist in this universe: Genesis, Rekron, RZ

### Card stats → racing stats
| Card stat | Racing meaning |
|---|---|
| SPD | Speed / acceleration |
| ATK | Attack power |
| DEF | Hull toughness |
| HP | Damage before spinout |

## Tone & Safety Rails
- Wholesome, never scary.
- Damage slows racers but never eliminates them; vehicles mend after races.
- Canonical lore lives in the **Sequel Story Bible** — never invent story content,
  character names, or lore. If something isn't in the Bible, flag it instead of
  inventing it. (No Sequel Story Bible file has been located in this workspace yet —
  ask the user for it before inventing any lore.)

## Workflow Rules
- This app is vibecoded by two kids (ages 10-12) with adult supervision.
- All changes must be scoped and non-destructive — do not touch visual design or
  working functionality outside the explicit scope of the request.
- Keep tuning constants centralized in `src/data/tuning.js` so game feel can be
  iterated easily.
