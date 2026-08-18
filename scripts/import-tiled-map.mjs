// Multi-chunk hub importer: converts all 9 Tiled .tmj chunks into a unified
// hubMap registry (src/data/hubMap.js). Each chunk is its own plain data object
// with the same structure as before (ground, decorUnder, decorOver, walk, spawn,
// zones, critters), plus a mapId and neighbor links for edge transitions.
//
// Re-run after re-exporting any chunk: `node scripts/import-tiled-map.mjs`

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MAPS_DIR = path.join(__dirname, '..', 'maps')
const OUT_PATH = path.join(__dirname, '..', 'src', 'data', 'hubMap.js')
const TILES_PER_CRITTER = 175 // must match data/tuning.js HUB.critter.tilesPerCritter

// Must mirror data/tuning.js HUB.tile.atlases
const ATLAS_CONFIG = [
  { name: 'forest-summer', count: 256 },
  { name: 'lodge', count: 128 },
]

const GRID_COLS = 3, GRID_ROWS = 3
const HOME_COL = 1, HOME_ROW = 2 // center of south row

function importChunk(col, row) {
  const filename = `hub-${col}-${row}.tmj`
  const tmjPath = path.join(MAPS_DIR, filename)
  const mapId = `hub-${col}-${row}`
  
  if (!fs.existsSync(tmjPath)) {
    throw new Error(`missing chunk ${filename}`)
  }
  
  const tmj = JSON.parse(fs.readFileSync(tmjPath, 'utf8'))
  const W = tmj.width
  const H = tmj.height
  
  if (tmj.tilewidth !== 16 || tmj.tileheight !== 16) {
    throw new Error(`${filename}: expected 16px tiles, got ${tmj.tilewidth}x${tmj.tileheight}`)
  }
  if (tmj.infinite) throw new Error(`${filename}: infinite maps not supported`)
  
  // --- gid -> unified id ---
  let cumulative = 0
  const offsetByName = {}
  for (const a of ATLAS_CONFIG) { offsetByName[a.name] = cumulative; cumulative += a.count }
  
  const tilesetByGidDesc = [...tmj.tilesets].sort((a, b) => b.firstgid - a.firstgid)
  for (const ts of tmj.tilesets) {
    if (!(ts.name in offsetByName)) throw new Error(`${filename}: unrecognized tileset "${ts.name}"`)
    if (ts.columns !== 16) throw new Error(`${filename}: tileset "${ts.name}" has ${ts.columns} columns, engine assumes 16`)
    const expected = ATLAS_CONFIG.find((a) => a.name === ts.name).count
    if (ts.tilecount !== expected) throw new Error(`${filename}: tileset "${ts.name}" has ${ts.tilecount} tiles, ATLAS_CONFIG expects ${expected}`)
  }
  
  function unifiedId(gid) {
    if (gid === 0) return -1
    if (gid & 0xf0000000) throw new Error(`${filename}: gid ${gid} has flip/rotation flag — not supported`)
    const ts = tilesetByGidDesc.find((t) => gid >= t.firstgid)
    if (!ts) throw new Error(`${filename}: no tileset covers gid ${gid}`)
    return offsetByName[ts.name] + (gid - ts.firstgid)
  }
  
  // --- merge layers ---
  const tileLayers = tmj.layers.filter((l) => l.type === 'tilelayer')
  for (const l of tileLayers) {
    if (l.width !== W || l.height !== H) throw new Error(`${filename}: layer "${l.name}" size mismatch`)
  }
  
  const groundLayer = tileLayers.find((l) => l.name === 'ground')
  if (!groundLayer) throw new Error(`${filename}: missing "ground" layer`)
  const underLayers = tileLayers.filter((l) => l.name.startsWith('decor-under'))
  const overLayers = tileLayers.filter((l) => l.name.startsWith('decor-over'))
  if (underLayers.length === 0) throw new Error(`${filename}: no decor-under layer(s) found`)
  if (overLayers.length === 0) throw new Error(`${filename}: no decor-over layer(s) found`)
  
  const ground = groundLayer.data.map(unifiedId)
  const decorUnder = underLayers.map((l) => l.data.map(unifiedId))
  const decorOver = overLayers.map((l) => l.data.map(unifiedId))
  const allRawLayers = [ground, ...decorUnder, ...decorOver]
  
  // --- walkability from tile identity ---
  function isBlockingId(id) {
    if (id < 0) return false
    if (id < 256) {
      const c = id % 16, r = Math.floor(id / 16)
      if (c >= 5 && c <= 10) return true // cliff family
      if (c >= 11 && c <= 13 && (r === 13 || r === 14)) return true // water
      if (c >= 11 && c <= 14 && r >= 7 && r <= 10) return true // cave mouth
      if (c >= 12 && c <= 14 && (r === 5 || r === 6)) return true // tree trunk
      if (c >= 2 && c <= 3 && r >= 10 && r <= 12) return true // garden wall
      if (c === 0 && r >= 11 && r <= 13) return true
      if (c === 1 && r >= 12 && r <= 14) return true
      if (c >= 2 && c <= 3 && r >= 14 && r <= 15) return true // boulder pair
      if (c === 4 && r >= 8 && r <= 9) return true // big boulder
      return false
    }
    const r = Math.floor((id - 256) / 16)
    return r >= 6 && r <= 7 // lodge walls
  }
  
  function isKnownId(id) {
    if (id < 0) return true
    if (id < 256) {
      const c = id % 16, r = Math.floor(id / 16)
      if (c === 0) return true
      if (c >= 1 && c <= 3 && r <= 5) return true
      if (c === 4 && r <= 9) return true
      if (c === 4 && (r >= 10 && r <= 12)) return true
      if (c === 4 && (r === 14 || r === 15)) return true
      if (c <= 3 && (r === 6 || r === 7)) return true
      if (c <= 2 && r === 8) return true
      if (c === 3 && r === 8) return true
      if (c === 1 && r === 9) return true
      if (c === 2 && r === 9) return true
      if (c === 3 && r === 9) return true
      if (c >= 5 && c <= 10) return true
      if (c >= 11 && c <= 14 && r >= 7 && r <= 10) return true
      if (c >= 11 && c <= 15 && r <= 6) return true
      if (c === 15 && r >= 7 && r <= 10) return true
      if (c >= 11 && c <= 15 && r === 11) return true
      if (c >= 11 && c <= 13 && (r === 13 || r === 14)) return true
      if (c >= 2 && c <= 3 && r >= 10 && r <= 15) return true
      if (c === 0 && r >= 11 && r <= 13) return true
      if (c === 1 && r >= 12 && r <= 14) return true
      if (c === 11 || c === 12) return r === 15
      return false
    }
    const local = id - 256
    const r = Math.floor(local / 16)
    return r >= 2 && r <= 7
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
    console.log(`${filename}: UNCLASSIFIED tiles found`)
    for (const [k, positions] of unclassified) console.log(`  ${k}: ${positions.length}x`)
    throw new Error(`${filename}: ${unclassified.size} unclassified tile categories`)
  }
  
  // --- flood fill for main walkable component ---
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
  console.log(`${filename}: ${totalWalkable} walkable, ${mainComponent.length} in main component`)
  
  // --- landmarks (HOME chunk only) ---
  let spawn = null, zones = []
  const isHome = col === HOME_COL && row === HOME_ROW
  
  if (isHome) {
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
    
    if (caveCells.length === 0) throw new Error(`${filename}: no cave-mouth tiles found`)
    if (lodgeCells.length === 0) throw new Error(`${filename}: no lodge tiles found`)
    
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
    
    const clampTile = (tx, ty) => ({ tx: Math.min(W - 1, Math.max(0, tx)), ty: Math.min(H - 1, Math.max(0, ty)) })
    
    const caveC = centroid(caveCells)
    const trialGateTile = nearestWalkable(caveC.x, caveC.y + 2)
    const caveMinX = Math.min(...caveCells.map(([x]) => x))
    const caveMaxX = Math.max(...caveCells.map(([x]) => x))
    const caveMinY = Math.min(...caveCells.map(([, y]) => y))
    const caveLabelTile = clampTile(Math.round((caveMinX + caveMaxX) / 2), caveMinY - 1)
    
    const lodgeMinX = Math.min(...lodgeCells.map(([x]) => x))
    const lodgeMaxX = Math.max(...lodgeCells.map(([x]) => x))
    const lodgeMaxY = Math.max(...lodgeCells.map(([, y]) => y))
    const lodgeCenterX = (lodgeMinX + lodgeMaxX) / 2
    const lodgeTile = nearestWalkable(lodgeCenterX, lodgeMaxY + 1)
    const lodgeLabelTile = clampTile(Math.round(lodgeCenterX), lodgeMaxY + 1)
    
    const spawnTile = nearestWalkable(W / 2, H / 2)
    spawn = { tx: spawnTile[0], ty: spawnTile[1] }
    zones = [
      { id: 'trialGate', tx: trialGateTile[0], ty: trialGateTile[1], radius: 104, label: 'Races', action: 'practice', labelTile: caveLabelTile },
      { id: 'lodge', tx: lodgeTile[0], ty: lodgeTile[1], radius: 92, label: 'Lodge', action: 'avatar', labelTile: lodgeLabelTile },
    ]
  } else {
    // Non-home: spawn at center
    const cx = Math.floor(W / 2), cy = Math.floor(H / 2)
    const spawnCell = mainComponent.length > 0 ? mainComponent.reduce((best, cell) => {
      const d = (cell[0] - cx) ** 2 + (cell[1] - cy) ** 2
      const bd = (best[0] - cx) ** 2 + (best[1] - cy) ** 2
      return d < bd ? cell : best
    }) : [cx, cy]
    spawn = { tx: spawnCell[0], ty: spawnCell[1] }
  }
  
  // --- critters ---
  const critterCount = Math.max(1, Math.round(mainComponent.length / TILES_PER_CRITTER))
  const zoneTiles = zones.map((z) => [z.tx, z.ty]).concat(spawn ? [[spawn.tx, spawn.ty]] : [])
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
  
  // --- neighbors ---
  const neighbors = {}
  if (col > 0) neighbors.west = `hub-${col - 1}-${row}`
  if (col < GRID_COLS - 1) neighbors.east = `hub-${col + 1}-${row}`
  if (row > 0) neighbors.north = `hub-${col}-${row - 1}`
  if (row < GRID_ROWS - 1) neighbors.south = `hub-${col}-${row + 1}`
  
  // --- map version hash ---
  function hashInts(nums) {
    let h = 0x811c9dc5
    for (const n of nums) {
      h ^= n + 1
      h = Math.imul(h, 0x01000193)
    }
    return (h >>> 0).toString(36)
  }
  const mapVersion = hashInts([W, H, ...ground, ...decorUnder.flat(), ...decorOver.flat()])
  
  return {
    mapId,
    w: W,
    h: H,
    mapVersion,
    ground,
    decorUnder,
    decorOver,
    walk,
    spawn,
    zones,
    critters,
    neighbors,
  }
}

