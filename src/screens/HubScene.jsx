import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HUB, CONTROLS } from '../data/tuning.js'
import { getHubState, setHubState, getAvatar, setOrigin } from '../data/saves.js'
import { normalizeAvatar } from '../data/avatarManifest.js'
import { ensureComposite, getComposite, getBuildCount } from '../engine/avatarComposite.js'
import { HUB_MAP } from '../data/hubMap.js'
import { CRITTER_SHEETS } from '../data/critters.js'
import { createCritters, updateCritters } from '../engine/critters.js'
import { tilePx, worldSize, tileCenter, isWalkable, drawLayer } from '../engine/tilemap.js'
import './HubScene.css'

// The hub is the game's home: a tiled forest the player walks around, with a
// camera that follows and clamps to the map. Interaction zones (Trial Gate ->
// Practice, Mirror -> Avatar) are placed in hubMap.js; terrain + walkability
// are DATA there too. The character is a palette-composited avatar. Every
// number lives in HUB (tuning.js) or hubMap.js — nothing is invented here.

const verifyMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('verify')
const forceTouch = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('touch')

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}

// The forest atlas is loaded once at module scope and shared across mounts.
let atlasImg = null
function getAtlas() {
  if (!atlasImg) {
    atlasImg = new Image()
    atlasImg.src = HUB.tile.atlasSrc
  }
  return atlasImg
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

// Interaction zones in WORLD px (tile placement + radius come from the map).
const ZONES = HUB_MAP.zones.map((z) => {
  const c = tileCenter(z.tx, z.ty)
  return { id: z.id, label: z.label, action: z.action, radius: z.radius, x: c.x, y: c.y }
})

// A saved spot is only safe to restore if the player would be VISIBLE and free
// there: on walkable ground AND not tucked under a decor-over canopy (which
// draws over entities — a reload there would hide the character). Otherwise we
// fall back to the open spawn, so the avatar is always visible on load.
function isVisibleSpot(worldX, worldY) {
  if (!isWalkable(HUB_MAP, worldX, worldY)) return false
  const TW = tilePx()
  const tx = Math.floor(worldX / TW)
  const ty = Math.floor(worldY / TW)
  if (tx < 0 || ty < 0 || tx >= HUB_MAP.w || ty >= HUB_MAP.h) return false
  const over = HUB_MAP.decorOver[ty * HUB_MAP.w + tx]
  return over == null || over < 0
}

// The ONE plain, serializable hub-player state object (position/facing/anim);
// the avatar look is a separate serializable descriptor (avatarRef).
function createPlayerState() {
  const world = worldSize(HUB_MAP)
  const spawn = tileCenter(HUB_MAP.spawn.tx, HUB_MAP.spawn.ty)
  let x = spawn.x
  let y = spawn.y
  let facing = 'down'
  const saved = getHubState()
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    const sx = clamp(saved.x, 0, world.w)
    const sy = clamp(saved.y, 0, world.h)
    if (isVisibleSpot(sx, sy)) {
      x = sx
      y = sy
      if (['down', 'up', 'left', 'right'].includes(saved.facing)) facing = saved.facing
    }
  }
  return { x, y, facing, moving: false, animFrame: 0, animTime: 0 }
}

