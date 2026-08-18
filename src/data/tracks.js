// Tracks as plain serializable data — one object per course. Each track
// describes SHAPE (layout) and LOOK (palette, roadside prop set/density);
// physics/feel constants that apply to every track (curve easing default,
// sprite sizing, camera/road geometry) stay in tuning.js — see
// TRACK_FEEL/ROAD/ROADSIDE there.
//
// Layout entries (drawn in order) are one of:
//   { type: 'straight', length }
//   { type: 'hill', dy, length }                      — pure elevation change
//   { type: 'curve', dir: 'left'|'right', strength, length, dy?, enter?, leave? }
// `length` is the section's total segment count. `enter`/`leave` (curve
// only) override TRACK_FEEL's default ease-in/out split — the original
// course's three curves carry their exact original values so its shape
// stays byte-identical; new tracks can just omit them.
//
// No track names/themes with narrative meaning — labels are generic and
// descriptive (Story Bible-blocked content stays out of code entirely).
import { TRACK_ID, activeTrackId } from './tuning.js'
import { COLORS, ROAD_BASE } from '../engine/colors.js'

export const TRACKS = [
  {
    id: TRACK_ID,
    label: 'Circuit One',
    lapCount: 3,
    // Scaled 2.5x from the original hand-authored lengths (track length/feel
    // pass) so a lap actually feels like a lap; dy/strength unchanged, so
    // hills read as proportionally gentler climbs/descents over more
    // distance (elevationSmoothing in tuning.js/track.js handles the rest
    // of the "no jarring hill skip" work).
    layout: [
      { type: 'straight', length: 188 }, // start/finish straight
      { type: 'curve', dir: 'left', strength: 2.4, length: 275, enter: 75, leave: 75 }, // gentle sweeper
      { type: 'hill', dy: 22, length: 150 }, // climb
      { type: 'curve', dir: 'right', strength: 4.6, dy: 8, length: 225, enter: 63, leave: 63 }, // curve along the hilltop
      { type: 'hill', dy: -30, length: 150 }, // descend back to base height
      { type: 'curve', dir: 'left', strength: 3.0, length: 300, enter: 75, leave: 75 }, // sweeping hairpin
      { type: 'straight', length: 200 }, // straight home
    ],
    palette: {
      sky: COLORS.sky,
      grass: COLORS.grass,
      grassAlt: COLORS.grassAlt,
      rumble: COLORS.shoulder,
      road: ROAD_BASE,
      ridgeFar: '#7A5528', // warmer, more amber-brown for forest feel
      ridgeMid: '#634520',
      ridgeNear: '#523A18',
    },
    roadside: {
      pillarModulo: 9,
      pillarRemainderLeft: 3,
      pillarRemainderRight: 7,
      stoneModuloA: 13,
      stoneRemainderA: 5,
      stoneModuloB: 11,
      stoneRemainderB: 8,
      markerModulo: 17,
      markerRemainderLeft: 6,
      markerRemainderRight: 12,
      pillarOffsetLeft: -1.45,
      pillarOffsetRight: 1.45,
      stoneOffsetA: -2.3,
      stoneOffsetB: 2.4,
      markerOffsetLeft: -1.8,
      markerOffsetRight: 1.8,
    },
    // Boost pickups — instant-boost items placed on the track. Each entry is
    // a segment index and a lateral offset (lane units, same scale as playerX).
    // Spread roughly evenly across the lap, favoring straights + post-challenge
    // spots (wholesome, not punishing). See BOOST.pickup in tuning.js.
    pickups: [
      { segment: 100, offset: 0.3 },
      { segment: 350, offset: -0.4 },
      { segment: 580, offset: 0 },
      { segment: 820, offset: 0.5 },
      { segment: 1100, offset: -0.3 },
      { segment: 1350, offset: 0.2 },
    ],
  },
  {
    id: 'long-circuit-1',
    label: 'Long Circuit',
    // 2 laps, not 3 — this is by far the longest per-lap distance of the
    // five, so fewer laps keeps total race length sensible (see CLAUDE.md).
    lapCount: 2,
    // Long and flowing: gentle sweepers and gradual elevation, no hairpins.
    // Scaled 2.5x — 2250 segments, the longest single lap of the five.
    layout: [
      { type: 'straight', length: 250 },
      { type: 'curve', dir: 'left', strength: 1.8, length: 400 },
      { type: 'hill', dy: 15, length: 200 },
      { type: 'curve', dir: 'right', strength: 2.0, dy: 10, length: 350 },
      { type: 'straight', length: 250 },
      { type: 'hill', dy: -25, length: 200 },
      { type: 'curve', dir: 'left', strength: 1.6, length: 375 },
      { type: 'straight', length: 225 },
    ],
    // Warm golden plains — brighter/drier than Circuit One, obviously distinct.
    palette: {
      sky: [[0, '#4A2F1C'], [0.45, '#A87A30'], [0.8, '#E8C468'], [1, '#FFFDF5']],
      grass: '#727F52', // yellower grass
      grassAlt: '#6C7A48',
      rumble: 'rgba(190, 160, 75, 0.5)',
      road: [85, 62, 36],
      ridgeFar: '#9A7538', // golden ridges
      ridgeMid: '#82642A',
      ridgeNear: '#6A521F',
    },
    // Fewer props (larger modulo = sparser) — an open, flowing feel.
    // Brass arches for ceremonial gateway feel.
    roadside: {
      pillarModulo: 14,
      pillarRemainderLeft: 4,
      pillarRemainderRight: 10,
      stoneModuloA: 19,
      stoneRemainderA: 6,
      stoneModuloB: 17,
      stoneRemainderB: 11,
      archModulo: 23,
      archRemainderLeft: 8,
      archRemainderRight: 15,
      pillarOffsetLeft: -1.45,
      pillarOffsetRight: 1.45,
      stoneOffsetA: -2.3,
      stoneOffsetB: 2.4,
      archOffsetLeft: -2.0,
      archOffsetRight: 2.0,
    },
    // Boost pickups — spaced for the long, flowing layout (2250 segments).
    pickups: [
      { segment: 180, offset: 0.2 },
      { segment: 480, offset: -0.3 },
      { segment: 820, offset: 0.4 },
      { segment: 1180, offset: 0 },
      { segment: 1550, offset: -0.4 },
      { segment: 1920, offset: 0.3 },
      { segment: 2100, offset: -0.2 },
    ],
  },
  {
    id: 'winding-circuit-1',
    label: 'Winding Circuit',
    lapCount: 3,
    // Tight and technical: sharp turns back to back, short straights.
    // Scaled 2.5x — 1263 segments, still the shortest of the five (fitting,
    // as the "tight" course) but now a real lap rather than a quick loop.
    // The one hill is an up-then-down bump (not a one-way climb) so its
    // net elevation change is 0: a closed lap's total elevation change
    // across its whole layout must sum to zero (it starts and ends at the
    // same point) — this track's original single one-way dy:10 climb never
    // came back down, a seam mismatch that predates this pass and was only
    // surfaced by the new finish-line banner rendering oddly right at the
    // lap seam on this and two other tracks (see Highland/Coastal below).
    // Splitting it into a real up/down bump fixes the seam AND keeps (in
    // fact sharpens) the crest this track's hardest air-time launch uses.
    layout: [
      { type: 'straight', length: 125 },
      { type: 'curve', dir: 'right', strength: 4.0, length: 175, enter: 38, leave: 38 },
      { type: 'curve', dir: 'left', strength: 4.5, length: 150, enter: 30, leave: 30 },
      { type: 'hill', dy: 10, length: 38 },
      { type: 'hill', dy: -10, length: 37 },
      { type: 'curve', dir: 'right', strength: 5.0, length: 200, enter: 38, leave: 38 },
      { type: 'straight', length: 100 },
      { type: 'curve', dir: 'left', strength: 4.2, length: 163, enter: 35, leave: 35 },
      { type: 'curve', dir: 'right', strength: 3.8, length: 150, enter: 35, leave: 35 },
      { type: 'straight', length: 125 },
    ],
    // Dense tight woods — deeper, darker greens, shadowy atmosphere.
    palette: {
      sky: [[0, '#2A1F15'], [0.45, '#5E4628'], [0.8, '#9B8560'], [1, '#F5EFE0']],
      grass: '#3F5530', // darker, denser forest green
      grassAlt: '#3A502B',
      rumble: 'rgba(120, 100, 50, 0.55)',
      road: [68, 55, 40],
      ridgeFar: '#4E5E3A', // dark wooded ridges
      ridgeMid: '#3F4D2E',
      ridgeNear: '#323D24',
    },
    // Denser props (smaller modulo = more frequent) — a packed, technical feel.
    // Trees for the forest/shaded environment.
    roadside: {
      pillarModulo: 6,
      pillarRemainderLeft: 2,
      pillarRemainderRight: 4,
      stoneModuloA: 7,
      stoneRemainderA: 3,
      stoneModuloB: 5,
      stoneRemainderB: 1,
      treeModulo: 8,
      treeRemainderLeft: 0,
      treeRemainderRight: 5,
      pillarOffsetLeft: -1.45,
      pillarOffsetRight: 1.45,
      stoneOffsetA: -2.3,
      stoneOffsetB: 2.4,
      treeOffsetLeft: -2.5,
      treeOffsetRight: 2.5,
    },
    // Boost pickups — tighter spacing for the short, technical circuit (1263 segments).
    pickups: [
      { segment: 80, offset: 0 },
      { segment: 280, offset: 0.4 },
      { segment: 480, offset: -0.3 },
      { segment: 720, offset: 0.2 },
      { segment: 980, offset: -0.4 },
      { segment: 1180, offset: 0.3 },
    ],
  },
  {
    id: 'highland-circuit-1',
    label: 'Highland Circuit',
    lapCount: 3,
    // Hills and turns: dramatically steeper climbs and descents for genuine
    // highland feel. Opening climb is 60 units over 110 segments (vs old 30
    // over 175 — much steeper), plus two more sharp climbs and matching drops.
    // Scaled 2.5x base length preserved at 1550 segments total. Net elevation
    // change: +60 +15 -40 +50 -85 = 0 (closed lap verified).
    layout: [
      { type: 'straight', length: 225 },
      { type: 'hill', dy: 60, length: 110 }, // steep opening climb
      { type: 'curve', dir: 'left', strength: 3.0, dy: 15, length: 260, enter: 65, leave: 65 }, // hilltop sweeper, still rising
      { type: 'hill', dy: -40, length: 110 }, // sharp descent
      { type: 'curve', dir: 'right', strength: 3.2, length: 300, enter: 75, leave: 75 }, // valley run
      { type: 'hill', dy: 50, length: 110 }, // second steep climb
      { type: 'curve', dir: 'left', strength: 2.6, dy: -85, length: 235, enter: 58, leave: 58 }, // plunging descent back to line
      { type: 'straight', length: 200 }, // run to finish
    ],
    // Grey stone highland — sage/grey-green grass, pale cool sky, stone-grey road.
    // Obviously cooler/stonier than forest or plains.
    palette: {
      sky: [[0, '#30291F'], [0.45, '#786D50'], [0.8, '#C2BA95'], [1, '#FEFBF2']],
      grass: '#727A68', // greyer sage
      grassAlt: '#6C7560',
      rumble: 'rgba(155, 155, 135, 0.5)',
      road: [92, 85, 74],
      ridgeFar: '#828670', // stone-grey ridges
      ridgeMid: '#6E7158',
      ridgeNear: '#5A5D48',
    },
    // Stone-heavy roadside (more stones than pillars) to match the highland look.
    // Verdigris markers add weathered character.
    roadside: {
      pillarModulo: 11,
      pillarRemainderLeft: 3,
      pillarRemainderRight: 8,
      stoneModuloA: 8,
      stoneRemainderA: 2,
      stoneModuloB: 10,
      stoneRemainderB: 6,
      markerModulo: 13,
      markerRemainderLeft: 5,
      markerRemainderRight: 9,
      pillarOffsetLeft: -1.45,
      pillarOffsetRight: 1.45,
      stoneOffsetA: -2.3,
      stoneOffsetB: 2.4,
      markerOffsetLeft: -1.9,
      markerOffsetRight: 1.9,
    },
    // Boost pickups — highland circuit (1550 segments).
    pickups: [
      { segment: 120, offset: 0.2 },
      { segment: 380, offset: -0.3 },
      { segment: 650, offset: 0.4 },
      { segment: 920, offset: 0 },
      { segment: 1180, offset: -0.4 },
      { segment: 1420, offset: 0.3 },
    ],
  },
  {
    id: 'coastal-circuit-1',
    label: 'Coastal Circuit',
    lapCount: 3,
    // Hills and turns along open ground: a distinct shape from Highland
    // Circuit (different curve/hill order and strengths). Scaled 2.5x —
    // 1601 segments. The last hill's dy is -6 (not -10): the climb/drop
    // above it nets to -4 by the time they reach it (+18-12), so this drop
    // only needs the remaining -6 to return to the lap's starting
    // elevation — a closed lap's total elevation change must sum to zero, a
    // seam mismatch this pass's finish-line banner surfaced (it rendered
    // oddly right at the lap seam) rather than something invented here.
    layout: [
      { type: 'straight', length: 200 },
      { type: 'curve', dir: 'right', strength: 2.8, length: 250, enter: 65, leave: 65 },
      { type: 'hill', dy: 18, length: 150 },
      { type: 'curve', dir: 'left', strength: 3.4, dy: -12, length: 275, enter: 70, leave: 70 },
      { type: 'straight', length: 175 },
      { type: 'hill', dy: -6, length: 125 },
      { type: 'curve', dir: 'right', strength: 2.5, length: 238, enter: 60, leave: 60 },
      { type: 'straight', length: 188 },
    ],
    // Coastal feel: cooler teal-blue atmosphere, sea-green grass, obviously
    // distinct from the warm/forest tracks. Strong teal shift for instant recognition.
    palette: {
      sky: [[0, '#1C3638'], [0.45, '#3A7270'], [0.8, '#A5CFAA'], [1, '#F8FCFA']],
      grass: '#488571', // stronger teal-green
      grassAlt: '#427B66',
      rumble: 'rgba(90, 165, 160, 0.5)',
      road: [68, 70, 68],
      ridgeFar: '#5A8578', // teal ridges
      ridgeMid: '#456E60',
      ridgeNear: '#355A4C',
    },
    roadside: {
      pillarModulo: 12,
      pillarRemainderLeft: 3,
      pillarRemainderRight: 9,
      stoneModuloA: 9,
      stoneRemainderA: 4,
      stoneModuloB: 12,
      stoneRemainderB: 7,
      markerModulo: 15,
      markerRemainderLeft: 5,
      markerRemainderRight: 11,
      treeModulo: 19,
      treeRemainderLeft: 2,
      treeRemainderRight: 13,
      pillarOffsetLeft: -1.45,
      pillarOffsetRight: 1.45,
      stoneOffsetA: -2.3,
      stoneOffsetB: 2.4,
      markerOffsetLeft: -1.8,
      markerOffsetRight: 1.8,
      treeOffsetLeft: -2.6,
      treeOffsetRight: 2.6,
    },
    // Boost pickups — coastal circuit (1601 segments).
    pickups: [
      { segment: 140, offset: 0.3 },
      { segment: 420, offset: -0.2 },
      { segment: 700, offset: 0.4 },
      { segment: 980, offset: 0 },
      { segment: 1240, offset: -0.4 },
      { segment: 1480, offset: 0.3 },
    ],
  },
]

export const TRACKS_BY_ID = Object.fromEntries(TRACKS.map((t) => [t.id, t]))

// Single resolved source for "the track this race is running" — keyed off
// the active practice/trial config's trackId (see tuning.js activeTrackId).
// Falls back to the first track if a stale/unrecognized id ever shows up
// (e.g. an old save from before a track was renamed), so a race can never
// fail to load.
export function activeTrack() {
  return TRACKS_BY_ID[activeTrackId()] || TRACKS[0]
}
