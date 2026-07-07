import { useEffect, useRef, useState } from 'react'
import { ROAD, RACE, DRIFT, PARALLAX, TRACK_ID, RESULTS, OPPONENTS, COMBAT } from '../data/tuning.js'
import { trackLength, seg } from '../engine/track.js'
import { project, renderRoadSegment, renderLaneStripe } from '../engine/projection.js'
import { drawParallax } from '../engine/background.js'
import { drawRoadsideSprite } from '../engine/roadside.js'
import { drawCar, drawOpponentCar, getCreatureAnchor } from '../engine/car.js'
import { createOpponents, updateOpponents, getOpponentScreenPlacement, computePlayerDepth, computePlayerPlace, startGridSlot } from '../engine/opponents.js'
import { updateCombat, wobbleAngle } from '../engine/combat.js'
import { drawAttackBolt, drawPlayerHitEdge } from '../engine/combatfx.js'
import { drawHud, formatTime, ordinal } from '../engine/hud.js'
import { COLORS, OPPONENT_PALETTES, linearGradient } from '../engine/colors.js'
import { getBestTimes, recordLapResult, recordRaceResult } from '../data/saves.js'
import './RaceTrack.css'

const verifyMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('verify')

// The countdown ceremony is a real-player affordance — verify mode drives
// scenarios directly via position overrides and expects the race to be
// live immediately, so it skips straight past it (countdownRemaining: 0).
// Time-trial keeps its instant start regardless of mode, per spec.
function initialCountdownRemaining() {
  if (verifyMode || RACE.mode !== 'race') return 0
  return (RACE.countdown.beats.length * RACE.countdown.beatDurationMs) / 1000
}

// The combat feedback bundle a car draw needs (see car.js drawCombatAura):
// hit-flash intensity, a "cooldown ready" charge flag, and the current
// wobble roll. Null outside race mode so combat visuals never show in
// time-trial. Shared by the player and every rival so all read identically.
function combatFx(attackCooldown, wobble, hitFlash) {
  if (RACE.mode !== 'race') return null
  return {
    flash: hitFlash > 0 ? hitFlash / COMBAT.hitFlashDuration : 0,
    charged: attackCooldown <= 0 ? 1 : 0,
    wobbleAngle: wobbleAngle(wobble),
  }
}

// Fresh per-race state — used both for the initial mount and for "Race
// Again" (which must reset positions, opponents, and timers as cleanly as
// a first load). bestLapTime is populated separately from persisted saves
// right after creation, since that record outlives any single race.
function createInitialGameState() {
  const playerSlot = startGridSlot(0)
  return {
    pos: playerSlot.pos,
    speed: 0,
    playerX: playerSlot.x,
    steer: 0,
    driftAngle: 0,
    boost: 0,
    bgSkew: 0,
    lapTime: 0,
    lastLapTime: null,
    bestLapTime: null,
    raceTime: 0,
    raceBestLap: null,
    raceHasNewBestLap: false,
    playerLaps: 0,
    playerFinished: false,
    playerPlace: null,
    raceFinished: false,
    nextPlace: 1,
    countdownRemaining: initialCountdownRemaining(),
    countdownBeatIndex: -1,
    // Minimal auto-attack combat state (see engine/combat.js). The player's
    // creature obeys the same fields every rival carries on its own object.
    playerAttackCooldown: 0,
    playerWobble: 0,
    playerHitFlash: 0,
    playerHitEdgePulse: 0,
    combatEventCount: 0,
    playerHitCount: 0,
    attacks: [],
    opponents: createOpponents(),
  }
}

