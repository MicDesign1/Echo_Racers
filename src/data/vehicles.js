// Vehicle sprite manifest. Maps each craft id to its 5-angle WebP frame URLs
// (rear straight, slight-left, slight-right, hard-left, hard-right). Frames
// are 512px WebP with alpha, bottom-center aligned, into public/sprites/vehicles/.
//
// Art contract (locked from project handoff):
//  - Individual frames, never a sprite sheet
//  - 512px WebP with alpha, bottom-center aligned
//  - Into public/sprites/vehicles/ (case-sensitive paths)
//  - Per craft, five views: rear straight, slight-left, slight-right, hard-left, hard-right
//  - Resonance-glow pixels must stay in a distinct color range from hull metal
//    (cyan/resonance vs brass/silver) so glow and hull can tint independently later
//  - Vehicles are all-metal Warden hovercraft: brushed silver, brass, verdigris copper.
//    No stone on vehicles.
//
// Frames are optional — if a frame is missing or hasn't loaded, the engine
// falls back to the vector chassis with no crash. This lets the pipeline be
// wired and tested before art is ready.

export const VEHICLES = {
  // Placeholder craft id — the single vehicle every racer currently uses.
  // Once real sprite frames land, their paths are wired here. Until then,
  // all entries stay null and the engine draws the vector chassis.
  placeholder: {
    id: 'placeholder',
    label: 'Placeholder Craft', // non-narrative placeholder name
    frames: {
      straight: null, // 'sprites/vehicles/placeholder-straight.webp'
      slightLeft: null, // 'sprites/vehicles/placeholder-slight-left.webp'
      slightRight: null, // 'sprites/vehicles/placeholder-slight-right.webp'
      hardLeft: null, // 'sprites/vehicles/placeholder-hard-left.webp'
      hardRight: null, // 'sprites/vehicles/placeholder-hard-right.webp'
    },
  },
}

// The default vehicle every racer uses. Once creature/vehicle selection is
// built, this will resolve per-racer, but for now it's a constant.
export function defaultVehicle() {
  return VEHICLES.placeholder
}
