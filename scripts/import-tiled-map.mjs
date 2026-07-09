// One-time importer: converts a Tiled .tmj export into the plain data shape
// src/data/hubMap.js exports: ground (one flat array), decorUnder/decorOver
// (each an ARRAY of layers, preserving Tiled's own stacking/transparency —
// flattening to one tile per cell would silently break cases where two
// tiles genuinely composite at the same cell, e.g. a bush's transparent
// corners revealing a cliff face drawn under it), walk, spawn/zones/critters.
// This just replaces how hubMap.js's terrain arrays get authored (baked from
// Tiled instead of hand-written rect()/stampTree() calls).
//
// Walkability is derived from TILE IDENTITY (see docs/tile-grammar.md), not
// from which layer a tile sits in — the map deliberately puts blocking cliff
// faces and lodge walls in "over" layers so they draw in front of the player
// standing at their base, so a layer-based rule would get that backwards.
//
// Re-run after every hub.tmj re-export: `node scripts/import-tiled-map.mjs`
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TMJ_PATH = process.argv[2] || 'E:/KID GAME/map-work/hub.tmj'
const OUT_PATH = path.join(__dirname, '..', 'src', 'data', 'hubMap.js')
const TILES_PER_CRITTER = 175 // must match data/tuning.js HUB.critter.tilesPerCritter

// Must mirror data/tuning.js HUB.tile.atlases (name here is the Tiled
// tileset name, matched against hub.tmj's own tileset list below) — this is
// the single source of truth for the unified tile-id space across atlases.
const ATLAS_CONFIG = [
  { name: 'forest-summer', count: 256 },
  { name: 'lodge', count: 128 },
]

const tmj = JSON.parse(fs.readFileSync(TMJ_PATH, 'utf8'))
const W = tmj.width
const H = tmj.height
if (tmj.tilewidth !== 16 || tmj.tileheight !== 16) {
  throw new Error(`expected 16px tiles, got ${tmj.tilewidth}x${tmj.tileheight}`)
}
if (tmj.infinite) throw new Error('infinite maps are not supported')

// --- gid -> unified id, per ATLAS_CONFIG (offsets computed cumulatively, ---
// --- same order as tuning.js) rather than trusting firstgid arithmetic. ---
let cumulative = 0
const offsetByName = {}
for (const a of ATLAS_CONFIG) { offsetByName[a.name] = cumulative; cumulative += a.count }

const tilesetByGidDesc = [...tmj.tilesets].sort((a, b) => b.firstgid - a.firstgid)
for (const ts of tmj.tilesets) {
  if (!(ts.name in offsetByName)) throw new Error(`unrecognized tileset "${ts.name}" — add it to ATLAS_CONFIG (and tuning.js HUB.tile.atlases) first`)
  if (ts.columns !== 16) throw new Error(`tileset "${ts.name}" has ${ts.columns} columns, engine assumes 16`)
  const expected = ATLAS_CONFIG.find((a) => a.name === ts.name).count
  if (ts.tilecount !== expected) throw new Error(`tileset "${ts.name}" has ${ts.tilecount} tiles, ATLAS_CONFIG expects ${expected}`)
}
function unifiedId(gid) {
  if (gid === 0) return -1
  if (gid & 0xf0000000) throw new Error(`gid ${gid} has a flip/rotation flag set — not supported`)
  const ts = tilesetByGidDesc.find((t) => gid >= t.firstgid)
  if (!ts) throw new Error(`no tileset covers gid ${gid}`)
  return offsetByName[ts.name] + (gid - ts.firstgid)
}

