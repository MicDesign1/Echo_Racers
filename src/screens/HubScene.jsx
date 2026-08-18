import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HUB, CONTROLS } from '../data/tuning.js'
import { getHubState, setHubState, getAvatar, setOrigin } from '../data/saves.js'
import { normalizeAvatar, isBodyStandalone } from '../data/avatarManifest.js'
import { ensureComposite, getComposite, getBuildCount } from '../engine/avatarComposite.js'
import { HUB_CHUNKS, HUB_HOME_ID, getChunk } from '../data/hubMap.js'
import { CRITTER_SHEETS } from '../data/critters.js'
import { createCritters, updateCritters } from '../engine/critters.js'
import { tilePx, worldSize, tileCenter, isWalkable, drawLayer } from '../engine/tilemap.js'
import './HubScene.css'

// The hub is the game's home: a 5×5 grid of tiled forest chunks that form one
// island. The player walks around with a camera that clamps to the current chunk.
// Walking off an edge JUMPS to the adjacent chunk (no seamless stitching). Zones
// (Races -> Practice, Lodge -> Avatar) are only on the HOME chunk. Terrain +
// walkability are DATA in hubMap.js. The character is a palette-composited avatar.
// Every number lives in HUB (tuning.js) or hubMap.js — nothing is invented here.

const verifyMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('verify')
const forceTouch = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('touch')

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}

// Tile atlases (forest + lodge) are loaded once at module scope and shared
// across mounts, one Image per entry in HUB.tile.atlases (same order/index).
let atlasImgs = null
function getAtlases() {
  if (!atlasImgs) {
    atlasImgs = HUB.tile.atlases.map((a) => {
      const img = new Image()
      img.src = a.src
      return img
    })
  }
  return atlasImgs
}

// Critter sprite sheets are loaded once at module scope (like the atlas).
const critterImgs = new Map()
function getCritterImg(src) {
  let img = critterImgs.get(src)
  if (!img) {
    img = new Image()
    img.src = src
    critterImgs.set(src, img)
  }
  return img
}

// Interaction zones in WORLD px (computed per-chunk when loaded).
function buildZones(chunk) {
  return chunk.zones.map((z) => {
    const c = tileCenter(z.tx, z.ty)
    const lc = tileCenter(z.labelTile.tx, z.labelTile.ty)
    return { id: z.id, label: z.label, action: z.action, radius: z.radius, x: c.x, y: c.y, labelX: lc.x, labelY: lc.y }
  })
}

// A saved spot is only safe to restore if the player would be VISIBLE and free
// there: on walkable ground AND not tucked under a decor-over canopy (which
// draws over entities — a reload there would hide the character). Otherwise we
// fall back to the open spawn, so the avatar is always visible on load.
function isVisibleSpot(chunk, worldX, worldY) {
  if (!isWalkable(chunk, worldX, worldY)) return false
  const TW = tilePx()
  const tx = Math.floor(worldX / TW)
  const ty = Math.floor(worldY / TW)
  if (tx < 0 || ty < 0 || tx >= chunk.w || ty >= chunk.h) return false
  const i = ty * chunk.w + tx
  return chunk.decorOver.every((layer) => layer[i] == null || layer[i] < 0)
}