// Import all 9 chunks
const chunks = []
for (let row = 0; row < GRID_ROWS; row++) {
  for (let col = 0; col < GRID_COLS; col++) {
    chunks.push(importChunk(col, row))
  }
}

// Write registry
function fmtArray(arr) {
  return `[${arr.join(',')}]`
}

const homeChunk = chunks.find((c) => c.mapId === `hub-${HOME_COL}-${HOME_ROW}`)

let out = `// Multi-chunk hub maps imported from Tiled via scripts/import-tiled-map.mjs.
// Re-run that script after re-exporting any chunk — do not hand-edit the
// terrain arrays below. Each chunk is one plain object with the same structure
// as the original single-map hub, plus a mapId and neighbor links.
//
// Tile ids are in ONE unified space across every atlas registered in
// tuning.js HUB.tile.atlases (forest-summer ids 0-255, lodge ids 256-383).
// Walkability is derived from tile identity per docs/tile-grammar.md.

export const HUB_CHUNKS = [\n`

for (const chunk of chunks) {
  out += `  {\n`
  out += `    mapId: ${JSON.stringify(chunk.mapId)},\n`
  out += `    w: ${chunk.w},\n`
  out += `    h: ${chunk.h},\n`
  out += `    mapVersion: ${JSON.stringify(chunk.mapVersion)},\n`
  out += `    ground: ${fmtArray(chunk.ground)},\n`
  out += `    decorUnder: [${chunk.decorUnder.map(fmtArray).join(',')}],\n`
  out += `    decorOver: [${chunk.decorOver.map(fmtArray).join(',')}],\n`
  out += `    walk: ${fmtArray(chunk.walk)},\n`
  out += `    spawn: ${JSON.stringify(chunk.spawn)},\n`
  out += `    zones: ${JSON.stringify(chunk.zones)},\n`
  out += `    critters: ${JSON.stringify(chunk.critters)},\n`
  out += `    neighbors: ${JSON.stringify(chunk.neighbors)},\n`
  out += `  },\n`
}

out += `]\n\n`
out += `// HOME chunk (lodge + cave + "Races"/"Lodge" zones)\n`
out += `export const HUB_HOME_ID = ${JSON.stringify(homeChunk.mapId)}\n\n`
out += `// Quick accessor\n`
out += `export function getChunk(mapId) {\n`
out += `  return HUB_CHUNKS.find((c) => c.mapId === mapId)\n`
out += `}\n`

fs.writeFileSync(OUT_PATH, out)
console.log(`wrote ${OUT_PATH} with ${chunks.length} chunks`)
