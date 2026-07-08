import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HUB, CONTROLS } from '../data/tuning.js'
import { getHubState, setHubState } from '../data/saves.js'
import './HubScene.css'

// Phase-1 walkable hub prototype. A player character walks a flat test area,
// collides with a few rectangle obstacles, and can enter one interaction zone
// (the "Trial Gate" placeholder) that opens the existing Practice setup. All
// tunables live in HUB (src/data/tuning.js) — nothing numeric is invented here.

const verifyMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('verify')
// Same forcing hook the racer uses, so the touch joystick can be hand-tested
// on a desktop without a coarse pointer.
const forceTouch = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('touch')

// Sprite images are cached ONCE at module scope, keyed by src, and shared
// across mounts. They are deliberately kept OUT of the player state object
// (which must stay plain/serializable for future phases).
const imageCache = new Map()
function getImage(src) {
  let img = imageCache.get(src)
  if (!img) {
    img = new Image()
    img.src = src
    imageCache.set(src, img)
  }
  return img
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}

// Builds the ONE plain, serializable hub-player state object. No functions, no
// class instances, no canvas/Image refs — only numbers, strings, and a layers
// descriptor (id + src strings). This is a hard requirement for later phases.
function createPlayerState() {
  const saved = getHubState()
  const W = HUB.world
  let x = HUB.player.start.x
  let y = HUB.player.start.y
  let facing = 'down'
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    x = clamp(saved.x, 0, W.width)
    y = clamp(saved.y, 0, W.height)
    if (['down', 'up', 'left', 'right'].includes(saved.facing)) facing = saved.facing
  }
  return {
    x,
    y,
    facing,
    moving: false,
    animFrame: 0,
    animTime: 0,
    layers: HUB.layers.map((l) => ({ id: l.id, src: l.src })),
  }
}