// The ONE plain, serializable hub-player state object (position/facing/anim +
// mapId); the avatar look is a separate serializable descriptor (avatarRef).
function createPlayerState() {
  const saved = getHubState()
  // ALWAYS start on HOME (hub-2-4, the lodge+cave map) when entering the hub.
  // Stale exploration saves should not skip the home screen.
  const mapId = HUB_HOME_ID
  const chunk = getChunk(mapId)
  if (!chunk) {
    throw new Error(`HOME chunk ${HUB_HOME_ID} not found`)
  }
  
  const world = worldSize(chunk)
  const spawn = tileCenter(chunk.spawn.tx, chunk.spawn.ty)
  let x = spawn.x
  let y = spawn.y
  let facing = 'down'
  
  // Restore saved XY/facing ONLY if the save was on HOME and mapVersion matches.
  // After the player walks off HOME, edge-jumps to neighbors still work (those
  // positions are saved/restored during the session, just not across fresh loads).
  if (saved && saved.mapId === HUB_HOME_ID && saved.mapVersion === chunk.mapVersion && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    const sx = clamp(saved.x, 0, world.w)
    const sy = clamp(saved.y, 0, world.h)
    if (isVisibleSpot(chunk, sx, sy)) {
      x = sx
      y = sy
      if (['down', 'up', 'left', 'right'].includes(saved.facing)) facing = saved.facing
    }
  }
  return { mapId, x, y, facing, moving: false, animFrame: 0, animTime: 0 }
}

