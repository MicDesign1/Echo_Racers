import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROAD, RACE, DRIFT, PARALLAX, RESULTS, OPPONENTS, COMBAT, CONTROLS, DIFFICULTY, activeTrackId } from '../data/tuning.js'
import { trackLength, seg } from '../engine/track.js'
import { project, renderRoadSegment, renderLaneStripe } from '../engine/projection.js'
import { drawParallax } from '../engine/background.js'
import { drawRoadsideSprite } from '../engine/roadside.js'
import { drawCar, drawOpponentCar, getCreatureAnchor } from '../engine/car.js'
import { createOpponents, updateOpponents, getOpponentScreenPlacement, computePlayerDepth, computePlayerPlace, startGridSlot } from '../engine/opponents.js'
import { updateCombat, wobbleAngle } from '../engine/combat.js'
import { drawAttackBolt, drawPlayerHitEdge } from '../engine/combatfx.js'
import * as audio from '../engine/audio.js'
import { drawHud, formatTime, ordinal } from '../engine/hud.js'
import { COLORS, OPPONENT_PALETTES, linearGradient } from '../engine/colors.js'
import { getBestTimes, recordLapResult, recordRaceResult, getPracticeConfig } from '../data/saves.js'
import './RaceTrack.css'

const verifyMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('verify')

// Opt-in audio inspection hook (?audiodebug=1). Audio is deliberately never
// started in verify mode (keeps the render/combat regression scripts pure),
// so this separate flag exposes the live audio graph for the audible/CDP
// hand-test without shipping the hook in normal play.
const audioDebug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('audiodebug')

// Forces the on-screen touch controls on (and, for verification only,
// exposes a read-only window.__ECHO_TOUCH__ view of the live input +
// resulting speed). Real touch devices get the controls via auto-detection
// WITHOUT this param, so this debug read never ships to normal play.
const forceTouch = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('touch')

// Difficulty/count/mode overrides for verification ONLY — no player UI yet.
// Applied to the practice config at load so they survive the page reloads the
// verify scripts perform (e.g. ?verify=1&rivals=8&difficulty=Ace). Gated on
// verify mode so nothing here ships to normal play. Also see the setDifficulty
// / setRivalCount / setRaceMode hooks on window.__ECHO_RACE_TEST__ below for
// changing these live within a session.
if (verifyMode && typeof window !== 'undefined') {
  const q = new URLSearchParams(window.location.search)
  const rc = q.get('rivals')
  if (rc != null && Number.isFinite(+rc)) {
    RACE.practice.rivalCount = Math.max(1, Math.min(RACE.maxRivalCount, Math.round(+rc)))
  }
  const d = q.get('difficulty')
  if (d && DIFFICULTY[d]) RACE.practice.difficulty = d
  const rm = q.get('racemode')
  if (rm === 'practice' || rm === 'trial') RACE.raceMode = rm
} else if (typeof window !== 'undefined') {
  // Outside verify mode, hydrate RACE.practice from the player's last-used
  // Practice choices so a direct load / refresh of /race (i.e. not arriving
  // via the setup screen) still uses what they picked last time. Validated
  // against the current tiers / rival bounds so a stale value can't launch an
  // invalid race. Never runs in verify mode — the regression scripts keep
  // their fixed Cadet / 3-rival defaults.
  const saved = getPracticeConfig()
  if (DIFFICULTY[saved.difficulty]) RACE.practice.difficulty = saved.difficulty
  const n = Number(saved.rivalCount)
  if (Number.isFinite(n)) RACE.practice.rivalCount = Math.max(1, Math.min(RACE.maxRivalCount, Math.round(n)))
}

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
    // Transient per-frame flags the audio bed reads (engine/audio.js):
    // whether the player is currently drifting, and a queue of combat
    // sounds updateCombat leaves for us to play. Both are advisory — the
    // simulation never depends on them.
    drifting: false,
    audioEvents: [],
    opponents: createOpponents(),
  }
}