// --- merge layers per Mic's rule: bottom "ground" fill -> ground; every ---
// --- "decor-under"-prefixed layer merges (in file/stacking order) -> ---
// --- decorUnder; every "decor-over"-prefixed layer merges the same way. ---
const tileLayers = tmj.layers.filter((l) => l.type === 'tilelayer')
for (const l of tileLayers) {
  if (l.width !== W || l.height !== H) throw new Error(`layer "${l.name}" size mismatch`)
}
const groundLayer = tileLayers.find((l) => l.name === 'ground')
if (!groundLayer) throw new Error('missing "ground" layer')
const underLayers = tileLayers.filter((l) => l.name.startsWith('decor-under'))
const overLayers = tileLayers.filter((l) => l.name.startsWith('decor-over'))
if (underLayers.length === 0) throw new Error('no decor-under layer(s) found')
if (overLayers.length === 0) throw new Error('no decor-over layer(s) found')
console.log(`layers: ground=1, decor-under=${underLayers.length} (${underLayers.map((l) => l.name).join(', ')}), decor-over=${overLayers.length} (${overLayers.map((l) => l.name).join(', ')})`)

const ground = groundLayer.data.map(unifiedId)
// decorUnder/decorOver are each an ARRAY OF LAYERS, not flattened to one
// winner-takes-all tile per cell. Tiled genuinely lets multiple tiles
// composite with transparency at the same cell (e.g. a bush's transparent
// corners revealing a cliff face drawn underneath it in a different
// decor-under-family layer) — collapsing to a single array would silently
// destroy that whenever two tiles in the same group share a cell. The
// engine draws each sub-layer in sequence, same as Tiled itself composites.
const decorUnder = underLayers.map((l) => l.data.map(unifiedId))
const decorOver = overLayers.map((l) => l.data.map(unifiedId))
// Every individual layer's data (flat list, for walkability/known-id checks
// below — order doesn't matter here, every layer is checked independently).
const allRawLayers = [ground, ...decorUnder, ...decorOver]

// --- walkability from tile identity (docs/tile-grammar.md) ---
function isBlockingId(id) {
  if (id < 0) return false
  if (id < 256) {
    // forest-summer
    const c = id % 16
    const r = Math.floor(id / 16)
    if (c >= 5 && c <= 10) return true // cliff family, ALL rows incl. the rounded-cap rim (rows 0-3): per
    // tile-grammar.md the cap's rows 0-3 supply ONLY the mound's edge/corner
    // art (top-left/right corners, top+side edges) — the atlas's own note
    // that the interior is "mostly transparent... just fill with plain
    // grass there" means a genuinely walkable hilltop would use plain grass
    // tiles (col 0), never these. So the rim tiles are always a boundary,
    // not open ground — confirmed needed as a fix: Mic's wall near the cave
    // uses a few of these rim tiles as a decorative top edge, and treating
    // rows 0-3 as walkable let the player climb through/onto the wall there.
    if (c >= 11 && c <= 13 && (r === 13 || r === 14)) return true // plain water fill
    if (c >= 11 && c <= 14 && r >= 7 && r <= 10) return true // cave mouth (decorative, no interior)
    if (c >= 12 && c <= 14 && (r === 5 || r === 6)) return true // tree trunk
    if (c >= 2 && c <= 3 && r >= 10 && r <= 12) return true // garden wall, horizontal run
    if (c === 0 && r >= 11 && r <= 13) return true // garden wall, corner return
    if (c === 1 && r >= 12 && r <= 14) return true // garden wall, corner return
    if (c >= 2 && c <= 3 && r >= 14 && r <= 15) return true // boulder pair (2x2)
    if (c === 4 && r >= 8 && r <= 9) return true // big smooth boulder
    return false
  }
  // lodge (id 256..383): row-based, independent of column, per tile-grammar.md
  const r = Math.floor((id - 256) / 16)
  return r >= 6 && r <= 7 // log-cabin walls (incl. windows) are solid; roof (rows 2-5) is not
}

