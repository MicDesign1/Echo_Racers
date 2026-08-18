import { PARALLAX } from '../data/tuning.js'

// Draws a soft radial sun/haze near the horizon — warm parchment glow.
// Larger and more atmospheric for proper OutRun feel.
function drawSun(ctx, width, height, colors) {
  const sunX = width * PARALLAX.sun.xFraction
  const sunY = height * PARALLAX.sun.yFraction
  
  // Large atmospheric glow
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, PARALLAX.sun.glowRadiusPx * 1.5)
  sunGlow.addColorStop(0, colors.sunCore || 'rgba(255, 248, 231, 0.95)')
  sunGlow.addColorStop(0.2, colors.sunMid || 'rgba(255, 235, 190, 0.6)')
  sunGlow.addColorStop(0.5, colors.sunOuter || 'rgba(242, 200, 121, 0.25)')
  sunGlow.addColorStop(1, 'rgba(255, 248, 231, 0)')
  ctx.fillStyle = sunGlow
  ctx.fillRect(0, 0, width, height)
  
  // Horizon haze band for atmospheric depth
  const horizonY = height * PARALLAX.horizonFraction
  const hazeGradient = ctx.createLinearGradient(0, horizonY - 40, 0, horizonY + 20)
  hazeGradient.addColorStop(0, 'rgba(255, 248, 231, 0)')
  hazeGradient.addColorStop(0.5, 'rgba(242, 215, 170, 0.15)')
  hazeGradient.addColorStop(1, 'rgba(255, 248, 231, 0)')
  ctx.fillStyle = hazeGradient
  ctx.fillRect(0, horizonY - 40, width, 60)
}

// Draws one wavy hill silhouette with more natural variation using
// multiple overlaid waves at different frequencies for organic feel.
function ridge(ctx, width, y, amp, color, rate, seedMul, skew) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, y)
  for (let x = 0; x <= width; x += PARALLAX.ridgeStepPx) {
    const k = (x + skew * rate) * PARALLAX.ridgeWaveFreq * seedMul
    // Five overlaid sine waves for more natural, OutRun-style hills
    const wave = (
      Math.sin(k) * 0.42 +
      Math.sin(k * 2.1) * 0.25 +
      Math.sin(k * 4.3) * 0.18 +
      Math.sin(k * 0.7) * 0.10 +
      Math.sin(k * 7.5) * 0.05
    )
    ctx.lineTo(x, y - wave * amp - amp * 0.3)
  }
  ctx.lineTo(width, y)
  ctx.closePath()
  ctx.fill()
}

// The ridge lines sit right at the horizon (steady, un-bobbing) and only
// move horizontally with `skew` for proper parallax depth. Three layers
// plus atmospheric haze create strong OutRun-style depth.
export function drawParallax(ctx, width, height, skew, colors) {
  drawSun(ctx, width, height, colors)
  
  // Draw ridges back-to-front for proper layering
  for (const layer of PARALLAX.ridges) {
    const y = height * layer.yFraction
    const color = colors[layer.colorKey] || '#4E3416'
    ridge(ctx, width, y, layer.amp, color, layer.rate, layer.seedMul, skew)
  }
}
