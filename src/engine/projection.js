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

// `roadColor` is one consistent surface color (with a barely-perceptible
// per-segment tint baked in already) — no alternating bands. The shoulder
// is a single soft brass band right at each road edge, in place of a harsh
// checkered rumble strip. `parity` alternates the grass tint by draw order.
export function renderRoadSegment(ctx, width, s1, s2, parity, colors, roadColor) {
  ctx.fillStyle = parity ? colors.grassAlt : colors.grass
  ctx.fillRect(0, s2.sy, width, s1.sy - s2.sy)

  const shoulder1 = s1.sw * ROAD.shoulderWidthFraction
  const shoulder2 = s2.sw * ROAD.shoulderWidthFraction
  trap(ctx, s1.sx - s1.sw - shoulder1, s1.sy, shoulder1, s2.sx - s2.sw - shoulder2, s2.sy, shoulder2, colors.shoulder)
  trap(ctx, s1.sx + s1.sw, s1.sy, shoulder1, s2.sx + s2.sw, s2.sy, shoulder2, colors.shoulder)

  trap(ctx, s1.sx - s1.sw, s1.sy, s1.sw * 2, s2.sx - s2.sw, s2.sy, s2.sw * 2, roadColor)
}

// A dashed centerline stripe, drawn as a thin trapezoid down the middle of
// an already-rendered road segment.
export function renderLaneStripe(ctx, s1, s2, color) {
  const half = ROAD.laneWidthFraction / 2
  trap(ctx, s1.sx - s1.sw * half, s1.sy, s1.sw * ROAD.laneWidthFraction,
    s2.sx - s2.sw * half, s2.sy, s2.sw * ROAD.laneWidthFraction, color)
}