export default function HubScene() {
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const playerRef = useRef(null)
  if (playerRef.current === null) playerRef.current = createPlayerState()
  const avatarRef = useRef(null)
  if (avatarRef.current === null) avatarRef.current = normalizeAvatar(getAvatar())
  
  // Current chunk (can change as the player walks off edges)
  const [currentMapId, setCurrentMapId] = useState(playerRef.current.mapId)
  const chunk = getChunk(currentMapId)
  const zones = chunk ? buildZones(chunk) : []

  const keysRef = useRef({ up: false, down: false, left: false, right: false })
  const inputRef = useRef({ x: 0, y: 0, active: false }) // joystick analog vector
  const activeZoneRef = useRef(null)
  const enterZoneRef = useRef(() => {})

  const joyBaseRef = useRef(null)
  const joyNubRef = useRef(null)

  const [activeZone, setActiveZone] = useState(null)
  const [showTouch] = useState(() => {
    if (verifyMode) return false
    if (forceTouch) return true
    return typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(pointer: coarse)').matches
      : false
  })

  // Persistent hub entries (work from anywhere on the hub, not just the zones).
  // Origin is set so each sub-screen returns to the hub even after a hard reload.
  function quickRace() {
    setOrigin('/hub')
    navigate('/practice')
  }
  function openAvatar() {
    setOrigin('/hub')
    navigate('/avatar')
  }

  useEffect(() => {
    if (!chunk) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const player = playerRef.current
    const avatar = avatarRef.current
    const atlases = getAtlases()
    const cam = { x: 0, y: 0, w: 0, h: 0 }
    
    // Helper to get current chunk (recomputed each call from player.mapId so it's never stale after transitions)
    const getCurrentChunk = () => getChunk(player.mapId) || chunk
    const getWorld = () => worldSize(getCurrentChunk())

    // The avatar look is fixed for the life of this mount (changing it means
    // a trip to /avatar and back), so its sprite grid + timing can be
    // resolved once here rather than re-checked every frame.
    const standalone = isBodyStandalone(avatar)
    const spriteCfg = standalone ? HUB.npcSprite : HUB.sprite
    const animFrameMs = standalone ? HUB.npcSprite.animFrameMs : HUB.player.animFrameMs
    const drawScale = standalone ? HUB.npcSprite.drawScale : HUB.player.drawScale

    // Composite the look ONCE on scene entry (not per frame).
    ensureComposite(avatar)

    // Ambient wildlife: fixed population from the map, each with its own wander
    // state. Preload every used sheet once.
    // Build critter population: slime palette mix + ~1 villager per chunk (if >=2 spawns)
    const rawCritters = createCritters(chunk)
    const critters = rawCritters.map((c, i) => {
      // Assign variety: slimes get palette variants, and some spawns become villagers
      const slimeTypes = ['slime', 'slimeAmber', 'slimeGreen', 'slimePink']
      const villagerTypes = ['npcManA', 'npcManB', 'npcWomanA', 'npcWomanB']
      
      // If this chunk has 2+ spawns, convert one to a villager (the first one)
      if (rawCritters.length >= 2 && i === 0) {
        c.type = villagerTypes[Math.floor(Math.random() * villagerTypes.length)]
      } else {
        // Round-robin slime palette variants
        c.type = slimeTypes[i % slimeTypes.length]
      }
      return c
    })
    
    // Try to add 1 extra villager per chunk on a walkable tile far from zones/spawn/other critters
    if (rawCritters.length > 0) {
      const villagerTypes = ['npcManA', 'npcManB', 'npcWomanA', 'npcWomanB']
      const TW = tilePx()
      const world = worldSize(chunk)
      const zonePad = HUB.critter.zonePad
      
      // Try to find a good spot for an extra villager
      for (let attempt = 0; attempt < 20; attempt++) {
        const tx = Math.floor(Math.random() * (chunk.w - 4)) + 2
        const ty = Math.floor(Math.random() * (chunk.h - 4)) + 2
        const p = tileCenter(tx, ty)
        
        // Check walkability
        if (!isWalkable(chunk, p.x, p.y)) continue
        
        // Check not too close to zones
        let tooClose = false
        for (const z of zones) {
          if (Math.hypot(p.x - z.x, p.y - z.y) < z.radius + zonePad + 100) {
            tooClose = true
            break
          }
        }
        if (tooClose) continue
        
        // Check not too close to other critters or spawn
        const spawn = tileCenter(chunk.spawn.tx, chunk.spawn.ty)
        if (Math.hypot(p.x - spawn.x, p.y - spawn.y) < 150) continue
        
        let nearCritter = false
        for (const other of critters) {
          if (Math.hypot(p.x - other.x, p.y - other.y) < 100) {
            nearCritter = true
            break
          }
        }
        if (nearCritter) continue
        
        // Good spot! Add a villager
        const sheet = CRITTER_SHEETS[villagerTypes[Math.floor(Math.random() * villagerTypes.length)]]
        critters.push({
          type: villagerTypes[Math.floor(Math.random() * villagerTypes.length)],
          x: p.x,
          y: p.y,
          state: 'idle',
          tgtX: p.x,
          tgtY: p.y,
          timer: Math.random() * 2000 + 1000,
          animFrame: 0,
          animTime: 0,
          facing: 'down',
          moving: false,
        })
        break
      }
    }
    
    // Preload all sheets used by this chunk's critters
    for (const type of new Set(critters.map((c) => c.type))) {
      const sheet = CRITTER_SHEETS[type]
      if (sheet) getCritterImg(sheet.src)
    }

    let W = 0
    let H = 0
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = canvas.clientWidth
      H = canvas.clientHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    // Feet-box walkability against the map grid.
    function feetOk(x, y) {
      const f = HUB.player.feet
      const corners = [
        [x - f.width / 2, y - f.height],
        [x + f.width / 2, y - f.height],
        [x - f.width / 2, y],
        [x + f.width / 2, y]
      ]
      for (const [cx, cy] of corners) {
        if (!isWalkable(getCurrentChunk(), cx, cy)) return false
      }
      return true
    }

    // Check if player would cross a chunk edge with this move, and if so,
    // transition to the neighbor chunk. Returns true if transitioned.
    // Fires when the desired position would go beyond the walkable boundary (where
    // feetOk would fail solely due to out-of-bounds, not interior obstacles).
    function tryEdgeTransition(desiredX, desiredY) {
      const currentChunk = getCurrentChunk()
      const TW = tilePx()
      const f = HUB.player.feet
      const chunkWorldW = currentChunk.w * TW
      const chunkWorldH = currentChunk.h * TW
      
      // The walkable boundary is where the feet box can still be fully inside the map
      const maxSafeX = chunkWorldW - f.width / 2
      const minSafeX = f.width / 2
      const maxSafeY = chunkWorldH
      const minSafeY = f.height
      
      // Extract col, row from current mapId (hub-col-row)
      const [,col, row] = player.mapId.split('-').map(Number)
      
      // Check if desired position would go beyond the safe walkable boundary
      let newCol = col
      let newRow = row
      let newX = desiredX
      let newY = desiredY
      
      // Left edge: desiredX would go beyond the safe left boundary
      if (desiredX < minSafeX && col > 0) {
        newCol = col - 1
        newX = chunkWorldW - f.width / 2 - 2
      } 
      // Right edge: desiredX would go beyond the safe right boundary
      else if (desiredX > maxSafeX && col < 4) {
        newCol = col + 1
        newX = f.width / 2 + 2
      }
      
      // Top edge: desiredY would go beyond the safe top boundary
      if (desiredY < minSafeY && row > 0) {
        newRow = row - 1
        newY = chunkWorldH - 2
      } 
      // Bottom edge: desiredY would go beyond the safe bottom boundary
      else if (desiredY > maxSafeY && row < 4) {
        newRow = row + 1
        newY = f.height + 2
      }
      
      // If we would move to a new chunk, do the transition
      if (newCol !== col || newRow !== row) {
        const newMapId = `hub-${newCol}-${newRow}`
        const newChunk = getChunk(newMapId)
        if (newChunk) {
          player.mapId = newMapId
          player.x = newX
          player.y = newY
          setCurrentMapId(newMapId)
          saveNow()
          return true
        }
      }
      return false
    }

    // Axis-separated move with edge sliding.
    function tryMove(ddx, ddy) {
      const f = HUB.player.feet
      // Check desired position BEFORE clamping
      const desiredX = player.x + ddx
      const desiredY = player.y + ddy
      
      // Try edge transition first (using unclamped desired position)
      // If a neighbor exists, treat leaving the map as a JUMP (not a wall)
      if (ddx !== 0 && tryEdgeTransition(desiredX, player.y)) return
      if (ddy !== 0 && tryEdgeTransition(player.x, desiredY)) return
      
      // If no transition, do normal walkability check with clamped position
      const world = getWorld()
      const nx = clamp(desiredX, f.width / 2, world.w - f.width / 2)
      const ny = clamp(desiredY, f.height, world.h)
      if (ddx !== 0 && feetOk(nx, player.y)) player.x = nx
      if (ddy !== 0 && feetOk(player.x, ny)) player.y = ny
    }

    function zoneAt(x, y) {
      for (const z of zones) {
        if (Math.hypot(x - z.x, y - z.y) < z.radius) return z
      }
      return null
    }
    function recomputeZone() {
      const z = zoneAt(player.x, player.y)
      activeZoneRef.current = z
      setActiveZone((prev) => (prev?.id === (z?.id ?? null) ? prev : (z ? { id: z.id, label: z.label, action: z.action } : null)))
    }

    function stepPlayer(dt, rawDx, rawDy) {
      const P = HUB.player
      const mag = Math.hypot(rawDx, rawDy)
      const moving = mag > P.moveDeadzone
      if (moving) {
        if (Math.abs(rawDx) > Math.abs(rawDy)) player.facing = rawDx > 0 ? 'right' : 'left'
        else player.facing = rawDy > 0 ? 'down' : 'up'
        const m = Math.min(mag, 1)
        const step = P.speed * dt
        tryMove((rawDx / mag) * m * step, 0)
        tryMove(0, (rawDy / mag) * m * step)
        player.animTime += dt * 1000
        while (player.animTime >= animFrameMs) {
          player.animTime -= animFrameMs
          player.animFrame = (player.animFrame + 1) % spriteCfg.walkFrames
        }
      } else {
        player.animFrame = 0
        player.animTime = 0
      }
      player.moving = moving
      recomputeZone()
    }

    function saveNow() {
      setHubState({ mapId: player.mapId, x: player.x, y: player.y, facing: player.facing, mapVersion: getCurrentChunk().mapVersion })
    }
    let lastSave = performance.now()
    let dirtySinceSave = false

    // Dispatch a zone by its data-driven action. Origin is persisted so the
    // race/avatar flow returns to the hub even after a hard reload.
    function enterZone(zone) {
      if (!zone) return
      saveNow()
      setOrigin('/hub')
      if (zone.action === 'practice') navigate('/practice')
      else if (zone.action === 'avatar') navigate('/avatar')
    }
    enterZoneRef.current = () => enterZone(activeZoneRef.current)

    function keyForMove(code) {
      switch (code) {
        case 'ArrowUp': case 'KeyW': return 'up'
        case 'ArrowDown': case 'KeyS': return 'down'
        case 'ArrowLeft': case 'KeyA': return 'left'
        case 'ArrowRight': case 'KeyD': return 'right'
        default: return null
      }
    }
    function onKeyDown(e) {
      if (e.code === 'Escape') { navigate('/'); return }
      if (e.code === 'Space') {
        if (activeZoneRef.current) enterZone(activeZoneRef.current)
        e.preventDefault()
        return
      }
      const k = keyForMove(e.code)
      if (k) { keysRef.current[k] = true; e.preventDefault() }
    }
    function onKeyUp(e) {
      const k = keyForMove(e.code)
      if (k) { keysRef.current[k] = false; e.preventDefault() }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    recomputeZone()

    function readInput() {
      const keys = keysRef.current
      let dx = 0
      let dy = 0
      if (keys.left) dx -= 1
      if (keys.right) dx += 1
      if (keys.up) dy -= 1
      if (keys.down) dy += 1
      if (dx === 0 && dy === 0) {
        const j = inputRef.current
        if (j.active) { dx = j.x; dy = j.y }
      }
      return { dx, dy }
    }

    function draw() {
      // Camera follows the player, clamped to the current chunk only.
      const currentChunk = getCurrentChunk()
      const world = getWorld()
      cam.w = W
      cam.h = H
      cam.x = clamp(player.x - W / 2, 0, Math.max(0, world.w - W))
      cam.y = clamp(player.y - H / 2, 0, Math.max(0, world.h - H))

      ctx.fillStyle = HUB.bgColor
      ctx.fillRect(0, 0, W, H)
      ctx.imageSmoothingEnabled = false

      drawLayer(ctx, currentChunk, currentChunk.ground, atlases, cam.x, cam.y, W, H)
      // decorUnder/decorOver are each an ARRAY of layers (not one flattened
      // array) — Tiled lets multiple tiles genuinely stack with transparency
      // at the same cell (e.g. a bush's transparent corners revealing a
      // cliff face drawn under it), which collapsing to a single winner-
      // takes-all tile per cell would silently destroy. Drawn in stacking
      // order, same as Tiled itself would composite them.
      for (const layer of currentChunk.decorUnder) drawLayer(ctx, currentChunk, layer, atlases, cam.x, cam.y, W, H)

      // Interaction zone labels (drawn on the ground, under entities) — no
      // trigger-radius circle anymore, just legible text at each zone's
      // label anchor (above the cave, below the lodge). A stroke gives the
      // text contrast against the busy grass texture without a fill circle.
      for (const z of zones) {
        const lx = z.labelX - cam.x
        const ly = z.labelY - cam.y
        ctx.font = HUB.zoneLabelFont
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineWidth = 4
        ctx.strokeStyle = HUB.zoneLabelStroke
        ctx.strokeText(z.label, lx, ly)
        ctx.fillStyle = HUB.zoneLabelColor
        ctx.fillText(z.label, lx, ly)
      }

      // Entities (player + critters) are depth-sorted by feet-Y so nearer ones
      // draw in front, then decor-over (canopies) draws over all of them.
      const entities = [{ y: player.y, draw: drawPlayer }]
      for (const c of critters) entities.push({ y: c.y, draw: () => drawCritter(c) })
      entities.sort((a, b) => a.y - b.y)
      for (const e of entities) e.draw()

      // Decor-over (tree canopies, roof, cliff caps) draws AFTER entities ->
      // walk-behind. Array of layers, same reasoning as decorUnder above.
      for (const layer of currentChunk.decorOver) drawLayer(ctx, currentChunk, layer, atlases, cam.x, cam.y, W, H)
    }

    // Player: composited avatar, bottom-center anchored, camera-corrected.
    function drawPlayer() {
      const sheet = getComposite(avatar)
      if (!sheet) return
      const S = spriteCfg
      const row = player.moving ? S.walkRow[player.facing] : S.idleRow[player.facing]
      const col = player.moving ? player.animFrame : S.idleCol
      const sx = col * S.frameSize
      const sy = row * S.frameSize
      const dw = S.frameSize * drawScale
      const dh = dw
      const dx = Math.round(player.x - cam.x - dw / 2)
      const dy = Math.round(player.y - cam.y - dh)
      ctx.drawImage(sheet, sx, sy, S.frameSize, S.frameSize, dx, dy, dw, dh)
    }

    // Critter: slimes use gentle-bob with hue-rotate, NPCs use facing/walk.
    function drawCritter(c) {
      const sh = CRITTER_SHEETS[c.type]
      if (!sh) return
      const img = getCritterImg(sh.src)
      if (!(img.complete && img.naturalWidth > 0)) return
      
      const fs = sh.frameSize
      let sx, sy, dw, dh, dx, dy
      
      if (sh.kind === 'slime') {
        // Slime: always bob (idleRow/idleCol + animFrame)
        sx = (sh.idleCol + (c.animFrame % sh.idleFrames)) * fs
        sy = sh.idleRow * fs
        dw = fs * sh.drawScale
        dh = dw
        dx = Math.round(c.x - cam.x - dw / 2)
        dy = Math.round(c.y - cam.y - dh + (sh.yOffset || 0))
        
        // Apply hue-rotate for palette variants
        if (sh.hueRotate !== 0) {
          ctx.save()
          ctx.filter = `hue-rotate(${sh.hueRotate}deg)`
          ctx.drawImage(img, sx, sy, fs, fs, dx, dy, dw, dh)
          ctx.restore()
          ctx.filter = 'none'
        } else {
          ctx.drawImage(img, sx, sy, fs, fs, dx, dy, dw, dh)
        }
      } else if (sh.kind === 'npc') {
        // NPC: facing-based walk (row per facing, cycle frames when moving)
        const row = sh.rowForFacing[c.facing]
        const col = c.moving ? c.animFrame : sh.idleCol
        sx = col * fs
        sy = row * fs
        dw = fs * sh.drawScale
        dh = dw
        dx = Math.round(c.x - cam.x - dw / 2)
        dy = Math.round(c.y - cam.y - dh)
        ctx.drawImage(img, sx, sy, fs, fs, dx, dy, dw, dh)
      }
    }

    let raf = 0
    let last = performance.now()
    function frame(now) {
      let dt = (now - last) / 1000
      last = now
      if (dt > 0.05) dt = 0.05
      const { dx, dy } = readInput()
      const beforeX = player.x
      const beforeY = player.y
      stepPlayer(dt, dx, dy)
      updateCritters(critters, dt, getCurrentChunk(), zones)
      if (player.x !== beforeX || player.y !== beforeY) dirtySinceSave = true
      if (dirtySinceSave && now - lastSave > HUB.saveThrottleMs) {
        saveNow()
        lastSave = now
        dirtySinceSave = false
      }
      draw()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    if (verifyMode) {
      window.__ECHO_HUB_TEST__ = {
        getState: () => ({
          mapId: player.mapId,
          x: player.x,
          y: player.y,
          facing: player.facing,
          moving: player.moving,
          animFrame: player.animFrame,
          activeZone: activeZoneRef.current?.id ?? null,
          composited: !!getComposite(avatar),
          buildCount: getBuildCount(),
          atlasLoaded: atlases.every((a) => a.complete && a.naturalWidth > 0),
          camX: cam.x,
          camY: cam.y,
          viewW: cam.w,
          viewH: cam.h,
          spriteStandalone: standalone,
          spriteFrameSize: spriteCfg.frameSize,
          spriteWalkFrames: spriteCfg.walkFrames,
          spriteRow: player.moving ? spriteCfg.walkRow[player.facing] : spriteCfg.idleRow[player.facing],
        }),
        getWorld: () => getWorld(),
        getMapInfo: () => {
          const currentChunk = getCurrentChunk()
          return { mapId: currentChunk.mapId, w: currentChunk.w, h: currentChunk.h, tilePx: tilePx(), spawn: { ...currentChunk.spawn } }
        },
        getZones: () => zones.map((z) => ({ ...z })),
        isWalkableTile: (tx, ty) => {
          const TW = tilePx()
          return isWalkable(getCurrentChunk(), (tx + 0.5) * TW, (ty + 0.5) * TW)
        },
        getCritters: () => critters.map((c) => ({ x: c.x, y: c.y, animFrame: c.animFrame, state: c.state, type: c.type })),
        stepCritters: (ms) => {
          const steps = Math.max(1, Math.round(ms / 16))
          for (let i = 0; i < steps; i++) updateCritters(critters, 0.016, getCurrentChunk(), zones)
          return critters.map((c) => ({ x: c.x, y: c.y, animFrame: c.animFrame }))
        },
        cameraAt: (px, py) => {
          const world = getWorld()
          return {
            x: clamp(px - cam.w / 2, 0, Math.max(0, world.w - cam.w)),
            y: clamp(py - cam.h / 2, 0, Math.max(0, world.h - cam.h)),
          }
        },
        setPos: (x, y) => { player.x = x; player.y = y; recomputeZone() },
        simulateMove: (dx, dy, ms) => {
          const steps = Math.max(1, Math.round(ms / 16))
          for (let i = 0; i < steps; i++) stepPlayer(0.016, dx, dy)
          return { mapId: player.mapId, x: player.x, y: player.y, facing: player.facing }
        },
        // targetHex is optional: standalone-body sheets have no recolor ramp
        // to search for, so omitting it just checks dims + build-once/caching.
        compositeProbe: async (descriptor, targetHex) => {
          const before = getBuildCount()
          const sheet = await ensureComposite(descriptor)
          const c = document.createElement('canvas')
          c.width = sheet.width
          c.height = sheet.height
          const cctx = c.getContext('2d', { willReadFrequently: true })
          cctx.drawImage(sheet, 0, 0)
          let found = true
          if (targetHex) {
            const d = cctx.getImageData(0, 0, c.width, c.height).data
            const want = parseInt(String(targetHex).slice(1), 16) & 0xffffff
            found = false
            for (let i = 0; i < d.length; i += 4) {
              if (d[i + 3] === 0) continue
              if (((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]) === want) { found = true; break }
            }
          }
          return { width: sheet.width, height: sheet.height, found, builtNow: getBuildCount() - before, buildCount: getBuildCount() }
        },
        // Darkest-pixel (eye) x-position within one frame cell — an objective
        // landmark for regression-testing facing direction (which row is
        // "left" vs "right"), since a swap there is otherwise only visible by
        // eye. frameSize comes from the caller so this works for any sheet.
        frameEyeX: async (descriptor, col, row, frameSize) => {
          const sheet = await ensureComposite(descriptor)
          const c = document.createElement('canvas')
          c.width = frameSize
          c.height = frameSize
          const cctx = c.getContext('2d', { willReadFrequently: true })
          cctx.drawImage(sheet, col * frameSize, row * frameSize, frameSize, frameSize, 0, 0, frameSize, frameSize)
          const d = cctx.getImageData(0, 0, frameSize, frameSize).data
          let bestX = -1
          let bestLum = Infinity
          for (let y = 0; y < frameSize; y++) {
            for (let x = 0; x < frameSize; x++) {
              const i = (y * frameSize + x) * 4
              if (d[i + 3] < 128) continue
              const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
              if (lum < bestLum) { bestLum = lum; bestX = x }
            }
          }
          return bestX
        },
        save: () => saveNow(),
      }
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      saveNow()
      if (verifyMode) delete window.__ECHO_HUB_TEST__
    }
  }, [navigate, currentMapId, chunk, zones])

  useEffect(() => {
    if (!showTouch) return
    const base = joyBaseRef.current
    const nub = joyNubRef.current
    if (!base || !nub) return
    const travel = (CONTROLS.joystick.baseSize - CONTROLS.joystick.nubSize) / 2
    let joyId = null

    const compute = (e) => {
      const rect = base.getBoundingClientRect()
      let dx = e.clientX - (rect.left + rect.width / 2)
      let dy = e.clientY - (rect.top + rect.height / 2)
      const dist = Math.hypot(dx, dy)
      if (dist > travel && dist > 0) { dx = (dx / dist) * travel; dy = (dy / dist) * travel }
      let x = travel > 0 ? dx / travel : 0
      let y = travel > 0 ? dy / travel : 0
      if (Math.hypot(x, y) < CONTROLS.joystick.deadzone) { x = 0; y = 0 }
      inputRef.current = { x, y, active: true }
      nub.style.transform = `translate(${dx}px, ${dy}px)`
    }
    const onDown = (e) => {
      if (joyId !== null) return
      joyId = e.pointerId
      try { base.setPointerCapture(e.pointerId) } catch { /* no active pointer (e.g. synthetic) */ }
      base.classList.add('is-pressed')
      compute(e)
      e.preventDefault()
    }
    const onMove = (e) => { if (e.pointerId === joyId) { compute(e); e.preventDefault() } }
    const onUp = (e) => {
      if (e.pointerId !== joyId) return
      joyId = null
      inputRef.current = { x: 0, y: 0, active: false }
      base.classList.remove('is-pressed')
      nub.style.transform = 'translate(0px, 0px)'
      e.preventDefault()
    }
    base.addEventListener('pointerdown', onDown)
    base.addEventListener('pointermove', onMove)
    base.addEventListener('pointerup', onUp)
    base.addEventListener('pointercancel', onUp)
    return () => {
      base.removeEventListener('pointerdown', onDown)
      base.removeEventListener('pointermove', onMove)
      base.removeEventListener('pointerup', onUp)
      base.removeEventListener('pointercancel', onUp)
      inputRef.current = { x: 0, y: 0, active: false }
    }
  }, [showTouch])

  return (
    <div className="hub-scene">
      <canvas ref={canvasRef} />

      <button type="button" className="hub-back-btn" onClick={() => navigate('/')}>
        &larr; Back
      </button>

      <div className="hub-top-right">
        <button type="button" className="hub-ui-btn hub-customize-btn" onClick={openAvatar}>
          Customize
        </button>
        <button type="button" className="hub-ui-btn hub-quickrace-btn" onClick={quickRace}>
          Quick Race
        </button>
      </div>

      {activeZone && (
        <button
          type="button"
          className="hub-prompt"
          onClick={() => enterZoneRef.current()}
        >
          {activeZone.label} — Space / tap
        </button>
      )}

      {showTouch && (
        <div
          className="hub-controls"
          style={{ '--ctrl-rest': CONTROLS.restOpacity, '--ctrl-press': CONTROLS.pressedOpacity }}
        >
          <div
            ref={joyBaseRef}
            className="hub-joy-base"
            style={{
              left: `${CONTROLS.joystick.marginX}px`,
              bottom: `${CONTROLS.joystick.marginY}px`,
              width: `${CONTROLS.joystick.baseSize}px`,
              height: `${CONTROLS.joystick.baseSize}px`,
            }}
          >
            <div
              ref={joyNubRef}
              className="hub-joy-nub"
              style={{
                width: `${CONTROLS.joystick.nubSize}px`,
                height: `${CONTROLS.joystick.nubSize}px`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
