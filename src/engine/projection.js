import { ROAD } from '../data/tuning.js'

// Projects a track-relative point into 2D screen space by perspective
// division: scale shrinks proportionally to distance from the camera, which
// is what makes the road narrow toward a vanishing point at the horizon.
// `p.wz` is expected to already be camera-relative distance (not an
// absolute world coordinate), so camZ is normally 0 — this sidesteps any
// track-length wraparound math when the camera loops back to the start.
export function project(p, camX, camY, camZ, cameraDepth, width, height, roadWidth) {
  const relX = p.wx - camX
  const relY = p.wy - camY
  let relZ = p.wz - camZ
  if (relZ <= 0) relZ = 0.01
  const scale = cameraDepth / relZ
  p.sx = width / 2 + scale * relX * width / 2
  p.sy = height / 2 - scale * relY * height / 2
  p.sw = scale * roadWidth * width / 2
  p.scale = scale
}

function trap(ctx, x1, y1, w1, x2, y2, w2, fill) {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x1 + w1, y1)
  ctx.lineTo(x2 + w2, y2)
  ctx.lineTo(x2, y2)
  ctx.closePath()
  ctx.fill()
}

// `roadColor` is the base tarmac tone (with per-segment noise baked in already).
// Add perspective grain, lane wear, and depth-based grass banding for OutRun feel.
export function renderRoadSegment(ctx, width, s1, s2, parity, colors, roadColor) {
  // Distance-based grass banding: multiple layers for proper depth
  const distanceFactor = Math.min(1, s1.scale * 20)
  const baseTone = parity ? colors.grassAlt : colors.grass
  
  let grassColor = baseTone
  if (distanceFactor < 0.95) {
    // Stronger banding with layered darkening
    const darken = 1 - (1 - distanceFactor) * 0.45
    const match = baseTone.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
    if (match) {
      const r = Math.floor(parseInt(match[1], 16) * darken)
      const g = Math.floor(parseInt(match[2], 16) * darken)
      const b = Math.floor(parseInt(match[3], 16) * darken)
      grassColor = `rgb(${r}, ${g}, ${b})`
    }
  }
  
  ctx.fillStyle = grassColor
  ctx.fillRect(0, s2.sy, width, s1.sy - s2.sy)

  // Shoulder with subtle grit texture (darker inner edge for depth)
  const shoulder1 = s1.sw * ROAD.shoulderWidthFraction
  const shoulder2 = s2.sw * ROAD.shoulderWidthFraction
  
  // Shoulder gradient: darker at road edge, lighter outside
  const shoulderLeft = ctx.createLinearGradient(s1.sx - s1.sw - shoulder1, 0, s1.sx - s1.sw, 0)
  shoulderLeft.addColorStop(0, colors.shoulderOuter || colors.shoulder)
  shoulderLeft.addColorStop(1, colors.shoulderInner || colors.shoulder)
  trap(ctx, s1.sx - s1.sw - shoulder1, s1.sy, shoulder1, s2.sx - s2.sw - shoulder2, s2.sy, shoulder2, shoulderLeft)
  
  const shoulderRight = ctx.createLinearGradient(s1.sx + s1.sw, 0, s1.sx + s1.sw + shoulder1, 0)
  shoulderRight.addColorStop(0, colors.shoulderInner || colors.shoulder)
  shoulderRight.addColorStop(1, colors.shoulderOuter || colors.shoulder)
  trap(ctx, s1.sx + s1.sw, s1.sy, shoulder1, s2.sx + s2.sw, s2.sy, shoulder2, shoulderRight)

  // Road surface: base + subtle lane wear streaks
  trap(ctx, s1.sx - s1.sw, s1.sy, s1.sw * 2, s2.sx - s2.sw, s2.sy, s2.sw * 2, roadColor)
  
  // Lane wear: subtle darker streaks in the wheel tracks
  if (s1.sw > 20) { // only visible when road is wide enough
    const laneWearAlpha = Math.min(0.08, s1.scale * 0.4) // fade with distance
    ctx.fillStyle = `rgba(0, 0, 0, ${laneWearAlpha})`
    const leftLane = s1.sw * 0.35
    const rightLane = s1.sw * 0.35
    const laneWidth = s1.sw * 0.18
    trap(ctx, s1.sx - leftLane - laneWidth/2, s1.sy, laneWidth, s2.sx - leftLane - laneWidth/2, s2.sy, laneWidth, ctx.fillStyle)
    trap(ctx, s1.sx + rightLane - laneWidth/2, s1.sy, laneWidth, s2.sx + rightLane - laneWidth/2, s2.sy, laneWidth, ctx.fillStyle)
  }
}

// A dashed centerline stripe, drawn as a thin trapezoid down the middle of
// an already-rendered road segment.
export function renderLaneStripe(ctx, s1, s2, color) {
  const half = ROAD.laneWidthFraction / 2
  trap(ctx, s1.sx - s1.sw * half, s1.sy, s1.sw * ROAD.laneWidthFraction,
    s2.sx - s2.sw * half, s2.sy, s2.sw * ROAD.laneWidthFraction, color)
}

// Finish-line ground marking: a checkerboard overlay across the full road
// width, drawn on top of an already-rendered finish segment (see track.js's
// isFinishLine flag) — replaces the old solid gold band so it reads as a
// deliberate finish pattern rather than just another surface tint.
export function renderFinishCheckers(ctx, s1, s2, cols, colorA, colorB) {
  for (let c = 0; c < cols; c++) {
    const t0 = c / cols
    const t1 = (c + 1) / cols
    const x1 = s1.sx - s1.sw + t0 * s1.sw * 2
    const w1 = (t1 - t0) * s1.sw * 2
    const x2 = s2.sx - s2.sw + t0 * s2.sw * 2
    const w2 = (t1 - t0) * s2.sw * 2
    trap(ctx, x1, s1.sy, w1, x2, s2.sy, w2, c % 2 === 0 ? colorA : colorB)
  }
}