// --- report any tile id outside every known category, so a future ---
// --- re-export with new/unfamiliar tiles gets flagged instead of silently ---
// --- defaulted. None expected for the current hub.tmj (all verified on ---
// --- real atlas pixels already). ---
function isKnownId(id) {
  if (id < 0) return true
  if (id < 256) {
    const c = id % 16, r = Math.floor(id / 16)
    if (c === 0) return true // grass (r 0-5), bush variant (r 9)
    if (c >= 1 && c <= 3 && r <= 5) return true // dirt-patch autotile
    if (c === 4 && r <= 9) return true // dirt / pebble / boulder
    if (c === 4 && (r >= 10 && r <= 12)) return true // blank (verified)
    if (c === 4 && (r === 14 || r === 15)) return true // blank (verified)
    if (c <= 3 && (r === 6 || r === 7)) return true // flowers
    if (c <= 2 && r === 8) return true // bush variants
    if (c === 3 && r === 8) return true // pebble
    if (c === 1 && r === 9) return true // blank (verified)
    if (c === 2 && r === 9) return true // blank (verified)
    if (c === 3 && r === 9) return true // pebble
    if (c >= 5 && c <= 10) return true // cliff family, all rows
    if (c >= 11 && c <= 14 && r >= 7 && r <= 10) return true // cave
    if (c >= 11 && c <= 15 && r <= 6) return true // canopy/trunk + verified blanks at (11/15, 5-6)
    if (c === 15 && r >= 7 && r <= 10) return true // plain grass background (right of the cave)
    if (c >= 11 && c <= 15 && r === 11) return true // blank (verified)
    if (c >= 11 && c <= 13 && (r === 13 || r === 14)) return true // water
    if (c >= 2 && c <= 3 && r >= 10 && r <= 15) return true // garden wall / boulder pair
    if (c === 0 && r >= 11 && r <= 13) return true
    if (c === 1 && r >= 12 && r <= 14) return true
    if (c === 11 || c === 12) return r === 15 // cobble
    return false
  }
  const local = id - 256
  const r = Math.floor(local / 16)
  return r >= 2 && r <= 7 // roof + wall band; rows 0-1 (swatches) unused/unexpected
}

const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H
const idx = (x, y) => y * W + x
const walk = new Array(W * H).fill(1)
const unclassified = new Map()
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y)
    let blocked = false
    for (const layerData of allRawLayers) {
      const id = layerData[i]
      if (!isKnownId(id)) {
        const key = id < 256 ? `forest(${id % 16},${Math.floor(id / 16)})` : `lodge(${(id - 256) % 16},${Math.floor((id - 256) / 16)})`
        if (!unclassified.has(key)) unclassified.set(key, [])
        unclassified.get(key).push(`(${x},${y})`)
      }
      if (isBlockingId(id)) blocked = true
    }
    if (blocked) walk[i] = 0
  }
}
if (unclassified.size > 0) {
  console.log('UNCLASSIFIED tiles found — resolve against docs/tile-grammar.md (pixel-check via inspect-tileset.mjs) before trusting walkability:')
  for (const [k, positions] of unclassified) console.log(`  ${k}: ${positions.length}x, e.g. ${positions.slice(0, 5).join(' ')}`)
  throw new Error(`${unclassified.size} unclassified tile categor${unclassified.size === 1 ? 'y' : 'ies'} — see above`)
}
console.log('tile identity check: every tile id used is a known, classified category')

// --- flood fill: find the largest connected walkable component ---
function floodFillFrom(sx, sy) {
  const seen = new Uint8Array(W * H)
  const stack = [[sx, sy]]
  const cells = []
  seen[idx(sx, sy)] = 1
  while (stack.length) {
    const [x, y] = stack.pop()
    cells.push([x, y])
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy
      if (!inb(nx, ny)) continue
      const ni = idx(nx, ny)
      if (seen[ni] || walk[ni] !== 1) continue
      seen[ni] = 1
      stack.push([nx, ny])
    }
  }
  return cells
}

let mainComponent = []
const visitedGlobal = new Set()
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (walk[idx(x, y)] !== 1 || visitedGlobal.has(idx(x, y))) continue
    const comp = floodFillFrom(x, y)
    for (const [cx, cy] of comp) visitedGlobal.add(idx(cx, cy))
    if (comp.length > mainComponent.length) mainComponent = comp
  }
}
const totalWalkable = walk.reduce((a, v) => a + (v === 1 ? 1 : 0), 0)
console.log(`walkable: ${totalWalkable} total, ${mainComponent.length} in main connected component`)
if (mainComponent.length < totalWalkable) {
  console.log(`  NOTE: ${totalWalkable - mainComponent.length} walkable tile(s) are isolated pockets outside the main component`)
}

