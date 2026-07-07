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
  // Start/finish marker at segment 0: a solid gold/brass road band (see
  // COLORS.finishLine) plus a pillar-and-orb pair at each edge, built the
  // same way as track.js's other deterministic roadside sprites so it
  // projects/clips through the existing mechanism — no new draw path.
  finishLine: {
    widthSegments: 2,
    pillarOffsetLeft: -1.6,
    pillarOffsetRight: 1.6,
  },
}

// Speeds/accelerations are in world units/sec (and /sec^2) — scaled against
// ROAD.segmentLength so "maxSpeed" means "segments crossed per second".
export const RACE = {
  // 'race': a lapCount-lap competition against the 3 AI rivals, ending in a
  // results screen with placement. 'timetrial': the original endless-lap
  // mode (no finish, no placement) — flip this to fall back to it without
  // deleting any race-mode code.
  mode: 'race',
  lapCount: 3,
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
  // Starting grid: every racer (player + however many are in OPPONENTS)
  // spawns AHEAD of the line at a small positive position — never a
  // wrapped negative one — so the laps*trackLength+pos progress metric
  // starts near zero for everyone and rubber-banding has no artificial
  // gap to "catch up" across at the start. Slots fill front-to-back,
  // lanesPerRow at a time; racer index 0 (the player) lands in the first
  // (rearmost) row. Scales automatically to however many entries
  // OPPONENTS ends up with — no hardcoded racer count.
  startGrid: {
    basePos: 120, // world units ahead of the line for the rearmost row
    rowSpacing: 220, // extra world units ahead, per row further forward
    lanesPerRow: 2,
    laneOffsets: [-0.4, 0.4], // same units as playerX/opponent x
  },
  // Countdown shown on every race start and every Race Again (race mode
  // only — time-trial keeps its instant start). All input and all racers
  // freeze until the last beat elapses, then everyone releases together.
  countdown: {
    beats: ['3', '2', '1', 'GO!'],
    beatDurationMs: 1000,
  },
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

// AI rival racers, drawn with the same placeholder chassis as the player,
// projected like roadside sprites so they scale/clip against hills
// correctly. Speed AI, lane wander, and a light player-opponent bump here;
// their creatures also auto-attack via the shared rules in COMBAT (see
// engine/combat.js) — every rival carries the same combat state fields the
// player does, so combat is symmetric. Racer count is
// always derived from these arrays' lengths (baseSpeedFractions.length),
// never hardcoded — adding an 8th racer is a tuning-data change (add an
// entry here, a lane offset, a palette in colors.js), not a refactor.
export const OPPONENTS = {
  // Base speed as a fraction of RACE.maxSpeed, spread so each rival feels
  // distinct without being unbeatable (fastest) or trivial (slowest).
  baseSpeedFractions: [0.82, 0.88, 0.94],
  laneOffsets: [-0.55, 0, 0.55], // distinct base racing lines, same units as playerX
  laneWanderAmplitude: 0.18, // how far an opponent drifts off its base line
  laneWanderRate: 0.15, // wander cycles/sec; per-rival phase offset keeps them from syncing
  laneBound: 0.95, // opponents never steer past this |x| — keeps them on-road
  steerEaseRate: 3, // how fast an opponent's lateral position eases toward its lane target
  leanNormalizer: 1.5, // divides lateral velocity to derive the visual lean angle
  leanEaseRate: 6,
  curveEaseThreshold: 1.2, // |curve| beyond which opponents ease off speed
  curveEaseStrength: 0.35, // fraction of speed shed at max curve severity
  accel: 2200,
  brake: 2600,
  // Gentle rubber-banding: nudges an opponent's target speed based on the
  // gap to the player so races stay close without feeling magnetic.
  rubberBand: {
    catchUpGap: 1800, // world units behind the player before a trailing opponent speeds up
    backOffGap: 1800, // world units ahead of the player before a leading opponent eases off
    catchUpStrength: 0.18,
    backOffStrength: 0.12,
    maxAdjustFraction: 0.22,
  },
  collision: {
    rangeWorld: 260, // pos gap (world units) within which player-opponent contact can trigger
    rangeLane: 0.5, // lane gap within which contact can trigger
    speedPenalty: 0.35, // fraction of speed shed by both parties on hit
    nudgeLane: 0.35, // total lateral push-apart, split between the two
    cooldown: 0.4, // seconds before the same opponent can trigger another hit
  },
  // Camera-space depth (see opponents.js computePlayerDepth); opponents are
  // not drawn at or behind this z. Kept well below a full segment so the
  // near-zone direct-projection branch only engages right at the camera.
  cameraNearPlane: ROAD.segmentLength * 0.5,
}

// Minimal auto-attack combat — the "feel pass" of CLAUDE.md's COMBAT
// DESIGN. ONE generic attack: no creature types, no HP, no stat
// multipliers yet (those layer on next). Every racer's bonded creature
// auto-fires at the nearest racer within range (ahead OR behind within
// attackRangeWorld AND within attackRangeLane laterally), or on a bump,
// then waits out a per-creature cooldown. Identical rules for the player
// and every rival, including rival-vs-rival when bunched. Race mode only,
// after GO — never during the countdown, never in time-trial.
export const COMBAT = {
  attackRangeWorld: 700, // |pos gap| (world units) within which a target can be attacked
  attackRangeLane: 0.7, // |lane gap| within which a target can be attacked; wider than collision.rangeLane so a bump is always inside attack range too
  cooldown: 3.0, // seconds a creature must wait between its own attacks
  // Effect on the victim: a firm-but-recoverable dip, never a spinout or
  // stop (wholesome — no elimination, no explosions-as-destruction).
  hitSpeedPenalty: 0.15, // fraction of speed the target sheds when hit
  hitWobbleDuration: 0.6, // seconds of steering wobble inflicted on the target
  wobbleFrequency: 6, // wobble oscillations/sec
  wobbleLateralAmp: 3.2, // peak lateral velocity (lane units/sec) the wobble injects
  wobbleAngleAmp: 0.28, // peak chassis roll (radians) the wobble shows
  // Readability cues — the whole point, since nobody presses a button.
  hitFlashDuration: 0.4, // seconds the victim chassis flashes
  edgePulseDuration: 0.7, // seconds the player-only screen-edge glow lasts (only when the PLAYER is the victim)
  edgePulseAlpha: 0.85, // peak alpha of the player-hit screen-edge glow (kept high so it's unmissable against the warm palette)
  edgePulseInnerFraction: 0.26, // transparent core radius, fraction of the smaller screen dimension (keeps road/HUD readable)
  edgePulseOuterFraction: 0.7, // glow reaches full strength by this fraction of the larger screen dimension
  telegraphDuration: 0.3, // seconds the resonance bolt takes to travel attacker -> target
  telegraphCoreFraction: 0.16, // bolt head radius, as a fraction of the target car width
  telegraphMinCorePx: 5, // ...floored to this many px so a distant bolt still reads
  flashGlowFraction: 0.62, // hit-flash glow radius, fraction of car width
  chargeGlowFraction: 0.34, // "cooldown ready" aura radius, fraction of car width
  chargePulseRate: 0.004, // rad/ms breathing rate of the ready aura
  chargeAlpha: 0.22, // peak alpha of the subtle ready aura
}

// Named curve strengths reused across track sections; sign convention:
// negative = left, positive = right (see track.js).
export const CURVE = {
  EASY_LEFT: -2.4,
  HILLTOP_RIGHT: 4.6,
  HAIRPIN_LEFT: -3.0,
}

// Identifies this course in localStorage best-time records. Bump/rename
// when a genuinely different course is added so its records don't collide.
export const TRACK_ID = 'trial-circuit-1'

// The course layout: each entry is one addRoad() call in track.js — segment
// counts for the ease-in/hold/ease-out phases, the curve strength, and the
// elevation change (in segment-lengths) across the whole span.
export const TRACK_LAYOUT = [
  { enter: 25, hold: 25, leave: 25, curve: 0, dy: 0 }, // start/finish straight
  { enter: 30, hold: 50, leave: 30, curve: CURVE.EASY_LEFT, dy: 0 }, // gentle left sweeper
  { enter: 20, hold: 20, leave: 20, curve: 0, dy: 22 }, // climb
  { enter: 25, hold: 40, leave: 25, curve: CURVE.HILLTOP_RIGHT, dy: 8 }, // curve along the hilltop
  { enter: 20, hold: 20, leave: 20, curve: 0, dy: -30 }, // descend back to base height
  { enter: 30, hold: 60, leave: 30, curve: CURVE.HAIRPIN_LEFT, dy: 0 }, // sweeping hairpin
  { enter: 20, hold: 40, leave: 20, curve: 0, dy: 0 }, // straight home
]

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
  groundYFraction: 0.7, // pivotY = height - carHeight * this
  // Hull/fin bottom edge, of carHeight below the pivot (see drawChassis's
  // hull rect and fin points, which both land here) — this is the chassis's
  // true ground-contact row, used as the shared anchor for the player's own
  // placement and for zPlayer (see car.js getPlayerAnchor).
  chassisBottomFraction: 0.34,
  // A hill-crest clip boundary is recomputed every frame from projected
  // segment heights, so it can sit a sub-pixel's width above a car's own
  // ground row — without slack the bottom row of the chassis flickers in
  // and out as that boundary jitters. 2px of slack absorbs the jitter
  // without hiding genuine crest occlusion (which clips well above the car).
  groundClipEpsilonPx: 2,
  steerRotationFactor: 0.10, // body rotation = steer * this + driftAngle
  steerLateralShiftFraction: 0.10, // body x-shift = steer * carWidth * this
  idleSwayAmplitude: 0.004,
  idleSwayRate: 0.02, // rad/ms
  driftDustThreshold: 0.12, // |driftAngle| beyond which dust particles show
  driftDustParticleCount: 3,
  driftDustJitterRate: 0.03, // rad/ms
  driftDustJitterAmplitudeFraction: 0.12, // of carWidth
  glowTrailThreshold: 0.15, // speedPercent above which the rear glow shows
  intakePulseBase: 0.7,
  intakePulseAmplitude: 0.3,
  intakePulseRate: 0.004, // rad/ms
  // Soft ground shadow drawn under every vehicle at its ground-contact
  // point, before the chassis, so hovercraft still read as touching the
  // road. Kept low-alpha — a hint of contact, not a night scene.
  shadow: {
    widthFraction: 0.62, // of the car's own rendered width
    heightFraction: 0.32, // ellipse squash, of the shadow's own width
    alpha: 0.22,
  },
}

