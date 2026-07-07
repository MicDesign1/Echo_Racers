import { ROADSIDE } from '../data/tuning.js'

// Draws one roadside pillar or stone at an already-projected screen
// position. `clipY` is the current hill-crest cutoff (the same plane the
// road itself stops drawing at), so sprites behind a hill are clipped
// instead of poking through it.
export function drawRoadsideSprite(ctx, x, yBase, roadHalfWidthPx, clipY, canvasWidth, canvasHeight, sprite, colors, time) {
  const isPillar = sprite.type === 'pillar'
  const h = roadHalfWidthPx * (isPillar ? ROADSIDE.pillarHeightFraction : ROADSIDE.stoneHeightFraction)
  const w = roadHalfWidthPx * (isPillar ? ROADSIDE.pillarWidthFraction : ROADSIDE.stoneWidthFraction)
  if (yBase - h > canvasHeight || yBase < 0 || h < 2) return

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, canvasWidth, clipY)
  ctx.clip()

  if (isPillar) {
    const body = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0)
    body.addColorStop(0, colors.pillar[0])
    body.addColorStop(0.5, colors.pillar[1])
    body.addColorStop(1, colors.pillar[2])
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.moveTo(x - w * 0.5, yBase)
    ctx.lineTo(x - w * 0.34, yBase - h)
    ctx.lineTo(x + w * 0.34, yBase - h)
    ctx.lineTo(x + w * 0.5, yBase)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = colors.pillarCap
    ctx.fillRect(x - w * 0.5, yBase - h - w * 0.18, w, w * 0.2)

    // Resonance orb — a soft, gentle pulse, never a strobe.
    const pulse = 0.75 + 0.25 * Math.sin(time * ROADSIDE.orbPulseRate + sprite.seed)
    const r = w * 0.42 * pulse
    const orbY = yBase - h - w * 0.35
    const glow = ctx.createRadialGradient(x, orbY, 0, x, orbY, r * 2.6)
    glow.addColorStop(0, colors.orbGlow[0])
    glow.addColorStop(0.4, colors.orbGlow[1])
    glow.addColorStop(1, colors.orbGlow[2])
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(x, orbY, r * 2.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = colors.orbCore
    ctx.beginPath()
    ctx.arc(x, orbY, r * 0.55, 0, Math.PI * 2)
    ctx.fill()
  } else {
    const body = ctx.createLinearGradient(x, yBase - h, x, yBase)
    body.addColorStop(0, colors.stone[0])
    body.addColorStop(1, colors.stone[1])
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.ellipse(x, yBase - h * 0.35, w * 0.55, h * 0.65, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}