// --- landmark cell sets (any layer) ---
function collectByCategory(pred) {
  const cells = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y)
      if (pred(ground[i]) || decorUnder.some((l) => pred(l[i])) || decorOver.some((l) => pred(l[i]))) cells.push([x, y])
    }
  }
  return cells
}
const isCave = (id) => { if (id < 0 || id >= 256) return false; const c = id % 16, r = Math.floor(id / 16); return c >= 11 && c <= 14 && r >= 7 && r <= 10 }
const isLodge = (id) => id >= 256
const caveCells = collectByCategory(isCave)
const lodgeCells = collectByCategory(isLodge)
if (caveCells.length === 0) throw new Error('no cave-mouth tiles found — cannot place the Races zone')
if (lodgeCells.length === 0) throw new Error('no lodge tiles found — cannot place Lodge zone')

function centroid(cells) {
  const n = cells.length
  return { x: cells.reduce((a, [x]) => a + x, 0) / n, y: cells.reduce((a, [, y]) => a + y, 0) / n }
}
function nearestWalkable(px, py) {
  let best = null, bestD = Infinity
  for (const [x, y] of mainComponent) {
    const d = (x - px) ** 2 + (y - py) ** 2
    if (d < bestD) { bestD = d; best = [x, y] }
  }
  return best
}

const caveC = centroid(caveCells)
const trialGateTile = nearestWalkable(caveC.x, caveC.y + 2) // just below/in front of the cave mouth
// Label anchor: purely visual (doesn't need to be walkable), centered on the
// cave's own footprint, one tile above its topmost row — "above the cave".
const caveMinX = Math.min(...caveCells.map(([x]) => x))
const caveMaxX = Math.max(...caveCells.map(([x]) => x))
const caveMinY = Math.min(...caveCells.map(([, y]) => y))
// clampTile: label anchors are purely visual and can land anywhere the math
// puts them (one tile above/below a landmark) — clamp to the map so a
// landmark flush against an edge never produces an off-map, unreachable-by-
// camera label position.
const clampTile = (tx, ty) => ({ tx: Math.min(W - 1, Math.max(0, tx)), ty: Math.min(H - 1, Math.max(0, ty)) })
const caveLabelTile = clampTile(Math.round((caveMinX + caveMaxX) / 2), caveMinY - 1)

// Lodge zone sits at the building's front (south) wall — the sheet's roof
// (rows 2-5) sits above its wall (rows 6-7), so "south of the footprint" is
// the building's face. The map's lodge tiles only use the windowed gable
// (no door art is placed anywhere in this export — confirmed by inspecting
// every lodge-tileset tile in the map); Mic confirmed placing the zone at
// this wall regardless is fine for now.
const lodgeMinX = Math.min(...lodgeCells.map(([x]) => x))
const lodgeMaxX = Math.max(...lodgeCells.map(([x]) => x))
const lodgeMaxY = Math.max(...lodgeCells.map(([, y]) => y))
const lodgeCenterX = (lodgeMinX + lodgeMaxX) / 2
const lodgeTile = nearestWalkable(lodgeCenterX, lodgeMaxY + 1)
// Label anchor: purely visual, centered on the lodge's own footprint, one
// tile below its bottommost (wall) row — "below the house tile".
const lodgeLabelTile = clampTile(Math.round(lodgeCenterX), lodgeMaxY + 1)

const spawnTile = nearestWalkable(W / 2, H / 2)

