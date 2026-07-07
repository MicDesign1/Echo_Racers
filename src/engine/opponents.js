import { ROAD, RACE, OPPONENTS } from '../data/tuning.js'
import { seg } from './track.js'
import { getPlayerAnchor } from './car.js'

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

export function wrapDelta(to, from, trackLength) {
  let d = (to - from) % trackLength
  if (d > trackLength / 2) d -= trackLength
  if (d < -trackLength / 2) d += trackLength
  return d
}

// zPlayer is the camera-space depth (in the same wz units project() uses)
// at which a flat-ground point would project onto the player's own screen
// ground-contact row (groundY, from the same anchor drawCar draws from —
// see car.js getPlayerAnchor). Inverts
// sy = H/2 + (cameraDepth/z)*cameraHeight*(H/2). Every opponent's depth is
// then measured in this same space: z = delta + zPlayer, so an opponent
// exactly at the player's position (delta = 0) lands at z = zPlayer and
// projects to groundY with carWidth = the player's own width — no separate
// pinning needed.
export function computePlayerDepth(canvasWidth, canvasHeight) {
  const { groundY, chassisWidth } = getPlayerAnchor(canvasWidth, canvasHeight)
  const zPlayer = ROAD.cameraDepth * ROAD.cameraHeight * (canvasHeight / 2) / (groundY - canvasHeight / 2)
  return { groundY, zPlayer, chassisWidth }
}

// Starting-grid slot for a racer index (0 = player, 1..N = opponents in
// rivalIndex order) — see RACE.startGrid. Fills lanesPerRow at a time,
// front-to-back, so racer 0 always lands in the rearmost row: everyone
// spawns ahead of the line at a small positive position, never a wrapped
// one, and the grid scales to any racer count with no code change.
export function startGridSlot(racerIndex) {
  const { basePos, rowSpacing, lanesPerRow, laneOffsets } = RACE.startGrid
  const row = Math.floor(racerIndex / lanesPerRow)
  const lane = racerIndex % lanesPerRow
  return { pos: basePos + row * rowSpacing, x: laneOffsets[lane % laneOffsets.length] }
}

export function createOpponents() {
  return OPPONENTS.baseSpeedFractions.map((speedFraction, i) => {
    const slot = startGridSlot(i + 1) // racer 0 is the player
    return {
      rivalIndex: i,
      pos: slot.pos,
      x: slot.x,
      speed: RACE.maxSpeed * speedFraction,
      wanderPhase: i * 2.1,
      lean: 0,
      collideCooldown: 0,
      // Combat state (see engine/combat.js) — identical fields to the
      // player's, so the same auto-attack rules drive rivals symmetrically.
      attackCooldown: 0, // seconds until this creature can attack again
      wobble: 0, // seconds of steering wobble left after being hit
      hitFlash: 0, // seconds of victim flash left
      laps: 0,
      finished: false,
      place: null,
    }
  })
}

function targetSpeedFor(o, playerPos, trackLength) {
  const baseSpeed = RACE.maxSpeed * OPPONENTS.baseSpeedFractions[o.rivalIndex]
  const segIndex = Math.floor(o.pos / ROAD.segmentLength)
  const curveSeverity = clamp(Math.abs(seg(segIndex).curve) / OPPONENTS.curveEaseThreshold, 0, 1)
  const target = baseSpeed * (1 - curveSeverity * OPPONENTS.curveEaseStrength)

  const gap = wrapDelta(o.pos, playerPos, trackLength)
  const rb = OPPONENTS.rubberBand
  let adjust = 0
  if (gap > rb.backOffGap) {
    adjust = -rb.backOffStrength * clamp((gap - rb.backOffGap) / rb.backOffGap, 0, 1)
  } else if (gap < -rb.catchUpGap) {
    adjust = rb.catchUpStrength * clamp((-gap - rb.catchUpGap) / rb.catchUpGap, 0, 1)
  }
  adjust = clamp(adjust, -rb.maxAdjustFraction, rb.maxAdjustFraction)
  return target * (1 + adjust)
}

export function updateOpponents(g, dt, trackLength) {
  for (const o of g.opponents) {
    const targetSpeed = targetSpeedFor(o, g.pos, trackLength)
    if (o.speed < targetSpeed) o.speed = Math.min(targetSpeed, o.speed + OPPONENTS.accel * dt)
    else o.speed = Math.max(targetSpeed, o.speed - OPPONENTS.brake * dt)

    o.wanderPhase += dt
    const wander = Math.sin(o.wanderPhase * OPPONENTS.laneWanderRate * Math.PI * 2 + o.rivalIndex * 2.4) * OPPONENTS.laneWanderAmplitude
    const laneTarget = clamp(OPPONENTS.laneOffsets[o.rivalIndex] + wander, -OPPONENTS.laneBound, OPPONENTS.laneBound)
    const prevX = o.x
    o.x += (laneTarget - o.x) * Math.min(1, dt * OPPONENTS.steerEaseRate)
    o.x = clamp(o.x, -OPPONENTS.laneBound, OPPONENTS.laneBound)

    const leanTarget = dt > 0 ? clamp((o.x - prevX) / (dt * OPPONENTS.leanNormalizer), -1, 1) : 0
    o.lean += (leanTarget - o.lean) * Math.min(1, dt * OPPONENTS.leanEaseRate)

    const prevPos = o.pos
    o.pos = ((o.pos + o.speed * dt) % trackLength + trackLength) % trackLength
    // A genuine wrap jumps from near trackLength back to near 0 — an
    // apparent decrease of nearly a full trackLength. Requiring the drop to
    // be at least half the track rules out misreading ordinary jitter
    // (e.g. a stray sub-frame dt) as a lap, which matters here since
    // opponents start only a few hundred units from the line already.
    if (RACE.mode === 'race' && !o.finished && prevPos - o.pos > trackLength / 2) {
      o.laps += 1
      if (o.laps >= RACE.lapCount) {
        // Locks this rival's finish order — it keeps driving after this
        // (see updateOpponents' caller), but its placement never changes.
        o.finished = true
        o.place = g.nextPlace++
      }
    }
    if (o.collideCooldown > 0) o.collideCooldown -= dt
  }

  resolveCollisions(g, trackLength)
}

