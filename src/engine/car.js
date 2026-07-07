import { CAR, COMBAT } from '../data/tuning.js'

// The screen point of a vehicle's creature-silhouette rider, given that
// vehicle's ground-contact point (sx, groundY) and its rendered width. Used
// as the endpoint for combat attack telegraphs (see combatfx.js) so a
// resonance bolt travels between the two bonded creatures, not the hulls.
// Mirrors where drawChassis places the creature (centered, at
// -carHeight*0.34 above the pivot, which itself sits chassisBottomFraction
// above the ground row).
export function getCreatureAnchor(sx, groundY, carWidth) {
  const carHeight = carWidth * CAR.heightFraction
  return { x: sx, y: groundY - carHeight * (CAR.chassisBottomFraction + 0.34) }
}

// The player's chassis width and its true ground-contact screen row (the
// hull/fin bottom edge, not the rotation pivot) — the one anchor every
// opponent placement is measured against (see opponents.js
// computePlayerDepth) so the player's own fixed-screen sprite and every
// projected rival agree on where "on the ground" is.
export function getPlayerAnchor(width, height) {
  const chassisWidth = Math.min(width * CAR.widthFraction, CAR.maxWidthPx)
  const carHeight = chassisWidth * CAR.heightFraction
  const pivotY = height - carHeight * CAR.groundYFraction
  const groundY = pivotY + carHeight * CAR.chassisBottomFraction
  return { groundY, chassisWidth }
}