console.log(`Races landmark (cave) centroid (${caveC.x.toFixed(1)},${caveC.y.toFixed(1)}) -> tile ${trialGateTile}, label above at ${JSON.stringify(caveLabelTile)}`)
console.log(`Lodge landmark (front wall, x-center ${lodgeCenterX.toFixed(1)}, y ${lodgeMaxY + 1}) -> tile ${lodgeTile}, label below at ${JSON.stringify(lodgeLabelTile)}`)
console.log(`Spawn (center) -> tile ${spawnTile}`)

// --- critters: scale with walkable area (tuning data, not hardcoded) ---
const critterCount = Math.max(1, Math.round(mainComponent.length / TILES_PER_CRITTER))
const zoneTiles = [trialGateTile, lodgeTile, spawnTile]
const farEnough = (x, y) => zoneTiles.every(([zx, zy]) => (x - zx) ** 2 + (y - zy) ** 2 >= 9)
const critterCandidates = mainComponent.filter(([x, y]) => farEnough(x, y))
const critters = []
if (critterCandidates.length > 0) {
  const step = Math.max(1, Math.floor(critterCandidates.length / critterCount))
  for (let n = 0; n < critterCount; n++) {
    const [x, y] = critterCandidates[(n * step) % critterCandidates.length]
    critters.push({ type: 'slime', tx: x, ty: y })
  }
}
console.log(`critters: ${critters.length} (density: 1 per ${TILES_PER_CRITTER} walkable tiles)`)

// --- write hubMap.js as plain data ---
function fmtArray(arr) {
  return `[${arr.join(',')}]`
}
// A cheap FNV-1a hash of the terrain, so a persisted player position can be
// tied to the exact map content it was saved against. Any re-import that
// changes the terrain (even "same elements, moved around") changes this
// value, which HubScene.jsx uses to discard now-stale saved positions
// instead of trusting them just because they're still technically walkable.
function hashInts(nums) {
  let h = 0x811c9dc5
  for (const n of nums) {
    h ^= n + 1 // +1 so -1 (empty) and 0 hash differently
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}
const mapVersion = hashInts([W, H, ...ground, ...decorUnder.flat(), ...decorOver.flat()])
const out = `// Imported from Tiled (${path.basename(TMJ_PATH)}) via scripts/import-tiled-map.mjs.
// Re-run that script after re-exporting the map — do not hand-edit the
// terrain arrays below. Spawn/zones/critters are placed by the importer
// using the landmark rules agreed with Mic (cave mouth = Races, the
// lodge's front wall = Lodge, map center = spawn) and verified reachable.
//
// Tile ids are in ONE unified space across every atlas registered in
// tuning.js HUB.tile.atlases (forest-summer ids 0-255, lodge ids 256-383).
// Walkability is derived from tile identity per docs/tile-grammar.md, not
// from layer — see isBlockingId() in the importer for the exact rule set.

export const HUB_MAP = {
  w: ${W},
  h: ${H},
  mapVersion: ${JSON.stringify(mapVersion)},
  ground: ${fmtArray(ground)},
  decorUnder: [${decorUnder.map(fmtArray).join(',')}],
  decorOver: [${decorOver.map(fmtArray).join(',')}],
  walk: ${fmtArray(walk)},
  spawn: { tx: ${spawnTile[0]}, ty: ${spawnTile[1]} },
  zones: [
    { id: 'trialGate', tx: ${trialGateTile[0]}, ty: ${trialGateTile[1]}, radius: 104, label: 'Races', action: 'practice', labelTile: ${JSON.stringify(caveLabelTile)} },
    { id: 'lodge', tx: ${lodgeTile[0]}, ty: ${lodgeTile[1]}, radius: 92, label: 'Lodge', action: 'avatar', labelTile: ${JSON.stringify(lodgeLabelTile)} },
  ],
  // Fixed ambient wildlife population (placeholder critters — see
  // data/critters.js), count scaled to walkable area via
  // tuning.js HUB.critter.tilesPerCritter, placed clear of zones/spawn.
  critters: ${JSON.stringify(critters)},
}
`
fs.writeFileSync(OUT_PATH, out)
console.log(`wrote ${OUT_PATH}`)
