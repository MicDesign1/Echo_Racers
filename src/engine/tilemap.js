// Minimal tile renderer for the hub. Pure drawing of STORED tile choices —
// no autotiling / edge logic (the map in data/hubMap.js already holds every
// chosen tile). A layer is a flat array (length map.w*map.h) of atlas tile
// ids, where id = atlasRow*atlasCols + atlasCol, and -1 (or null) = empty.
import { HUB } from '../data/tuning.js'

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
export function drawLayer(ctx, map, layer, atlasImg, camX, camY, viewW, viewH) {
  if (!atlasImg || !atlasImg.complete || atlasImg.naturalWidth === 0) return
  const TW = tilePx()
  const T = HUB.tile.size
  const AC = HUB.tile.atlasCols
  const minTx = Math.max(0, Math.floor(camX / TW))
  const maxTx = Math.min(map.w - 1, Math.floor((camX + viewW) / TW))
  const minTy = Math.max(0, Math.floor(camY / TW))
  const maxTy = Math.min(map.h - 1, Math.floor((camY + viewH) / TW))
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const id = layer[ty * map.w + tx]
      if (id == null || id < 0) continue
      const sx = (id % AC) * T
      const sy = Math.floor(id / AC) * T
      ctx.drawImage(atlasImg, sx, sy, T, T, Math.round(tx * TW - camX), Math.round(ty * TW - camY), TW, TW)
    }
  }
}
