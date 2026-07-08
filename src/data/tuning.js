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

// Identifies this course in localStorage best-time records. Bump/rename
// when a genuinely different course is added so its records don't collide.
// Defined above RACE so the practice/trial configs can reference it.
export const TRACK_ID = 'trial-circuit-1'

// Speeds/accelerations are in world units/sec (and /sec^2) — scaled against
// ROAD.segmentLength so "maxSpeed" means "segments crossed per second".
export const RACE = {
  // 'race': a lapCount-lap competition against the AI rivals, ending in a
  // results screen with placement. 'timetrial': the original endless-lap
  // mode (no finish, no placement) — flip this to fall back to it without
  // deleting any race-mode code.
  mode: 'race',

  // Session framing (structural only — no narrative content lives in code):
  //  'practice' — player-selectable difficulty / rival count / track, read
  //               from the RACE.practice config below. This is the single
  //               place the upcoming Practice setup screen will write choices.
  //  'trial'    — fixed per-circuit settings for the future story path, read
  //               from RACE.trial. A placeholder only; Trial Circuit content
  //               (which circuits, their settings, their story) is resolved
  //               separately from the Story Bible, never invented here.
  raceMode: 'practice',
  maxRivalCount: 8, // hard ceiling the grid + palettes + lane offsets support
  // Practice-mode player choices. difficulty keys into DIFFICULTY; rivalCount
  // is clamped to [1, maxRivalCount]; trackId keys the save records.
  practice: { difficulty: 'Cadet', rivalCount: 3, trackId: TRACK_ID },
  // Trial-mode fixed settings (placeholder — same baseline as practice until
  // real circuits are authored). Structure matches practice so the resolver
  // treats them identically.
  trial: { difficulty: 'Cadet', rivalCount: 3, trackId: TRACK_ID },
  // Effective rival count, resolved from whichever config raceMode selects —
  // the SINGLE source createOpponents and the starting grid both read. Never
  // hardcode a rival count anywhere else.
  get rivalCount() {
    return Math.max(1, Math.min(RACE.maxRivalCount, activeRaceConfig().rivalCount))
  },

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
// player does, so combat is symmetric.
//
// Rival COUNT comes from RACE.rivalCount (a single resolved source, 1–8),
// and each rival's top-speed fraction / corner-easing / rubber-band /
// combat aggression come from the active DIFFICULTY tier — NOT from here.
// This block holds only the count-independent, difficulty-independent
// physics shared by every tier and field size. laneOffsets and
// colors.js OPPONENT_PALETTES both provide RACE.maxRivalCount (8) entries.
export const OPPONENTS = {
  // Distinct base racing lines (same units as playerX), one per rival index
  // up to maxRivalCount. First three preserved from the original 3-rival
  // field so nothing regresses.
  laneOffsets: [-0.55, 0, 0.55, -0.82, 0.82, -0.3, 0.3, -0.68],
  laneWanderAmplitude: 0.18, // how far an opponent drifts off its base line
  laneWanderRate: 0.15, // wander cycles/sec; per-rival phase offset keeps them from syncing
  laneBound: 0.95, // opponents never steer past this |x| — keeps them on-road
  steerEaseRate: 3, // how fast an opponent's lateral position eases toward its lane target
  leanNormalizer: 1.5, // divides lateral velocity to derive the visual lean angle
  leanEaseRate: 6,
  curveEaseThreshold: 1.2, // |curve| beyond which opponents ease off speed (severity is per-difficulty)
  accel: 2200,
  brake: 2600,
  // Gentle rubber-banding geometry (the GAPS at which it engages). The
  // STRENGTHS live per-difficulty (DIFFICULTY[*].rubberBand) so higher tiers
  // can stop leading rivals from easing up — a main reason lower tiers feel
  // easy. Nudges an opponent's target speed based on its gap to the player.
  rubberBand: {
    catchUpGap: 1800, // world units behind the player before a trailing opponent speeds up
    backOffGap: 1800, // world units ahead of the player before a leading opponent eases off
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

// Difficulty as pure data, ahead of any selection UI. Three named tiers; the
// active one is chosen by the race config (see activeDifficulty). Each tier
// bundles the four levers that make a field easy or hard:
//
//   speedFractions   — per-rival top speed as a fraction of RACE.maxSpeed,
//                      indexed by rivalIndex (maxRivalCount entries; fewer
//                      rivals use the first N). Values >= 1.0 let a rival
//                      out-run a player who is merely holding full throttle.
//   curveEaseStrength— fraction of speed a rival sheds at max corner
//                      severity (with OPPONENTS.curveEaseThreshold). LOWER =
//                      carries more speed through corners = harder.
//   rubberBand       — catch-up / back-off strengths (gaps live in
//                      OPPONENTS.rubberBand). Higher tiers cut backOff toward
//                      0 so a LEADING rival never eases up for the player —
//                      the single biggest reason low tiers feel easy.
//   combat           — range/cooldown SCALES on the shared COMBAT values.
//                      Applied symmetrically to every racer (player included,
//                      per CLAUDE.md COMBAT DESIGN) so a tier sets the whole
//                      field's attack tempo, never a one-sided handicap.
//
// Cadet reproduces the pre-difficulty values EXACTLY, so the default
// (practice / Cadet) is a no-op relative to the old game.
export const DIFFICULTY = {
  Cadet: {
    label: 'Cadet',
    speedFractions: [0.82, 0.88, 0.94, 0.80, 0.86, 0.92, 0.84, 0.90],
    curveEaseStrength: 0.35,
    rubberBand: { catchUpStrength: 0.18, backOffStrength: 0.12, maxAdjustFraction: 0.22 },
    combat: { rangeScale: 1.0, cooldownScale: 1.0 },
  },
  Racer: {
    label: 'Racer',
    speedFractions: [0.90, 0.96, 1.00, 0.88, 0.94, 0.98, 0.91, 0.97],
    curveEaseStrength: 0.26,
    rubberBand: { catchUpStrength: 0.14, backOffStrength: 0.06, maxAdjustFraction: 0.18 },
    combat: { rangeScale: 1.12, cooldownScale: 0.82 },
  },
  Ace: {
    label: 'Ace',
    // Several rivals at/above player max (1.0): a passive player is beaten,
    // an active one is genuinely pressured.
    speedFractions: [0.99, 1.03, 1.06, 0.98, 1.02, 1.05, 1.00, 1.04],
    curveEaseStrength: 0.18,
    // backOff 0: leading Ace rivals never slow down to let the player back in.
    rubberBand: { catchUpStrength: 0.10, backOffStrength: 0.0, maxAdjustFraction: 0.14 },
    combat: { rangeScale: 1.25, cooldownScale: 0.65 },
  },
}

// --- Active-config resolvers: the single read path for count/difficulty/track.
// raceMode picks the practice or trial config; everything downstream reads
// through these so the future setup screen only has to write RACE.practice.

export function activeRaceConfig() {
  return RACE.raceMode === 'trial' ? RACE.trial : RACE.practice
}

export function activeDifficulty() {
  return DIFFICULTY[activeRaceConfig().difficulty] || DIFFICULTY.Cadet
}

export function activeTrackId() {
  return activeRaceConfig().trackId
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

  // Small always-on audio indicator (speaker glyph, with a slash when
  // muted), tucked below the speed panel. Toggled with the M key.
  mute: { x: 20, y: 84, size: 15 },
}

export const RESULTS = {
  bannerDurationMs: 2200, // how long the post-lap banner stays on screen
}

// On-screen touch controls for tablet/phone (see screens/RaceTrack.jsx).
// Shown ONLY on touch/coarse-pointer devices — desktop keyboard play draws
// nothing and behaves identically. The left thumbstick feeds the SAME
// analog steerTarget the keyboard sets (so it reuses the existing easing +
// physics), and the right-hand buttons map onto the same up/down/drift
// flags. Everything sizes/positions in CSS px; opacity keeps the road
// readable underneath. All layout lives here — no magic numbers in the
// component/CSS.
export const CONTROLS = {
  // Which right-thumb layout to present. Both kids can try each:
  //  'manual'   — steering joystick + separate accelerate/brake + drift button.
  //  'autoAccel'— car accelerates on its own; joystick steers; ONE combined
  //               brake+drift button (release = resume accelerating).
  touchScheme: 'manual',

  // The whole control layer is semi-transparent at rest and brightens the
  // element being pressed, so it never obscures the road mid-race.
  restOpacity: 0.42,
  pressedOpacity: 0.88,

  // Left-thumb steering joystick, anchored bottom-left. The nub travels up
  // to (baseSize-nubSize)/2 px from center; that full travel maps to ±1.
  joystick: {
    marginX: 26, // px in from the left edge
    marginY: 30, // px up from the bottom edge
    baseSize: 138, // outer ring diameter (px) — sized for a real thumb
    nubSize: 66, // draggable nub diameter (px)
    deadzone: 0.1, // |axis| below this reads as centered (no twitch at rest)
  },

  // Right-thumb throttle + drift cluster, anchored bottom-right. In 'manual'
  // all three buttons show (accel is the largest, reached by the resting
  // thumb); in 'autoAccel' only the combined brake+drift button shows.
  buttons: {
    marginX: 26, // px in from the right edge
    marginY: 30, // px up from the bottom edge
    gap: 16, // px between adjacent buttons
    accelSize: 100, // accelerate button diameter (manual)
    brakeSize: 84, // brake button diameter (manual) / combined button (autoAccel)
    driftSize: 84, // drift button diameter (manual)
  },
}

// Walkable hub scene (see screens/HubScene.jsx). Phase 1 prototype: a flat
// test area the player walks around, a few collision obstacles, and one
// interaction zone ("Trial Gate", a placeholder label) that opens the
// existing Practice setup screen. EVERY number the scene uses lives here.
//
// Coordinates are a fixed LOGICAL world (HUB.world); the canvas fits this box
// and letterboxes any leftover space, so obstacle/gate/player positions are
// deterministic regardless of the actual window size — the same
// fit-to-a-logical-size approach the racer uses, which also keeps the verify
// script's geometry checks stable.
export const HUB = {
  world: { width: 960, height: 600 }, // logical play field, px
  groundColor: '#FFF8E7', // cream play field (palette: Cream)
  letterboxColor: '#E8DBB5', // slightly deeper parchment behind the field

  player: {
    start: { x: 480, y: 360 }, // feet-anchor start, logical px (clear of gate + obstacles)
    speed: 170, // walk speed, logical px/sec
    drawScale: 2.1, // sprite scale: a 64px sheet frame draws at 64*this logical px
    animFrameMs: 135, // ms per walk frame (Mana Seed page-1 default cadence)
    moveDeadzone: 0.06, // input magnitude below this reads as standing still
    // Feet-based collision box (NOT the full sprite height): centered on the
    // feet anchor in x, rising `height` px above the anchor in y.
    feet: { width: 24, height: 14 },
  },

  // Mana Seed "char_a_p1" sheet facts (from the pack's guide, confirmed on the
  // actual sheet): a 512px page = 8x8 grid of 64px frames. Idle/stand is
  // column 0 of the top four rows; walk is rows 4-7, columns 0-5 (6 frames).
  // Row order (both blocks): 0 down, 1 up, 2 right, 3 left.
  sprite: {
    frameSize: 64,
    columns: 8,
    idleCol: 0,
    walkFrames: 6,
    idleRow: { down: 0, up: 1, right: 2, left: 3 },
    walkRow: { down: 4, up: 5, right: 6, left: 7 },
  },
  // The player look is now DATA: a serializable avatar descriptor (see
  // data/avatarManifest.js + data/avatarPalettes.js) rendered by the
  // palette-swap compositor (engine/avatarComposite.js). Draw order is still
  // body -> outfit -> hair (Mana Seed 0bas < 1out < 4har), baked into the
  // composited sheet, so this scene just draws the one cached sheet.

  // Placeholder collision obstacles (drawn rectangles, no art), logical px.
  obstacles: [
    { x: 150, y: 150, w: 120, h: 92 },
    { x: 640, y: 140, w: 156, h: 74 },
    { x: 236, y: 402, w: 96, h: 128 },
    { x: 688, y: 420, w: 132, h: 104 },
  ],
  obstacleFill: '#8B6914', // Brass
  obstacleEdge: '#5C3A1E', // Walnut outline

  // Interaction zones — generic DATA (not one-offs) so new zones are just new
  // entries. Trigger = player feet within `radius`; `action` picks what the
  // prompt opens. `label`s are placeholders per the brief — no invented
  // location/lore names ("Trial Gate", "Mirror" are stand-ins to be renamed
  // when hub locations are resolved from the story side).
  zones: [
    { id: 'trialGate', x: 480, y: 118, radius: 64, label: 'Trial Gate', action: 'practice' },
    { id: 'mirror', x: 150, y: 305, radius: 58, label: 'Mirror', action: 'avatar' },
  ],
  zoneFill: 'rgba(196, 154, 60, 0.22)', // Aged Gold, translucent
  zoneRing: '#C49A3C', // Aged Gold
  zoneLabelFont: "20px 'Cinzel', Georgia, serif",
  zoneLabelColor: '#5C3A1E',

  // Avatar customization preview (screens/AvatarScreen.jsx): the composited
  // character walks in place, slowly cycling facings.
  avatar: {
    previewScale: 3.2, // sprite draw scale in the preview canvas
    previewAnimFrameMs: 150, // ms per walk frame in the preview
    facingCycleMs: 1500, // ms each facing holds before rotating
    facingOrder: ['down', 'right', 'up', 'left'],
  },

  // Persist-on-move throttle: how often (ms) the hub writes the player's
  // position to localStorage while walking, so a reload restores it without
  // writing every frame.
  saveThrottleMs: 750,
}

export const CREATURE_STAT_RANGES = {
  spd: [10, 100],
  atk: [10, 100],
  def: [10, 100],
  hp: [50, 200],
}

// Synthesized audio (see engine/audio.js). Warm and musical, wholesome —
// the hovercraft read as tuned resonance machines, never harsh engines.
// Every level, frequency, and envelope time lives here so the whole sound
// palette can be tuned without touching the audio engine. Levels are linear
// gains (0..1); frequencies in Hz; times in seconds.
export const AUDIO = {
  master: 0.45, // overall output level (before mute)
  sfxGain: 0.9, // one-shots + drift channel
  ambientGain: 0.8, // continuous beds (engine hum, wind, rival hums)
  paramGlide: 0.08, // time constant (s) for continuous params easing toward their target
  muteGlide: 0.05, // time constant (s) for the master mute fade
  raceEndFadeSec: 1.5, // engine/wind/rival/music fade-out as the results screen appears

  // Player hover-engine hum: two slightly-detuned oscillators (a slow
  // "resonance" beat) plus a sub an octave down for body. Pitch and gain
  // ride g.speed continuously — idle purr on the grid up to a musical
  // high-speed whine (never a screech).
  engine: {
    waveform: 'triangle',
    idleFreq: 66, // grid-idle purr
    maxFreq: 176, // top-speed whine (~1.4 octaves up — still musical)
    detuneCents: 7, // between the two main oscillators
    subRatio: 0.5, // sub oscillator an octave below
    subMix: 0.5, // sub level relative to the main pair
    idleGain: 0.05,
    maxGain: 0.15,
    freqCurve: 0.8, // pitch = idle..max by speedPct^curve (<1 ramps in early)
  },
  // Rival hums: same character, quieter, and faded by proximity so a
  // rival alongside you is audible but never drowns your own machine.
  rivalEngine: {
    waveform: 'triangle',
    idleFreq: 70,
    maxFreq: 168,
    detuneCents: 9,
    maxGain: 0.05, // at closest approach; scales to 0 by rangeWorld
    rangeWorld: 2600, // world-unit gap beyond which a rival hum is silent
  },
  // Wind rush: lowpass-filtered noise whose cutoff and gain rise with
  // speed. Quiet at a crawl, present but soft at speed.
  wind: {
    minCutoff: 240,
    maxCutoff: 2400,
    q: 0.6,
    minGain: 0.0,
    maxGain: 0.11,
    gainCurve: 1.5, // stays low until genuinely fast (speedPct^curve)
  },
  // Drift sizzle: bandpassed noise gated on while drifting, with a soft
  // attack/release so it swells and fades rather than clicking.
  drift: {
    cutoff: 1600,
    q: 1.8,
    gain: 0.09,
    attack: 0.04,
    release: 0.18,
  },
  // Boost surge: a brief rising tone on a successful drift-exit boost.
  boost: {
    waveform: 'sine',
    freqStart: 300,
    freqEnd: 720,
    duration: 0.3,
    gain: 0.12,
  },
  // Combat one-shots. A resonance "zap" as a creature fires, and a softer
  // impact thump on the target — deeper and a touch longer when the player
  // is the one hit, so it feels personal without being punishing.
  combat: {
    // Sampled attack/damage pools are primary (see src/data/sounds.js); these
    // flags keep the synth as a fallback (empty pool / clip not yet loaded)
    // without deleting it. Flip false to force pure synth.
    useSampledAttack: true,
    useSampledDamage: true,
    zap: { waveform: 'triangle', freqStart: 680, freqEnd: 240, duration: 0.2, gain: 0.13, detuneCents: 12 },
    hit: { waveform: 'sine', freqStart: 160, freqEnd: 90, duration: 0.16, gain: 0.14 },
    playerHit: { waveform: 'sine', freqStart: 130, freqEnd: 66, duration: 0.28, gain: 0.18 },
  },
  // Race music (sample layer). Independent volume; the clip isn't seamlessly
  // loopable, so audio.js fades it out `fadeOut` seconds before its end and
  // starts a fresh instance (fading in over `fadeIn`) so the fades overlap
  // with no dead gap.
  music: { volume: 0.32, fadeIn: 1.2, fadeOut: 2.0 },
  // Countdown: three warm beeps, then a brighter major chord on GO.
  countdown: {
    beep: { waveform: 'triangle', freq: 430, duration: 0.14, gain: 0.16 },
    go: { waveform: 'triangle', freqs: [523.25, 659.25, 783.99], duration: 0.55, gain: 0.14 }, // C-E-G
  },
  // UI blips: a rising two-note flourish on the results screen, a short
  // single note on Race Again.
  ui: {
    results: { waveform: 'triangle', freqs: [523.25, 783.99], noteGap: 0.12, duration: 0.3, gain: 0.13 },
    blip: { waveform: 'triangle', freq: 620, duration: 0.09, gain: 0.12 },
  },
  // Sample layer (scaffold — see src/data/sounds.js). Each played sample
  // gets a small random pitch shift so repeats don't sound mechanical.
  sample: { pitchVariation: 0.1, gain: 0.9 },
}
