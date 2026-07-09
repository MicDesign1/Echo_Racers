// One-time-per-audit tool: scans a hub.tmj for depth-layer misplacements
// (per docs/tile-grammar.md's tile classifications) and writes a CORRECTED
// copy — never touches the input file. Run: node scripts/fix-tmj-depth.mjs
// [input.tmj] [output.tmj]
//
// Rule (per Mic's brief): cliff caps/top edges, tree canopy, and roof-
// overhang tiles belong in a decor-over-family layer; cliff faces, trunks,
// walls, and ground scatter (flowers/pebbles/bushes/boulders — grouped
// together under tile-grammar.md's own "Decor" heading) belong in a
// decor-under-family layer. Plain fills (grass/dirt/path/water/cobble) are
// never touched regardless of which layer they're found in. The cave mouth
// isn't named in either bucket by Mic and is architecturally its own thing
// (not simply "cliff" or "wall") — flagged, never moved.
//
// Tiled genuinely lets multiple tiles composite with transparency at the
// same cell across different layers in one group (e.g. a bush's transparent
// corners revealing a cliff face drawn under it in a different decor-under
// layer) — so a moved tile is written into whichever same-group layer has a
// free slot at that cell, never overwriting existing content. If every
// layer in the target group is already occupied there (two overlapping
// trees needing the same decor-over cell, most likely), a new overflow
// layer is created rather than losing the tile or clobbering something
// already-correct.
import fs from 'node:fs'

const TMJ_PATH = process.argv[2] || 'E:/KID GAME/map-work/hub.tmj'
const OUT_PATH = process.argv[3] || 'E:/KID GAME/map-work/hub-fixed.tmj'
const tmj = JSON.parse(fs.readFileSync(TMJ_PATH, 'utf8'))
const W = tmj.width, H = tmj.height

const tilesetByGidDesc = [...tmj.tilesets].sort((a, b) => b.firstgid - a.firstgid)
function unifiedId(gid) {
  if (gid === 0) return -1
  const ts = tilesetByGidDesc.find((t) => gid >= t.firstgid)
  return (ts.name === 'lodge' ? 256 : 0) + (gid - ts.firstgid)
}
function toGid(id) {
  if (id < 256) return id + 1 // forest firstgid=1
  return (id - 256) + 257 // lodge firstgid=257
}
const GRASS_GID = toGid(0) // plain grass, A(0,0) — used to backfill a vacated ground cell

const layers = tmj.layers.filter((l) => l.type === 'tilelayer')
const groupOf = (name) => name === 'ground' ? 'ground' : name.startsWith('decor-under') ? 'under' : name.startsWith('decor-over') ? 'over' : null

// Returns 'over' | 'under' | 'fill' (ground-material, never reclassified) |
// 'ambiguous' (named by neither bucket — flag, don't move) | 'unknown'
// (not in tile-grammar.md at all — flag).
function classify(id) {
  if (id < 0) return null
  if (id < 256) {
    // forest-summer
    const c = id % 16, r = Math.floor(id / 16)
    if (c === 0 && r <= 5) return 'fill' // grass
    if (c >= 1 && c <= 3 && r <= 5) return 'fill' // dirt-patch autotile
    if (c === 4 && r <= 4) return 'fill' // dirt
    if (c >= 11 && c <= 15 && r <= 4) return 'over' // tree canopy
    if (c >= 12 && c <= 14 && (r === 5 || r === 6)) return 'under' // tree trunk
    if (c >= 5 && c <= 10) {
      // cliff family: cap rows 0-4 (incl. the row-4 "cap transition into the
      // vertical face" per tile-grammar.md) -> over; face/base rows 5-11
      // (the doc's own "Cliff face (rows 4-10...)" section, minus the cap
      // row, plus the base row) -> under; pool water row12 -> fill; second
      // tier repeat rows13-15 mirrors the same cap/face/base split.
      if (r <= 4) return 'over'
      if (r >= 5 && r <= 11) return 'under'
      if (r === 12) return 'fill'
      if (r === 13) return 'over'
      if (r === 14 || r === 15) return 'under'
    }
    // Decor scatter — tile-grammar.md's own "### Decor" heading groups
    // flowers/pebbles/bushes/the big boulder together -> under.
    if (c <= 3 && (r === 6 || r === 7)) return 'under' // flowers
    if (c === 4 && (r === 6 || r === 7)) return 'under' // pebble
    if (c <= 2 && r === 8) return 'under' // bush
    if (c === 0 && r === 9) return 'under' // bush variant
    if (c === 3 && (r === 8 || r === 9)) return 'under' // pebble
    if (c === 4 && (r === 8 || r === 9)) return 'under' // big boulder
    // Garden wall + its boulder pair (doc's own section, explicit "walls").
    if (c >= 2 && c <= 3 && r >= 10 && r <= 12) return 'under'
    if (c === 0 && r >= 11 && r <= 13) return 'under'
    if (c === 1 && r >= 12 && r <= 14) return 'under'
    if (c >= 2 && c <= 3 && r >= 14 && r <= 15) return 'under' // boulder pair
    // Fills.
    if (c >= 11 && c <= 13 && (r === 13 || r === 14)) return 'fill' // water
    if ((c === 11 || c === 12) && r === 15) return 'fill' // cobble floor
    // Cave mouth — not named in either bucket; genuinely ambiguous.
    if (c >= 11 && c <= 14 && r >= 7 && r <= 10) return 'ambiguous'
    // Verified-blank/harmless cells and grass-background-right-of-cave.
    if ((c === 1 || c === 2) && r === 9) return 'fill'
    if (c === 4 && (r >= 10 && r <= 12)) return 'fill'
    if (c === 4 && (r === 14 || r === 15)) return 'fill'
    if ((c === 11 || c === 15) && (r === 5 || r === 6)) return 'fill'
    if (c === 15 && r >= 7 && r <= 10) return 'fill'
    if (c >= 11 && c <= 15 && r === 11) return 'fill'
    return 'unknown'
  }
  // lodge
  const local = id - 256
  const r = Math.floor(local / 16)
  if (r >= 2 && r <= 5) return 'over' // roof-overhang
  if (r === 6 || r === 7) return 'under' // walls (incl. windows/door)
  return 'unknown' // rows 0-1 stray material swatches — shouldn't be placed
}

