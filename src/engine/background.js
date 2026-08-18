import { PARALLAX } from '../data/tuning.js'

// Draws a soft radial sun/haze near the horizon — warm parchment glow
function drawSun(ctx, width, height, colors) {
  const sunX = width * PARALLAX.sun.xFraction
  const sunY = height * PARALLAX.sun.yFraction
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, PARALLAX.sun.glowRadiusPx)
  sunGlow.addColorStop(0, colors.sunCore || 'rgba(255, 248, 231, 0.85)') // Cream with high alpha
  sunGlow.addColorStop(0.3, colors.sunMid || 'rgba(255, 230, 180, 0.45)')
  sunGlow.addColorStop(0.7, colors.sunOuter || 'rgba(242, 200, 121, 0.15)') // resonance glow tone
  sunGlow.addColorStop(1, 'rgba(255, 248, 231, 0)')
  ctx.fillStyle = sunGlow
  ctx.fillRect(0, 0, width, height)
}

// Draws one wavy hill silhouette across the canvas width using overlaid
// sine waves. `skew` scrolls the pattern horizontally as the road curves,
// at `rate * seedMul` so the ridge layers drift at different speeds
// relative to each other (parallax depth).
function ridge(ctx, width, y, amp, color, rate, seedMul, skew) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, y)
  for (let x = 0; x <= width; x += PARALLAX.ridgeStepPx) {
    const k = (x + skew * rate) * PARALLAX.ridgeWaveFreq * seedMul
    // Three overlaid sine waves with different frequencies for natural variation
    const wave = Math.sin(k) * 0.5 + Math.sin(k * 2.3) * 0.3 + Math.sin(k * 4.7) * 0.2
    ctx.lineTo(x, y - wave * amp - amp * 0.35)
  }
  ctx.lineTo(width, y)
  ctx.closePath()
  ctx.fill()
}

// The ridge lines sit right at the horizon (a steady, un-bobbing line) and
// only ever move horizontally with `skew` — never vertically — so they
// read as distant terrain, not camera motion. Three layers (far, mid, near)
// create proper depth.
export function drawParallax(ctx, width, height, skew, colors) {
  drawSun(ctx, width, height, colors)
  for (const layer of PARALLAX.ridges) {
    const y = height * layer.yFraction
    const color = colors[layer.colorKey] || '#4E3416'
    ridge(ctx, width, y, layer.amp, color, layer.rate, layer.seedMul, skew)
  }
}
