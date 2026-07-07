import { ROAD, RACE, OPPONENTS } from '../data/tuning.js'
import { seg } from './track.js'

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// Shortest signed distance from `from` to `to` around a looping track of
// length `trackLength` — positive means `to` is ahead of `from`, negative
// means behind. Used both for AI gap-sensing and for placing opponents on
// screen relative to the camera.
export function wrapDelta(to, from, trackLength) {
  let d = (to - from) % trackLength
  if (d > trackLength / 2) d -= trackLength
  if (d < -trackLength / 2) d += trackLength
  return d
}

// Staggers opponents behind the player's start line, each on its own base
// racing line, so the opening seconds don't look like a dead heat.
export function createOpponents(trackLength) {
  return OPPONENTS.baseSpeedFractions.map((speedFraction, i) => ({
    rivalIndex: i,
    pos: (((-(i + 1) * OPPONENTS.startGapSegments * ROAD.segmentLength) % trackLength) + trackLength) % trackLength,
    x: OPPONENTS.laneOffsets[i],
    speed: RACE.maxSpeed * speedFraction,
    wanderPhase: i * 2.1,
    lean: 0,
    collideCooldown: 0,
  }))
}

// Target speed for one opponent this frame: its base pace, eased off for
// sharp curves, then nudged by light rubber-banding based on the gap to the
// player (trailing rivals catch up a little, a rival that's pulled too far
// ahead backs off a little) so races stay close without feeling magnetic.
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

// Advances every opponent's speed/position/lane wander, then resolves
// player-opponent contact. Mutates `g` (the shared game-state ref) directly,
// matching how the player's own update() already works.
export function updateOpponents(g, dt, trackLength) {
  for (const o of g.opponents) {
    const targetSpeed = targetSpeedFor(o, g.pos, trackLength)
    if (o.speed < targetSpeed) o.speed = Math.min(targetSpeed, o.speed + OPPONENTS.accel * dt)
    else o.speed = Math.max(targetSpeed, o.speed - OPPONENTS.brake * dt)

    // Each rival wanders around its own base line on a phase-shifted sine so
    // they drift apart rather than stacking three-wide.
    o.wanderPhase += dt
    const wander = Math.sin(o.wanderPhase * OPPONENTS.laneWanderRate * Math.PI * 2 + o.rivalIndex * 2.4) * OPPONENTS.laneWanderAmplitude
    const laneTarget = clamp(OPPONENTS.laneOffsets[o.rivalIndex] + wander, -OPPONENTS.laneBound, OPPONENTS.laneBound)
    const prevX = o.x
    o.x += (laneTarget - o.x) * Math.min(1, dt * OPPONENTS.steerEaseRate)
    o.x = clamp(o.x, -OPPONENTS.laneBound, OPPONENTS.laneBound)

    const leanTarget = dt > 0 ? clamp((o.x - prevX) / (dt * OPPONENTS.leanNormalizer), -1, 1) : 0
    o.lean += (leanTarget - o.lean) * Math.min(1, dt * OPPONENTS.leanEaseRate)

    o.pos = ((o.pos + o.speed * dt) % trackLength + trackLength) % trackLength
    if (o.collideCooldown > 0) o.collideCooldown -= dt
  }

  resolveCollisions(g, trackLength)
}

// Basic player-opponent contact: no damage, just a shared speed penalty and
// a lateral shove apart so the two racers don't overlap. Cooldown per
// opponent prevents the penalty re-triggering every frame while touching.
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

// Resolves an opponent's on-screen placement for the current frame from the
// same per-segment projected data the road/roadside sprites use
// (`frameSlots`, indexed relative to the camera's current segment), so
// opponents scale and clip against hills exactly like everything else on
// the road.
//
// Segment 0 is excluded (its near edge can sit right at/behind the camera
// plane and projects unreliably), so any opponent within one segment of the
// camera — whether just ahead or just passed — is clamped to segment 1's
// well-behaved projection. That reads as "very close, large, at the bottom
// of the screen" either way, which is the same thing a player actually sees
// during a pass. `rearVisibleWorld` controls how long a just-passed
// opponent lingers there (fading out) before it's dropped from view — this
// engine has no rear-view mirror, so that brief glimpse is the whole of
// "visible behind the player."
export function getOpponentRenderSlot(o, g, frameSlots, trackLength) {
  const delta = wrapDelta(o.pos, g.pos, trackLength)
  const maxSlotIndex = frameSlots.length - 2
  if (delta < -OPPONENTS.rearVisibleWorld || delta >= maxSlotIndex * ROAD.segmentLength) return null

  const nClamped = clamp(delta / ROAD.segmentLength, 1, maxSlotIndex)
  const n0 = Math.floor(nClamped)
  const frac = nClamped - n0
  const slotA = frameSlots[n0]
  const slotB = frameSlots[n0 + 1]

  const sw = slotA.s1w + (slotB.s1w - slotA.s1w) * frac
  const sx = slotA.s1x + (slotB.s1x - slotA.s1x) * frac + sw * o.x
  const sy = slotA.s1y + (slotB.s1y - slotA.s1y) * frac
  const clip = Math.min(slotA.clip, slotB.clip)
  const alpha = delta < 0 ? clamp(1 + delta / OPPONENTS.rearVisibleWorld, 0, 1) : 1

  return { n0, sx, sy, sw, clip, alpha }
}
