import { BOOST, RACE } from '../data/tuning.js'

// Boost system — a charge meter that fills over time and can be dumped for
// an instant speed burst, plus track pickups for immediate boosts. Repeatable
// resource (not once-per-race). Wholesome: thrilling but never punishing.

// Fresh boost state for one racer. Called once per race on mount/reset.
// Meter starts FULL so the player can boost immediately at race start.
export function createBoostState() {
  return {
    charge: BOOST.chargeMax, // start FULL (playtest feedback: ready to boost at GO)
    active: false, // whether a boost burst is currently running
    elapsed: 0, // seconds elapsed since activation (0 when !active)
    duration: 0, // total duration of this burst (0 when !active)
    source: null, // 'manual' (dumped meter) — pickups no longer auto-activate
    pickupFlash: 0, // seconds remaining on pickup collection flash (0 when none)
  }
}

// Activate a boost burst: consume the meter (if manual) and enter the burst.
// Returns true if activated, false if already active or insufficient charge.
// `source` is always 'manual' now — pickups just fill the meter, they don't
// auto-activate. When collecting a pickup, call this separately with 'pickup'
// ONLY to arm the flash (the caller still needs to check if a burst should start).
export function tryActivateBoost(boost, source = 'manual') {
  if (boost.active) return false
  if (boost.charge < BOOST.minActivateCharge) return false

  // Consume the meter and enter the burst.
  boost.charge = 0
  boost.active = true
  boost.elapsed = 0
  boost.source = source
  boost.duration = BOOST.burstDuration
  return true
}

// Advance the boost state one frame. Charge fills passively (even during a
// burst); active bursts tick elapsed and deactivate when duration is reached.
// Pickup flash timer counts down independently. Returns the current effect
// multipliers (accel factor, max speed bonus) the caller applies to this racer's physics.
export function updateBoost(boost, dt) {
  const result = { accelFactor: 1.0, maxSpeedBonus: 0.0 }

  // Charge fills continuously (no cooldown penalty — encourages frequent use).
  if (boost.charge < BOOST.chargeMax) {
    boost.charge = Math.min(BOOST.chargeMax, boost.charge + BOOST.chargeRate * dt)
  }

  // Pickup flash timer counts down (visual only, independent of burst state).
  if (boost.pickupFlash > 0) {
    boost.pickupFlash = Math.max(0, boost.pickupFlash - dt)
  }

  if (!boost.active) return result

  boost.elapsed += dt
  if (boost.elapsed >= boost.duration) {
    boost.active = false
    boost.elapsed = 0
    boost.duration = 0
    boost.source = null
    return result
  }

  // All bursts use the same strength now (no pickup vs manual distinction).
  result.accelFactor = BOOST.burstAccelFactor
  result.maxSpeedBonus = BOOST.burstMaxSpeedBonus

  return result
}

// Reset the boost to a fresh state (full meter, nothing active). Called
// on Race Again / new race so the next race starts with a full boost ready.
export function resetBoost(boost) {
  boost.charge = BOOST.chargeMax // start FULL (playtest feedback)
  boost.active = false
  boost.elapsed = 0
  boost.duration = 0
  boost.source = null
  boost.pickupFlash = 0
}

// Create pickup instance state for a track's pickups. Each pickup has a
// respawn timer (seconds since collection); 0 = available, >0 = respawning.
// The pickup's position/offset come from the track data; this is just the
// per-race state. Called once per race on mount/reset.
export function createPickupStates(trackPickups) {
  if (!trackPickups || !trackPickups.length) return []
  return trackPickups.map(() => ({ respawnTimer: 0 }))
}

// Check whether the player/rival collided with any available pickups this
// frame. A pickup is "collected" if the racer's position is within a small
// segment window AND their lane offset is within a lateral threshold. Returns
// the index of the collected pickup, or -1 if none. The caller fills the
// boost meter to max and arms the flash — pickups NO LONGER auto-activate
// a burst (playtest feedback: let the player press Boost when they want).
export function checkPickupCollection(racerPos, racerX, trackPickups, pickupStates, trackLength) {
  if (!trackPickups || !trackPickups.length) return -1
  const SEGMENT_WINDOW = 3 // segments ahead/behind the pickup center that count as a hit
  const LANE_THRESHOLD = 0.6 // |lane gap| within which a hit counts

  for (let i = 0; i < trackPickups.length; i++) {
    if (pickupStates[i].respawnTimer > 0) continue // still respawning
    const pickup = trackPickups[i]
    // Wrap-aware distance to the pickup's segment.
    let gap = ((pickup.segment * 200) - racerPos) % trackLength
    if (gap > trackLength / 2) gap -= trackLength
    if (gap < -trackLength / 2) gap += trackLength
    const segGap = Math.abs(gap / 200)
    const laneGap = Math.abs(racerX - pickup.offset)
    if (segGap < SEGMENT_WINDOW && laneGap < LANE_THRESHOLD) {
      return i
    }
  }
  return -1
}

// Advance all pickup respawn timers. Called once per frame for the whole
// pickup set. Timers count down to 0 (at which point the pickup reappears).
export function updatePickups(pickupStates, dt) {
  for (const state of pickupStates) {
    if (state.respawnTimer > 0) {
      state.respawnTimer = Math.max(0, state.respawnTimer - dt)
    }
  }
}
