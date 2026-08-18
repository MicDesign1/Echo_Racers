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
//
// Slime palette variants (slimeAmber, slimeGreen, slimePink) are runtime hue-
// rotations of the same placeholder slime sheet, not distinct species.
//
// NPC wanderers (npcManA, npcManB, npcWomanA, npcWomanB) are placeholder
// villagers from the Mana Seed starter pack — NOT story NPCs, not named, not
// Animalians. They walk with facing (4-direction) and use the standalone NPC
// sprite grid (128x256, 4x4 of 32px frames). Same calm wander behavior as slimes.
import { HUB } from './tuning.js'

export const CRITTER_SHEETS = {
  slime: {
    kind: 'slime',
    src: '/sprites/hub/critters/slime.png',
    frameSize: 64,
    columns: 8,
    idleRow: 0,
    idleCol: 0,
    idleFrames: 4, // row 0, cols 0-3 — a soft breathing bob
    drawScale: 1.5, // small; sits comfortably under the ~2-tile-tall player
    yOffset: 4, // nudge the bottom anchor down so it rests on the ground
    hueRotate: 0, // degrees
  },
  slimeAmber: {
    kind: 'slime',
    src: '/sprites/hub/critters/slime.png',
    frameSize: 64,
    columns: 8,
    idleRow: 0,
    idleCol: 0,
    idleFrames: 4,
    drawScale: 1.5,
    yOffset: 4,
    hueRotate: 40, // warm amber/gold
  },
  slimeGreen: {
    kind: 'slime',
    src: '/sprites/hub/critters/slime.png',
    frameSize: 64,
    columns: 8,
    idleRow: 0,
    idleCol: 0,
    idleFrames: 4,
    drawScale: 1.5,
    yOffset: 4,
    hueRotate: 140, // leaf green
  },
  slimePink: {
    kind: 'slime',
    src: '/sprites/hub/critters/slime.png',
    frameSize: 64,
    columns: 8,
    idleRow: 0,
    idleCol: 0,
    idleFrames: 4,
    drawScale: 1.5,
    yOffset: 4,
    hueRotate: 280, // pink/violet
  },
  npcManA: {
    kind: 'npc',
    src: '/sprites/hub/npc/npc_man_a_v01.png',
    frameSize: 32,
    columns: 4,
    walkFrames: 4,
    idleCol: 0,
    // Row order: 0 down, 1 right, 2 up, 3 left
    rowForFacing: { down: 0, right: 1, up: 2, left: 3 },
    // Same draw scale as player standalone NPC body (HUB.player.drawScale * HUB.npcSprite.sizeBoost)
    get drawScale() { return HUB.npcSprite.drawScale },
    yOffset: 0, // bottom-center anchor like player
    speed: 50, // px/s, a bit quicker than slime (26 px/s)
  },
  npcManB: {
    kind: 'npc',
    src: '/sprites/hub/npc/npc_man_a_v02.png',
    frameSize: 32,
    columns: 4,
    walkFrames: 4,
    idleCol: 0,
    rowForFacing: { down: 0, right: 1, up: 2, left: 3 },
    get drawScale() { return HUB.npcSprite.drawScale },
    yOffset: 0,
    speed: 50,
  },
  npcWomanA: {
    kind: 'npc',
    src: '/sprites/hub/npc/npc_woman_a_v01.png',
    frameSize: 32,
    columns: 4,
    walkFrames: 4,
    idleCol: 0,
    rowForFacing: { down: 0, right: 1, up: 2, left: 3 },
    get drawScale() { return HUB.npcSprite.drawScale },
    yOffset: 0,
    speed: 50,
  },
  npcWomanB: {
    kind: 'npc',
    src: '/sprites/hub/npc/npc_woman_a_v02.png',
    frameSize: 32,
    columns: 4,
    walkFrames: 4,
    idleCol: 0,
    rowForFacing: { down: 0, right: 1, up: 2, left: 3 },
    get drawScale() { return HUB.npcSprite.drawScale },
    yOffset: 0,
    speed: 50,
  },
}
