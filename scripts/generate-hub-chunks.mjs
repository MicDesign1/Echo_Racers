// Generate a 3×3 grid of hub chunks (each ~31×21 tiles) that form one island.
// Each chunk is a standalone Tiled .tmj file the humans can open and edit.
//
// Grid layout (col, row):
//   (0,0) NW corner  (1,0) N edge   (2,0) NE corner
//   (0,1) W edge     (1,1) CENTER   (2,1) E edge
//   (0,2) SW corner  (1,2) HOME     (2,2) SE corner
//
// HOME (1,2) is based on the existing hub: lodge + cave + south shore.
// Outer chunks have coastline on their outer edges; center/inner chunks are
// interior forest with no shore. Every chunk gets a tree/decor framework
// (groves, tree lines, walk-behind clusters, open grass pockets) per the
// brief, not empty grass fields.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'maps')

const W = 31, H = 21 // tile dimensions per chunk, matching the original hub

// Tile id helper (same as hubMap.js): A(col, row) for forest-summer atlas
const A = (c, r) => r * 16 + c
// Lodge atlas starts at id 256
const L = (c, r) => 256 + r * 16 + c

// Common terrain builders (reusable across chunks)

function fillRect(arr, w, x, y, width, height, id) {
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const tx = x + dx, ty = y + dy
      if (tx >= 0 && ty >= 0 && tx < w && ty < H) arr[ty * w + tx] = id
    }
  }
}

function stampTree(decorUnder, decorOver, w, x, y) {
  // Tree canopy (5×5) -> decorOver, trunk (3×2) -> decorUnder
  // Canopy: cols 11-15, rows 0-4
  for (let r = 0; r <= 4; r++) {
    for (let c = 0; c <= 4; c++) {
      const tx = x + c - 2, ty = y + r - 2
      if (tx >= 0 && ty >= 0 && tx < w && ty < H) {
        decorOver[0][ty * w + tx] = A(11 + c, r)
      }
    }
  }
  // Trunk: cols 12-14, rows 5-6
  for (let r = 0; r <= 1; r++) {
    for (let c = 0; c <= 2; c++) {
      const tx = x + c - 1, ty = y + 3 + r
      if (tx >= 0 && ty >= 0 && tx < w && ty < H) {
        decorUnder[0][ty * w + tx] = A(12 + c, 5 + r)
      }
    }
  }
}

function addCliffWithWater(ground, decorUnder, decorOver, w, x, y, width) {
  // Cliff structure: cap (over) -> face (under) -> base-meets-water (under) -> water fill (ground)
  // Cap: A(6,0)..A(9,0) top edge, A(5,1)..A(10,3) sides/fill
  // Face: A(6,5)..A(9,6) body, A(5,5)..A(10,9) edges
  // Base: A(6,11)..A(9,11) scalloped edge
  // Water: A(13,14)
  
  // Top edge of cap
  decorOver[0][y * w + x] = A(6, 0)
  for (let i = 1; i < width - 1; i++) {
    decorOver[0][y * w + (x + i)] = A(7, 0)
  }
  decorOver[0][y * w + (x + width - 1)] = A(9, 0)
  
  // Cap sides (rows 1-3)
  for (let r = 1; r <= 3; r++) {
    decorOver[0][(y + r) * w + x] = A(5, r)
    for (let i = 1; i < width - 1; i++) {
      ground[(y + r) * w + (x + i)] = A(0, 0) // grass fill
    }
    decorOver[0][(y + r) * w + (x + width - 1)] = A(10, r)
  }
  
  // Cliff face transition (row 4)
  decorUnder[0][(y + 4) * w + x] = A(5, 4)
  for (let i = 1; i < width - 1; i++) {
    decorUnder[0][(y + 4) * w + (x + i)] = A(6 + (i % 4), 4)
  }
  decorUnder[0][(y + 4) * w + (x + width - 1)] = A(10, 4)
  
  // Cliff face body (rows 5-6)
  for (let r = 5; r <= 6; r++) {
    decorUnder[0][(y + r) * w + x] = A(5, r)
    for (let i = 1; i < width - 1; i++) {
      decorUnder[0][(y + r) * w + (x + i)] = A(6 + (i % 4), r)
    }
    decorUnder[0][(y + r) * w + (x + width - 1)] = A(10, r)
  }
  
  // Base meets water (row 7)
  decorUnder[0][(y + 7) * w + x] = A(5, 11)
  for (let i = 1; i < width - 1; i++) {
    decorUnder[0][(y + 7) * w + (x + i)] = A(6 + (i % 4), 11)
  }
  decorUnder[0][(y + 7) * w + (x + width - 1)] = A(10, 11)
  
  // Water fill below
  for (let r = 8; r < H; r++) {
    for (let i = 0; i < width; i++) {
      ground[(y + r) * w + (x + i)] = A(13, 14)
    }
  }
}