export const HUD = {
  // Speed gauge — shown in both modes, unchanged position.
  panelLeft: { x: 12, y: 12, w: 150, h: 58, r: 10 },
  speedFont: 'bold 26px Georgia',
  labelFont: '13px Georgia',
  speedTextOffset: { x: 14, y: 36 },
  labelTextOffset: { x: 70, y: 36 },
  speedDivisor1: 60,
  speedDivisor2: 2.2,

  // Time-trial only: the original time-focused panel (current/last/best
  // lap time), unchanged from before race mode existed.
  panelRight: { marginRight: 192, y: 12, w: 180, h: 74, r: 10 },
  lapFont: '15px Georgia',
  lapLineOffsets: [{ x: 14, y: 24 }, { x: 14, y: 44 }, { x: 14, y: 64 }],

  // Race mode: place-first hierarchy — the opposite emphasis of
  // time-trial's HUD. Current place is the largest element on screen (a
  // glance mid-drift should be enough to read it), lap count sits directly
  // beneath it at secondary size, and lap/total times shrink to a small
  // corner readout since they matter far less turn-to-turn than "am I
  // winning right now."
  racePlace: {
    y: 84, // baseline, horizontally centered
    font: "bold 72px 'Cinzel', Georgia, serif",
  },
  raceLapCount: {
    offsetY: 32, // below the place baseline
    font: 'bold 22px Georgia',
  },
  raceTimes: {
    marginRight: 138, y: 12, w: 126, h: 58, r: 8,
    font: '11px Georgia',
    lineOffsets: [{ x: 10, y: 20 }, { x: 10, y: 34 }, { x: 10, y: 48 }],
  },
}

export const RESULTS = {
  bannerDurationMs: 2200, // how long the post-lap banner stays on screen
}

export const CREATURE_STAT_RANGES = {
  spd: [10, 100],
  atk: [10, 100],
  def: [10, 100],
  hp: [50, 200],
}
