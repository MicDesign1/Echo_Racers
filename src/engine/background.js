import { PARALLAX } from '../data/tuning.js'

// Draws one wavy hill silhouette across the canvas width using two
// overlaid sine waves. `skew` scrolls the pattern horizontally as the road
// curves, at `rate * seedMul` so the two ridge layers drift at different
// speeds relative to each other (parallax).
function ridge(ctx, width, y, amp, color, rate, seedMul, skew) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, y)
  for (let x = 0; x <= width; x += PARALLAX.ridgeStepPx) {
    const k = (x + skew * rate) * PARALLAX.ridgeWaveFreq * seedMul
    ctx.lineTo(x, y - (Math.sin(k) * 0.6 + Math.sin(k * 2.7) * 0.4) * amp - amp * 0.4)
  }
  ctx.lineTo(width, y)
  ctx.closePath()
  ctx.fill()
}

// The ridge lines sit right at the horizon (a steady, un-bobbing line) and
// only ever move horizontally with `skew` — never vertically — so they
// read as distant terrain, not camera motion.
export function drawParallax(ctx, width, height, skew, colors) {
  ridge(ctx, width, height * PARALLAX.farRidgeYFraction, PARALLAX.farRidgeAmp, colors.ridgeFar, PARALLAX.farRidgeRate, PARALLAX.farRidgeSeedMul, skew)
  ridge(ctx, width, height * PARALLAX.nearRidgeYFraction, PARALLAX.nearRidgeAmp, colors.ridgeNear, PARALLAX.nearRidgeRate, PARALLAX.nearRidgeSeedMul, skew)
}
