import { ROAD } from '../data/tuning.js'

const { segmentLength, segmentsPerColor } = ROAD

// Curve is the amount a segment bends the road per unit of distance; sign
// convention: negative = left, positive = right. Height (y) is an absolute
// world elevation, not a delta — sections ease from the current elevation to
// a target so hills/curves blend smoothly instead of kinking.
function easeIn(a, b, t) {
  return a + (b - a) * t * t
}
function easeInOut(a, b, t) {
  return a + (b - a) * ((1 - Math.cos(t * Math.PI)) / 2)
}

function buildTrack() {
  const segments = []

  function lastY() {
    return segments.length === 0 ? 0 : segments[segments.length - 1].p2.world.y
  }

  function addSegment(curve, y) {
    const n = segments.length
    segments.push({
      index: n,
      curve,
      color: Math.floor(n / segmentsPerColor) % 2 ? 'dark' : 'light',
      p1: {
        world: { x: 0, y: lastY(), z: n * segmentLength },
        camera: { x: 0, y: 0, z: 0 },
        screen: { x: 0, y: 0, w: 0 },
      },
      p2: {
        world: { x: 0, y, z: (n + 1) * segmentLength },
        camera: { x: 0, y: 0, z: 0 },
        screen: { x: 0, y: 0, w: 0 },
      },
    })
  }

  // Curve eases in from 0, holds, then eases back to 0 across the section;
  // elevation eases from whatever it is now to targetY over the whole span.
  function addSection(enter, hold, leave, curve, targetY) {
    const startY = lastY()
    const total = enter + hold + leave
    for (let i = 0; i < enter; i++) {
      addSegment(easeIn(0, curve, i / enter), easeInOut(startY, targetY, i / total))
    }
    for (let i = 0; i < hold; i++) {
      addSegment(curve, easeInOut(startY, targetY, (enter + i) / total))
    }
    for (let i = 0; i < leave; i++) {
      addSegment(easeInOut(curve, 0, i / leave), easeInOut(startY, targetY, (enter + hold + i) / total))
    }
  }

  function addStraight(num, targetY = lastY()) {
    addSection(num, 0, 0, 0, targetY)
  }

  const CURVE = { EASY: 3, MEDIUM: 4.5, HAIRPIN: 7 }
  const HILL_HEIGHT = 500

  addStraight(60) // start/finish straight
  addSection(40, 60, 40, -CURVE.EASY, 0) // left curve 1
  addStraight(40)
  addSection(50, 70, 50, -CURVE.MEDIUM, 0) // left curve 2 (sharper)
  addStraight(30)
  addSection(60, 60, 60, 0, HILL_HEIGHT) // hill climb
  addStraight(60, HILL_HEIGHT) // straight along the top
  addSection(60, 60, 60, 0, 0) // descent back to base height
  addStraight(40)
  addSection(30, 100, 30, CURVE.HAIRPIN, 0) // right hairpin
  addStraight(80) // run back to start/finish

  return segments
}

export const track = buildTrack()
export const trackLength = track.length * segmentLength

export function findSegment(z) {
  return track[Math.floor(z / segmentLength) % track.length]
}

export function percentRemaining(z, length) {
  return (z % length) / length
}

export function interpolate(a, b, t) {
  return a + (b - a) * t
}
