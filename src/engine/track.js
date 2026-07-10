import { ROAD, TRACK_FEEL } from '../data/tuning.js'
import { roadTone } from './colors.js'

const { segmentLength } = ROAD

// Curve is the amount a segment bends the road per unit of distance; sign
// convention: negative = left, positive = right. `y` is an absolute world
// elevation, not a delta — sections ease from the current elevation to a
// target so hills/curves blend smoothly instead of kinking.
function easeIn(a, b, p) { return a + (b - a) * p * p }
function easeOut(a, b, p) { return a + (b - a) * (1 - (1 - p) * (1 - p)) }
function easeInOut(a, b, p) { return a + (b - a) * ((1 - Math.cos(p * Math.PI)) / 2) }

// Translates one data/tracks.js layout entry into the (enter, hold, leave,
// curve, dy) tuple addRoad() consumes. 'straight'/'hill' sections have no
// curve, so their enter/hold/leave split can't affect the output (curve
// eases 0->0 regardless of subdivision, and elevation eases continuously
// across the whole span either way) — putting the whole length in `hold`
// keeps those two types simple with no loss of fidelity. 'curve' sections
// use the entry's own enter/leave if given (the original course's three
// curves carry their exact original values so its shape stays byte-
// identical), else split by TRACK_FEEL.curveEnterLeaveFraction.
function resolveSection(entry) {
  const { type, length } = entry
  if (type === 'straight') return { enter: 0, hold: length, leave: 0, curve: 0, dy: 0 }
  if (type === 'hill') return { enter: 0, hold: length, leave: 0, curve: 0, dy: entry.dy }
  if (type === 'curve') {
    const frac = TRACK_FEEL.curveEnterLeaveFraction
    const enter = entry.enter ?? Math.round(length * frac)
    const leave = entry.leave ?? Math.round(length * frac)
    const signed = entry.dir === 'left' ? -entry.strength : entry.strength
    return { enter, hold: Math.max(0, length - enter - leave), leave, curve: signed, dy: entry.dy ?? 0 }
  }
  throw new Error(`unknown track layout section type "${type}"`)
}

function buildSegments(trackData) {
  const segments = []
  let lastY = 0
  const roadside = trackData.roadside
  const roadBase = trackData.palette.road

  function addSegment(curve, y) {
    const i = segments.length
    const tone = (
      Math.sin(i * ROAD.surfaceNoiseFreq1) * ROAD.surfaceNoiseWeight1 +
      Math.sin(i * ROAD.surfaceNoiseFreq2)
    ) * ROAD.surfaceNoiseAmplitude

    // Deterministic placement (by segment index, not randomness) so the
    // track scatters the same way every run. Modulo/remainder/offsets are
    // this track's own "prop set + density" (data/tracks.js).
    const sprites = []
    if (i % roadside.pillarModulo === roadside.pillarRemainderLeft) {
      sprites.push({ offset: roadside.pillarOffsetLeft, type: 'pillar', seed: i })
    }
    if (i % roadside.pillarModulo === roadside.pillarRemainderRight) {
      sprites.push({ offset: roadside.pillarOffsetRight, type: 'pillar', seed: i * 3 })
    }
    if (i % roadside.stoneModuloA === roadside.stoneRemainderA) {
      sprites.push({ offset: roadside.stoneOffsetA, type: 'stone', seed: i })
    }
    if (i % roadside.stoneModuloB === roadside.stoneRemainderB) {
      sprites.push({ offset: roadside.stoneOffsetB, type: 'stone', seed: i * 7 })
    }

    // Start/finish marker: segment 0 only, drawn via the exact same
    // sprite/road mechanisms as everything else above, so it projects and
    // clips correctly on approach. `isFinishLine` flags the first
    // `widthSegments` for a checkered ground overlay (drawn on top of the
    // normal surface — see projection.js renderFinishCheckers — rather than
    // replacing roadColor, so the surface-noise tint stays underneath). The
    // pillar pair (with its built-in resonance orb, same as any roadside
    // pillar) marks both edges right at the line, and a banner sprite spans
    // between their tops (see roadside.js drawFinishBanner).
    const isFinishLine = i < ROAD.finishLine.widthSegments
    if (i === 0) {
      sprites.push({ offset: ROAD.finishLine.pillarOffsetLeft, type: 'pillar', seed: 0 })
      sprites.push({ offset: ROAD.finishLine.pillarOffsetRight, type: 'pillar', seed: 1 })
      sprites.push({
        type: 'finishBanner',
        seed: 2,
        leftOffset: ROAD.finishLine.pillarOffsetLeft,
        rightOffset: ROAD.finishLine.pillarOffsetRight,
      })
    }

    segments.push({
      index: i,
      curve,
      y,
      roadColor: roadTone(tone, roadBase),
      isFinishLine,
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

  for (const entry of trackData.layout) {
    const { enter, hold, leave, curve, dy } = resolveSection(entry)
    addRoad(enter, hold, leave, curve, dy)
  }

  smoothElevation(segments, TRACK_FEEL.elevationSmoothingRadius, TRACK_FEEL.elevationSmoothingPasses)
  return segments
}

// Box-blur the final elevation profile — see TRACK_FEEL.elevationSmoothing*
// in tuning.js for why. Clamped at the array edges (not wrapped): every
// track's layout starts and ends on a flat straight, so there's no seam to
// smooth across there anyway.
function smoothElevation(segments, radius, passes) {
  if (radius <= 0 || passes <= 0) return
  const n = segments.length
  let ys = segments.map((s) => s.y)
  for (let p = 0; p < passes; p++) {
    const next = new Array(n)
    for (let i = 0; i < n; i++) {
      let sum = 0
      let count = 0
      for (let k = -radius; k <= radius; k++) {
        const j = i + k
        if (j < 0 || j >= n) continue
        sum += ys[j]
        count++
      }
      next[i] = sum / count
    }
    ys = next
  }
  for (let i = 0; i < n; i++) segments[i].y = ys[i]
}

// The active track's built segments — rebuilt by loadTrack() whenever the
// selected track changes (race mount, Race Again, or a future in-session
// track switch). `export let` bindings are LIVE in ES modules, so every
// existing `import { track, trackLength, seg } from './track.js'` picks up
// the rebuilt values automatically — no need to thread a track argument
// through every caller.
export let track = []
export let trackLength = 0

export function loadTrack(trackData) {
  track = buildSegments(trackData)
  trackLength = track.length * segmentLength
  return { track, trackLength }
}

// Wrapping lookup — any index (including negative or past the end) resolves
// to a segment, so callers never need to special-case the loop boundary.
export function seg(i) {
  const n = track.length
  return track[((i % n) + n) % n]
}