// A soft, low-alpha ellipse at a vehicle's ground-contact point — just
// enough to read as contact with the road, not a cast shadow at night.
// Shared by the player and every opponent; drawn flat (unrotated) so it
// doesn't bank with the chassis above it.
function drawGroundShadow(ctx, sx, sy, carWidth) {
  const rx = carWidth * CAR.shadow.widthFraction
  if (rx < 1) return
  const ry = rx * CAR.shadow.heightFraction
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, rx)
  glow.addColorStop(0, `rgba(0, 0, 0, ${CAR.shadow.alpha})`)
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.save()
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// A vehicle's combat feedback overlay, drawn in the same translated/rotated
// frame as its chassis so it tracks the creature: a hit-flash burst
// (fx.flash 0..1) and a subtle "cooldown ready" charge aura (fx.charged
// 0..1). Both use the racer's own resonance-glow color, composited additive
// so they read as light rather than paint. Shared by player and rivals.
function drawCombatAura(ctx, carWidth, carHeight, fx, glowRGB, time) {
  if (!fx) return
  const cy = -carHeight * 0.34 // creature-silhouette center, matching drawChassis
  if (fx.charged > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(time * COMBAT.chargePulseRate)
    const a = COMBAT.chargeAlpha * fx.charged * pulse
    const r = carWidth * COMBAT.chargeGlowFraction
    const grad = ctx.createRadialGradient(0, cy, 0, 0, cy, r)
    grad.addColorStop(0, `rgba(${glowRGB}, ${a})`)
    grad.addColorStop(1, `rgba(${glowRGB}, 0)`)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(0, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  if (fx.flash > 0) {
    const r = carWidth * COMBAT.flashGlowFraction
    const grad = ctx.createRadialGradient(0, cy, 0, 0, cy, r)
    grad.addColorStop(0, `rgba(${glowRGB}, ${0.85 * fx.flash})`)
    grad.addColorStop(0.5, `rgba(${glowRGB}, ${0.4 * fx.flash})`)
    grad.addColorStop(1, `rgba(${glowRGB}, 0)`)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(0, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

// Placeholder vector-drawn chassis. This is the seam for real art: once
// sprite frames exist (4 per side, for the lean/drift angle), replace this
// function's body with a frame lookup keyed on `driftAngle`/`steer` and
// draw an image instead — the call site (RaceTrack.jsx) already passes
// everything a sprite-based version would need and shouldn't need to change.
// `fx` (optional) carries combat feedback: { flash, charged, wobbleAngle }.
export function drawCar(ctx, width, height, state, colors, fx) {
  const { steer, driftAngle, speedPercent, boosting, time } = state
  const { groundY, chassisWidth: carWidth } = getPlayerAnchor(width, height)
  const carHeight = carWidth * CAR.heightFraction
  const cx = width / 2
  const cy = groundY - carHeight * CAR.chassisBottomFraction

  drawGroundShadow(ctx, cx, groundY, carWidth)

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(
    steer * CAR.steerRotationFactor +
    driftAngle +
    (fx ? fx.wobbleAngle : 0) +
    Math.sin(time * CAR.idleSwayRate) * CAR.idleSwayAmplitude * speedPercent
  )
  ctx.translate(steer * carWidth * CAR.steerLateralShiftFraction, 0)

  if (Math.abs(driftAngle) > CAR.driftDustThreshold) {
    ctx.fillStyle = colors.driftDust
    for (let d = 0; d < CAR.driftDustParticleCount; d++) {
      const jitter = Math.sin(time * CAR.driftDustJitterRate + d * 2.1) * carWidth * CAR.driftDustJitterAmplitudeFraction
      ctx.beginPath()
      ctx.arc(
        -Math.sign(driftAngle) * carWidth * (0.3 + d * 0.14) + jitter,
        carHeight * 0.34 + d * 3,
        carHeight * (0.10 + d * 0.05),
        0, Math.PI * 2
      )
      ctx.fill()
    }
  }

  if (speedPercent > CAR.glowTrailThreshold) {
    const alpha = 0.28 * speedPercent + (boosting ? 0.3 : 0)
    const glow = ctx.createRadialGradient(0, carHeight * 0.35, 0, 0, carHeight * 0.35, carWidth * 0.8)
    glow.addColorStop(0, `rgba(${colors.glowTrailRGB}, ${alpha})`)
    glow.addColorStop(1, `rgba(${colors.glowTrailRGB}, 0)`)
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.ellipse(0, carHeight * 0.35, carWidth * 0.8, carHeight * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  drawChassis(ctx, carWidth, carHeight, time, {
    hull: colors.carHull,
    fin: colors.carFin,
    canopy: colors.canopy,
    creature: colors.creature,
    intakeGlowRGB: colors.intakeGlowRGB,
  })
  drawCombatAura(ctx, carWidth, carHeight, fx, colors.intakeGlowRGB, time)

  ctx.restore()
}

// The hull/fin/canopy/creature/intake silhouette, shared by the player's
// own chassis and every AI opponent. Assumes the caller has already
// translated/rotated ctx so (0,0) is the car's pivot; `palette` supplies the
// per-racer tint (see COLORS.carHull/... for the player, OPPONENT_PALETTES
// for rivals) while canopy/creature stay a shared default until real
// rider/creature art lands.
export function drawChassis(ctx, carWidth, carHeight, time, palette) {
  let hull = ctx.createLinearGradient(-carWidth / 2, 0, carWidth / 2, 0)
  hull.addColorStop(0, palette.hull[0])
  hull.addColorStop(0.5, palette.hull[1])
  hull.addColorStop(1, palette.hull[2])
  ctx.fillStyle = hull
  ctx.beginPath()
  ctx.roundRect(-carWidth * 0.42, -carHeight * 0.28, carWidth * 0.84, carHeight * 0.62, carHeight * 0.24)
  ctx.fill()

  const finY = carHeight * CAR.chassisBottomFraction
  ctx.fillStyle = palette.fin
  ctx.beginPath()
  ctx.moveTo(-carWidth * 0.42, carHeight * 0.1)
  ctx.lineTo(-carWidth * 0.58, finY)
  ctx.lineTo(-carWidth * 0.40, finY)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(carWidth * 0.42, carHeight * 0.1)
  ctx.lineTo(carWidth * 0.58, finY)
  ctx.lineTo(carWidth * 0.40, finY)
  ctx.closePath()
  ctx.fill()

  const canopy = ctx.createLinearGradient(0, -carHeight * 0.55, 0, -carHeight * 0.05)
  canopy.addColorStop(0, palette.canopy[0])
  canopy.addColorStop(1, palette.canopy[1])
  ctx.fillStyle = canopy
  ctx.beginPath()
  ctx.roundRect(-carWidth * 0.16, -carHeight * 0.52, carWidth * 0.32, carHeight * 0.34, carHeight * 0.16)
  ctx.fill()

  // Creature silhouette — the rider bonded to the resonance chassis.
  ctx.fillStyle = palette.creature
  ctx.beginPath()
  ctx.arc(0, -carHeight * 0.34, carHeight * 0.10, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(-carHeight * 0.07, -carHeight * 0.46, carHeight * 0.045, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(carHeight * 0.07, -carHeight * 0.46, carHeight * 0.045, 0, Math.PI * 2)
  ctx.fill()

  const pulse = CAR.intakePulseBase + CAR.intakePulseAmplitude * Math.sin(time * CAR.intakePulseRate)
  const intake = ctx.createRadialGradient(0, -carHeight * 0.02, 0, 0, -carHeight * 0.02, carWidth * 0.16)
  intake.addColorStop(0, `rgba(${palette.intakeGlowRGB}, ${0.85 * pulse})`)
  intake.addColorStop(1, `rgba(${palette.intakeGlowRGB}, 0)`)
  ctx.fillStyle = intake
  ctx.beginPath()
  ctx.arc(0, -carHeight * 0.02, carWidth * 0.16, 0, Math.PI * 2)
  ctx.fill()
}

// An AI opponent's chassis, placed via the same projected screen position
// roadside sprites use (sx/sy = ground contact point, sw = projected road
// half-width at that depth) rather than the player's fixed screen-center
// placement. `lean` is a steer-like -1..1 value for a bit of banking motion.
// `fx` (optional) carries combat feedback: { flash, charged, wobbleAngle } —
// identical to the player's, so a rival's hits/charge read the same way.
export function drawOpponentCar(ctx, sx, sy, carWidth, lean, palette, time, clipY, canvasWidth, fx) {
  const carHeight = carWidth * CAR.heightFraction
  if (carWidth < 2 || sy - carHeight > clipY || sy < 0) return

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, canvasWidth, clipY + CAR.groundClipEpsilonPx)
  ctx.clip()

  drawGroundShadow(ctx, sx, sy, carWidth)

  const pivotY = sy - carHeight * CAR.chassisBottomFraction
  ctx.translate(sx, pivotY)
  ctx.rotate(lean * CAR.steerRotationFactor + (fx ? fx.wobbleAngle : 0))
  drawChassis(ctx, carWidth, carHeight, time, palette)
  drawCombatAura(ctx, carWidth, carHeight, fx, palette.intakeGlowRGB, time)
  ctx.restore()
}