function addCaveMouth(decorUnder, decorOver, w, x, y) {
  // Cave: cols 11-14, rows 7-10
  // Top row (7): caps go to decorOver
  for (let c = 0; c <= 3; c++) {
    decorOver[0][(y) * w + (x + c)] = A(11 + c, 7)
  }
  // Body rows (8-9): archway goes to decorUnder
  for (let r = 1; r <= 2; r++) {
    for (let c = 0; c <= 3; c++) {
      decorUnder[0][(y + r) * w + (x + c)] = A(11 + c, 7 + r)
    }
  }
  // Bottom row (10): floor
  for (let c = 0; c <= 3; c++) {
    decorUnder[0][(y + 3) * w + (x + c)] = A(11 + c, 10)
  }
}

function addLodge(decorUnder, decorOver, w, x, y) {
  // Lodge building: cols 4-11 (8 wide), rows 2-7 (6 tall)
  // Roof (rows 2-5) -> decorOver, walls (rows 6-7) -> decorUnder
  for (let r = 0; r <= 3; r++) {
    for (let c = 0; c <= 7; c++) {
      decorOver[0][(y + r) * w + (x + c)] = L(4 + c, 2 + r)
    }
  }
  for (let r = 4; r <= 5; r++) {
    for (let c = 0; c <= 7; c++) {
      decorUnder[0][(y + r) * w + (x + c)] = L(4 + c, 2 + r)
    }
  }
}

function scatterDecor(decorUnder, w, count, ids) {
  // Scatter random ground decor (flowers, pebbles, bushes)
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * (w - 2)) + 1
    const y = Math.floor(Math.random() * (H - 2)) + 1
    const id = ids[Math.floor(Math.random() * ids.length)]
    if (decorUnder[0][y * w + x] === 0) {
      decorUnder[0][y * w + x] = id
    }
  }
}

function createChunk(col, row) {
  const isNorth = row === 0
  const isSouth = row === 2
  const isWest = col === 0
  const isEast = col === 2
  const isHome = col === 1 && row === 2
  
  const ground = new Array(W * H).fill(A(0, 0)) // grass fill
  const decorUnder = [new Array(W * H).fill(0), new Array(W * H).fill(0)]
  const decorOver = [new Array(W * H).fill(0), new Array(W * H).fill(0)]
  
  // Add shoreline on outer edges
  if (isNorth) {
    // North shore: cliff at top
    addCliffWithWater(ground, decorUnder, decorOver, W, 0, 0, W)
  }
  if (isSouth && !isHome) {
    // South shore: cliff at bottom (leave space for HOME to have its own shore)
    const startY = H - 8
    addCliffWithWater(ground, decorUnder, decorOver, W, 0, startY, W)
  }
  if (isWest) {
    // West shore: vertical cliff on left edge
    for (let y = (isNorth ? 8 : 0); y < (isSouth ? H - 8 : H); y++) {
      ground[y * W + 0] = A(13, 14) // water
      if (y < H - 1) {
        decorUnder[0][y * W + 1] = A(5, 5 + (y % 5)) // cliff face
      }
    }
  }
  if (isEast) {
    // East shore: vertical cliff on right edge
    for (let y = (isNorth ? 8 : 0); y < (isSouth ? H - 8 : H); y++) {
      ground[y * W + (W - 1)] = A(13, 14) // water
      if (y < H - 1) {
        decorUnder[0][y * W + (W - 2)] = A(10, 5 + (y % 5)) // cliff face
      }
    }
  }
  
  // HOME chunk: replicate the existing hub
  if (isHome) {
    // The current hub has: lodge (right side), cave (top center), south shore (bottom)
    // Cave mouth at top-center
    addCaveMouth(decorUnder, decorOver, W, 7, 2)
    
    // Lodge on right side
    addLodge(decorUnder, decorOver, W, 20, 9)
    
    // South shore at bottom
    const shoreY = H - 8
    addCliffWithWater(ground, decorUnder, decorOver, W, 0, shoreY, W)
    
    // Tree framework around the features
    for (let i = 0; i < 15; i++) {
      const x = Math.floor(Math.random() * (W - 6)) + 3
      const y = Math.floor(Math.random() * (shoreY - 6)) + 3
      stampTree(decorUnder, decorOver, W, x, y)
    }
  } else {
    // Non-home chunks: add tree framework
    const treeCount = 12 + Math.floor(Math.random() * 8)
    for (let i = 0; i < treeCount; i++) {
      const x = 3 + Math.floor(Math.random() * (W - 6))
      const y = 3 + Math.floor(Math.random() * (H - 6))
      stampTree(decorUnder, decorOver, W, x, y)
    }
    
    // Add a few unlabeled structures in interior chunks
    if (!isNorth && !isSouth && !isWest && !isEast) {
      // Center chunk: add a small timber structure (unlabeled)
      const lx = 10 + Math.floor(Math.random() * 8)
      const ly = 8 + Math.floor(Math.random() * 6)
      for (let r = 0; r <= 3; r++) {
        for (let c = 0; c <= 3; c++) {
          if (ly + r < H && lx + c < W) {
            if (r <= 1) decorOver[0][(ly + r) * W + (lx + c)] = L(4 + c, 2 + r)
            else decorUnder[0][(ly + r) * W + (lx + c)] = L(4 + c, 2 + r)
          }
        }
      }
    }
  }
  
  // Scatter ground decor (flowers, pebbles, bushes)
  const decorIds = [A(0, 6), A(1, 6), A(2, 6), A(3, 6), A(0, 7), A(1, 7), A(1, 8), A(4, 6), A(4, 7)]
  scatterDecor(decorUnder, W, 25, decorIds)
  
  return { ground, decorUnder, decorOver }
}

