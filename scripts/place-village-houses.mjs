// Place timber houses on inland chunks north of HOME
// Creates a small village with 4 varied houses

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MAPS_DIR = path.join(__dirname, '..', 'maps')

// Lodge tileset starts at gid 257 in Tiled
const LODGE_GID_BASE = 257

// Helper to calculate gid from lodge atlas position
function lodgeGid(col, row) {
  return LODGE_GID_BASE + row * 16 + col
}

// Dirt-patch autotile helpers (from tile-grammar.md cols 1-3, rows 0-5)
const DIRT = {
  TL: 18,      // A(1,0) top-left corner
  TC: 34,      // A(2,0) top edge
  TR: 50,      // A(3,0) top-right corner
  ML: 34,      // A(1,1) left edge with grass sliver
  MR: 51,      // A(3,1) right edge with grass sliver
  FILL: 66,    // A(2,1) fill
  BL: 86,      // A(1,5) bottom-left corner
  BC: 87,      // A(2,5) bottom edge
  BR: 88,      // A(3,5) bottom-right corner
}

// House configurations: each defines which lodge atlas columns to use
const HOUSES = [
  {
    chunk: 'hub-2-2',
    name: 'House 1',
    x: 10,  // placement position (top-left of clearing)
    y: 7,
    cols: [4, 5, 6, 7],  // 4 tiles wide (same as HOME lodge)
    clearingPad: 2,  // dirt clearing extends 2 tiles beyond house
  },
  {
    chunk: 'hub-2-3',
    name: 'House 2',
    x: 18,
    y: 5,
    cols: [6, 7, 8, 9],  // 4 tiles wide, different section
    clearingPad: 2,
  },
  {
    chunk: 'hub-1-3',
    name: 'House 3',
    x: 6,
    y: 8,
    cols: [4, 5, 6, 7, 8],  // 5 tiles wide
    clearingPad: 2,
  },
  {
    chunk: 'hub-3-3',
    name: 'House 4',
    x: 20,
    y: 9,
    cols: [7, 8, 9, 10, 11],  // 5 tiles wide, different section
    clearingPad: 2,
  },
]

function placeHouse(tmj, house) {
  const w = tmj.width
  const h = tmj.height
  
  // Find layers
  const groundLayer = tmj.layers.find(l => l.name === 'ground')
  const decorUnder = tmj.layers.filter(l => l.name.startsWith('decor-under'))
  const decorOver = tmj.layers.filter(l => l.name.startsWith('decor-over'))
  
  if (!groundLayer || decorUnder.length === 0 || decorOver.length === 0) {
    throw new Error(`${house.chunk}: missing required layers`)
  }
  
  // Use the last decor-under and decor-over layers for house tiles
  const decorUnderLayer = decorUnder[decorUnder.length - 1]
  const decorOverLayer = decorOver[decorOver.length - 1]
  
  const houseWidth = house.cols.length
  const houseHeight = 6  // rows 2-7 of lodge atlas
  
  const clearingX = house.x
  const clearingY = house.y
  const clearingW = houseWidth + house.clearingPad * 2
  const clearingH = houseHeight + house.clearingPad * 2
  
  // 1. Place dirt clearing
  for (let dy = 0; dy < clearingH; dy++) {
    for (let dx = 0; dx < clearingW; dx++) {
      const x = clearingX + dx
      const y = clearingY + dy
      if (x < 0 || x >= w || y < 0 || y >= h) continue
      
      const i = y * w + x
      
      // Determine dirt tile based on position in clearing
      let dirtGid = 0
      if (dy === 0 && dx === 0) dirtGid = DIRT.TL
      else if (dy === 0 && dx === clearingW - 1) dirtGid = DIRT.TR
      else if (dy === 0) dirtGid = DIRT.TC
      else if (dy === clearingH - 1 && dx === 0) dirtGid = DIRT.BL
      else if (dy === clearingH - 1 && dx === clearingW - 1) dirtGid = DIRT.BR
      else if (dy === clearingH - 1) dirtGid = DIRT.BC
      else if (dx === 0) dirtGid = DIRT.ML
      else if (dx === clearingW - 1) dirtGid = DIRT.MR
      else dirtGid = DIRT.FILL
      
      groundLayer.data[i] = dirtGid
    }
  }
  
  // 2. Place house
  const houseX = clearingX + house.clearingPad
  const houseY = clearingY + house.clearingPad
  
  // Roof (lodge rows 2-5) goes in decor-over
  for (let lodgeRow = 2; lodgeRow <= 5; lodgeRow++) {
    const dy = lodgeRow - 2
    const y = houseY + dy
    if (y < 0 || y >= h) continue
    
    for (let i = 0; i < houseWidth; i++) {
      const lodgeCol = house.cols[i]
      const x = houseX + i
      if (x < 0 || x >= w) continue
      
      const idx = y * w + x
      const gid = lodgeGid(lodgeCol, lodgeRow)
      decorOverLayer.data[idx] = gid
    }
  }
  
  // Walls (lodge rows 6-7) go in decor-under
  for (let lodgeRow = 6; lodgeRow <= 7; lodgeRow++) {
    const dy = lodgeRow - 2
    const y = houseY + dy
    if (y < 0 || y >= h) continue
    
    for (let i = 0; i < houseWidth; i++) {
      const lodgeCol = house.cols[i]
      const x = houseX + i
      if (x < 0 || x >= w) continue
      
      const idx = y * w + x
      const gid = lodgeGid(lodgeCol, lodgeRow)
      decorUnderLayer.data[idx] = gid
    }
  }
  
  console.log(`  Placed ${house.name} at (${houseX},${houseY}), ${houseWidth}×${houseHeight} tiles`)
}

function main() {
  console.log('Placing village houses on inland chunks...\n')
  
  for (const house of HOUSES) {
    const tmjPath = path.join(MAPS_DIR, `${house.chunk}.tmj`)
    
    if (!fs.existsSync(tmjPath)) {
      console.log(`  SKIP ${house.chunk}: file not found`)
      continue
    }
    
    console.log(`${house.chunk}:`)
    const tmj = JSON.parse(fs.readFileSync(tmjPath, 'utf8'))
    
    placeHouse(tmj, house)
    
    fs.writeFileSync(tmjPath, JSON.stringify(tmj, null, 1) + '\n', 'utf8')
    console.log(`  Saved ${house.chunk}\n`)
  }
  
  console.log('Done! Re-run scripts/import-tiled-map.mjs to update hubMap.js')
}

main()
