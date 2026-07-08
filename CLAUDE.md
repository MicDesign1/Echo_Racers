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

STATUS: Playable racing game with full loop — grid start with countdown, 3-lap races vs data-driven AI roster, verified placement, place-first HUD, finish marker, results screen, persistence; time-trial behind RACE.mode flag. Minimal auto-attack combat live (symmetric, telegraphed, recoverable). Sampled + synth audio with lifecycle management (race-end fade, full teardown on unmount): manifest-driven samples (per-file gain, retrigger, pitch variation); attack and damage sounds currently play from randomized pools of all available clips (typed selection is a marked future swap), fade-restart race music, win cheer on 1st only. Input: keyboard on desktop, plus touch controls (steering joystick + throttle/drift, manual/auto-accel schemes) for tablet/phone; desktop keyboard unchanged. Difficulty tiers (Cadet/Racer/Ace) and rival count (1–8) as tuning data, resolved through a practice/trial raceMode config (trial is a structural placeholder only). Practice setup screen live (rival count 1–8, difficulty tier selection, persisted defaults); track selection placeholder pending themed tracks. The walkable hub is now the game's HOME (title-screen "Play" → /hub; no dev links): a Canvas-2D tiled forest (Mana Seed "Seasonal Forest" summer atlas) drawn by a stored-tile engine (engine/tilemap.js) from hand-authored DATA (src/data/hubMap.js: 40×28 tiles; ground / decor-under / decor-over layers + a walkability grid; spawn + zones). A camera follows the player and clamps to the map bounds; natural borders (water lake, tree lines) replace invisible walls; tree canopies (decor-over) draw over entities so the player walks behind them. The bottom-anchored Mana Seed player (keyboard WASD/arrows + reused touch joystick, 4-direction walk with animation, facing persists when idle) collides feet-box vs the walkability grid with edge sliding. DATA-DRIVEN interaction zones (in hubMap.js) — "Trial Gate" opens Practice, "Mirror" opens avatar customization (both labels placeholders) — plus a persistent Quick Race button; sub-screens (Practice/Race/Avatar) return via a reload-proof sessionStorage origin (saves.getOrigin/setOrigin) that survives a hard reload. Last hub position persisted per profile; player state kept as ONE plain serializable object. Avatar look is DATA (hub Phase 2): a plain serializable descriptor { body, outfit, outfitColor, hair, hairColor, hat, hatColor } rendered by a palette-swap compositor (engine/avatarComposite.js) that maps official Mana Seed ramps — extracted EXACTLY into src/data/avatarPalettes.js by scripts/generate-avatar-palettes.mjs, style manifest in src/data/avatarManifest.js — onto ONE cached composited sheet per look (body→outfit→hair→hat, once per descriptor, not per frame); customization screen (/avatar) is fully manifest-driven (one picker row per slot) with a live walking preview, per-slot style arrows + ramp-driven color swatches, Randomize, and Save/Cancel; avatar persisted per profile (saves.getAvatar/setAvatar). Hub Phase 1.5 additions: (B) a hat slot with a 'none' (bare-headed) option plus Straw/Pointed hats (5 colors each), drawn last on top of hair; old saved avatars normalize to hat 'none'. (C) ambient wildlife — placeholder, non-interactive critters (free Mana Seed slime, gentle idle-bob only; attack/death frames intentionally unused) with a fixed per-map population (hubMap.critters), wander behavior (engine/critters.js: idle → pick a walkable target clear of zones → glide → idle, small feet-box vs the grid so they never enter water/trees/borders, and they pass through the player), sheet config in src/data/critters.js and motion feel in tuning.js HUB.critter; critters + player are depth-sorted by feet-Y and draw under the canopy layer. Regression scripts: verify-opponents-render.mjs, verify-combat.mjs, and verify-hub-render.mjs (asserts map load, walkability, zones, camera clamp, palette compositing incl. a newly-added hat style, and that critters animate + stay on walkable ground while wandering) — run the relevant ones after render/combat/audio-loop/hub changes. Chassis are placeholder vector art awaiting sprites; hub sprites are the free Mana Seed demo base (placeholder). Dev tool scripts/render-hub-snapshot.mjs renders the full hub map (all tile layers) to tmp/hub-snapshot.png (gitignored) via the real HubScene + its verify hook, for visual sanity-checks. Wardrobe inventory pass (Hub Phase 1.6) against the second free pack ("25.07 Free Mana Seed RPG Starter Pack", extracted at ../assets/manaseed2/ outside the repo) found NO new usable wardrobe content: every char_a_p1 body/outfit/hair/hat file already in public/sprites/hub/layers/ is byte-identical to this pack, and the only two files not yet present (1out/boxr, 1out/undi — both single-color, shirtless-plus-underwear looks) were declined as inappropriate for the wardrobe. The pack's char_a_pONE1/2/3 pages share char_a_p1's 512x512/8x8 dimensions but hold combat animations (draw/sheath, parry, dodge, hurt, dead), not stand/walk, so they don't conform to the current compositor's row assumptions — flagged as future held-item/combat-stance material (their 6tla/7tlb weapon/shield layers + the pack's standalone icon-style weapon sprites are catalogued, not integrated). Its tileset/slime assets are already in use (confirmed byte-identical). Hub Phase 1.7 turned the pack's npc man/woman sheets (previously catalogued as hub-NPC material) into two STANDALONE avatar body options instead — generic "Traveler (Man)"/"Traveler (Woman)" cosmetic looks, no names/lore invented. Confirmed on the actual files (not assumed): 128x256 canvas, content only in the top 128x128, a 4-col x4-row grid of 32x32 frames — row0 down, row1 RIGHT, row2 up, row3 LEFT (row3 is a pixel-perfect mirror of row1 baked into the file; verified with an objective landmark — the eye, the darkest opaque pixel in the frame, sits right-of-center for row1 and left-of-center for row3 — after an initial pass had these two backwards, caught only once actually playtested, not by the render/compositing checks, which is why verify-hub-render.mjs now asserts eye-x directly instead of trusting row labels), 4 walk frames (vs char_a_p1's 6, no separate idle row — col0 doubles as idle); v00 of each is an intentionally-ugly reference palette per the pack's readme, so only v01-v04 (4 colors) are used. These do NOT go through the palette-swap compositor: `avatarComposite.js` short-circuits for `standalone` body styles (data/avatarManifest.js) and caches/draws the variant sheet directly. The descriptor keeps its existing seven fields — no new shape — by compound-encoding the body slot (`"npcMan:c00"`; a plain value with no ':' still means the legacy human skin color, so old saves load unchanged); `data/tuning.js` HUB.npcSprite holds the standalone frame grid/timing/drawScale so nothing is hardcoded — drawScale tracks HUB.player.drawScale directly (NOT doubled despite the frame being half the pixel size: the composited player's actual character only fills about half its 64px frame, while this art fills nearly all of its 32px frame, so the on-screen character sizes already match at the same scale — measured on real pixels, not assumed, after an initial doubled-scale pass rendered ~2x too big). Selecting a standalone body visibly locks (grays out, inert) the outfit/hair/hat rows in /avatar since their look is baked in; Randomize and the live preview both handle either mode. Not yet built: typed attacks + HP, special-move perk, creature/vehicle select, multi-track themes, roadside allies (lore-blocked), menus, real (non-slime) wildlife + interactive creatures, multi-profile UI (hub Phase 3+), held-item cosmetic slot.

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