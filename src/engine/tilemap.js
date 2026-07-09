// Minimal tile renderer for the hub. Pure drawing of STORED tile choices —
// no autotiling / edge logic (the map in data/hubMap.js already holds every
// chosen tile). A layer is a flat array (length map.w*map.h) of tile ids in
// ONE unified id space spanning every atlas in HUB.tile.atlases, in order
// (atlas 0 ids 0..count-1, atlas 1 right after, etc) — -1 (or null) = empty.
import { HUB } from '../data/tuning.js'

// Precomputed once: which unified-id range each atlas owns.
const ATLAS_RANGES = (() => {
  let offset = 0
  return HUB.tile.atlases.map((a) => {
    const range = { start: offset, cols: a.cols }
    offset += a.count
    return range
  })
})()

// Resolve a unified tile id to { atlasIndex, localId }, or null if it falls
// outside every registered atlas (treated as empty rather than throwing, so
// a stray/future id never crashes rendering).
function resolveAtlas(id) {
  for (let i = 0; i < ATLAS_RANGES.length; i++) {
    const r = ATLAS_RANGES[i]
    const count = HUB.tile.atlases[i].count
    if (id >= r.start && id < r.start + count) return { atlasIndex: i, localId: id - r.start, cols: r.cols }
  }
  return null
}

// World px per tile = source tile size * integer draw scale.
export function tilePx() {
  return HUB.tile.size * HUB.tile.scale
}

export function worldSize(map) {
  const TW = tilePx()
  return { w: map.w * TW, h: map.h * TW }
}

// Center of a tile in world px (used for zone/spawn placement).
export function tileCenter(tx, ty) {
  const TW = tilePx()
  return { x: (tx + 0.5) * TW, y: (ty + 0.5) * TW }
}

// Walkability test for a world-space point. Out-of-bounds reads as blocked so
// the player can never leave the map even if a border tile is missing.
export function isWalkable(map, worldX, worldY) {
  const TW = tilePx()
  const tx = Math.floor(worldX / TW)
  const ty = Math.floor(worldY / TW)
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return false
  return map.walk[ty * map.w + tx] === 1
}

// Draw one layer, culled to the visible camera rect for performance.
// `atlasImgs` is an array of loaded Image objects, index-matched to
// HUB.tile.atlases (one per registered atlas).
export function drawLayer(ctx, map, layer, atlasImgs, camX, camY, viewW, viewH) {
  const TW = tilePx()
  const T = HUB.tile.size
  const minTx = Math.max(0, Math.floor(camX / TW))
  const maxTx = Math.min(map.w - 1, Math.floor((camX + viewW) / TW))
  const minTy = Math.max(0, Math.floor(camY / TW))
  const maxTy = Math.min(map.h - 1, Math.floor((camY + viewH) / TW))
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const id = layer[ty * map.w + tx]
      if (id == null || id < 0) continue
      const resolved = resolveAtlas(id)
      if (!resolved) continue
      const atlasImg = atlasImgs[resolved.atlasIndex]
      if (!atlasImg || !atlasImg.complete || atlasImg.naturalWidth === 0) continue
      const sx = (resolved.localId % resolved.cols) * T
      const sy = Math.floor(resolved.localId / resolved.cols) * T
      ctx.drawImage(atlasImg, sx, sy, T, T, Math.round(tx * TW - camX), Math.round(ty * TW - camY), TW, TW)
    }
  }
}