export default function RaceTrack() {
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const joyBaseRef = useRef(null)
  const joyNubRef = useRef(null)
  const accelBtnRef = useRef(null)
  const brakeBtnRef = useRef(null)
  const driftBtnRef = useRef(null)
  const keysRef = useRef({ up: false, down: false, left: false, right: false, drift: false })
  // Analog touch input, read alongside keysRef every frame. `steer` is a
  // continuous -1..+1 from the joystick (steerActive gates it in so a
  // centered/absent stick never fights the keyboard); up/down/drift mirror
  // the keyboard flags for the throttle cluster. Mutated by pointer
  // handlers, never triggers a re-render (same pattern as gameRef).
  const touchRef = useRef({ steer: 0, steerActive: false, up: false, down: false, drift: false })
  // Show on-screen controls only on touch/coarse-pointer devices (or when
  // forced via ?touch=1 for hand-testing on desktop). Never in verify mode,
  // so the render/combat regression scripts stay byte-identical. Desktop
  // keyboard play renders nothing and is behaviorally unchanged.
  const [showTouch] = useState(() => {
    if (typeof window === 'undefined') return false
    if (new URLSearchParams(window.location.search).has('touch')) return true
    if (verifyMode) return false
    // Gate on the PRIMARY pointer being coarse — true on phones/tablets, but
    // NOT on a desktop/laptop with a mouse (even a touchscreen one, whose
    // primary pointer is still fine). Keeps desktop keyboard play unchanged.
    // Falls back to touch-point count only where matchMedia is unavailable.
    if (typeof window.matchMedia === 'function') return window.matchMedia('(pointer: coarse)').matches
    return navigator.maxTouchPoints > 0 || 'ontouchstart' in window
  })
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

    gameRef.current.bestLapTime = getBestTimes(activeTrackId()).bestLap

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
      fresh.bestLapTime = getBestTimes(activeTrackId()).bestLap
      gameRef.current = fresh
      setCountdownText(fresh.countdownRemaining > 0 ? RACE.countdown.beats[0] : null)
      audio.raceRestart() // let the beds come back; music restarts at the new GO
      audio.blip() // short UI note on Race Again
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
      // Any key is a valid "first gesture" to unblock the AudioContext.
      // Skipped in verify mode so the headless regression scripts never
      // spin up audio (keeps them byte-for-byte as before).
      if (!verifyMode) audio.ensureStarted()
      if (e.code === 'KeyM') { audio.toggleMute(); e.preventDefault(); return }
      const k = keyFor(e)
      if (k) { keysRef.current[k] = true; e.preventDefault() }
    }
    function onKeyUp(e) {
      const k = keyFor(e)
      if (k) { keysRef.current[k] = false; e.preventDefault() }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

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
        g.drifting = false
        g.countdownRemaining = Math.max(0, g.countdownRemaining - dt)
        const beats = RACE.countdown.beats
        const totalSec = (beats.length * RACE.countdown.beatDurationMs) / 1000
        const beatSec = RACE.countdown.beatDurationMs / 1000
        const elapsed = totalSec - g.countdownRemaining
        const beatIndex = Math.min(beats.length - 1, Math.floor(elapsed / beatSec))
        if (beatIndex !== g.countdownBeatIndex) {
          g.countdownBeatIndex = beatIndex
          setCountdownText(beats[beatIndex])
          // A warm beep on each number, a brighter chord on the final GO —
          // and the race music kicks in on GO (fades/restarts while racing).
          if (beats[beatIndex] === 'GO!') { audio.countdownGo(); audio.startRaceMusic() }
          else audio.countdownBeep()
        }
        if (g.countdownRemaining <= 0) setCountdownText(null)
        return
      }

      // Race finished: freeze input, let the car coast to a stop under its
      // own friction. Rivals are unaffected — updateOpponents still runs,
      // so anyone still racing keeps driving exactly as before.
      if (g.raceFinished) {
        g.drifting = false
        g.speed = Math.max(0, g.speed - RACE.friction * dt)
        g.driftAngle += (0 - g.driftAngle) * Math.min(1, dt * DRIFT.settleEaseRate)
        g.pos = (g.pos + g.speed * dt) % trackLength
        updateOpponents(g, dt, trackLength)
        updateCombat(g, dt, trackLength)
        return
      }

      const keys = keysRef.current
      const touch = touchRef.current
      const spct = g.speed / RACE.maxSpeed

      // Throttle: keyboard OR touch. The touch buttons set the same flags,
      // so 'autoAccel' just holds touch.up true (its combined button drops
      // it while braking). Keyboard order is preserved (accel wins ties).
      const accelInput = keys.up || touch.up
      const brakeInput = keys.down || touch.down
      if (accelInput) {
        g.speed += RACE.accel * dt * (RACE.accelLowSpeedBoost - RACE.accelSpeedTaper * spct)
      } else if (brakeInput) {
        g.speed -= RACE.brakeDecel * dt
      } else {
        g.speed -= RACE.friction * dt
      }

      const offRoad = Math.abs(g.playerX) > RACE.offRoadThreshold
      if (offRoad && g.speed > RACE.offRoadMaxSpeed) {
        g.speed -= RACE.offRoadDecel * dt
      }
      g.speed = Math.max(0, Math.min(RACE.maxSpeed, g.speed))

      // Steering feeds a single analog target. The joystick provides a
      // proportional -1..+1 (half-tilt = gentle) and, while held, overrides
      // the discrete keyboard value; released, it springs to 0 and hands
      // control straight back to the keys. Same easing/physics either way.
      const keySteer = (keys.left ? -1 : 0) + (keys.right ? 1 : 0)
      let steerTarget = touch.steerActive ? touch.steer : keySteer
      steerTarget = Math.max(-1, Math.min(1, steerTarget))
      g.steer += (steerTarget - g.steer) * Math.min(1, dt * RACE.steerEaseRate)
      g.playerX += g.steer * RACE.steerRate * dt * spct

      const curve = seg(Math.floor(g.pos / ROAD.segmentLength)).curve
      g.playerX -= curve * RACE.centrifugalStrength * spct * spct * dt
      g.playerX = Math.max(-RACE.playerXMax, Math.min(RACE.playerXMax, g.playerX))

      const drifting = (keys.drift || touch.drift) && Math.abs(g.steer) > DRIFT.minSteer && spct > DRIFT.minSpeedPercent
      g.drifting = drifting
      if (drifting) {
        g.driftAngle += (g.steer * DRIFT.angleTargetFactor - g.driftAngle) * Math.min(1, dt * DRIFT.angleEaseRate)
        g.playerX += g.steer * RACE.steerRate * DRIFT.lateralSteerFactor * dt * spct
        g.speed -= RACE.friction * DRIFT.speedScrub * dt
      } else {
        if (Math.abs(g.driftAngle) > DRIFT.exitAngleThreshold && spct > DRIFT.exitMinSpeedPercent) {
          g.boost = DRIFT.boostDuration
          audio.boost() // brief rising surge on a clean drift exit
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
        const result = recordLapResult(activeTrackId(), g.lapTime)
        g.bestLapTime = result.bestLap
        if (g.raceBestLap == null || g.lapTime < g.raceBestLap) g.raceBestLap = g.lapTime
        if (result.isNewBestLap) g.raceHasNewBestLap = true

        if (RACE.mode === 'race') {
          g.playerLaps += 1
          if (g.playerLaps >= RACE.lapCount) {
            g.playerFinished = true
            g.playerPlace = g.nextPlace++
            g.raceFinished = true
            const raceRecord = recordRaceResult(activeTrackId(), g.raceTime)
            setRaceResult({
              place: g.playerPlace,
              totalTime: g.raceTime,
              bestLap: g.raceBestLap,
              isNewBestLap: g.raceHasNewBestLap,
              isNewBestTotal: raceRecord.isNewBestTotal,
            })
            // Fade engine/wind/music out over ~1.5s as the results appear.
            audio.raceEndFade()
            // Victory cheer for 1st place only — no stinger otherwise (synth
            // flourish is only a fallback if the cheer clip is missing).
            if (g.playerPlace === 1 && !audio.playWinCheer()) audio.results()
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
        muted: audio.isMuted(),
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

        // Play any combat sounds updateCombat queued this frame, then clear
        // the queue (drained even when audio is inactive so it can't grow).
        // playAttack/playDamage pull a random clip from their pool (synth
        // fallback). No combat sounds once the race is finished. All no-op
        // before the first gesture and in time-trial (never queued there).
        // FUTURE TYPED COMBAT: pass ev's attacker/target creature type into
        // playAttack/playDamage so audio can pickForType instead of the full
        // pool (swap points are marked in engine/audio.js).
        for (const ev of g.audioEvents) {
          if (g.raceFinished) continue
          audio.playAttack(ev.fromPlayer)
          audio.playDamage(ev.toPlayer)
        }
        g.audioEvents.length = 0

        // Continuous bed: engine hum + wind track g.speed; drift sizzle
        // tracks g.drifting; rival hums fade with proximity (shortest
        // wrap-around gap). No-ops until the AudioContext is started.
        audio.update({
          speed: g.speed,
          maxSpeed: RACE.maxSpeed,
          drifting: g.drifting,
          rivals: g.opponents.map((o) => {
            let gap = ((o.pos - g.pos) % trackLength + trackLength) % trackLength
            if (gap > trackLength / 2) gap -= trackLength
            return { speed: o.speed, gap: Math.abs(gap) }
          }),
        })
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
            playerX: g.playerX,
            playerSpeed: g.speed,
            rivalCount: RACE.rivalCount,
            opponents: g.opponents.map((o) => ({
              rivalIndex: o.rivalIndex, pos: o.pos, x: o.x, speed: o.speed, laps: o.laps, finished: o.finished, place: o.place,
            })),
          }
        },
        // Difficulty / rival-count / race-mode debug hooks (no player UI yet).
        // Changing count or difficulty rebuilds the field via a full race
        // reset so the new values apply from a clean grid, exactly as a fresh
        // load would. getRaceConfig reports the resolved active config.
        getRaceConfig: () => ({
          raceMode: RACE.raceMode,
          difficulty: (RACE.raceMode === 'trial' ? RACE.trial : RACE.practice).difficulty,
          rivalCount: RACE.rivalCount,
          trackId: activeTrackId(),
          tiers: Object.keys(DIFFICULTY),
        }),
        setDifficulty(name) {
          if (!DIFFICULTY[name]) return false
          ;(RACE.raceMode === 'trial' ? RACE.trial : RACE.practice).difficulty = name
          resetRaceRef.current?.()
          return true
        },
        setRivalCount(n) {
          const count = Math.max(1, Math.min(RACE.maxRivalCount, Math.round(n)))
          ;(RACE.raceMode === 'trial' ? RACE.trial : RACE.practice).rivalCount = count
          resetRaceRef.current?.()
          return count
        },
        setRaceMode(mode) {
          if (mode !== 'practice' && mode !== 'trial') return false
          RACE.raceMode = mode
          resetRaceRef.current?.()
          return true
        },
      }
    }

    if (audioDebug) {
      window.__ECHO_AUDIO__ = {
        getState: () => audio.getDebugState(),
        getPickLog: () => audio.getPickLog(),
        playWinCheer: () => audio.playWinCheer(),
        toggleMute: () => audio.toggleMute(),
        setMode: (m) => { RACE.mode = m },
        setLapCount: (n) => { RACE.lapCount = n },
        hold: (k, on = true) => { keysRef.current[k] = on },
        startCountdown: () => {
          const g = gameRef.current
          g.countdownRemaining = (RACE.countdown.beats.length * RACE.countdown.beatDurationMs) / 1000
          g.countdownBeatIndex = -1
        },
      }
    }

    return () => {
      if (verifyMode) {
        delete window.__ECHO_RACE_TEST__
        delete window.__ECHO_RACE_TEST_OVERRIDE__
      }
      // NB: in audioDebug we intentionally KEEP window.__ECHO_AUDIO__ after
      // unmount so verification can assert the graph is fully torn down
      // (getState reads the module singleton, valid post-teardown).
      cancelAnimationFrame(rafId)
      audio.teardown() // stop ALL sources + close the context: zero audio survives leaving the race
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      clearTimeout(bannerTimeoutRef.current)
    }
  }, [])

  // Touch-control wiring, mounted only when the on-screen controls render.
  // Each control captures its own pointer id, so the steering joystick and
  // a throttle/drift button work simultaneously (true multi-touch — no
  // shared handler). All state lands in touchRef, drained by update().
  useEffect(() => {
    if (!showTouch) return
    const touch = touchRef.current
    const cleanups = []

    // 'autoAccel' drives forward on its own; the combined button below drops
    // this while held. 'manual' starts with nothing pressed.
    touch.up = CONTROLS.touchScheme === 'autoAccel'
    touch.down = false
    touch.drift = false
    touch.steer = 0
    touch.steerActive = false

    const base = joyBaseRef.current
    const nub = joyNubRef.current
    if (base && nub) {
      const travel = (CONTROLS.joystick.baseSize - CONTROLS.joystick.nubSize) / 2
      let steerId = null
      const compute = (e) => {
        const rect = base.getBoundingClientRect()
        let dx = e.clientX - (rect.left + rect.width / 2)
        let dy = e.clientY - (rect.top + rect.height / 2)
        const dist = Math.hypot(dx, dy)
        if (dist > travel && dist > 0) { dx = (dx / dist) * travel; dy = (dy / dist) * travel }
        let axis = travel > 0 ? dx / travel : 0
        if (Math.abs(axis) < CONTROLS.joystick.deadzone) axis = 0
        touch.steer = axis
        touch.steerActive = true
        nub.style.transform = `translate(${dx}px, ${dy}px)`
      }
      const onDown = (e) => {
        if (steerId !== null) return
        steerId = e.pointerId
        try { base.setPointerCapture(e.pointerId) } catch { /* no active pointer (e.g. synthetic) */ }
        base.classList.add('is-pressed')
        if (!verifyMode) audio.ensureStarted()
        compute(e)
        e.preventDefault()
      }
      const onMove = (e) => { if (e.pointerId === steerId) { compute(e); e.preventDefault() } }
      const onUp = (e) => {
        if (e.pointerId !== steerId) return
        steerId = null
        touch.steer = 0
        touch.steerActive = false
        base.classList.remove('is-pressed')
        nub.style.transform = 'translate(0px, 0px)'
        e.preventDefault()
      }
      base.addEventListener('pointerdown', onDown)
      base.addEventListener('pointermove', onMove)
      base.addEventListener('pointerup', onUp)
      base.addEventListener('pointercancel', onUp)
      cleanups.push(() => {
        base.removeEventListener('pointerdown', onDown)
        base.removeEventListener('pointermove', onMove)
        base.removeEventListener('pointerup', onUp)
        base.removeEventListener('pointercancel', onUp)
      })
    }

    // A press/release button that captures its own pointer so it survives a
    // finger sliding slightly off it, and never steals the joystick's touch.
    function wireButton(el, onPress, onRelease) {
      if (!el) return
      const down = (e) => {
        el.classList.add('is-pressed')
        try { el.setPointerCapture(e.pointerId) } catch { /* no active pointer (e.g. synthetic) */ }
        if (!verifyMode) audio.ensureStarted()
        onPress()
        e.preventDefault()
      }
      const up = (e) => { el.classList.remove('is-pressed'); onRelease(); e.preventDefault() }
      el.addEventListener('pointerdown', down)
      el.addEventListener('pointerup', up)
      el.addEventListener('pointercancel', up)
      el.addEventListener('lostpointercapture', up)
      cleanups.push(() => {
        el.removeEventListener('pointerdown', down)
        el.removeEventListener('pointerup', up)
        el.removeEventListener('pointercancel', up)
        el.removeEventListener('lostpointercapture', up)
      })
    }

    if (CONTROLS.touchScheme === 'autoAccel') {
      // One combined brake+drift button; releasing resumes auto-accelerate.
      wireButton(brakeBtnRef.current,
        () => { touch.down = true; touch.drift = true; touch.up = false },
        () => { touch.down = false; touch.drift = false; touch.up = true })
    } else {
      wireButton(accelBtnRef.current, () => { touch.up = true }, () => { touch.up = false })
      wireButton(brakeBtnRef.current, () => { touch.down = true }, () => { touch.down = false })
      wireButton(driftBtnRef.current, () => { touch.drift = true }, () => { touch.drift = false })
    }

    if (forceTouch) {
      window.__ECHO_TOUCH__ = () => ({
        scheme: CONTROLS.touchScheme,
        ...touchRef.current,
        steer_g: gameRef.current.steer,
        speed: gameRef.current.speed,
        playerX: gameRef.current.playerX,
        countdownRemaining: gameRef.current.countdownRemaining,
        nub: joyNubRef.current ? joyNubRef.current.style.transform : null,
      })
    }

    return () => {
      for (const c of cleanups) c()
      if (forceTouch) delete window.__ECHO_TOUCH__
      // Leave no input latched if the controls unmount mid-press.
      touchRef.current = { steer: 0, steerActive: false, up: false, down: false, drift: false }
    }
  }, [showTouch])

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
      {showTouch && (
        <div
          className="touch-controls"
          style={{
            '--ctrl-rest': CONTROLS.restOpacity,
            '--ctrl-press': CONTROLS.pressedOpacity,
          }}
        >
          <div
            ref={joyBaseRef}
            className="touch-joy-base"
            style={{
              left: `${CONTROLS.joystick.marginX}px`,
              bottom: `${CONTROLS.joystick.marginY}px`,
              width: `${CONTROLS.joystick.baseSize}px`,
              height: `${CONTROLS.joystick.baseSize}px`,
            }}
          >
            <div
              ref={joyNubRef}
              className="touch-joy-nub"
              style={{
                width: `${CONTROLS.joystick.nubSize}px`,
                height: `${CONTROLS.joystick.nubSize}px`,
              }}
            />
          </div>
          <div
            className="touch-throttle"
            style={{
              right: `${CONTROLS.buttons.marginX}px`,
              bottom: `${CONTROLS.buttons.marginY}px`,
              gap: `${CONTROLS.buttons.gap}px`,
            }}
          >
            {CONTROLS.touchScheme === 'autoAccel' ? (
              <div
                ref={brakeBtnRef}
                className="touch-btn touch-btn-brake"
                style={{ width: `${CONTROLS.buttons.brakeSize}px`, height: `${CONTROLS.buttons.brakeSize}px` }}
              >
                Brake
              </div>
            ) : (
              <>
                <div
                  ref={driftBtnRef}
                  className="touch-btn touch-btn-drift"
                  style={{ width: `${CONTROLS.buttons.driftSize}px`, height: `${CONTROLS.buttons.driftSize}px` }}
                >
                  Drift
                </div>
                <div
                  ref={brakeBtnRef}
                  className="touch-btn touch-btn-brake"
                  style={{ width: `${CONTROLS.buttons.brakeSize}px`, height: `${CONTROLS.buttons.brakeSize}px` }}
                >
                  Brake
                </div>
                <div
                  ref={accelBtnRef}
                  className="touch-btn touch-btn-accel"
                  style={{ width: `${CONTROLS.buttons.accelSize}px`, height: `${CONTROLS.buttons.accelSize}px` }}
                >
                  Go
                </div>
              </>
            )}
          </div>
        </div>
      )}
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
              onClick={() => navigate('/practice')}
            >
              Race Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}