export default function HubScene() {
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const playerRef = useRef(null)
  if (playerRef.current === null) playerRef.current = createPlayerState()

  const keysRef = useRef({ up: false, down: false, left: false, right: false })
  const inputRef = useRef({ x: 0, y: 0, active: false }) // joystick analog vector
  const inZoneRef = useRef(false)
  const enterGateRef = useRef(() => {})

  const joyBaseRef = useRef(null)
  const joyNubRef = useRef(null)

  const [inZone, setInZone] = useState(false)
  const [showTouch] = useState(() => {
    if (verifyMode) return false
    if (forceTouch) return true
    return typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(pointer: coarse)').matches
      : false
  })

  // Main scene: canvas sizing, image load, movement/collision/zone update, the
  // render loop, keyboard, persistence, and (verify only) the test hook.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const player = playerRef.current

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

    function layersLoaded() {
      return player.layers.every((l) => {
        const img = getImage(l.src)
        return img.complete && img.naturalWidth > 0
      })
    }

    function collides(px, py) {
      const f = HUB.player.feet
      const x0 = px - f.width / 2
      const x1 = px + f.width / 2
      const y0 = py - f.height
      const y1 = py
      for (const o of HUB.obstacles) {
        if (x1 > o.x && x0 < o.x + o.w && y1 > o.y && y0 < o.y + o.h) return true
      }
      return false
    }

    // Axis-separated move so the player slides along an obstacle edge instead
    // of sticking when pushing into it diagonally.
    function tryMove(ddx, ddy) {
      const f = HUB.player.feet
      const world = HUB.world
      const nx = clamp(player.x + ddx, f.width / 2, world.width - f.width / 2)
      const ny = clamp(player.y + ddy, f.height, world.height)
      if (ddx !== 0 && !collides(nx, player.y)) player.x = nx
      if (ddy !== 0 && !collides(player.x, ny)) player.y = ny
    }

    function recomputeZone() {
      const g = HUB.trialGate
      const inside = Math.hypot(player.x - g.x, player.y - g.y) < g.radius
      inZoneRef.current = inside
      setInZone((prev) => (prev === inside ? prev : inside))
    }

    // Shared movement step (used by the rAF loop AND the verify hook), so both
    // exercise identical collision/facing/animation logic.
    function stepPlayer(dt, rawDx, rawDy) {
      const P = HUB.player
      const mag = Math.hypot(rawDx, rawDy)
      const moving = mag > P.moveDeadzone
      if (moving) {
        // Diagonal input picks the dominant axis for facing (4-direction).
        if (Math.abs(rawDx) > Math.abs(rawDy)) player.facing = rawDx > 0 ? 'right' : 'left'
        else player.facing = rawDy > 0 ? 'down' : 'up'
        // Normalize direction, then re-apply the (clamped) magnitude so a
        // half-tilted stick walks at half speed and diagonals aren't faster.
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

    function enterGate() {
      saveNow()
      // Origin threaded so completing/leaving the race returns here, not to
      // the home-page practice flow.
      navigate('/practice', { state: { returnTo: '/hub' } })
    }
    enterGateRef.current = enterGate

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
        if (inZoneRef.current) enterGate()
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
      // Keyboard takes priority; the joystick feeds movement only when no
      // movement key is held (desktop keyboard behaviour is untouched).
      if (dx === 0 && dy === 0) {
        const j = inputRef.current
        if (j.active) { dx = j.x; dy = j.y }
      }
      return { dx, dy }
    }

    function draw() {
      const world = HUB.world
      // Fit the logical world into the canvas, centered, letterboxing the rest.
      const scale = Math.min(W / world.width, H / world.height)
      const offX = (W - world.width * scale) / 2
      const offY = (H - world.height * scale) / 2

      ctx.fillStyle = HUB.letterboxColor
      ctx.fillRect(0, 0, W, H)

      ctx.save()
      ctx.translate(offX, offY)
      ctx.scale(scale, scale)
      ctx.imageSmoothingEnabled = false

      ctx.fillStyle = HUB.groundColor
      ctx.fillRect(0, 0, world.width, world.height)

      // Obstacles.
      ctx.lineWidth = 3
      for (const o of HUB.obstacles) {
        ctx.fillStyle = HUB.obstacleFill
        ctx.fillRect(o.x, o.y, o.w, o.h)
        ctx.strokeStyle = HUB.obstacleEdge
        ctx.strokeRect(o.x, o.y, o.w, o.h)
      }

      // Trial Gate zone (drawn under the player).
      const g = HUB.trialGate
      ctx.beginPath()
      ctx.arc(g.x, g.y, g.radius, 0, Math.PI * 2)
      ctx.fillStyle = HUB.gateFill
      ctx.fill()
      ctx.lineWidth = 3
      ctx.strokeStyle = HUB.gateRing
      ctx.stroke()
      ctx.fillStyle = HUB.gateLabelColor
      ctx.font = HUB.gateLabelFont
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(g.label, g.x, g.y)

      // Player: 3 layers, body -> outfit -> hair, bottom-center anchored.
      const S = HUB.sprite
      const row = player.moving ? S.walkRow[player.facing] : S.idleRow[player.facing]
      const col = player.moving ? player.animFrame : S.idleCol
      const sx = col * S.frameSize
      const sy = row * S.frameSize
      const dw = S.frameSize * HUB.player.drawScale
      const dh = dw
      const dx = player.x - dw / 2
      const dy = player.y - dh
      for (const l of player.layers) {
        const img = getImage(l.src)
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, sx, sy, S.frameSize, S.frameSize, dx, dy, dw, dh)
        }
      }

      ctx.restore()
    }

    let raf = 0
    let last = performance.now()
    function frame(now) {
      let dt = (now - last) / 1000
      last = now
      if (dt > 0.05) dt = 0.05 // clamp big gaps (tab refocus) so nothing teleports
      const { dx, dy } = readInput()
      const beforeX = player.x
      const beforeY = player.y
      stepPlayer(dt, dx, dy)
      if (player.x !== beforeX || player.y !== beforeY) dirtySinceSave = true
      // Throttled autosave while walking, so a reload restores position.
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
          inZone: inZoneRef.current,
          layersLoaded: layersLoaded(),
          layerCount: player.layers.length,
          world: { ...HUB.world },
        }),
        getGate: () => ({ ...HUB.trialGate }),
        getObstacles: () => HUB.obstacles.map((o) => ({ ...o })),
        setPos: (x, y) => { player.x = x; player.y = y; recomputeZone() },
        // Run the shared movement step for `ms` at a fixed timestep so the
        // script can verify walking/collision/facing deterministically.
        simulateMove: (dx, dy, ms) => {
          const steps = Math.max(1, Math.round(ms / 16))
          for (let i = 0; i < steps; i++) stepPlayer(0.016, dx, dy)
          return { x: player.x, y: player.y, facing: player.facing }
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

  // Touch joystick — reuses the racer's CONTROLS.joystick tuning + pointer-
  // capture pattern, extended to a 2D walk vector. Self-contained so the
  // verified race input is left untouched. Mounted only when controls show.
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

      {inZone && (
        <button
          type="button"
          className="hub-prompt"
          onClick={() => enterGateRef.current()}
        >
          Enter — Space / tap
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