export default function HubScene() {
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const playerRef = useRef(null)
  if (playerRef.current === null) playerRef.current = createPlayerState()
  const avatarRef = useRef(null)
  if (avatarRef.current === null) avatarRef.current = normalizeAvatar(getAvatar())

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
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const player = playerRef.current
    const avatar = avatarRef.current
    const atlas = getAtlas()
    const world = worldSize(HUB_MAP)
    const cam = { x: 0, y: 0, w: 0, h: 0 }

    // Composite the look ONCE on scene entry (not per frame).
    ensureComposite(avatar)

    // Ambient wildlife: fixed population from the map, each with its own wander
    // state. Preload every used sheet once.
    const critters = createCritters(HUB_MAP)
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

    // Feet-box walkability against the map grid (out-of-bounds reads blocked).
    function feetOk(px, py) {
      const f = HUB.player.feet
      const x0 = px - f.width / 2
      const x1 = px + f.width / 2
      const y0 = py - f.height
      const y1 = py
      return isWalkable(HUB_MAP, x0, y0) && isWalkable(HUB_MAP, x1, y0)
        && isWalkable(HUB_MAP, x0, y1) && isWalkable(HUB_MAP, x1, y1)
    }

    // Axis-separated move so the player slides along a blocked edge instead of
    // sticking when pushing into it diagonally.
    function tryMove(ddx, ddy) {
      const f = HUB.player.feet
      const nx = clamp(player.x + ddx, f.width / 2, world.w - f.width / 2)
      const ny = clamp(player.y + ddy, f.height, world.h)
      if (ddx !== 0 && feetOk(nx, player.y)) player.x = nx
      if (ddy !== 0 && feetOk(player.x, ny)) player.y = ny
    }

    function zoneAt(px, py) {
      for (const z of ZONES) {
        if (Math.hypot(px - z.x, py - z.y) < z.radius) return z
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
        while (player.animTime >= P.animFrameMs) {
          player.animTime -= P.animFrameMs
          player.animFrame = (player.animFrame + 1) % HUB.sprite.walkFrames
        }
      } else {
        player.animFrame = 0
        player.animTime = 0
      }
      player.moving = moving
      recomputeZone()
    }

    function saveNow() {
      setHubState({ x: player.x, y: player.y, facing: player.facing })
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
      // Camera follows the player, clamped so it never shows past the map.
      cam.w = W
      cam.h = H
      cam.x = clamp(player.x - W / 2, 0, Math.max(0, world.w - W))
      cam.y = clamp(player.y - H / 2, 0, Math.max(0, world.h - H))

      ctx.fillStyle = HUB.bgColor
      ctx.fillRect(0, 0, W, H)
      ctx.imageSmoothingEnabled = false

      drawLayer(ctx, HUB_MAP, HUB_MAP.ground, atlas, cam.x, cam.y, W, H)
      drawLayer(ctx, HUB_MAP, HUB_MAP.decorUnder, atlas, cam.x, cam.y, W, H)

      // Interaction zones (drawn on the ground, under entities).
      for (const z of ZONES) {
        const zx = z.x - cam.x
        const zy = z.y - cam.y
        ctx.beginPath()
        ctx.arc(zx, zy, z.radius, 0, Math.PI * 2)
        ctx.fillStyle = HUB.zoneFill
        ctx.fill()
        ctx.lineWidth = 3
        ctx.strokeStyle = HUB.zoneRing
        ctx.stroke()
        ctx.fillStyle = HUB.zoneLabelColor
        ctx.font = HUB.zoneLabelFont
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(z.label, zx, zy)
      }

      // Entities (player + critters) are depth-sorted by feet-Y so nearer ones
      // draw in front, then decor-over (canopies) draws over all of them.
      const entities = [{ y: player.y, draw: drawPlayer }]
      for (const c of critters) entities.push({ y: c.y, draw: () => drawCritter(c) })
      entities.sort((a, b) => a.y - b.y)
      for (const e of entities) e.draw()

      // Decor-over (tree canopies) draws AFTER entities -> walk-behind.
      drawLayer(ctx, HUB_MAP, HUB_MAP.decorOver, atlas, cam.x, cam.y, W, H)
    }

    // Player: composited avatar, bottom-center anchored, camera-corrected.
    function drawPlayer() {
      const sheet = getComposite(avatar)
      if (!sheet) return
      const S = HUB.sprite
      const row = player.moving ? S.walkRow[player.facing] : S.idleRow[player.facing]
      const col = player.moving ? player.animFrame : S.idleCol
      const sx = col * S.frameSize
      const sy = row * S.frameSize
      const dw = S.frameSize * HUB.player.drawScale
      const dh = dw
      const dx = Math.round(player.x - cam.x - dw / 2)
      const dy = Math.round(player.y - cam.y - dh)
      ctx.drawImage(sheet, sx, sy, S.frameSize, S.frameSize, dx, dy, dw, dh)
    }

    // Critter: single gentle-bob animation, bottom-center anchored.
    function drawCritter(c) {
      const sh = CRITTER_SHEETS[c.type]
      if (!sh) return
      const img = getCritterImg(sh.src)
      if (!(img.complete && img.naturalWidth > 0)) return
      const fs = sh.frameSize
      const sx = (sh.idleCol + (c.animFrame % sh.idleFrames)) * fs
      const sy = sh.idleRow * fs
      const dw = fs * sh.drawScale
      const dh = dw
      const dx = Math.round(c.x - cam.x - dw / 2)
      const dy = Math.round(c.y - cam.y - dh + (sh.yOffset || 0))
      ctx.drawImage(img, sx, sy, fs, fs, dx, dy, dw, dh)
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
      updateCritters(critters, dt, HUB_MAP, ZONES)
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
          x: player.x,
          y: player.y,
          facing: player.facing,
          moving: player.moving,
          animFrame: player.animFrame,
          activeZone: activeZoneRef.current?.id ?? null,
          composited: !!getComposite(avatar),
          buildCount: getBuildCount(),
          atlasLoaded: !!(atlas.complete && atlas.naturalWidth > 0),
          camX: cam.x,
          camY: cam.y,
          viewW: cam.w,
          viewH: cam.h,
        }),
        getWorld: () => worldSize(HUB_MAP),
        getMapInfo: () => ({ w: HUB_MAP.w, h: HUB_MAP.h, tilePx: tilePx(), spawn: { ...HUB_MAP.spawn } }),
        getZones: () => ZONES.map((z) => ({ ...z })),
        isWalkableTile: (tx, ty) => {
          const TW = tilePx()
          return isWalkable(HUB_MAP, (tx + 0.5) * TW, (ty + 0.5) * TW)
        },
        getCritters: () => critters.map((c) => ({ x: c.x, y: c.y, animFrame: c.animFrame, state: c.state, type: c.type })),
        stepCritters: (ms) => {
          const steps = Math.max(1, Math.round(ms / 16))
          for (let i = 0; i < steps; i++) updateCritters(critters, 0.016, HUB_MAP, ZONES)
          return critters.map((c) => ({ x: c.x, y: c.y, animFrame: c.animFrame }))
        },
        cameraAt: (px, py) => ({
          x: clamp(px - cam.w / 2, 0, Math.max(0, world.w - cam.w)),
          y: clamp(py - cam.h / 2, 0, Math.max(0, world.h - cam.h)),
        }),
        setPos: (x, y) => { player.x = x; player.y = y; recomputeZone() },
        simulateMove: (dx, dy, ms) => {
          const steps = Math.max(1, Math.round(ms / 16))
          for (let i = 0; i < steps; i++) stepPlayer(0.016, dx, dy)
          return { x: player.x, y: player.y, facing: player.facing }
        },
        compositeProbe: async (descriptor, targetHex) => {
          const before = getBuildCount()
          const sheet = await ensureComposite(descriptor)
          const c = document.createElement('canvas')
          c.width = sheet.width
          c.height = sheet.height
          const cctx = c.getContext('2d', { willReadFrequently: true })
          cctx.drawImage(sheet, 0, 0)
          const d = cctx.getImageData(0, 0, c.width, c.height).data
          const want = parseInt(String(targetHex).slice(1), 16) & 0xffffff
          let found = false
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] === 0) continue
            if (((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]) === want) { found = true; break }
          }
          return { width: sheet.width, height: sheet.height, found, builtNow: getBuildCount() - before, buildCount: getBuildCount() }
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
  }, [navigate])

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