const idx = (x, y) => y * W + x

const work = {}
for (const l of layers) work[l.name] = [...l.data]

let overLayerNames = layers.filter((l) => groupOf(l.name) === 'over').map((l) => l.name)
const underLayerNames = layers.filter((l) => groupOf(l.name) === 'under').map((l) => l.name).reverse() // prefer last (topmost) first

let nextLayerId = tmj.nextlayerid
const newOverLayers = []
function ensureOverflowLayer() {
  const name = `decor-over ${overLayerNames.length + 1}`
  work[name] = new Array(W * H).fill(0)
  overLayerNames.push(name)
  newOverLayers.push({ data: work[name], height: H, id: nextLayerId++, name, opacity: 1, type: 'tilelayer', visible: true, width: W, x: 0, y: 0 })
  return name
}

const moved = []
const conflicts = []
const ambiguousReport = []
const groundHoles = []

for (const l of layers) {
  const grp = groupOf(l.name)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y)
      const gid = l.data[i]
      if (gid === 0) {
        if (l.name === 'ground') groundHoles.push({ x, y, reason: 'empty (gid 0) on ground layer' })
        continue
      }
      const id = unifiedId(gid)
      const cat = classify(id)
      if (l.name === 'ground') {
        const c = id < 256 ? id % 16 : (id - 256) % 16
        const r = id < 256 ? Math.floor(id / 16) : Math.floor((id - 256) / 16)
        const isBlank = id < 256 && (((c === 1 || c === 2) && r === 9) || (c === 4 && r >= 10 && r <= 12) || (c === 4 && (r === 14 || r === 15)) || ((c === 11 || c === 15) && (r === 5 || r === 6)) || (c >= 11 && c <= 15 && r === 11))
        if (isBlank) groundHoles.push({ x, y, reason: `ground cell uses a verified-blank atlas tile (id ${id})` })
      }
      if (cat === 'ambiguous' || cat === 'unknown') {
        ambiguousReport.push({ x, y, layer: l.name, id, cat })
        continue
      }
      if (cat !== 'over' && cat !== 'under') continue // 'fill' — never touched
      if (grp === cat) continue // already correct

      const candidates = cat === 'over' ? overLayerNames : underLayerNames
      let destName = null
      for (const name of candidates) {
        if (work[name][i] === 0) { destName = name; break }
      }
      if (!destName && cat === 'over') destName = ensureOverflowLayer()
      if (!destName) {
        conflicts.push({ x, y, sourceLayer: l.name, id, target: cat })
        continue
      }
      // Move: clear source (backfill with grass if source is ground, since
      // ground must stay a continuous fill), write gid into destination.
      work[l.name][i] = l.name === 'ground' ? GRASS_GID : 0
      work[destName][i] = gid
      moved.push({ x, y, from: l.name, to: destName, id, target: cat })
    }
  }
}

console.log(`moved: ${moved.length}`)
console.log(`conflicts (no free slot in any target-group layer): ${conflicts.length}`)
for (const c of conflicts) console.log(`  (${c.x},${c.y}) layer="${c.sourceLayer}" id=${c.id} target=${c.target}`)
console.log(`ambiguous/unclassified (left in place): ${ambiguousReport.length}`)
for (const a of ambiguousReport) console.log(`  (${a.x},${a.y}) layer="${a.layer}" id=${a.id}${a.cat === 'unknown' ? ' UNCLASSIFIED' : ''}`)
console.log(`ground-layer holes: ${groundHoles.length}`)
for (const g of groundHoles) console.log(`  (${g.x},${g.y}) ${g.reason}`)
console.log(`new overflow layer(s): ${newOverLayers.map((l) => l.name).join(', ') || 'none'}`)

// Write the corrected copy: clone of the original, with each tile layer's
// data replaced by its mutated array, plus any new overflow layers. Every
// other field (ids, opacity, visibility, tileset defs, map-level fields)
// stays byte-identical — this is a surgical data edit, not a regeneration.
const fixed = JSON.parse(JSON.stringify(tmj))
for (const l of fixed.layers) {
  if (l.type === 'tilelayer' && work[l.name]) l.data = work[l.name]
}
if (newOverLayers.length) {
  // Inserted before the first original decor-over layer (not appended at
  // the end): an overflow tile only exists at a cell because an existing
  // decor-over layer already has content there. Either stacking order is
  // now render-correct (the engine draws every sub-layer in sequence, it
  // doesn't collapse to one winner) — this ordering just preserves which
  // one was already visible before the fix.
  const firstOverIdx = fixed.layers.findIndex((l) => l.type === 'tilelayer' && l.name.startsWith('decor-over'))
  fixed.layers.splice(firstOverIdx, 0, ...newOverLayers)
  fixed.nextlayerid = nextLayerId
}
fs.writeFileSync(OUT_PATH, JSON.stringify(fixed, null, 1))
console.log(`wrote ${OUT_PATH}`)
