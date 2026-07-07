import { ROAD, ROADSIDE, TRACK_LAYOUT } from '../data/tuning.js'
import { roadTone, COLORS } from './colors.js'

const { segmentLength } = ROAD

// Curve is the amount a segment bends the road per unit of distance; sign
// convention: negative = left, positive = right. `y` is an absolute world
// elevation, not a delta — sections ease from the current elevation to a
// target so hills/curves blend smoothly instead of kinking.
function easeIn(a, b, p) { return a + (b - a) * p * p }
function easeOut(a, b, p) { return a + (b - a) * (1 - (1 - p) * (1 - p)) }
function easeInOut(a, b, p) { return a + (b - a) * ((1 - Math.cos(p * Math.PI)) / 2) }

function buildTrack() {
  const segments = []
  let lastY = 0

  function addSegment(curve, y) {
    const i = segments.length
    const tone = (
      Math.sin(i * ROAD.surfaceNoiseFreq1) * ROAD.surfaceNoiseWeight1 +
      Math.sin(i * ROAD.surfaceNoiseFreq2)
    ) * ROAD.surfaceNoiseAmplitude

    // Deterministic placement (by segment index, not randomness) so the
    // track scatters the same way every run.
    const sprites = []
    if (i % ROADSIDE.pillarModulo === ROADSIDE.pillarRemainderLeft) {
      sprites.push({ offset: ROADSIDE.pillarOffsetLeft, type: 'pillar', seed: i })
    }
    if (i % ROADSIDE.pillarModulo === ROADSIDE.pillarRemainderRight) {
      sprites.push({ offset: ROADSIDE.pillarOffsetRight, type: 'pillar', seed: i * 3 })
    }
    if (i % ROADSIDE.stoneModuloA === ROADSIDE.stoneRemainderA) {
      sprites.push({ offset: ROADSIDE.stoneOffsetA, type: 'stone', seed: i })
    }
    if (i % ROADSIDE.stoneModuloB === ROADSIDE.stoneRemainderB) {
      sprites.push({ offset: ROADSIDE.stoneOffsetB, type: 'stone', seed: i * 7 })
    }

    // Start/finish marker: segment 0 only, drawn via the exact same
    // sprite/road mechanisms as everything else above, so it projects and
    // clips correctly on approach. A wide contrasting band replaces the
    // normal surface tint for the first `widthSegments`; the pillar pair
    // (with its built-in resonance orb, same as any roadside pillar) marks
    // both edges right at the line itself.
    const isFinishLine = i < ROAD.finishLine.widthSegments
    if (i === 0) {
      sprites.push({ offset: ROAD.finishLine.pillarOffsetLeft, type: 'pillar', seed: 0 })
      sprites.push({ offset: ROAD.finishLine.pillarOffsetRight, type: 'pillar', seed: 1 })
    }

    segments.push({
      index: i,
      curve,
      y,
      roadColor: isFinishLine ? COLORS.finishLine : roadTone(tone),
      sprites,
    })
  }

  // Curve eases in from 0, holds, then eases back to 0 across the section;
  // elevation eases from whatever it is now to a target `dy` segment-lengths
  // away over the whole span.
  function addRoad(enter, hold, leave, curve, dy) {
    const startY = lastY
    const endY = startY + dy * segmentLength
    const total = enter + hold + leave
    for (let n = 0; n < enter; n++) {
      addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total))
    }
    for (let n = 0; n < hold; n++) {
      addSegment(curve, easeInOut(startY, endY, (enter + n) / total))
    }
    for (let n = 0; n < leave; n++) {
      addSegment(easeOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total))
    }
    lastY = endY
  }

  for (const { enter, hold, leave, curve, dy } of TRACK_LAYOUT) {
    addRoad(enter, hold, leave, curve, dy)
  }

  return segments
}

export const track = buildTrack()
export const trackLength = track.length * segmentLength

// Wrapping lookup — any index (including negative or past the end) resolves
// to a segment, so callers never need to special-case the loop boundary.
export function seg(i) {
  const n = track.length
  return track[((i % n) + n) % n]
}