export default function RaceTrack() {
  const canvasRef = useRef(null)
  const touchLeftRef = useRef(null)
  const touchAccelRef = useRef(null)
  const touchRightRef = useRef(null)
  const keysRef = useRef({ up: false, down: false, left: false, right: false, drift: false })
  const bannerTimeoutRef = useRef(null)
  const verifyMetricsRef = useRef(null)
  const resetRaceRef = useRef(null)
  const [banner, setBanner] = useState(null)
  const [raceResult, setRaceResult] = useState(null)
  const [countdownText, setCountdownText] = useState(() => (
    RACE.mode === 'race' && !verifyMode ? RACE.countdown.beats[0] : null
  ))
  const gameRef = useRef(createInitialGameState())

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    gameRef.current.bestLapTime = getBestTimes(TRACK_ID).bestLap

    function showBanner(lapTime, bestTime, isRecord) {
      clearTimeout(bannerTimeoutRef.current)
      setBanner({ lapText: formatTime(lapTime), bestText: formatTime(bestTime), isRecord })
      bannerTimeoutRef.current = setTimeout(() => setBanner(null), RESULTS.bannerDurationMs)
    }

    // "Race Again": a full reset (positions, opponents, timers) rather than
    // patching individual fields, so it can never leave a stray field from
    // the finished race behind.
    function resetRace() {
      clearTimeout(bannerTimeoutRef.current)
      setBanner(null)
      setRaceResult(null)
      const fresh = createInitialGameState()
      fresh.bestLapTime = getBestTimes(TRACK_ID).bestLap
      gameRef.current = fresh
      setCountdownText(fresh.countdownRemaining > 0 ? RACE.countdown.beats[0] : null)
    }
    resetRaceRef.current = resetRace

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
        for (const { rivalIndex, delta, x, speed } of o.rivals) {
          const rival = g.opponents[rivalIndex]
          if (!rival) continue
          rival.pos = ((g.pos + delta) % trackLength + trackLength) % trackLength
          if (x != null) rival.x = x
          if (speed != null) rival.speed = speed
        }
      }
    }

    function update(dt) {
      const g = gameRef.current
      applyVerifyOverride(g)

      // Countdown: every racer (player and AI alike) is completely frozen
      // — updateOpponents isn't even called — until the last beat elapses.
      // Lap/race timers only start accumulating once we fall through to
      // normal physics below, so they naturally begin at GO, not at mount.
      if (g.countdownRemaining > 0) {
        g.countdownRemaining = Math.max(0, g.countdownRemaining - dt)
        const beats = RACE.countdown.beats
        const totalSec = (beats.length * RACE.countdown.beatDurationMs) / 1000
        const beatSec = RACE.countdown.beatDurationMs / 1000
        const elapsed = totalSec - g.countdownRemaining
        const beatIndex = Math.min(beats.length - 1, Math.floor(elapsed / beatSec))
        if (beatIndex !== g.countdownBeatIndex) {
          g.countdownBeatIndex = beatIndex
          setCountdownText(beats[beatIndex])
        }
        if (g.countdownRemaining <= 0) setCountdownText(null)
        return
      }

      // Race finished: freeze input, let the car coast to a stop under its
      // own friction. Rivals are unaffected — updateOpponents still runs,
      // so anyone still racing keeps driving exactly as before.
      if (g.raceFinished) {
        g.speed = Math.max(0, g.speed - RACE.friction * dt)
        g.driftAngle += (0 - g.driftAngle) * Math.min(1, dt * DRIFT.settleEaseRate)
        g.pos = (g.pos + g.speed * dt) % trackLength
        updateOpponents(g, dt, trackLength)
        updateCombat(g, dt, trackLength)
        return
      }

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
      g.raceTime += dt
      // See opponents.js's identical guard: require the apparent decrease
      // to be at least half the track, so a genuine wrap (near trackLength
      // back to near 0) can't be confused with ordinary jitter.
      if (prevPos - g.pos > trackLength / 2) {
        g.lastLapTime = g.lapTime
        const result = recordLapResult(TRACK_ID, g.lapTime)
        g.bestLapTime = result.bestLap
        if (g.raceBestLap == null || g.lapTime < g.raceBestLap) g.raceBestLap = g.lapTime
        if (result.isNewBestLap) g.raceHasNewBestLap = true

        if (RACE.mode === 'race') {
          g.playerLaps += 1
          if (g.playerLaps >= RACE.lapCount) {
            g.playerFinished = true
            g.playerPlace = g.nextPlace++
            g.raceFinished = true
            const raceRecord = recordRaceResult(TRACK_ID, g.raceTime)
            setRaceResult({
              place: g.playerPlace,
              totalTime: g.raceTime,
              bestLap: g.raceBestLap,
              isNewBestLap: g.raceHasNewBestLap,
              isNewBestTotal: raceRecord.isNewBestTotal,
            })
          } else {
            showBanner(g.lapTime, result.bestLap, result.isNewBestLap)
          }
        } else {
          showBanner(g.lapTime, result.bestLap, result.isNewBestLap)
        }
        g.lapTime = 0
      }

      updateOpponents(g, dt, trackLength)
      // Combat runs only here (race mode, post-GO): the countdown branch
      // returns before reaching this, and updateCombat itself no-ops in
      // time-trial. It's the last word each frame, so its wobble nudge sits
      // on top of the frame's steering/lane easing.
      updateCombat(g, dt, trackLength)
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
            combatFx(o.attackCooldown, o.wobble, o.hitFlash),
          )
        }
      }

      drawCar(ctx, width, height, {
        steer: g.steer,
        driftAngle: g.driftAngle,
        speedPercent: spct,
        boosting: g.boost > 0,
        time,
      }, COLORS, combatFx(g.playerAttackCooldown, g.playerWobble, g.playerHitFlash))

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
          combatFx(o.attackCooldown, o.wobble, o.hitFlash),
        )
      }

      // Attack telegraphs — the resonance bolts traveling between bonded
      // creatures. Drawn after the cars (glowing light reads fine over the
      // hulls) but before the HUD/vignette. Each endpoint is a creature
      // anchor: the player's fixed screen center, or a rival's projected
      // placement; a bolt whose attacker or target is currently culled
      // (offscreen) is simply skipped for that frame.
      if (RACE.mode === 'race' && g.attacks.length) {
        const playerPt = getCreatureAnchor(width / 2, playerGroundY, chassisWidth)
        const rivalById = {}
        for (const { o, place } of opponentPlacements) {
          rivalById[o.rivalIndex] = {
            pt: getCreatureAnchor(place.sx, place.sy, place.carWidth),
            carWidth: place.carWidth,
          }
        }
        for (const a of g.attacks) {
          const from = a.fromPlayer ? playerPt : rivalById[a.fromRivalIndex]?.pt
          const toEntry = a.toPlayer
            ? { pt: playerPt, carWidth: chassisWidth }
            : rivalById[a.toRivalIndex]
          if (!from || !toEntry) continue
          const glowRGB = a.fromPlayer
            ? COLORS.intakeGlowRGB
            : OPPONENT_PALETTES[a.fromRivalIndex].intakeGlowRGB
          drawAttackBolt(ctx, from, toEntry.pt, Math.min(1, a.elapsed / a.duration), glowRGB, toEntry.carWidth)
        }
      }

      if (verifyMode) {
        const rival = opponentPlacements.find(({ o }) => o.rivalIndex === 0)
        verifyMetricsRef.current = {
          playerPos: g.pos,
          playerX: g.playerX,
          curve: baseSegment.curve,
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
        raceTime: g.raceTime,
        mode: RACE.mode,
        lap: Math.min(g.playerLaps + 1, RACE.lapCount),
        lapCount: RACE.lapCount,
        place: RACE.mode === 'race' ? computePlayerPlace(g, trackLength) : null,
      }, COLORS)

      const vignette = ctx.createRadialGradient(
        width / 2, horizonY, height * PARALLAX.vignetteInnerRadiusFraction,
        width / 2, horizonY, height * PARALLAX.vignetteOuterRadiusFraction
      )
      vignette.addColorStop(0, COLORS.vignetteInner)
      vignette.addColorStop(1, COLORS.vignetteOuter)
      ctx.fillStyle = vignette
      ctx.fillRect(0, 0, width, height)

      // Player-only "I just got hit" screen-edge glow, over everything so
      // it's unmissable mid-drift. Only fires when the player was the
      // victim (see combat.js landHit arming playerHitEdgePulse).
      if (RACE.mode === 'race' && g.playerHitEdgePulse > 0) {
        drawPlayerHitEdge(ctx, width, height, g.playerHitEdgePulse / COMBAT.edgePulseDuration, COLORS.resonanceGlowRGB)
      }
    }

    // Verify-only capture pause: lets the combat verification freeze the
    // loop on the first frame that shows a telegraph (or a player-hit edge
    // pulse) so those brief, timing-sensitive cues can be screenshotted
    // deterministically. Update is skipped while paused (state frozen) but
    // render keeps running, so the frozen frame stays on screen. Never
    // engaged outside verify mode — the arming flags are only reachable
    // through the verify API below.
    let paused = false
    let pauseArm = null

    let rafId
    let lastTime = performance.now()
    function frame(now) {
      // Clamp to [0, 0.05]: a stray early frame's `now` can land at or
      // slightly before `lastTime` (a known requestAnimationFrame quirk,
      // most visible right after mount under StrictMode's double-effect),
      // which would otherwise produce a momentary negative dt.
      const dt = Math.max(0, Math.min((now - lastTime) / 1000, 0.05))
      lastTime = now
      if (!paused) {
        update(dt)
        const g = gameRef.current
        if (pauseArm === 'attack' && g.attacks.length) { paused = true; pauseArm = null }
        else if (pauseArm === 'playerhit' && g.playerHitEdgePulse > 0) { paused = true; pauseArm = null }
      }
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
        // Combat verification hooks. setOverride pins positions WITHOUT
        // forcing speed (unlike setScenario, which defaults speed to 0), so
        // a combat speed penalty actually persists and can be measured.
        // setMode flips RACE.mode at runtime (it's a mutable object prop) so
        // the "no combat in time-trial" gate can be exercised. startCountdown
        // re-arms the countdown so the "no combat during countdown" gate can
        // be exercised even though verify mode normally skips it.
        setOverride(override) { window.__ECHO_RACE_TEST_OVERRIDE__ = override },
        setMode(mode) { RACE.mode = mode },
        // Freeze the loop on the next frame showing a telegraph ('attack')
        // or a player-hit edge pulse ('playerhit'), for deterministic
        // screenshots of those brief cues; resumeLoop() releases it.
        armPause(kind = 'attack') { pauseArm = kind; paused = false },
        pause() { paused = true; pauseArm = null },
        resumeLoop() { paused = false; pauseArm = null },
        isPaused: () => paused,
        startCountdown() {
          const g = gameRef.current
          g.countdownRemaining = (RACE.countdown.beats.length * RACE.countdown.beatDurationMs) / 1000
          g.countdownBeatIndex = -1
        },
        getCombatState: () => {
          const g = gameRef.current
          return {
            mode: RACE.mode,
            countdownRemaining: g.countdownRemaining,
            events: g.combatEventCount || 0,
            playerHits: g.playerHitCount || 0,
            activeAttacks: g.attacks.length,
            playerSpeed: g.speed,
            playerX: g.playerX,
            playerAttackCooldown: g.playerAttackCooldown,
            playerWobble: g.playerWobble,
            playerHitFlash: g.playerHitFlash,
            playerHitEdgePulse: g.playerHitEdgePulse,
            opponents: g.opponents.map((o) => ({
              rivalIndex: o.rivalIndex, pos: o.pos, x: o.x, speed: o.speed,
              attackCooldown: o.attackCooldown, wobble: o.wobble, hitFlash: o.hitFlash,
            })),
          }
        },
        getMetrics: () => verifyMetricsRef.current,
        // Read-only race-state accessor for verifying the race/placement
        // feature end-to-end without parsing the DOM overlay.
        getRaceState: () => {
          const g = gameRef.current
          return {
            mode: RACE.mode,
            lapCount: RACE.lapCount,
            trackLength,
            playerLaps: g.playerLaps,
            playerFinished: g.playerFinished,
            playerPlace: g.playerPlace,
            raceFinished: g.raceFinished,
            raceTime: g.raceTime,
            raceBestLap: g.raceBestLap,
            countdownRemaining: g.countdownRemaining,
            currentPlace: RACE.mode === 'race' ? computePlayerPlace(g, trackLength) : null,
            playerPos: g.pos,
            opponents: g.opponents.map((o) => ({
              rivalIndex: o.rivalIndex, pos: o.pos, laps: o.laps, finished: o.finished, place: o.place,
            })),
          }
        },
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
      {countdownText && (
        <div className="countdown-overlay">
          <span
            key={countdownText}
            className={`countdown-text${countdownText === 'GO!' ? ' countdown-go' : ''}`}
          >
            {countdownText}
          </span>
        </div>
      )}
      {raceResult && (
        <div className="results-screen">
          <div className="results-card">
            <h2 className="results-headline">
              {raceResult.place === 1
                ? 'You won the Trial Circuit!'
                : `Finished ${ordinal(raceResult.place)} — race again?`}
            </h2>
            <div className="results-stats">
              <div className="results-stat">
                <span className="results-stat-label">Total Time</span>
                <span className="results-stat-value">{formatTime(raceResult.totalTime)}</span>
              </div>
              <div className="results-stat">
                <span className="results-stat-label">Best Lap</span>
                <span className="results-stat-value">
                  {formatTime(raceResult.bestLap)}
                  {raceResult.isNewBestLap && <span className="results-stat-badge"> New Best!</span>}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="results-again-btn"
              onClick={() => resetRaceRef.current?.()}
            >
              Race Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}