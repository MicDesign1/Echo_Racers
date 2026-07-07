import { RACE, COMBAT, OPPONENTS, activeDifficulty } from '../data/tuning.js'
import { wrapDelta } from './opponents.js'

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// Minimal auto-attack combat, the feel pass (see CLAUDE.md COMBAT DESIGN
// and tuning.js COMBAT). ONE generic attack — no types, no HP, no stat
// multipliers yet. The player and every rival obey the exact same rules,
// so this builds a uniform list of "combatant handles" each frame: each
// handle reads/writes its underlying state (the player's fields live on
// `g`, a rival's on its opponent object) so a single detection/effect pass
// covers player-vs-rival, rival-vs-player, and rival-vs-rival identically.
function buildCombatants(g) {
  const list = [{
    isPlayer: true,
    xClampMax: RACE.playerXMax,
    get pos() { return g.pos },
    get x() { return g.playerX },
    set x(v) { g.playerX = v },
    get speed() { return g.speed },
    set speed(v) { g.speed = v },
    get cooldown() { return g.playerAttackCooldown },
    set cooldown(v) { g.playerAttackCooldown = v },
    get wobble() { return g.playerWobble },
    set wobble(v) { g.playerWobble = v },
    get hitFlash() { return g.playerHitFlash },
    set hitFlash(v) { g.playerHitFlash = v },
  }]
  for (const o of g.opponents) {
    list.push({
      isPlayer: false,
      o,
      xClampMax: OPPONENTS.laneBound,
      get pos() { return o.pos },
      get x() { return o.x },
      set x(v) { o.x = v },
      get speed() { return o.speed },
      set speed(v) { o.speed = v },
      get cooldown() { return o.attackCooldown },
      set cooldown(v) { o.attackCooldown = v },
      get wobble() { return o.wobble },
      set wobble(v) { o.wobble = v },
      get hitFlash() { return o.hitFlash },
      set hitFlash(v) { o.hitFlash = v },
    })
  }
  return list
}

// Applies the effect a hit lands on its target: a firm-but-recoverable
// speed dip plus a brief steering wobble and a victim flash. Never a
// spinout or a stop. If the target is the player, also arm the
// screen-edge glow pulse so a mid-drift hit is unmissable.
function landHit(g, target) {
  target.speed = target.speed * (1 - COMBAT.hitSpeedPenalty)
  target.wobble = COMBAT.hitWobbleDuration
  target.hitFlash = COMBAT.hitFlashDuration
  if (target.isPlayer) {
    g.playerHitEdgePulse = COMBAT.edgePulseDuration
    g.playerHitCount = (g.playerHitCount || 0) + 1
  }
  g.combatEventCount = (g.combatEventCount || 0) + 1
}

// One combat step. Called only in race mode, only after GO (the caller
// returns early during the countdown, so this never runs then), and never
// in time-trial (guarded below). Order within the step: tick timers and
// apply any lingering wobble, then let every ready creature fire at its
// nearest in-range target, then advance the visual telegraphs.
export function updateCombat(g, dt, trackLength) {
  if (RACE.mode !== 'race') return
  if (!g.attacks) g.attacks = []
  // Transient per-frame queue of combat sounds to play, drained by the
  // caller (RaceTrack) — keeps combat logic free of any audio dependency.
  if (!g.audioEvents) g.audioEvents = []

  // Difficulty scales the shared combat tempo for EVERY racer equally
  // (symmetry per CLAUDE.md COMBAT DESIGN): higher tiers reach a little
  // further and re-fire sooner. Cadet's scales are 1.0, so the default is
  // identical to the pre-difficulty values.
  const diff = activeDifficulty()
  const rangeWorld = COMBAT.attackRangeWorld * diff.combat.rangeScale
  const rangeLane = COMBAT.attackRangeLane * diff.combat.rangeScale
  const cooldown = COMBAT.cooldown * diff.combat.cooldownScale

  const combatants = buildCombatants(g)

  for (const c of combatants) {
    if (c.cooldown > 0) c.cooldown = Math.max(0, c.cooldown - dt)
    if (c.hitFlash > 0) c.hitFlash = Math.max(0, c.hitFlash - dt)
    if (c.wobble > 0) {
      // A decaying side-to-side shove: noticeable, recoverable. The lane
      // easing in the movement code naturally pulls the racer back, so the
      // wobble reads as "knocked, then steadied" rather than a hard veer.
      const elapsed = COMBAT.hitWobbleDuration - c.wobble
      const decay = clamp(c.wobble / COMBAT.hitWobbleDuration, 0, 1)
      const vel = Math.sin(elapsed * COMBAT.wobbleFrequency * Math.PI * 2) * COMBAT.wobbleLateralAmp * decay
      c.x = clamp(c.x + vel * dt, -c.xClampMax, c.xClampMax)
      c.wobble = Math.max(0, c.wobble - dt)
    }
  }

  // Each ready creature attacks the single nearest racer inside its range.
  // A bump is always inside this range (attackRangeLane > collision.rangeLane,
  // attackRangeWorld > collision.rangeWorld), so proximity detection alone
  // covers the "on a collision bump" trigger too.
  for (const attacker of combatants) {
    if (attacker.cooldown > 0) continue
    let target = null
    let bestGap = Infinity
    for (const other of combatants) {
      if (other === attacker) continue
      const gap = Math.abs(wrapDelta(other.pos, attacker.pos, trackLength))
      const laneGap = Math.abs(other.x - attacker.x)
      if (gap < rangeWorld && laneGap < rangeLane && gap < bestGap) {
        bestGap = gap
        target = other
      }
    }
    if (!target) continue

    attacker.cooldown = cooldown
    landHit(g, target)
    g.audioEvents.push({ fromPlayer: attacker.isPlayer, toPlayer: target.isPlayer })
    g.attacks.push({
      fromPlayer: attacker.isPlayer,
      fromRivalIndex: attacker.isPlayer ? -1 : attacker.o.rivalIndex,
      toPlayer: target.isPlayer,
      toRivalIndex: target.isPlayer ? -1 : target.o.rivalIndex,
      elapsed: 0,
      duration: COMBAT.telegraphDuration,
    })
  }

  if (g.playerHitEdgePulse > 0) g.playerHitEdgePulse = Math.max(0, g.playerHitEdgePulse - dt)
  for (const a of g.attacks) a.elapsed += dt
  g.attacks = g.attacks.filter((a) => a.elapsed < a.duration)
}

// The steering-wobble roll angle for a racer with `wobbleRemaining` seconds
// of wobble left — shared by the player and rivals so the visual read of a
// hit is identical for everyone (see car.js's fx.wobbleAngle).
export function wobbleAngle(wobbleRemaining) {
  if (wobbleRemaining <= 0) return 0
  const elapsed = COMBAT.hitWobbleDuration - wobbleRemaining
  const decay = clamp(wobbleRemaining / COMBAT.hitWobbleDuration, 0, 1)
  return Math.sin(elapsed * COMBAT.wobbleFrequency * Math.PI * 2) * COMBAT.wobbleAngleAmp * decay
}
