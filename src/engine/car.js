import { CAR } from '../data/tuning.js'

// Placeholder vector-drawn chassis. This is the seam for real art: once
// sprite frames exist (4 per side, for the lean/drift angle), replace this
// function's body with a frame lookup keyed on `driftAngle`/`steer` and
// draw an image instead — the call site (RaceTrack.jsx) already passes
// everything a sprite-based version would need and shouldn't need to change.
export function drawCar(ctx, width, height, state, colors) {
  const { steer, driftAngle, speedPercent, boosting, time } = state
  const carWidth = Math.min(width * CAR.widthFraction, CAR.maxWidthPx)
  const carHeight = carWidth * CAR.heightFraction
  const cx = width / 2
  const cy = height - carHeight * CAR.groundYFraction

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(
    steer * CAR.steerRotationFactor +
    driftAngle +
    Math.sin(time * CAR.idleSwayRate) * CAR.idleSwayAmplitude * speedPercent
  )
  ctx.translate(steer * carWidth * CAR.steerLateralShiftFraction, 0)

  if (Math.abs(driftAngle) > CAR.driftDustThreshold) {
    ctx.fillStyle = colors.driftDust
    for (let d = 0; d < 3; d++) {
      const jitter = Math.sin(time * 0.03 + d * 2.1) * carWidth * 0.12
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

  let hull = ctx.createLinearGradient(-carWidth / 2, 0, carWidth / 2, 0)
  hull.addColorStop(0, colors.carHull[0])
  hull.addColorStop(0.5, colors.carHull[1])
  hull.addColorStop(1, colors.carHull[2])
  ctx.fillStyle = hull
  ctx.beginPath()
  ctx.roundRect(-carWidth * 0.42, -carHeight * 0.28, carWidth * 0.84, carHeight * 0.62, carHeight * 0.24)
  ctx.fill()

  ctx.fillStyle = colors.carFin
  ctx.beginPath()
  ctx.moveTo(-carWidth * 0.42, carHeight * 0.1)
  ctx.lineTo(-carWidth * 0.58, carHeight * 0.34)
  ctx.lineTo(-carWidth * 0.40, carHeight * 0.34)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(carWidth * 0.42, carHeight * 0.1)
  ctx.lineTo(carWidth * 0.58, carHeight * 0.34)
  ctx.lineTo(carWidth * 0.40, carHeight * 0.34)
  ctx.closePath()
  ctx.fill()

  const canopy = ctx.createLinearGradient(0, -carHeight * 0.55, 0, -carHeight * 0.05)
  canopy.addColorStop(0, colors.canopy[0])
  canopy.addColorStop(1, colors.canopy[1])
  ctx.fillStyle = canopy
  ctx.beginPath()
  ctx.roundRect(-carWidth * 0.16, -carHeight * 0.52, carWidth * 0.32, carHeight * 0.34, carHeight * 0.16)
  ctx.fill()

  // Creature silhouette — the rider bonded to the resonance chassis.
  ctx.fillStyle = colors.creature
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
  intake.addColorStop(0, `rgba(${colors.intakeGlowRGB}, ${0.85 * pulse})`)
  intake.addColorStop(1, `rgba(${colors.intakeGlowRGB}, 0)`)
  ctx.fillStyle = intake
  ctx.beginPath()
  ctx.arc(0, -carHeight * 0.02, carWidth * 0.16, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}
