import { useEffect, useRef } from 'react'
import { ROAD, RACE } from '../data/tuning.js'
import { track, trackLength, findSegment, percentRemaining, interpolate } from '../engine/track.js'
import { project, renderSegment } from '../engine/projection.js'
import { COLORS } from '../engine/colors.js'
import './RaceTrack.css'

// Distance ahead of the camera at which the ground plane crosses the bottom
// of the screen — this is "where the car is" for projection purposes.
const PLAYER_Z = ROAD.cameraHeight * ROAD.cameraDepth

function formatTime(t) {
  const minutes = Math.floor(t / 60)
  const seconds = (t % 60).toFixed(2).padStart(5, '0')
  return `${minutes}:${seconds}`
}

function drawCar(ctx, width, height, game) {
  const carWidth = 140
  const carHeight = 70
  const baseX = width / 2 + game.tilt * 220
  const baseY = height - 90

  ctx.save()
  ctx.translate(baseX, baseY)
  ctx.rotate(game.tilt)

  ctx.fillStyle = COLORS.carHull
  ctx.beginPath()
  ctx.moveTo(-carWidth / 2, carHeight / 2)
  ctx.lineTo(-carWidth / 2 + 20, -carHeight / 2)
  ctx.lineTo(carWidth / 2 - 20, -carHeight / 2)
  ctx.lineTo(carWidth / 2, carHeight / 2)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = COLORS.carTrim
  ctx.fillRect(-carWidth / 2 + 10, carHeight / 2 - 14, carWidth - 20, 8)

  ctx.fillStyle = COLORS.carGlow
  ctx.beginPath()
  ctx.ellipse(0, -carHeight / 4, carWidth / 5, carHeight / 4, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

function drawHud(ctx, game) {
  ctx.fillStyle = COLORS.hudPanel
  ctx.fillRect(12, 12, 230, 88)

  ctx.font = '20px Georgia, serif'
  ctx.textBaseline = 'top'
  ctx.fillStyle = COLORS.hudText
  const speedPercent = Math.round((game.speed / RACE.maxSpeed) * 200)
  ctx.fillText(`Speed  ${speedPercent}`, 24, 22)
  ctx.fillText(`Lap    ${formatTime(game.lapTime)}`, 24, 48)
  ctx.fillText(`Last   ${game.lastLapTime !== null ? formatTime(game.lastLapTime) : '--:--.--'}`, 24, 74)
}

export default function RaceTrack() {
  const canvasRef = useRef(null)
  const touchLeftRef = useRef(null)
  const touchAccelRef = useRef(null)
  const touchRightRef = useRef(null)
  const keysRef = useRef({ up: false, down: false, left: false, right: false })
  const gameRef = useRef({
    position: 0,
    speed: 0,
    playerX: 0,
    tilt: 0,
    lapTime: 0,
    lastLapTime: null,
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let skyGradient = null

    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      skyGradient = ctx.createLinearGradient(0, 0, 0, canvas.height / 2)
      skyGradient.addColorStop(0, COLORS.skyTop)
      skyGradient.addColorStop(1, COLORS.skyHorizon)
    }
    resize()
    window.addEventListener('resize', resize)

    function keyFor(e) {
      switch (e.code) {
        case 'ArrowUp': case 'KeyW': return 'up'
        case 'ArrowDown': case 'KeyS': return 'down'
        case 'ArrowLeft': case 'KeyA': return 'left'
        case 'ArrowRight': case 'KeyD': return 'right'
        default: return null
      }
    }
    function onKeyDown(e) {
      const k = keyFor(e)
      if (k) { keysRef.current[k] = true; e.preventDefault() }
    }
    function onKeyUp(e) {
      const k = keyFor(e)
      if (k) { keysRef.current[k] = false; e.preventDefault() }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    // Touch zones set the same key flags keyboard input does, so update()
    // doesn't need to know which input source is driving it.
    const touchTargets = [
      [touchLeftRef.current, 'left'],
      [touchAccelRef.current, 'up'],
      [touchRightRef.current, 'right'],
    ]
    const touchCleanups = []
    for (const [el, key] of touchTargets) {
      if (!el) continue
      const down = (e) => { e.preventDefault(); keysRef.current[key] = true }
      const up = (e) => { e.preventDefault(); keysRef.current[key] = false }
      el.addEventListener('pointerdown', down)
      el.addEventListener('pointerup', up)
      el.addEventListener('pointerleave', up)
      el.addEventListener('pointercancel', up)
      touchCleanups.push(() => {
        el.removeEventListener('pointerdown', down)
        el.removeEventListener('pointerup', up)
        el.removeEventListener('pointerleave', up)
        el.removeEventListener('pointercancel', up)
      })
    }

    function update(dt) {
      const g = gameRef.current
      const keys = keysRef.current

      if (keys.up) g.speed += RACE.accel * dt
      else if (keys.down) g.speed -= RACE.brakeDecel * dt
      else g.speed -= RACE.friction * dt
      g.speed = Math.max(0, Math.min(RACE.maxSpeed, g.speed))

      const speedPercent = g.speed / RACE.maxSpeed
      const playerSegment = findSegment(g.position + PLAYER_Z)

      const steerInput = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
      const steerScale = Math.max(speedPercent, 0.15)
      g.playerX += steerInput * RACE.steerRate * steerScale * dt
      // Curved road pulls the car toward the outside of the turn, harder at speed.
      g.playerX -= playerSegment.curve * speedPercent * speedPercent * RACE.centrifugalStrength * dt

      // Off-road caps top speed; only bleed speed off when actually above that
      // cap, so accelerating off-road can still climb back up to the cap
      // instead of getting stuck fighting the penalty at 0.
      const offRoad = Math.abs(g.playerX) > 1
      if (offRoad && g.speed > RACE.offRoadMaxSpeed) {
        g.speed = Math.max(RACE.offRoadMaxSpeed, g.speed - RACE.offRoadDecel * dt)
      }
      g.playerX = Math.max(-2.2, Math.min(2.2, g.playerX))

      const targetTilt = steerInput * 0.15
      g.tilt += (targetTilt - g.tilt) * Math.min(1, dt * 10)

      g.position += g.speed * dt
      g.lapTime += dt
      if (g.position >= trackLength) {
        g.position -= trackLength
        g.lastLapTime = g.lapTime
        g.lapTime = 0
      }
    }

    function render(width, height) {
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = skyGradient
      ctx.fillRect(0, 0, width, height / 2)

      const g = gameRef.current
      const baseSegment = findSegment(g.position)
      const basePercent = percentRemaining(g.position, ROAD.segmentLength)
      const playerSegment = findSegment(g.position + PLAYER_Z)
      const playerPercent = percentRemaining(g.position + PLAYER_Z, ROAD.segmentLength)
      const playerY = interpolate(playerSegment.p1.world.y, playerSegment.p2.world.y, playerPercent)

      let maxy = height
      let x = 0
      let dx = -(baseSegment.curve * basePercent)

      for (let n = 0; n < ROAD.drawDistance; n++) {
        const segment = track[(baseSegment.index + n) % track.length]
        const looped = segment.index < baseSegment.index
        const cameraZ = g.position - (looped ? trackLength : 0)

        project(segment.p1, g.playerX * ROAD.roadWidth - x, playerY + ROAD.cameraHeight, cameraZ, ROAD.cameraDepth, width, height, ROAD.roadWidth)
        project(segment.p2, g.playerX * ROAD.roadWidth - x - dx, playerY + ROAD.cameraHeight, cameraZ, ROAD.cameraDepth, width, height, ROAD.roadWidth)

        x += dx
        dx += segment.curve

        if (segment.p1.camera.z <= ROAD.cameraDepth ||
            segment.p2.screen.y >= segment.p1.screen.y ||
            segment.p2.screen.y >= maxy) {
          continue
        }

        renderSegment(ctx, width,
          segment.p1.screen.x, segment.p1.screen.y, segment.p1.screen.w,
          segment.p2.screen.x, segment.p2.screen.y, segment.p2.screen.w,
          segment.color === 'dark' ? COLORS.dark : COLORS.light)

        maxy = segment.p2.screen.y
      }

      drawCar(ctx, width, height, g)
      drawHud(ctx, g)
    }

    let rafId
    let lastTime = performance.now()
    function step(now) {
      const dt = Math.min((now - lastTime) / 1000, 0.1)
      lastTime = now
      update(dt)
      render(canvas.width, canvas.height)
      rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      for (const cleanup of touchCleanups) cleanup()
    }
  }, [])

  return (
    <div className="race-track">
      <canvas ref={canvasRef} />
      <div className="touch-zones">
        <div ref={touchLeftRef} className="touch-zone touch-left" />
        <div ref={touchAccelRef} className="touch-zone touch-accel" />
        <div ref={touchRightRef} className="touch-zone touch-right" />
      </div>
    </div>
  )
}
