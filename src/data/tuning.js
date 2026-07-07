// Centralized game-feel constants. Adjust here rather than scattering magic
// numbers through engine/component code. Ported from the reference demo's
// `T` object (echo_racers_reference_demo.html), plus every other tunable
// value the reference kept inline.

export const ROAD = {
  segmentLength: 200,
  roadWidth: 2100,
  cameraDepth: 0.84,
  cameraHeight: 1050,
  drawDistance: 220,
  laneWidthFraction: 0.04, // dashed centerline total width, fraction of road half-width
  laneDashPeriod: 5, // segments per on+off cycle
  laneDashOn: 2, // segments "on" within that cycle
  shoulderWidthFraction: 0.12, // soft brass shoulder band thickness, fraction of road half-width
  // Two slow, out-of-phase sines give the road surface a barely-perceptible
  // tone drift instead of a flat fill — never a hard alternating band.
  surfaceNoiseFreq1: 0.7,
  surfaceNoiseFreq2: 2.3,
  surfaceNoiseWeight1: 0.5,
  surfaceNoiseAmplitude: 0.8,
}

// Speeds/accelerations are in world units/sec (and /sec^2) — scaled against
// ROAD.segmentLength so "maxSpeed" means "segments crossed per second".
export const RACE = {
  maxSpeed: 220 * 60,
  accel: 2600,
  accelLowSpeedBoost: 1.35, // accel multiplier at a standstill
  accelSpeedTaper: 0.6, // how much of that boost tapers off by top speed
  brakeDecel: 7000,
  friction: 1400,
  offRoadMaxSpeed: 220 * 18,
  offRoadDecel: 5200,
  offRoadThreshold: 1.02, // |playerX| beyond this counts as off-road
  centrifugalStrength: 0.42,
  steerRate: 2.1,
  steerEaseRate: 8, // how fast steer input eases toward the key target
  playerXMax: 2.6,
}

// Hold-to-drift: rotate into a slide, scrub a little speed, and get a small
// exit boost on release if the slide was sharp enough.
export const DRIFT = {
  minSteer: 0.3,
  minSpeedPercent: 0.35,
  angleTargetFactor: 0.55, // driftAngle target = steer * this
  angleEaseRate: 4,
  lateralSteerFactor: 0.55, // extra playerX slide while drifting
  speedScrub: 0.35, // fraction of `friction` bled off while drifting
  exitAngleThreshold: 0.22, // |driftAngle| needed on release to earn a boost
  exitMinSpeedPercent: 0.3,
  boostDuration: 0.8, // seconds
  boostAccelFactor: 0.7,
  settleEaseRate: 6, // how fast driftAngle relaxes back to 0 off-drift
}

// Roadside pillars/stones, placed deterministically by segment index so the
// track is identical every run (no per-segment randomness).
export const ROADSIDE = {
  pillarModulo: 9,
  pillarRemainderLeft: 3,
  pillarRemainderRight: 7,
  stoneModuloA: 13,
  stoneRemainderA: 5,
  stoneModuloB: 11,
  stoneRemainderB: 8,
  pillarOffsetLeft: -1.45,
  pillarOffsetRight: 1.45,
  stoneOffsetA: -2.3,
  stoneOffsetB: 2.4,
  pillarHeightFraction: 0.9, // of the road's projected half-width at that point
  pillarWidthFraction: 0.13,
  stoneHeightFraction: 0.22,
  stoneWidthFraction: 0.3,
  orbPulseRate: 0.002, // rad/ms
}

// Background hill silhouettes, drawn in screen space (not projected).
export const PARALLAX = {
  horizonFraction: 0.55, // sky/ground split, fraction of canvas height
  farRidgeYFraction: 0.552,
  farRidgeAmp: 60,
  farRidgeRate: 0.35,
  farRidgeSeedMul: 1.0,
  nearRidgeYFraction: 0.553,
  nearRidgeAmp: 34,
  nearRidgeRate: 0.7,
  nearRidgeSeedMul: 1.7,
  skewRate: 2.2, // how fast the ridge skew accumulates from curve*speedPercent
  ridgeStepPx: 12, // sampling step along x when building the ridge silhouette
  ridgeWaveFreq: 0.008,
  vignetteInnerRadiusFraction: 0.35,
  vignetteOuterRadiusFraction: 0.95,
}

// The placeholder vector-drawn chassis (src/engine/car.js). Only the values
// that affect feel/thresholds live here — the silhouette's exact shape is
// throwaway geometry that goes away once real sprite art lands.
export const CAR = {
  widthFraction: 0.22, // of canvas width
  maxWidthPx: 210,
  heightFraction: 0.5, // of car width
  groundYFraction: 0.7, // cy = height - carHeight * this
  steerRotationFactor: 0.10, // body rotation = steer * this + driftAngle
  steerLateralShiftFraction: 0.10, // body x-shift = steer * carWidth * this
  idleSwayAmplitude: 0.004,
  idleSwayRate: 0.02, // rad/ms
  driftDustThreshold: 0.12, // |driftAngle| beyond which dust particles show
  glowTrailThreshold: 0.15, // speedPercent above which the rear glow shows
  intakePulseBase: 0.7,
  intakePulseAmplitude: 0.3,
  intakePulseRate: 0.004, // rad/ms
}

export const HUD = {
  panelLeft: { x: 12, y: 12, w: 150, h: 58, r: 10 },
  panelRight: { marginRight: 192, y: 12, w: 180, h: 74, r: 10 },
  speedFont: 'bold 26px Georgia',
  labelFont: '13px Georgia',
  lapFont: '15px Georgia',
  speedTextOffset: { x: 14, y: 36 },
  labelTextOffset: { x: 70, y: 36 },
  lapLineOffsets: [{ x: 14, y: 24 }, { x: 14, y: 44 }, { x: 14, y: 64 }],
  speedDivisor1: 60,
  speedDivisor2: 2.2,
}

export const CREATURE_STAT_RANGES = {
  spd: [10, 100],
  atk: [10, 100],
  def: [10, 100],
  hp: [50, 200],
}
