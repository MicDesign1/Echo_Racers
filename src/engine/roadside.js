import { ROADSIDE, BOOST } from '../data/tuning.js'

// Draws one roadside pillar or stone at an already-projected screen
// position. `clipY` is the current hill-crest cutoff (the same plane the
// road itself stops drawing at), so sprites behind a hill are clipped
// instead of poking through it.
export function drawRoadsideSprite(ctx, x, yBase, roadHalfWidthPx, clipY, canvasWidth, canvasHeight, sprite, colors, time) {
  const type = sprite.type
  
  // Height/width for each prop type
  let h, w
  if (type === 'pillar') {
    h = roadHalfWidthPx * ROADSIDE.pillarHeightFraction
    w = roadHalfWidthPx * ROADSIDE.pillarWidthFraction
  } else if (type === 'stone') {
    h = roadHalfWidthPx * ROADSIDE.stoneHeightFraction
    w = roadHalfWidthPx * ROADSIDE.stoneWidthFraction
  } else if (type === 'marker') {
    h = roadHalfWidthPx * ROADSIDE.markerHeightFraction
    w = roadHalfWidthPx * ROADSIDE.markerWidthFraction
  } else if (type === 'tree') {
    h = roadHalfWidthPx * ROADSIDE.treeHeightFraction
    w = roadHalfWidthPx * ROADSIDE.treeWidthFraction
  } else if (type === 'arch') {
    h = roadHalfWidthPx * ROADSIDE.archHeightFraction
    w = roadHalfWidthPx * ROADSIDE.archWidthFraction
  } else {
    return // unknown type
  }
  
  if (yBase - h > canvasHeight || yBase < 0 || h < 2) return

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, canvasWidth, clipY)
  ctx.clip()

  if (type === 'pillar') {
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
  } else if (type === 'stone') {
    // River-worn stone — irregular blob with weathered texture
    const body = ctx.createLinearGradient(x, yBase - h, x, yBase)
    body.addColorStop(0, colors.stone[0])
    body.addColorStop(0.7, colors.stone[1])
    body.addColorStop(1, colors.stone[0])
    ctx.fillStyle = body
    // Two overlapping ellipses for natural irregular shape
    ctx.beginPath()
    ctx.ellipse(x, yBase - h * 0.35, w * 0.55, h * 0.65, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 0.6
    ctx.beginPath()
    ctx.ellipse(x + w * 0.15, yBase - h * 0.28, w * 0.38, h * 0.5, 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  } else if (type === 'marker') {
    // Verdigris marker — weathered copper post
    const body = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0)
    body.addColorStop(0, colors.marker[0])
    body.addColorStop(0.5, colors.marker[1])
    body.addColorStop(1, colors.marker[2])
    ctx.fillStyle = body
    ctx.fillRect(x - w * 0.5, yBase - h, w, h)
    
    // Weathered cap
    const capH = h * ROADSIDE.markerCapFraction
    ctx.fillStyle = colors.markerCap
    ctx.fillRect(x - w * 0.6, yBase - h - capH, w * 1.2, capH)
    
    // Subtle verdigris patina overlay
    const patina = ctx.createLinearGradient(x, yBase - h, x, yBase - h * 0.5)
    patina.addColorStop(0, colors.markerVerdigris[0])
    patina.addColorStop(1, colors.markerVerdigris[1])
    ctx.fillStyle = patina
    ctx.fillRect(x - w * 0.4, yBase - h * 0.8, w * 0.8, h * 0.6)
  } else if (type === 'tree') {
    // Tree silhouette — trunk + canopy
    const trunkW = roadHalfWidthPx * ROADSIDE.treeTrunkWidthFraction
    const trunkH = h * ROADSIDE.treeTrunkHeightFraction
    const trunk = ctx.createLinearGradient(x, yBase - trunkH, x, yBase)
    trunk.addColorStop(0, colors.treeTrunk[0])
    trunk.addColorStop(1, colors.treeTrunk[1])
    ctx.fillStyle = trunk
    ctx.fillRect(x - trunkW * 0.5, yBase - trunkH, trunkW, trunkH)
    
    // Canopy — irregular foliage shape with three overlapping circles
    const canopyY = yBase - trunkH - h * ROADSIDE.treeCanopyOffsetFraction
    const canopyR = w * 0.5
    ctx.fillStyle = colors.treeCanopy[0]
    ctx.beginPath()
    ctx.arc(x, canopyY, canopyR, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = colors.treeCanopy[1]
    ctx.beginPath()
    ctx.arc(x - canopyR * 0.5, canopyY + canopyR * 0.3, canopyR * 0.7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = colors.treeCanopy[2]
    ctx.beginPath()
    ctx.arc(x + canopyR * 0.5, canopyY + canopyR * 0.3, canopyR * 0.7, 0, Math.PI * 2)
    ctx.fill()
  } else if (type === 'arch') {
    // Brass arch — ceremonial gateway element
    const thickness = w * ROADSIDE.archThicknessFraction
    const capH = h * ROADSIDE.archCapFraction
    
    // Left pillar
    const pillar = ctx.createLinearGradient(x - w / 2, 0, x - w / 2 + thickness, 0)
    pillar.addColorStop(0, colors.arch[0])
    pillar.addColorStop(0.5, colors.arch[1])
    pillar.addColorStop(1, colors.arch[2])
    ctx.fillStyle = pillar
    ctx.fillRect(x - w * 0.5, yBase - h, thickness, h)
    
    // Right pillar
    ctx.fillRect(x + w * 0.5 - thickness, yBase - h, thickness, h)
    
    // Top span
    ctx.fillRect(x - w * 0.5, yBase - h - capH, w, capH)
    
    // Decorative cap
    ctx.fillStyle = colors.archCap
    ctx.fillRect(x - w * 0.5 - thickness * 0.3, yBase - h - capH * 1.3, w + thickness * 0.6, capH * 0.4)
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

// Boost pickup — an instant-boost item placed on the track. Drawn as a
// glowing road plate sitting ON the tarmac (not floating), proper OutRun style.
// `available` determines whether it's shown (false = respawning).
export function drawBoostPickup(ctx, x, yBase, roadHalfWidthPx, clipY, canvasWidth, canvasHeight, colors, time, available) {
  if (!available) return
  const w = roadHalfWidthPx * BOOST.pickup.spriteWidth * 1.2 // slightly wider plate
  const h = w * 0.15 // very flat, sits on road
  if (yBase > canvasHeight || yBase - h < 0 || h < 1) return

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, canvasWidth, clipY)
  ctx.clip()

  const pulse = 0.75 + 0.25 * Math.sin(time * BOOST.pickup.glowPulseRate)
  const yPad = yBase - h

  // Glow underneath the pad (road illumination)
  const glowRadius = w * 0.8 * pulse
  const glow = ctx.createRadialGradient(x, yBase, 0, x, yBase, glowRadius)
  glow.addColorStop(0, `rgba(${colors.resonanceGlowRGB}, 0.5)`)
  glow.addColorStop(0.7, `rgba(${colors.resonanceGlowRGB}, 0.15)`)
  glow.addColorStop(1, `rgba(${colors.resonanceGlowRGB}, 0)`)
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.ellipse(x, yBase, glowRadius, glowRadius * 0.6, 0, 0, Math.PI * 2)
  ctx.fill()

  // Road plate body: metallic brass with perspective
  const plateGradient = ctx.createLinearGradient(x, yPad, x, yBase)
  plateGradient.addColorStop(0, colors.brass || '#8B6914')
  plateGradient.addColorStop(0.5, colors.agedGold || '#C49A3C')
  plateGradient.addColorStop(1, colors.brass || '#8B6914')
  
  // Draw as trapezoid for perspective (wider at base)
  ctx.fillStyle = plateGradient
  ctx.beginPath()
  ctx.moveTo(x - w * 0.45, yPad)
  ctx.lineTo(x + w * 0.45, yPad)
  ctx.lineTo(x + w * 0.5, yBase)
  ctx.lineTo(x - w * 0.5, yBase)
  ctx.closePath()
  ctx.fill()

  // Edge highlight for depth
  ctx.strokeStyle = `rgba(255, 240, 200, ${0.6 * pulse})`
  ctx.lineWidth = Math.max(1, h * 0.2)
  ctx.stroke()

  // Center glow strip (resonance energy)
  const stripW = w * 0.6
  const stripGlow = ctx.createLinearGradient(x - stripW / 2, yPad + h * 0.3, x + stripW / 2, yPad + h * 0.3)
  stripGlow.addColorStop(0, `rgba(${colors.resonanceGlowRGB}, 0)`)
  stripGlow.addColorStop(0.5, `rgba(${colors.resonanceGlowRGB}, ${0.8 * pulse})`)
  stripGlow.addColorStop(1, `rgba(${colors.resonanceGlowRGB}, 0)`)
  ctx.fillStyle = stripGlow
  ctx.fillRect(x - stripW / 2, yPad + h * 0.25, stripW, h * 0.5)

  ctx.restore()
}
