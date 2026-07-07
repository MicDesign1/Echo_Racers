import { useEffect, useRef, useState } from 'react'
import { ROAD, RACE, DRIFT, PARALLAX, TRACK_ID, RESULTS, OPPONENTS } from '../data/tuning.js'
import { trackLength, seg } from '../engine/track.js'
import { project, renderRoadSegment, renderLaneStripe } from '../engine/projection.js'
import { drawParallax } from '../engine/background.js'
import { drawRoadsideSprite } from '../engine/roadside.js'
import { drawCar, drawOpponentCar } from '../engine/car.js'
import { createOpponents, updateOpponents, getOpponentScreenPlacement, computePlayerDepth } from '../engine/opponents.js'
import { drawHud, formatTime } from '../engine/hud.js'
import { COLORS, OPPONENT_PALETTES, linearGradient } from '../engine/colors.js'
import { getBestTimes, recordLapResult } from '../data/saves.js'
import './RaceTrack.css'

const verifyMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('verify')

export default function RaceTrack() {
  const canvasRef = useRef(null)
  const touchLeftRef = useRef(null)
  const touchAccelRef = useRef(null)
  const touchRightRef = useRef(null)
  const keysRef = useRef({ up: false, down: false, left: false, right: false, drift: false })
  const bannerTimeoutRef = useRef(null)
  const verifyMetricsRef = useRef(null)
  const [banner, setBanner] = useState(null)
  const gameRef = useRef({
    pos: 0,
    speed: 0,
    playerX: 0,
    steer: 0,
    driftAngle: 0,
    boost: 0,
    bgSkew: 0,
    lapTime: 0,
    lastLapTime: null,
    bestLapTime: null,
    opponents: createOpponents(trackLength),
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    gameRef.current.bestLapTime = getBestTimes(TRACK_ID).bestLap

    function showBanner(lapTime, bestTime, isRecord) {
      clearTimeout(bannerTimeoutRef.current)
      setBanner({ lapText: formatTime(lapTime), bestText: formatTime(bestTime), isRecord })
      bannerTimeoutRef.current = setTimeout(() => setBanner(null), RESULTS.bannerDurationMs)
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

    function keyFor(e) {
      switch (e.code) {
        case 'ArrowUp': case 'KeyW': return 'up'
        case 'ArrowDown': case 'KeyS': return 'down'
        case 'ArrowLeft': case 'KeyA': return 'left'
        case 'ArrowRight': case 'KeyD': return 'right'
        case 'Space': case 'ShiftLeft': case 'ShiftRight': return 'drift'
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

    function applyVerifyOverride(g) {
      if (!verifyMode) return
      const o = window.__ECHO_RACE_TEST_OVERRIDE__
      if (!o) return
      if (o.pos != null) g.pos = o.pos
      if (o.playerX != null) g.playerX = o.playerX
      if (o.speed != null) g.speed = o.speed
      if (o.rivals) {
        for (const { rivalIndex, delta, x } of o.rivals) {
          const rival = g.opponents[rivalIndex]
          if (!rival) continue
          rival.pos = ((g.pos + delta) % trackLength + trackLength) % trackLength
          if (x != null) rival.x = x
        }
      }
    }

    function update(dt) {
      const g = gameRef.current
      applyVerifyOverride(g)
      const keys = keysRef.current
      const spct = g.speed / RACE.maxSpeed

      if (keys.up) {
        g.speed += RACE.accel * dt * (RACE.accelLowSpeedBoost - RACE.accelSpeedTaper * spct)
      } else if (keys.down) {
        g.speed -= RACE.brakeDecel * dt
      } else {
        g.speed -= RACE.friction * dt
      }

      const offRoad = Math.abs(g.playerX) > RACE.offRoadThreshold
      if (offRoad && g.speed > RACE.offRoadMaxSpeed) {
        g.speed -= RACE.offRoadDecel * dt
      }
      g.speed = Math.max(0, Math.min(RACE.maxSpeed, g.speed))

      const steerTarget = (keys.left ? -1 : 0) + (keys.right ? 1 : 0)
      g.steer += (steerTarget - g.steer) * Math.min(1, dt * RACE.steerEaseRate)
      g.playerX += g.steer * RACE.steerRate * dt * spct

      const curve = seg(Math.floor(g.pos / ROAD.segmentLength)).curve
      g.playerX -= curve * RACE.centrifugalStrength * spct * spct * dt
      g.playerX = Math.max(-RACE.playerXMax, Math.min(RACE.playerXMax, g.playerX))

      const drifting = keys.drift && Math.abs(g.steer) > DRIFT.minSteer && spct > DRIFT.minSpeedPercent
      if (drifting) {
        g.driftAngle += (g.steer * DRIFT.angleTargetFactor - g.driftAngle) * Math.min(1, dt * DRIFT.angleEaseRate)
        g.playerX += g.steer * RACE.steerRate * DRIFT.lateralSteerFactor * dt * spct
        g.speed -= RACE.friction * DRIFT.speedScrub * dt
      } else {
        if (Math.abs(g.driftAngle) > DRIFT.exitAngleThreshold && spct > DRIFT.exitMinSpeedPercent) {
          g.boost = DRIFT.boostDuration
        }
        g.driftAngle += (0 - g.driftAngle) * Math.min(1, dt * DRIFT.settleEaseRate)
      }
      if (g.boost > 0) {
        g.boost -= dt
        g.speed += RACE.accel * DRIFT.boostAccelFactor * dt
      }

      const prevPos = g.pos
      g.pos = (g.pos + g.speed * dt) % trackLength
      g.lapTime += dt
      if (g.pos < prevPos && g.speed > 0) {
        g.lastLapTime = g.lapTime
        const result = recordLapResult(TRACK_ID, g.lapTime)
        g.bestLapTime = result.bestLap
        showBanner(g.lapTime, result.bestLap, result.isNewBestLap)
        g.lapTime = 0
      }

      updateOpponents(g, dt, trackLength)
    }

    const P1 = { wx: 0, wy: 0, wz: 0, sx: 0, sy: 0, sw: 0, scale: 0 }
    const P2 = { wx: 0, wy: 0, wz: 0, sx: 0, sy: 0, sw: 0, scale: 0 }
    const frameSlots = Array.from({ length: ROAD.drawDistance }, () => (
      { s1x: 0, s1y: 0, s1w: 0, s2y: 0, s1wx: 0, s1wy: 0, segIndex: 0, clip: 0 }
    ))

    function render(width, height, time) {
      const g = gameRef.current
      applyVerifyOverride(g)
      const baseIndex = Math.floor(g.pos / ROAD.segmentLength)
      const baseSegment = seg(baseIndex)
      const segProgress = (g.pos % ROAD.segmentLength) / ROAD.segmentLength
      const camY = ROAD.cameraHeight + baseSegment.y + (seg(baseIndex + 1).y - baseSegment.y) * segProgress
      const spct = g.speed / RACE.maxSpeed
      g.bgSkew += baseSegment.curve * spct * PARALLAX.skewRate

      const horizonY = height * PARALLAX.horizonFraction
      ctx.fillStyle = linearGradient(ctx, 0, 0, 0, horizonY, COLORS.sky)
      ctx.fillRect(0, 0, width, horizonY)
      ctx.fillStyle = COLORS.grass
      ctx.fillRect(0, horizonY, width, height - horizonY)

      drawParallax(ctx, width, height, g.bgSkew, COLORS)

      let clip = height
      let x = 0
      const basePct = (g.pos % ROAD.segmentLength) / ROAD.segmentLength
      let dx = -(baseSegment.curve * basePct)

      for (let n = 0; n < ROAD.drawDistance; n++) {
        const i = baseIndex + n
        const s = seg(i)
        const z1 = n * ROAD.segmentLength - (g.pos % ROAD.segmentLength)
        const z2 = z1 + ROAD.segmentLength

        P1.wx = x; P1.wy = s.y; P1.wz = z1 + 0.01
        P2.wx = x + dx; P2.wy = seg(i + 1).y; P2.wz = z2
        project(P1, g.playerX * ROAD.roadWidth, camY, 0, ROAD.cameraDepth, width, height, ROAD.roadWidth)
        project(P2, g.playerX * ROAD.roadWidth, camY, 0, ROAD.cameraDepth, width, height, ROAD.roadWidth)

        x += dx
        dx += s.curve

        const slot = frameSlots[n]
        slot.s1x = P1.sx; slot.s1y = P1.sy; slot.s1w = P1.sw
        slot.s2y = P2.sy; slot.segIndex = i; slot.clip = clip
        slot.s1wx = P1.wx; slot.s1wy = P1.wy

        if (P2.sy >= P1.sy || P2.sy >= clip) continue

        renderRoadSegment(ctx, width, P1, P2, n % 2, COLORS, s.roadColor)
        if (i % ROAD.laneDashPeriod < ROAD.laneDashOn) {
          renderLaneStripe(ctx, P1, P2, COLORS.laneStripe)
        }

        clip = Math.min(clip, P2.sy)
      }

      const { groundY: playerGroundY, zPlayer, chassisWidth } = computePlayerDepth(width, height)
      const opponentPlacements = g.opponents
        .map((o) => ({ o, place: getOpponentScreenPlacement(o, g, frameSlots, trackLength, width, height, zPlayer, camY, chassisWidth) }))
        .filter((entry) => entry.place)

      const beforePlayer = opponentPlacements.filter(({ place }) => place.drawBeforePlayer)
      const afterPlayer = opponentPlacements.filter(({ place }) => !place.drawBeforePlayer)

      for (let n = ROAD.drawDistance - 1; n >= 1; n--) {
        const slot = frameSlots[n]
        const s = seg(slot.segIndex)
        if (s.sprites.length) {
          for (const sprite of s.sprites) {
            const sx = slot.s1x + slot.s1w * sprite.offset
            drawRoadsideSprite(ctx, sx, slot.s1y, slot.s1w, slot.clip, width, height, sprite, COLORS, time)
          }
        }
        for (const { o, place } of beforePlayer) {
          if (place.n0 !== n) continue
          drawOpponentCar(
            ctx,
            place.sx,
            place.sy,
            place.carWidth,
            o.lean,
            OPPONENT_PALETTES[o.rivalIndex],
            time,
            place.clip,
            width,
          )
        }
      }

      drawCar(ctx, width, height, {
        steer: g.steer,
        driftAngle: g.driftAngle,
        speedPercent: spct,
        boosting: g.boost > 0,
        time,
      }, COLORS)

      for (const { o, place } of afterPlayer.sort((a, b) => b.place.cameraZ - a.place.cameraZ)) {
        drawOpponentCar(
          ctx,
          place.sx,
          place.sy,
          place.carWidth,
          o.lean,
          OPPONENT_PALETTES[o.rivalIndex],
          time,
          place.clip,
          width,
        )
      }

      if (verifyMode) {
        const rival = opponentPlacements.find(({ o }) => o.rivalIndex === 0)
        verifyMetricsRef.current = {
          playerPos: g.pos,
          canvasH: height,
          playerWidth: chassisWidth,
          playerGroundY,
          nearPlane: OPPONENTS.cameraNearPlane,
          zPlayer,
          segmentLength: ROAD.segmentLength,
          rival: rival ? {
            delta: rival.place.delta,
            cameraZ: rival.place.cameraZ,
            sx: rival.place.sx,
            carWidth: rival.place.carWidth,
            sy: rival.place.sy,
            drawBeforePlayer: rival.place.drawBeforePlayer,
          } : null,
        }
      }

      drawHud(ctx, width, {
        speed: g.speed,
        lapTime: g.lapTime,
        lastLapTime: g.lastLapTime,
        bestLapTime: g.bestLapTime,
      }, COLORS)

      const vignette = ctx.createRadialGradient(
        width / 2, horizonY, height * PARALLAX.vignetteInnerRadiusFraction,
        width / 2, horizonY, height * PARALLAX.vignetteOuterRadiusFraction
      )
      vignette.addColorStop(0, COLORS.vignetteInner)
      vignette.addColorStop(1, COLORS.vignetteOuter)
      ctx.fillStyle = vignette
      ctx.fillRect(0, 0, width, height)
    }

    let rafId
    let lastTime = performance.now()
    function frame(now) {
      const dt = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now
      update(dt)
      render(W, H, now)
      rafId = requestAnimationFrame(frame)
    }
    rafId = requestAnimationFrame(frame)

    if (verifyMode) {
      window.__ECHO_RACE_TEST__ = {
        setScenario({ playerPos, playerX = 0, speed = 0, rivals }) {
          window.__ECHO_RACE_TEST_OVERRIDE__ = { pos: playerPos, playerX, speed, rivals }
        },
        clearScenario() { window.__ECHO_RACE_TEST_OVERRIDE__ = null },
        freeze() { keysRef.current = { up: false, down: false, left: false, right: false, drift: false } },
        holdUp(on = true) { keysRef.current.up = on },
        holdDown(on = true) { keysRef.current.down = on },
        getMetrics: () => verifyMetricsRef.current,
      }
    }

    return () => {
      if (verifyMode) {
        delete window.__ECHO_RACE_TEST__
        delete window.__ECHO_RACE_TEST_OVERRIDE__
      }
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      for (const cleanup of touchCleanups) cleanup()
      clearTimeout(bannerTimeoutRef.current)
    }
  }, [])

  return (
    <div className="race-track">
      <canvas ref={canvasRef} />
      {banner && (
        <div
          className={`lap-banner${banner.isRecord ? ' lap-banner-record' : ''}`}
          style={{ animationDuration: `${RESULTS.bannerDurationMs}ms` }}
        >
          <span className="lap-banner-time">Lap {banner.lapText}</span>
          <span className="lap-banner-best">
            {banner.isRecord ? 'New Best!' : `Best ${banner.bestText}`}
          </span>
        </div>
      )}
      <div className="touch-zones">
        <div ref={touchLeftRef} className="touch-zone touch-left" />
        <div ref={touchAccelRef} className="touch-zone touch-accel" />
        <div ref={touchRightRef} className="touch-zone touch-right" />
      </div>
    </div>
  )
}