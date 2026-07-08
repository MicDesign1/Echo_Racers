// Hand-authored hub map (Mana Seed "Seasonal Forest" summer atlas). This is
// pure DATA: three tile layers (ground, decorUnder, decorOver), a walkability
// grid, interaction zones, and the spawn point. The tilemap engine just draws
// these stored choices — there is no autotiling here.
//
// Atlas facts: 16px tiles, 16 tiles wide (256px). A tile id = row*16 + col.
// Layer draw order: ground -> decorUnder -> [entities] -> decorOver, so tree
// canopies (decorOver) render OVER the player (walk-behind).
//
// Zone/spawn positions are TILE coords (converted to world px via the tilemap);
// zone radius is in world px. Labels are placeholders per the brief.

const W = 40
const H = 28

// --- named atlas tiles (col,row picked from the labeled atlas grid) ---
const A = (col, row) => row * 16 + col
const GRASS = A(0, 4) // plain grass
const GRASS2 = A(0, 3) // grass variant, for light texture break-up
const DIRT = A(4, 2) // solid brown soil (path fill; the (1-3,1-5) block is grass-edged)
const WATER = A(13, 14) // deep water
const BUSH = A(1, 8) // leafy bush (decor)
const ROCK = A(4, 8) // small rock (decor)
// Tree: canopy block atlas cols 11..15 rows 0..4; trunk cols 12..14 rows 5..6.

// --- layers ---
const ground = new Array(W * H).fill(GRASS)
const decorUnder = new Array(W * H).fill(-1)
const decorOver = new Array(W * H).fill(-1)
const walk = new Array(W * H).fill(1)

const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H
const idx = (x, y) => y * W + x
function setGround(x, y, t) { if (inb(x, y)) ground[idx(x, y)] = t }
function block(x, y) { if (inb(x, y)) walk[idx(x, y)] = 0 }
function rect(x0, y0, x1, y1, fn) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn(x, y)
}

// Stamp a tree with its trunk base at tile (cx,cy): canopy into decorOver
// (walk-behind), trunk into decorUnder, trunk footprint blocked.
function stampTree(cx, cy) {
  for (let r = 0; r <= 4; r++) {
    for (let c = 0; c <= 4; c++) {
      const x = cx - 2 + c
      const y = cy - 6 + r
      if (inb(x, y)) decorOver[idx(x, y)] = A(11 + c, r)
    }
  }
  for (let r = 0; r <= 1; r++) {
    for (let c = 0; c <= 2; c++) {
      const x = cx - 1 + c
      const y = cy - 1 + r
      if (inb(x, y)) { decorUnder[idx(x, y)] = A(12 + c, 5 + r); block(x, y) }
    }
  }
}

// Light grass texture variation (deterministic scatter, purely visual).
for (let i = 0; i < W * H; i += 7) ground[i] = GRASS2

// --- natural borders (map edges unwalkable, covered by trees/water) ---
// Top forest wall.
rect(0, 0, W - 1, 6, block)
// Bottom lake.
rect(0, 25, W - 1, 27, (x, y) => { setGround(x, y, WATER); block(x, y) })
// Left + right tree walls (interior playfield is cols 5..34).
rect(0, 7, 4, 24, block)
rect(35, 7, W - 1, 24, block)

// Tree lines along the top and sides (canopies overlap into a forest edge).
for (let cx = 3; cx <= 39; cx += 4) stampTree(cx, 6)
for (const cy of [11, 16, 21, 24]) { stampTree(3, cy); stampTree(38, cy) }

// A couple of interior feature trees to demonstrate walk-behind on open grass.
stampTree(13, 13)
stampTree(30, 12)

// --- the path: spawn -> Trial Gate (up) -> Mirror (left) ---
// Vertical trunk of the path.
rect(20, 8, 21, 23, (x, y) => setGround(x, y, DIRT))
// Horizontal branch to the Mirror clearing.
rect(9, 16, 21, 17, (x, y) => setGround(x, y, DIRT))

// --- light decor on grass (non-blocking, kept clear of path + zones) ---
const decorSpots = [
  [26, 10, BUSH], [15, 21, BUSH], [32, 22, BUSH],
  [24, 20, ROCK], [11, 22, ROCK], [28, 9, ROCK],
]
for (const [x, y, t] of decorSpots) if (inb(x, y)) decorUnder[idx(x, y)] = t

export const HUB_MAP = {
  w: W,
  h: H,
  ground,
  decorUnder,
  decorOver,
  walk,
  spawn: { tx: 20, ty: 22 }, // on the path, in a clearing
  zones: [
    { id: 'trialGate', tx: 20, ty: 9, radius: 104, label: 'Trial Gate', action: 'practice' },
    { id: 'mirror', tx: 9, ty: 16, radius: 92, label: 'Mirror', action: 'avatar' },
  ],
  // Fixed ambient wildlife population (placeholder critters — see
  // data/critters.js). Placed on open grass, clear of zones/path/trees.
  critters: [
    { type: 'slime', tx: 26, ty: 19 },
    { type: 'slime', tx: 15, ty: 21 },
    { type: 'slime', tx: 31, ty: 20 },
  ],
}
