// Ambient wildlife sheet configs (DATA). These are PLACEHOLDER wild critters —
// NOT Animalians, not typed, not named species. They are purely decorative and
// non-interactive (they never chase, block, attack, or startle). Real creature
// designs come later from the project side.
//
// The slime sheet (Mana Seed monster) is a 512px page of 64px frames (8x8).
// We use ONLY the gentle idle "bob" (row 0, cols 0-3); the sheet's attack
// (tentacles/spit) and death (splat) frames are intentionally never referenced,
// so the critter always reads as calm and friendly. Slimes have no facing, so
// there is a single animation regardless of movement direction.
export const CRITTER_SHEETS = {
  slime: {
    src: '/sprites/hub/critters/slime.png',
    frameSize: 64,
    columns: 8,
    idleRow: 0,
    idleCol: 0,
    idleFrames: 4, // row 0, cols 0-3 — a soft breathing bob
    drawScale: 1.5, // small; sits comfortably under the ~2-tile-tall player
    yOffset: 4, // nudge the bottom anchor down so it rests on the ground
  },
}