// Live "current place" for the HUD while the player is still racing — once
// finished the player's place is already locked (g.playerPlace). A
// finished rival always outranks an unfinished player (it already
// completed the race); among still-racing rivals, more progress wins.
// Progress is laps completed * trackLength + position within the current
// lap — an absolute, monotonically increasing distance, so it's already
// unambiguous mid-lap without needing wrapDelta's shortest-signed-distance
// semantics (which would reintroduce the exact wraparound ambiguity this
// avoids).
export function computePlayerPlace(g, trackLength) {
  if (g.playerFinished) return g.playerPlace
  const playerProgress = g.playerLaps * trackLength + g.pos
  let place = 1
  for (const o of g.opponents) {
    if (o.finished || o.laps * trackLength + o.pos > playerProgress) place += 1
  }
  return place
}

function resolveCollisions(g, trackLength) {
  const c = OPPONENTS.collision
  for (const o of g.opponents) {
    if (o.collideCooldown > 0) continue
    const gap = wrapDelta(o.pos, g.pos, trackLength)
    const laneGap = o.x - g.playerX
    if (Math.abs(gap) < c.rangeWorld && Math.abs(laneGap) < c.rangeLane) {
      o.collideCooldown = c.cooldown
      g.speed *= (1 - c.speedPenalty)
      o.speed *= (1 - c.speedPenalty)
      const pushDir = laneGap >= 0 ? 1 : -1
      g.playerX = clamp(g.playerX - pushDir * c.nudgeLane * 0.5, -RACE.playerXMax, RACE.playerXMax)
      o.x = clamp(o.x + pushDir * c.nudgeLane * 0.5, -OPPONENTS.laneBound, OPPONENTS.laneBound)
    }
  }
}

// All opponent depths are measured in the same camera-space z as the
// player's own visual depth (zPlayer, from computePlayerDepth): z = delta +
// zPlayer, used for the perspective scale (and hence carWidth) everywhere.
// WHERE the opponent's road geometry (elevation, curve-accumulated x) comes
// from is a separate concern, keyed on the opponent's true world position
// (delta), not on z — sampling geometry at the shifted depth would fetch a
// different, wrong segment (~zPlayer/segmentLength segments off) whenever
// the road isn't flat there, since z and real world offset only coincide
// when zPlayer happens to be 0.
//
// Ahead (delta >= 0): interpolate the raw world x/y already captured in
// frameSlots (s1wx/s1wy, alongside their existing projected sx/sy — see
// RaceTrack.jsx's render loop) at the opponent's real position, then
// project that through the shifted z ourselves. Behind (delta < 0): no
// frameSlot data exists for negative offsets, so fall back to a direct
// seg() lookup, same as before — the lateral (x) term skips curve
// accumulation here since it's only ever a short distance behind camera,
// where curve drift is negligible.
export function getOpponentScreenPlacement(o, g, frameSlots, trackLength, canvasWidth, canvasHeight, zPlayer, camY, chassisWidth) {
  const delta = wrapDelta(o.pos, g.pos, trackLength)
  const z = delta + zPlayer
  const nearPlane = OPPONENTS.cameraNearPlane
  if (z <= nearPlane) return null

  const carWidth = chassisWidth * zPlayer / z
  const scale = ROAD.cameraDepth / z

  if (delta >= 0) {
    const remainder = ((g.pos % ROAD.segmentLength) + ROAD.segmentLength) % ROAD.segmentLength
    const maxSlotIndex = frameSlots.length - 2
    const nFloat = (delta + remainder) / ROAD.segmentLength
    if (nFloat >= maxSlotIndex + 1) return null

    const n0 = Math.floor(nFloat)
    const frac = nFloat - n0
    const slotA = frameSlots[n0]
    const slotB = frameSlots[n0 + 1]

    const oppWx = slotA.s1wx + (slotB.s1wx - slotA.s1wx) * frac
    const oppWy = slotA.s1wy + (slotB.s1wy - slotA.s1wy) * frac
    const camX = g.playerX * ROAD.roadWidth

    const sw = scale * ROAD.roadWidth * (canvasWidth / 2)
    const sx = canvasWidth / 2 + scale * (oppWx - camX) * (canvasWidth / 2) + sw * o.x
    const sy = canvasHeight / 2 - scale * (oppWy - camY) * (canvasHeight / 2)

    return {
      n0,
      sx,
      sy,
      carWidth,
      clip: slotA.clip,
      cameraZ: z,
      delta,
      drawBeforePlayer: delta > 0,
    }
  }

  const oppSegIndex = Math.floor(o.pos / ROAD.segmentLength)
  const oppProgress = (o.pos % ROAD.segmentLength) / ROAD.segmentLength
  const oppRoadY = seg(oppSegIndex).y + (seg(oppSegIndex + 1).y - seg(oppSegIndex).y) * oppProgress
  const relY = oppRoadY - camY
  const sy = canvasHeight / 2 - scale * relY * (canvasHeight / 2)
  const sx = canvasWidth / 2 + scale * ROAD.roadWidth * (o.x - g.playerX) * (canvasWidth / 2)

  return {
    n0: 0,
    sx,
    sy,
    carWidth,
    clip: canvasHeight,
    cameraZ: z,
    delta,
    drawBeforePlayer: false,
  }
}