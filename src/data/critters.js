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
//
// Pumpkin dude: user-supplied free sheet, side-view hop (4 frames 128x32).
// Soldier: Cainos Tiny RPG Character Asset Pack, idle/walk only (no attack/hurt/death).
// TODO: Drop pumpkin_dude.png, soldier-idle.png, soldier-walk.png into public/sprites/hub/critters/
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
  pumpkin: {
    kind: 'pumpkin',
    src: '/sprites/hub/critters/pumpkin_dude.png',
    frameWidth: 16,   // 8 frames of 16px wide × 32px tall (not square)
    frameHeight: 32,
    columns: 8,
    idleRow: 0,
    idleCol: 0,
    idleFrames: 8, // side-view hop, all 8 frames play continuously
    drawScale: 2.0, // scales 16×32 to 32×64 on screen, similar to villagers
    yOffset: 0,
    flipWhenLeft: true, // flip horizontally when walking left
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
  soldier: {
    kind: 'soldier',
    // Cainos Tiny RPG: idle 6 frames / walk 8 frames, 100x100 cells with padding
    // Sprite content ~32px in 100px cell, so drawScale tuned to match Mana Seed villagers
    src: '/sprites/hub/critters/soldier-walk.png',
    idleSrc: '/sprites/hub/critters/soldier-idle.png',
    frameSize: 100,
    idleFrames: 6,
    walkFrames: 8,
    drawScale: 1.2, // tuned so ~32px content matches villager on-screen size
    yOffset: 30, // adjust so feet sit on ground (sprite has lots of vertical padding)
    flipWhenLeft: true, // 3q side-view, flip for left
    speed: 50,
  },
  // CraftPix tiny-hero blob people: idle (128×32 = 4 frames) + walk (192×32 = 6 frames).
  // Side-view like pumpkin/soldier, flip when left. Credit: craftpix.net/file-licenses/
  // craftpix-net-622999 idle+walk only (no attack/hurt/death).
  blobPink: {
    kind: 'blob',
    idleSrc: '/sprites/hub/critters/craftpix/pink-idle.png',
    src: '/sprites/hub/critters/craftpix/pink-walk.png',
    frameWidth: 32,
    frameHeight: 32,
    idleFrames: 4, // idle sheet 128×32
    walkFrames: 6, // walk sheet 192×32
    get drawScale() { return HUB.npcSprite.drawScale },
    yOffset: 0,
    flipWhenLeft: true,
  },
  blobOwlet: {
    kind: 'blob',
    idleSrc: '/sprites/hub/critters/craftpix/owlet-idle.png',
    src: '/sprites/hub/critters/craftpix/owlet-walk.png',
    frameWidth: 32,
    frameHeight: 32,
    idleFrames: 4,
    walkFrames: 6,
    get drawScale() { return HUB.npcSprite.drawScale },
    yOffset: 0,
    flipWhenLeft: true,
  },
  blobDude: {
    kind: 'blob',
    idleSrc: '/sprites/hub/critters/craftpix/dude-idle.png',
    src: '/sprites/hub/critters/craftpix/dude-walk.png',
    frameWidth: 32,
    frameHeight: 32,
    idleFrames: 4,
    walkFrames: 6,
    get drawScale() { return HUB.npcSprite.drawScale },
    yOffset: 0,
    flipWhenLeft: true,
  },
  // CraftPix predator plants (craftpix-net-284465): 4-direction carnivorous plants.
  // Idle: 256×256, 4×4 grid of 64px frames (4 idle frames per direction).
  // Walk: 384×256, 6×4 grid of 64px frames (6 walk frames per direction).
  // Credit: craftpix.net/file-licenses/
  plant1: {
    kind: 'plant4',
    idleSrc: '/sprites/hub/critters/craftpix/plant1-idle.png',
    src: '/sprites/hub/critters/craftpix/plant1-walk.png',
    frameWidth: 64,
    frameHeight: 64,
    idleFrames: 4,
    walkFrames: 6,
    drawScale: 1.5,
    yOffset: 0,
    // Row order determined by actual PNG inspection (don't assume)
    rowForFacing: { down: 0, right: 1, up: 2, left: 3 },
  },
  plant2: {
    kind: 'plant4',
    idleSrc: '/sprites/hub/critters/craftpix/plant2-idle.png',
    src: '/sprites/hub/critters/craftpix/plant2-walk.png',
    frameWidth: 64,
    frameHeight: 64,
    idleFrames: 4,
    walkFrames: 6,
    drawScale: 1.5,
    yOffset: 0,
    rowForFacing: { down: 0, right: 1, up: 2, left: 3 },
  },
  plant3: {
    kind: 'plant4',
    idleSrc: '/sprites/hub/critters/craftpix/plant3-idle.png',
    src: '/sprites/hub/critters/craftpix/plant3-walk.png',
    frameWidth: 64,
    frameHeight: 64,
    idleFrames: 4,
    walkFrames: 6,
    drawScale: 1.5,
    yOffset: 0,
    rowForFacing: { down: 0, right: 1, up: 2, left: 3 },
  },
}
