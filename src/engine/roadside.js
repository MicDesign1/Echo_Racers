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

// Overhead finish-line banner spanning the two finish pillars (see
// ROAD.finishLine.pillarOffsetLeft/Right in tuning.js — the same offsets the
// pillar sprites at segment 0 use, so the banner lines up exactly between
// them). Unlike a pillar/stone, a banner needs BOTH edge x-positions at
// once, so it reads the frame slot directly instead of a single pre-offset
// screen x (see RaceTrack.jsx's sprite-draw loop special-casing this type).
// Drawn/clipped through the exact same projected-slot + hill-crest-clip path
// as every other roadside sprite, so it scales up naturally on approach and
// clips correctly near a crest, same as a pillar would.
export function drawFinishBanner(ctx, slot, sprite, canvasWidth, canvasHeight, colors, time) {
  const { s1x: x, s1y: yBase, s1w: roadHalfWidthPx, clip: clipY } = slot
  const xLeft = x + roadHalfWidthPx * sprite.leftOffset
  const xRight = x + roadHalfWidthPx * sprite.rightOffset
  const postH = roadHalfWidthPx * ROADSIDE.pillarHeightFraction
  const yTop = yBase - postH
  if (yTop > canvasHeight || yBase < 0 || postH < 2) return

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, canvasWidth, clipY)
  ctx.clip()

  // Cloth: a straight top edge (hung taut between the two posts) and a
  // gently sagging bottom edge (a soft catenary approximation), so it reads
  // as a real hanging banner rather than a rigid plank.
  const clothH = postH * 0.32
  const sag = clothH * 0.35
  const cloth = ctx.createLinearGradient(0, yTop, 0, yTop + clothH)
  cloth.addColorStop(0, colors.finishBannerCloth[0])
  cloth.addColorStop(1, colors.finishBannerCloth[1])
  ctx.fillStyle = cloth
  ctx.beginPath()
  ctx.moveTo(xLeft, yTop)
  ctx.lineTo(xRight, yTop)
  ctx.lineTo(xRight, yTop + clothH)
  ctx.quadraticCurveTo((xLeft + xRight) / 2, yTop + clothH + sag, xLeft, yTop + clothH)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = colors.finishBannerTrim
  ctx.lineWidth = Math.max(1, postH * 0.05)
  ctx.stroke()

  ctx.restore()
}
