import { ROAD, AIR } from '../data/tuning.js'
import { seg } from './track.js'

// Crest sharpness at a world position: an approximation of the elevation
// profile's curvature (its second derivative) — how much the road bends
// from its incoming slope to its outgoing slope across a short window
// straddling `pos`. Positive means convex (rising or flat behind, falling
// ahead — a genuine crest); flat ground, a uniform slope, or a dip (concave)
// all read near zero or negative, and are never launch-worthy regardless of
// speed. See AIR.crestThreshold in tuning.js for the calibration this was
// checked against (real per-track peak values, not a guess).
export function crestSharpnessAt(pos) {
  const w = AIR.sampleWindowSegments
  const idx = Math.floor(pos / ROAD.segmentLength)
  const step = ROAD.segmentLength * w
  const yBehind = seg(idx - w).y
  const yHere = seg(idx).y
  const yAhead = seg(idx + w).y
  const slopeBehind = (yHere - yBehind) / step
  const slopeAhead = (yAhead - yHere) / step
  return slopeBehind - slopeAhead
}

// Symmetric per-racer air-time state machine — identical rules drive the
// player and every AI rival (same "same physics" pattern as combat; see
// CLAUDE.md COMBAT DESIGN). `entity` is either the player's game-state
// object or a rival's opponent object; both carry the same flat fields
// (matching the existing combat-state convention of flat fields rather than
// a nested sub-object): airborne, airTime, airDuration, airLaunchSpeedPercent,
// airLaunchCooldown, airLandBounce.
export function updateAirtime(entity, pos, speedPercent, dt) {
  if (entity.airLaunchCooldown > 0) entity.airLaunchCooldown = Math.max(0, entity.airLaunchCooldown - dt)

  if (entity.airborne) {
    entity.airTime += dt
    if (entity.airTime >= entity.airDuration) {
      entity.airborne = false
      entity.airLandBounce = AIR.landingSettleDuration
      entity.airLaunchCooldown = AIR.relaunchCooldown
    }
    return
  }

  if (entity.airLandBounce > 0) entity.airLandBounce = Math.max(0, entity.airLandBounce - dt)

  if (entity.airLaunchCooldown > 0) return
  if (speedPercent < AIR.launchSpeedPercent) return

  const crest = crestSharpnessAt(pos)
  if (crest < AIR.crestThreshold) return

  entity.airborne = true
  entity.airTime = 0
  entity.airLaunchSpeedPercent = speedPercent
  entity.airDuration = Math.min(
    AIR.airDurationMax,
    AIR.airDurationBase + AIR.airDurationSpeedScale * speedPercent + AIR.airDurationCrestScale * crest
  )
}

// Visual lift, as a FRACTION of the chassis's own carHeight — the caller
// (engine/car.js) multiplies by its own carHeight, so this scales correctly
// with perspective the same way carWidth already does for a distant rival,
// with no unit conversion needed here. 0 when grounded and settled.
export function airLiftFraction(entity) {
  if (entity.airborne) {
    const peak = AIR.liftHeightBaseFraction + AIR.liftHeightSpeedScaleFraction * entity.airLaunchSpeedPercent
    const p = entity.airDuration > 0 ? entity.airTime / entity.airDuration : 0
    return Math.sin(p * Math.PI) * peak
  }
  if (entity.airLandBounce > 0) {
    // A damped settle: dips slightly below ground on touchdown (suspension
    // compressing), oscillates, and decays to 0 — never a speed/handling
    // penalty, purely a visual "whoosh, landed" cue.
    const p = 1 - entity.airLandBounce / AIR.landingSettleDuration
    return -AIR.landingBounceAmplitudeFraction * Math.exp(-AIR.landingDamping * p) * Math.cos(p * Math.PI * AIR.landingBounceCycles)
  }
  return 0
}

// Fresh per-racer air-time fields — spread into both the player's initial
// game state and each opponent's created object so the two stay identical.
export function createAirState() {
  return {
    airborne: false,
    airTime: 0,
    airDuration: 0,
    airLaunchSpeedPercent: 0,
    airLaunchCooldown: 0,
    airLandBounce: 0,
  }
}