function toGid(id) {
  if (id === 0) return 0
  if (id < 256) return id + 1 // forest firstgid=1
  return (id - 256) + 257 // lodge firstgid=257
}

function generateTMJ(col, row) {
  const { ground, decorUnder, decorOver } = createChunk(col, row)
  
  const tmj = {
    "compressionlevel": -1,
    "height": H,
    "width": W,
    "infinite": false,
    "layers": [
      {
        "data": ground.map(toGid),
        "height": H,
        "id": 1,
        "name": "ground",
        "opacity": 1,
        "type": "tilelayer",
        "visible": true,
        "width": W,
        "x": 0,
        "y": 0
      },
      {
        "data": decorUnder[0].map(toGid),
        "height": H,
        "id": 2,
        "name": "decor-under-1",
        "opacity": 1,
        "type": "tilelayer",
        "visible": true,
        "width": W,
        "x": 0,
        "y": 0
      },
      {
        "data": decorUnder[1].map(toGid),
        "height": H,
        "id": 3,
        "name": "decor-under-2",
        "opacity": 1,
        "type": "tilelayer",
        "visible": true,
        "width": W,
        "x": 0,
        "y": 0
      },
      {
        "data": decorOver[0].map(toGid),
        "height": H,
        "id": 4,
        "name": "decor-over-1",
        "opacity": 1,
        "type": "tilelayer",
        "visible": true,
        "width": W,
        "x": 0,
        "y": 0
      },
      {
        "data": decorOver[1].map(toGid),
        "height": H,
        "id": 5,
        "name": "decor-over-2",
        "opacity": 1,
        "type": "tilelayer",
        "visible": true,
        "width": W,
        "x": 0,
        "y": 0
      }
    ],
    "nextlayerid": 6,
    "nextobjectid": 1,
    "orientation": "orthogonal",
    "renderorder": "right-down",
    "tiledversion": "1.10.2",
    "tileheight": 16,
    "tilewidth": 16,
    "tilesets": [
      {
        "columns": 16,
        "firstgid": 1,
        "image": "../public/sprites/hub/tiles/forest-summer.png",
        "imageheight": 256,
        "imagewidth": 256,
        "margin": 0,
        "name": "forest-summer",
        "spacing": 0,
        "tilecount": 256,
        "tileheight": 16,
        "tilewidth": 16
      },
      {
        "columns": 16,
        "firstgid": 257,
        "image": "../public/sprites/hub/tiles/lodge.png",
        "imageheight": 128,
        "imagewidth": 256,
        "margin": 0,
        "name": "lodge",
        "spacing": 0,
        "tilecount": 128,
        "tileheight": 16,
        "tilewidth": 16
      }
    ],
    "type": "map",
    "version": "1.10"
  }
  
  const filename = `hub-${col}-${row}.tmj`
  fs.writeFileSync(path.join(OUT_DIR, filename), JSON.stringify(tmj, null, 1))
  console.log(`generated ${filename}`)
}

// Generate all 9 chunks
for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 3; col++) {
    generateTMJ(col, row)
  }
}

console.log('all 9 chunks generated')
