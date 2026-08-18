# Vehicle Sprite Frames — Art Contract

This folder holds the 5-angle sprite frames for each Warden hovercraft. Frames are **optional** — if a frame is missing, the game engine falls back to the placeholder vector chassis with no crash.

## File Format

- **Individual frames only**, never sprite sheets
- **512px × 512px WebP** with alpha transparency
- **Bottom-center aligned** in the frame (vehicle's ground-contact point sits at the bottom-center pixel)
- **Case-sensitive paths** (Cloudflare Pages deployment requires exact case)

## Five Required Views Per Craft

Each vehicle needs exactly **five frames**, rendered from these camera angles:

1. **Rear straight** (`<craft-id>-straight.webp`)
   - Camera directly behind the vehicle, level
   - Vehicle facing away from camera, no yaw

2. **Slight-left** (`<craft-id>-slight-left.webp`)
   - Camera still behind, slight yaw to the left (~15-20°)
   - Vehicle banking gently left

3. **Slight-right** (`<craft-id>-slight-right.webp`)
   - Camera still behind, slight yaw to the right (~15-20°)
   - Vehicle banking gently right

4. **Hard-left** (`<craft-id>-hard-left.webp`)
   - Camera behind, stronger yaw to the left (~40-50°)
   - Vehicle banking sharply left (drift pose)

5. **Hard-right** (`<craft-id>-hard-right.webp`)
   - Camera behind, stronger yaw to the right (~40-50°)
   - Vehicle banking sharply right (drift pose)

## Camera Setup Notes

- **Position**: Behind and slightly above the vehicle, looking down at a shallow angle (similar to OutRun/arcade racer perspective)
- **Distance**: Far enough that the full vehicle (including any fins/wings) fits comfortably in the 512px frame with some breathing room
- **Ground contact**: The vehicle's lowest point (where it touches the road) must sit **exactly at the bottom-center** of the 512px canvas
- **Framing**: Leave ~20-30px of transparent padding around the vehicle so nothing clips at the edges when the sprite scales

## Color Separation for Runtime Tinting

**CRITICAL**: Resonance-glow pixels must stay in a **distinct color range** from hull metal so the engine can recolor glow and hull independently later (future customization system).

- **Hull metal**: Brushed silver, brass, verdigris copper (warm metallic tones)
- **Resonance glow**: Cyan, light blue, teal (cool, distinct from metal)

Keep glow pixels in a separate visual range (e.g., cyan/aqua hues) so they don't blend into the hull's brass/silver palette. The engine will add runtime palette-swap support once the sprite pipeline is proven.

## Art Direction

**Vehicles are all-metal Warden hovercraft:**
- Brushed silver base
- Brass and verdigris copper accents
- Soft "resonance light" glow from intake/underbelly (cyan/aqua tones)
- Victorian naturalist meets ancient Atlantean craftsmanship

**No stone on vehicles** — stone appears only in environments (roadside pillars, track boundaries). Vehicles are pure metal + energy glow.

## Wiring a New Craft

Once you've exported the five WebP frames for a craft:

1. Drop the frames into this folder (`public/sprites/vehicles/`)
2. Open `src/data/vehicles.js`
3. Add a new entry to `VEHICLES` with your craft's id and frame paths:

```js
myCraft: {
  id: 'my-craft',
  label: 'My Craft', // placeholder name (real names are lore-gated)
  frames: {
    straight: 'sprites/vehicles/my-craft-straight.webp',
    slightLeft: 'sprites/vehicles/my-craft-slight-left.webp',
    slightRight: 'sprites/vehicles/my-craft-slight-right.webp',
    hardLeft: 'sprites/vehicles/my-craft-hard-left.webp',
    hardRight: 'sprites/vehicles/my-craft-hard-right.webp',
  },
},
```

No code changes needed — the engine picks up the new frames immediately.

## Current Placeholder Craft

The **placeholder** craft id is currently active for all racers. Its frames are all `null` in `vehicles.js`, so the vector chassis draws. Once you drop the five WebP frames and wire their paths, the sprites replace the vector art with no other changes.

### Example Filenames

For the placeholder craft (once exported):

- `placeholder-straight.webp`
- `placeholder-slight-left.webp`
- `placeholder-slight-right.webp`
- `placeholder-hard-left.webp`
- `placeholder-hard-right.webp`

## Testing

Run the game in a browser. The sprite frames (if present and loaded) draw automatically. If a frame is missing or fails to load:
- The engine falls back to the vector chassis (you'll see the colored geometric craft)
- A warning logs once to the console: `[car.js] Failed to load sprite frame: <path>`

No crashes, no blank cars — the vector fallback ensures the game stays playable while art is in progress.
