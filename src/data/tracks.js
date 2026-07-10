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
    },
    roadside: {
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
    },
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
    // Warm golden plains — brighter/drier than Circuit One, still within
    // the parchment-sky/natural-green art direction.
    palette: {
      sky: [[0, '#4A2F1C'], [0.45, '#A06F28'], [0.8, '#E6BD5E'], [1, '#FFFBEF']],
      grass: '#6B7A4A',
      grassAlt: '#66753F',
      rumble: 'rgba(180, 150, 70, 0.5)',
      road: [82, 58, 34],
    },
    // Fewer props (larger modulo = sparser) — an open, flowing feel.
    roadside: {
      pillarModulo: 14,
      pillarRemainderLeft: 4,
      pillarRemainderRight: 10,
      stoneModuloA: 19,
      stoneRemainderA: 6,
      stoneModuloB: 17,
      stoneRemainderB: 11,
      pillarOffsetLeft: -1.45,
      pillarOffsetRight: 1.45,
      stoneOffsetA: -2.3,
      stoneOffsetB: 2.4,
    },
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
    // Cooler, deeper forest greens — a shaded, close-in feel to match the
    // tighter course.
    palette: {
      sky: [[0, '#2A2015'], [0.45, '#5E4A22'], [0.8, '#A98A45'], [1, '#F2E6C8']],
      grass: '#3F5A38',
      grassAlt: '#3A5433',
      rumble: 'rgba(139, 105, 20, 0.6)',
      road: [58, 42, 26],
    },
    // Denser props (smaller modulo = more frequent) — a packed, technical feel.
    roadside: {
      pillarModulo: 6,
      pillarRemainderLeft: 2,
      pillarRemainderRight: 4,
      stoneModuloA: 7,
      stoneRemainderA: 3,
      stoneModuloB: 5,
      stoneRemainderB: 1,
      pillarOffsetLeft: -1.45,
      pillarOffsetRight: 1.45,
      stoneOffsetA: -2.3,
      stoneOffsetB: 2.4,
    },
  },
  {
    id: 'highland-circuit-1',
    label: 'Highland Circuit',
    lapCount: 3,
    // Hills and turns: a big climb, a hilltop sweeper, a drop, another
    // climb, then a descending curve back to the line. Scaled 2.5x — 1550
    // segments. The closing curve's dy is -45 (not -25): the climbs/drops
    // above it only net to +20 by the time they reach it (+30+10-15+0+20),
    // so the final descent needs the extra -20 to actually return to the
    // lap's starting elevation — a closed lap's total elevation change must
    // sum to zero, a seam mismatch this pass's finish-line banner surfaced
    // (it rendered oddly right at the lap seam) rather than something
    // invented for this fix.
    layout: [
      { type: 'straight', length: 175 },
      { type: 'hill', dy: 30, length: 175 },
      { type: 'curve', dir: 'left', strength: 3.0, dy: 10, length: 250, enter: 63, leave: 63 },
      { type: 'hill', dy: -15, length: 125 },
      { type: 'curve', dir: 'right', strength: 3.2, length: 275, enter: 70, leave: 70 },
      { type: 'hill', dy: 20, length: 150 },
      { type: 'curve', dir: 'left', strength: 2.6, dy: -45, length: 225, enter: 55, leave: 55 },
      { type: 'straight', length: 175 },
    ],
    // Grey stone highland — sage/grey-green grass, pale cool sky, stone-grey road.
    palette: {
      sky: [[0, '#332A22'], [0.45, '#7A6B4A'], [0.8, '#C4B98F'], [1, '#FFF8E7']],
      grass: '#6E7360',
      grassAlt: '#68705A',
      rumble: 'rgba(160, 160, 140, 0.5)',
      road: [90, 82, 70],
    },
    // Stone-heavy roadside (more stones than pillars) to match the highland look.
    roadside: {
      pillarModulo: 11,
      pillarRemainderLeft: 3,
      pillarRemainderRight: 8,
      stoneModuloA: 8,
      stoneRemainderA: 2,
      stoneModuloB: 10,
      stoneRemainderB: 6,
      pillarOffsetLeft: -1.45,
      pillarOffsetRight: 1.45,
      stoneOffsetA: -2.3,
      stoneOffsetB: 2.4,
    },
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
    // Verdigris/aquatic — a cooler, teal-tinted sky at altitude easing to
    // the same warm parchment horizon, teal-green grass, cool stone road.
    palette: {
      sky: [[0, '#1E3A3A'], [0.45, '#3E6E68'], [0.8, '#A9C9A0'], [1, '#FFF8E7']],
      grass: '#4C7A6A',
      grassAlt: '#46705F',
      rumble: 'rgba(95, 158, 160, 0.5)',
      road: [70, 64, 60],
    },
    roadside: {
      pillarModulo: 12,
      pillarRemainderLeft: 3,
      pillarRemainderRight: 9,
      stoneModuloA: 9,
      stoneRemainderA: 4,
      stoneModuloB: 12,
      stoneRemainderB: 7,
      pillarOffsetLeft: -1.45,
      pillarOffsetRight: 1.45,
      stoneOffsetA: -2.3,
      stoneOffsetB: 2.4,
    },
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
