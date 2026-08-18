// Ambient wildlife behavior (PLACEHOLDER critters — never chase/block/startle).
// A critter idles, picks a nearby WALKABLE target that sits clear of the
// interaction zones, glides to it, then idles again. It respects the map's
// walkability grid (never enters water/trees/borders) and passes THROUGH the
// player (no collision). State is a plain object; positions are world px.
import { HUB } from '../data/tuning.js'
import { CRITTER_SHEETS } from '../data/critters.js'
import { isWalkable, tileCenter } from './tilemap.js'

function rand(a, b) {
  return a + Math.random() * (b - a)
}

// Small feet-box walkability test (same idea as the player, smaller box).
function feetOk(map, x, y) {
  const f = HUB.critter.feet
  return isWalkable(map, x - f.width / 2, y - f.height)
    && isWalkable(map, x + f.width / 2, y - f.height)
    && isWalkable(map, x - f.width / 2, y)
    && isWalkable(map, x + f.width / 2, y)
}

function inAnyZone(zones, x, y) {
  const pad = HUB.critter.zonePad
  for (const z of zones) {
    if (Math.hypot(x - z.x, y - z.y) < z.radius + pad) return true
  }
  return false
}

function pickTarget(map, zones, c) {
  const R = HUB.critter.wanderRadius
  for (let i = 0; i < 10; i++) {
    const ang = Math.random() * Math.PI * 2
    const dist = rand(R * 0.3, R)
    const nx = c.x + Math.cos(ang) * dist
    const ny = c.y + Math.sin(ang) * dist
    if (feetOk(map, nx, ny) && !inAnyZone(zones, nx, ny)) return { x: nx, y: ny }
  }
  return null
}

// Build critter state from the map's fixed population (zones are only needed
// during wandering, so they're passed to updateCritters, not here).
export function createCritters(map) {
  return (map.critters || []).map((c) => {
    const p = tileCenter(c.tx, c.ty)
    const sheet = CRITTER_SHEETS[c.type]
    return {
      type: c.type,
      x: p.x,
      y: p.y,
      state: 'idle',
      tgtX: p.x,
      tgtY: p.y,
      timer: rand(HUB.critter.idleMs[0], HUB.critter.idleMs[1]),
      animFrame: 0,
      animTime: 0,
      facing: 'down', // for NPCs; slimes ignore this
      moving: false, // for NPCs walk animation
    }
  })
}

export function updateCritters(list, dt, map, zones) {
  const C = HUB.critter
  for (const c of list) {
    const sheet = CRITTER_SHEETS[c.type]
    
    // Animation: slimes/pumpkins always bob (idle or moving), NPCs/soldiers/blobs/plants walk when moving
    if (sheet?.kind === 'slime' || sheet?.kind === 'pumpkin') {
      // Gentle bob/hop plays continuously (idle and moving both read as calm).
      c.animTime += dt * 1000
      while (c.animTime >= C.animFrameMs) {
        c.animTime -= C.animFrameMs
        c.animFrame = (c.animFrame + 1) % (sheet.idleFrames || 1)
      }
    } else if (sheet?.kind === 'npc' || sheet?.kind === 'soldier' || sheet?.kind === 'blob' || sheet?.kind === 'plant4') {
      // NPCs/soldiers/blobs/plants cycle walk frames when moving, idle frames when idle
      if (c.moving) {
        c.animTime += dt * 1000
        const frameMs = sheet.kind === 'soldier' ? 200 : C.animFrameMs
        while (c.animTime >= frameMs) {
          c.animTime -= frameMs
          c.animFrame = (c.animFrame + 1) % (sheet.walkFrames || 4)
        }
      } else {
        // Idle: cycle idleFrames (or hold at 0 if idleFrames is 1)
        if ((sheet.idleFrames || 1) > 1) {
          c.animTime += dt * 1000
          while (c.animTime >= C.animFrameMs) {
            c.animTime -= C.animFrameMs
            c.animFrame = (c.animFrame + 1) % (sheet.idleFrames || 1)
          }
        } else {
          c.animFrame = 0
          c.animTime = 0
        }
      }
    }

    c.timer -= dt * 1000
    if (c.state === 'idle') {
      c.moving = false
      if (c.timer <= 0) {
        const t = pickTarget(map, zones, c)
        if (t) {
          c.tgtX = t.x
          c.tgtY = t.y
          c.state = 'walk'
          c.timer = rand(C.walkMs[0], C.walkMs[1])
          c.moving = true
          c.animFrame = 0 // reset frame when entering walk
          c.animTime = 0
        } else {
          c.timer = rand(C.idleMs[0], C.idleMs[1])
        }
      }
    } else { // walk
      const dx = c.tgtX - c.x
      const dy = c.tgtY - c.y
      const d = Math.hypot(dx, dy)
      if (d < C.arriveDist || c.timer <= 0) {
        c.state = 'idle'
        c.timer = rand(C.idleMs[0], C.idleMs[1])
        c.moving = false
        c.animFrame = 0 // reset frame when entering idle
        c.animTime = 0
      } else {
        c.moving = true
        // For NPCs/soldiers/pumpkins/blobs/plants, update facing based on dominant movement direction
        if (sheet?.kind === 'npc' || sheet?.kind === 'plant4' || sheet?.kind === 'soldier') {
          // Soldier only faces left/right (3q side-view)
          if (sheet.kind === 'soldier') {
            c.facing = dx > 0 ? 'right' : 'left'
          } else {
            // NPC and plant4 have 4-direction
            if (Math.abs(dx) > Math.abs(dy)) {
              c.facing = dx > 0 ? 'right' : 'left'
            } else {
              c.facing = dy > 0 ? 'down' : 'up'
            }
          }
        } else if (sheet?.kind === 'pumpkin' || sheet?.kind === 'blob') {
          // Pumpkin and blob track facing for flip (left/right from dx)
          c.facing = dx > 0 ? 'right' : 'left'
        }
        
        // Use per-type speed if available, else fallback to critter default
        const speed = sheet?.speed ?? C.speed
        const step = Math.min(d, speed * dt)
        const nx = c.x + (dx / d) * step
        const ny = c.y + (dy / d) * step
        if (feetOk(map, nx, ny)) {
          c.x = nx
          c.y = ny
        } else {
          // Path blocked (e.g. a tree edge) — stop and pick a new spot next idle.
          c.state = 'idle'
          c.timer = rand(C.idleMs[0], C.idleMs[1])
          c.moving = false
        }
      }
    }
  }
  return list
}
