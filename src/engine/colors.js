// Palette per CLAUDE.md: brass/silver/verdigris copper/river-worn stone/warm
// parchment skies. No neon, no chrome — every road/ground tone is a warm or
// weathered natural material. Values ported exactly from the reference demo
// (echo_racers_reference_demo.html).
export const COLORS = {
  sky: [
    [0, '#3A2415'],
    [0.45, '#8B5E1E'],
    [0.8, '#D9A94F'],
    [1, '#FFF8E7'],
  ],
  ridgeFar: '#6E4E22',
  ridgeNear: '#4E3416',

  // Grass alternates between two near-identical greens by draw order (not
  // by fixed segment identity) — the reference's comment calls this "very
  // low contrast," unlike the road, which never alternates at all.
  grass: '#5B6B43',
  grassAlt: '#57683F',
  shoulder: 'rgba(139, 105, 20, 0.55)',
  laneStripe: 'rgba(196, 154, 60, 0.8)',

  pillar: ['#5C3A1E', '#8B6914', '#4a2f16'],
  pillarCap: '#3d2812',
  orbGlow: ['rgba(255, 226, 150, 0.95)', 'rgba(230, 180, 80, 0.45)', 'rgba(230, 180, 80, 0)'],
  orbCore: '#FFE9B0',
  stone: ['#8a8272', '#565043'],

  carHull: ['#7a5a12', '#C49A3C', '#6d4e10'],
  carFin: '#8B6914',
  canopy: ['#FFF8E7', '#D4A574'],
  creature: '#5C3A1E',
  intakeGlowRGB: '255, 232, 160',
  driftDust: 'rgba(212, 165, 116, 0.35)',
  glowTrailRGB: '255, 220, 140',

  vignetteInner: 'rgba(0, 0, 0, 0)',
  vignetteOuter: 'rgba(30, 15, 5, 0.35)',

  hudPanel: 'rgba(44, 24, 16, 0.72)',
  hudBorder: '#8B6914',
  hudText: '#FFF8E7',
  hudTextDim: '#C49A3C',
}

// Road surface base color + per-channel tint weights. `tone` is the
// segment's tiny signed drift value; the result is one consistent brown
// family with a barely-perceptible shift — never an alternating band.
const ROAD_BASE = [74, 50, 28]
const ROAD_TONE_WEIGHT = [1, 0.8, 0.5]
export function roadTone(tone) {
  const r = (ROAD_BASE[0] + tone * ROAD_TONE_WEIGHT[0]) | 0
  const g = (ROAD_BASE[1] + tone * ROAD_TONE_WEIGHT[1]) | 0
  const b = (ROAD_BASE[2] + tone * ROAD_TONE_WEIGHT[2]) | 0
  return `rgb(${r}, ${g}, ${b})`
}

// Builds a linear gradient from a `[[offset, color], ...]` stop list —
// lets gradients live in COLORS as plain data instead of imperative calls.
export function linearGradient(ctx, x0, y0, x1, y1, stops) {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1)
  for (const [offset, color] of stops) gradient.addColorStop(offset, color)
  return gradient
}
