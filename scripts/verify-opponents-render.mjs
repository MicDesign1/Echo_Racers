/**
 * Regression: opponent visible pixel height/width on the live canvas, under
 * the depth model where every opponent's camera-space z = delta + zPlayer
 * (zPlayer = the camera depth at which a flat point projects onto the
 * player's own screen ground line — see computePlayerDepth in
 * src/engine/opponents.js). Because both the far-zone (slot interpolation)
 * and near-zone (direct projection) branches share the exact same
 * carWidth = playerChassisWidth * zPlayer / z formula, there should be no
 * seam, no flicker, and strictly monotonic sizing across the whole sweep.
 * The exhaustive sweep runs on Circuit One (the reference track, guaranteed
 * byte-identical to pre-refactor); every other track in data/tracks.js gets
 * a lighter track-agnostic smoke test (positions scaled off its own actual
 * length) checking the same placement invariants.
 * Prereq: dev server running (Vite port auto-detected from 5173 upward)
 * Run: node scripts/verify-opponents-render.mjs
 */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, 'verify-screenshots')

// Optional full-field run: RIVALS=8 node scripts/verify-opponents-render.mjs
// loads the game with that many rivals (via the verify-gated ?rivals= param,
// which survives the reloads this script performs) and adds a grid-spawn
// overlap check + a full-field draw-order screenshot on top of the normal
// single-rival sweep. Unset => the original 3-rival default, unchanged.
const RIVALS = process.env.RIVALS != null ? Math.max(1, Math.min(8, parseInt(process.env.RIVALS, 10))) : null

// The exhaustive sweep above (hardcoded FLAT_POS/HILL_POS/CREST_POS) targets
// Circuit One's specific geometry and stays exactly as it was — it's the
// thorough regression check against the one track guaranteed byte-identical
// to pre-refactor. Every OTHER track (data/tracks.js) gets a lighter,
// track-agnostic smoke test below: same depth-projection math (it doesn't
// care which course is loaded), positions computed from each track's own
// actual length rather than assumed hill/crest locations.
const OTHER_TRACK_IDS = ['long-circuit-1', 'winding-circuit-1', 'highland-circuit-1', 'coastal-circuit-1']

const FLAT_POS = 6000
const HILL_POS = 40000
// Just past the hilltop (dy=+8 over 90 segments, nearly flat) into the steep
// descent (dy=-30 over 60 segments) — TRACK_LAYOUT's sharpest elevation
// inflection, i.e. the track's most pronounced hill crest for clip testing.
const CREST_POS = 60000

async function discoverPort() {
  if (process.env.PORT) return String(process.env.PORT)
  for (let port = 5173; port <= 5190; port++) {
    try {
      const res = await fetch(`http://localhost:${port}/race`, { signal: AbortSignal.timeout(600) })
      if (res.ok) return String(port)
    } catch {
      // try next port
    }
  }
  throw new Error('No Vite dev server found on ports 5173–5190')
}

async function waitFrames(page, count = 3) {
  for (let i = 0; i < count; i++) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  }
}

async function setScenario(page, playerPos, delta, speed = 0) {
  await page.evaluate(({ playerPos, delta, speed }) => {
    window.__ECHO_RACE_TEST__.freeze()
    window.__ECHO_RACE_TEST__.setScenario({
      playerPos,
      speed,
      rivals: [
        { rivalIndex: 0, delta, x: 0.55 },
        { rivalIndex: 1, delta: 90000, x: 0 },
        { rivalIndex: 2, delta: 90000, x: 0 },
      ],
    })
  }, { playerPos, delta, speed })
  await page.reload({ waitUntil: 'networkidle' })
  await page.evaluate(({ playerPos, delta, speed }) => {
    window.__ECHO_RACE_TEST__.setScenario({
      playerPos,
      speed,
      rivals: [
        { rivalIndex: 0, delta, x: 0.55 },
        { rivalIndex: 1, delta: 90000, x: 0 },
        { rivalIndex: 2, delta: 90000, x: 0 },
      ],
    })
  }, { playerPos, delta, speed })
  await page.waitForFunction(
    (pos) => window.__ECHO_RACE_TEST__?.getMetrics()?.playerPos === pos,
    playerPos,
    { timeout: 10000 },
  )
  await waitFrames(page)
}

async function measureVisibleHeight(page, metrics) {
  if (!metrics?.rival) return 0
  const { sx, sy, carWidth } = metrics.rival
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(carWidth)) return 0
  return page.evaluate(({ sx, sy, carWidth }) => {
    const canvas = document.querySelector('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const dpr = canvas.width / canvas.clientWidth
    const carH = Math.ceil(carWidth * 0.5)
    const cw = canvas.width
    const ch = canvas.height
    const x0 = Math.max(0, Math.min(cw - 1, Math.floor((sx - carWidth / 2) * dpr)))
    const y0 = Math.max(0, Math.min(ch - 1, Math.floor((sy - carH) * dpr)))
    const w = Math.max(1, Math.min(cw - x0, Math.ceil(carWidth * dpr)))
    const h = Math.max(1, Math.min(ch - y0, Math.ceil(carH * dpr)))
    const data = ctx.getImageData(x0, y0, w, h).data
    let minY = h
    let maxY = -1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        if (data[i + 3] < 20) continue
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        if (r + g + b < 90) continue
        if (g > 150 && r < 120) continue
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
    return maxY >= minY ? maxY - minY + 1 : 0
  }, { sx, sy, carWidth })
}

async function capture(page, label, playerPos, delta) {
  await setScenario(page, playerPos, delta)
  const metrics = await page.evaluate(() => window.__ECHO_RACE_TEST__.getMetrics())
  const visPx = await measureVisibleHeight(page, metrics)
  return { label, delta, playerPos, metrics, visPx }
}

// Far-to-near checkpoints spanning the whole visible range: deep background,
// through the far/near-zone seam at z = 1.5*segmentLength, across delta = 0
// (alongside), down to just above the cull boundary z = nearPlane.
function buildSweep(zPlayer, nearPlane, segmentLength) {
  const seamDelta = 1.5 * segmentLength - zPlayer
  const cullDelta = nearPlane - zPlayer
  const raw = [
    6000, 4000, 2500, 1500, 1000, 700, 500, 350,
    seamDelta + 80, seamDelta + 30, seamDelta, seamDelta - 30, seamDelta - 80,
    200, 100, 50, 20, 0, -20, -50, -80, -150, -250,
    cullDelta + 200, cullDelta + 100, cullDelta + 40, cullDelta + 10,
  ]
  const seen = new Set()
  const points = []
  for (const d of raw) {
    const r = Math.round(d)
    if (r + zPlayer <= nearPlane + 2) continue // keep a small margin above the cull plane
    if (seen.has(r)) continue
    seen.add(r)
    points.push(r)
  }
  return points.sort((a, b) => b - a) // far to near
}

async function sweepPhase(page, label, playerPos, sweep) {
  const rows = []
  for (const delta of sweep) {
    rows.push(await capture(page, label, playerPos, delta))
  }
  return rows
}

// "Undrawn" here means getOpponentScreenPlacement wrongly culled the
// opponent (returned null) while z is still ahead of the near plane — the
// old sawtooth-driven bug. It does NOT mean "zero visible pixels": once z
// drops much below ~cameraDepth*cameraHeight, the projected sy falls below
// the canvas (this is a real, correct property of the perspective — the
// road itself is equally invisible there), and the pixel-sampling probe
// degenerates to a clamped 1x1 corner sample once sx/sy are far off-canvas,
// so visPx stops being a meaningful signal in that region. Visibility is
// checked for real (via visPx) only in the ranges actual gameplay reaches —
// see dynamicFlickerTest and naturalCatchBumpPass below.
function assertNoGapsAndMonotonic(rows, label, nearPlane) {
  let prevWidth = -Infinity
  for (const row of rows) {
    const rival = row.metrics?.rival
    if (!rival) throw new Error(`${label} delta=${row.delta}: rival culled (null placement) while it should still be in range`)
    if (rival.cameraZ <= nearPlane) throw new Error(`${label} delta=${row.delta}: cameraZ ${rival.cameraZ.toFixed(1)} at/behind nearPlane ${nearPlane}`)
    if (rival.carWidth < prevWidth - 1) {
      throw new Error(`${label} delta=${row.delta}: width not non-decreasing (${rival.carWidth.toFixed(1)} < prev ${prevWidth.toFixed(1)})`)
    }
    prevWidth = rival.carWidth
  }
}

// The rival's sy IS its ground-contact row (see getOpponentScreenPlacement),
// and player metrics.playerGroundY is the same anchor drawCar draws from
// (car.js getPlayerAnchor) — at delta=0 both chassis bottoms should land on
// the same screen row.
function assertBottomAlignment(rows, label) {
  const row = rows.find((r) => r.delta === 0)
  if (!row?.metrics?.rival) throw new Error(`${label} alignment: rival not rendered`)
  const diff = Math.abs(row.metrics.rival.sy - row.metrics.playerGroundY)
  if (diff > 2) {
    throw new Error(`${label} bottom alignment off by ${diff.toFixed(2)}px (rival sy=${row.metrics.rival.sy.toFixed(2)} player groundY=${row.metrics.playerGroundY.toFixed(2)})`)
  }
  return diff
}

function assertAlongsideWidth(rows, label) {
  const row = rows.find((r) => r.delta === 0)
  if (!row?.metrics?.rival) throw new Error(`${label} alongside: rival not rendered`)
  const ratio = row.metrics.rival.carWidth / row.metrics.playerWidth
  if (ratio < 0.95 || ratio > 1.05) {
    throw new Error(`${label} alongside width ratio ${ratio.toFixed(3)} outside 0.95–1.05 (w=${row.metrics.rival.carWidth.toFixed(1)} player=${row.metrics.playerWidth.toFixed(1)})`)
  }
  return ratio
}

// Fine sweep straddling the real branch boundary, delta = 0: ahead
// (delta >= 0) sources road geometry from frameSlots' raw world x/y at the
// opponent's true position; behind (delta < 0) sources it via a direct
// seg() lookup. Both project through the same shifted-z formula, and delta
// = 0 sits well inside the visible canvas (this is the same point the
// alongside/alignment checks exercise), so a plain px-jump assertion is
// meaningful here without any visibility carve-out.
async function seamCheck(page, label, playerPos) {
  const steps = [-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3]
  const rows = []
  for (const delta of steps) rows.push(await capture(page, label, playerPos, delta))
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1].metrics?.rival
    const b = rows[i].metrics?.rival
    if (!a || !b) throw new Error(`${label} seam check: rival missing near seam`)
    const dw = Math.abs(b.carWidth - a.carWidth)
    if (dw > 2) throw new Error(`${label} seam width jump ${dw.toFixed(2)}px at delta ${rows[i - 1].delta.toFixed(2)}->${rows[i].delta.toFixed(2)}`)
    const dy = Math.abs(b.sy - a.sy)
    if (dy > 2) throw new Error(`${label} seam sy jump ${dy.toFixed(2)}px at delta ${rows[i - 1].delta.toFixed(2)}->${rows[i].delta.toFixed(2)}`)
  }
  return rows
}

async function dynamicFlickerTest(page, playerPos) {
  await setScenario(page, playerPos, 120)
  await page.evaluate(() => {
    window.__ECHO_RACE_TEST__.holdUp(true)
  })
  await page.keyboard.down('ArrowUp')

  const frames = []
  let prevWidth = null
  for (let i = 0; i < 120; i++) {
    const delta = 95 + Math.sin(i * 0.17) * 90
    await page.evaluate(({ playerPos, delta }) => {
      window.__ECHO_RACE_TEST__.setScenario({
        playerPos,
        speed: 12000,
        rivals: [{ rivalIndex: 0, delta, x: 0.55 }],
      })
    }, { playerPos, delta })
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)))
    const metrics = await page.evaluate(() => window.__ECHO_RACE_TEST__.getMetrics())
    const visPx = await measureVisibleHeight(page, metrics)
    const rival = metrics?.rival
    if (!rival || rival.cameraZ <= metrics.nearPlane) {
      throw new Error(`dynamic flicker frame ${i}: rival missing or past near plane (delta=${delta.toFixed(0)})`)
    }
    if (visPx < 10) {
      throw new Error(`dynamic flicker frame ${i}: delta=${delta.toFixed(0)} cameraZ=${rival.cameraZ.toFixed(1)} visPx=${visPx}`)
    }
    if (prevWidth != null && Math.abs(rival.carWidth - prevWidth) > 3) {
      throw new Error(`dynamic flicker frame ${i}: width jitter ${Math.abs(rival.carWidth - prevWidth).toFixed(2)}px (delta=${delta.toFixed(0)})`)
    }
    prevWidth = rival.carWidth
    frames.push({ i, delta, cameraZ: rival.cameraZ, visPx, carWidth: rival.carWidth })
  }

  await page.keyboard.up('ArrowUp')
  return frames
}

// Samples a thin band straddling the rival's ground-contact row (sy) and
// reports whether any chassis-colored pixel is present there — i.e.
// whether the bottom row of the car is actually drawn, as opposed to
// clipped away by the hill-crest clip rect.
async function measureBottomRowVisible(page, metrics) {
  if (!metrics?.rival) return false
  const { sx, sy, carWidth } = metrics.rival
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(carWidth)) return false
  return page.evaluate(({ sx, sy, carWidth }) => {
    const canvas = document.querySelector('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const dpr = canvas.width / canvas.clientWidth
    const bandHeightPx = 3
    const cw = canvas.width
    const ch = canvas.height
    const x0 = Math.max(0, Math.min(cw - 1, Math.floor((sx - carWidth / 2) * dpr)))
    const y0 = Math.max(0, Math.min(ch - 1, Math.floor((sy - bandHeightPx) * dpr)))
    const w = Math.max(1, Math.min(cw - x0, Math.ceil(carWidth * dpr)))
    const h = Math.max(1, Math.min(ch - y0, Math.ceil(bandHeightPx * dpr)))
    const data = ctx.getImageData(x0, y0, w, h).data
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 20) continue
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (r + g + b < 90) continue
      if (g > 150 && r < 120) continue
      return true
    }
    return false
  }, { sx, sy, carWidth })
}

// Drives a real 120-frame stretch through the track's sharpest hill crest
// with a rival nearby, under normal physics (not frame-frozen — clip only
// jitters when g.pos actually advances continuously, which a frozen
// scenario wouldn't exercise). Flags "shimmer": a single isolated frame
// where visibility differs from both neighbors. A sustained transition
// (the rival genuinely passing behind the crest for many consecutive
// frames) is real occlusion, not shimmer, and is not flagged.
async function groundRowShimmerTest(page, playerPos, rivalDelta) {
  await setScenario(page, playerPos, rivalDelta, 9000)
  await page.evaluate(() => window.__ECHO_RACE_TEST__.clearScenario())
  await page.evaluate(() => window.__ECHO_RACE_TEST__.holdUp(true))
  await page.keyboard.down('ArrowUp')

  const frames = []
  for (let i = 0; i < 120; i++) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)))
    const metrics = await page.evaluate(() => window.__ECHO_RACE_TEST__.getMetrics())
    const visible = await measureBottomRowVisible(page, metrics)
    frames.push({ i, delta: metrics?.rival?.delta ?? null, visible })
  }

  await page.keyboard.up('ArrowUp')
  return frames
}

function assertNoShimmer(frames, label) {
  for (let i = 1; i < frames.length - 1; i++) {
    const prev = frames[i - 1].visible
    const cur = frames[i].visible
    const next = frames[i + 1].visible
    if (cur !== prev && cur !== next) {
      throw new Error(`${label} ground-row shimmer at frame ${i}: visible=${cur} isolated between prev=${prev} and next=${next} (delta=${frames[i].delta?.toFixed?.(0)})`)
    }
  }
}

async function naturalCatchBumpPass(page) {
  // A large, explicit starting gap (rather than the opponents' default
  // stagger, only ~9200 units — under a second to close) gives enough real
  // time margin that the catch/bump/pass sequence can't finish during
  // Playwright's own setup round-trips, before the polling loop below even
  // starts sampling.
  const startDelta = -16000
  await page.evaluate(({ startDelta }) => {
    window.__ECHO_RACE_TEST__.freeze()
    window.__ECHO_RACE_TEST__.setScenario({
      playerPos: 8000,
      speed: 0,
      rivals: [
        { rivalIndex: 0, delta: startDelta, x: 0.4 },
        { rivalIndex: 1, delta: 90000, x: 0 },
        { rivalIndex: 2, delta: 90000, x: 0 },
      ],
    })
  }, { startDelta })
  await page.reload({ waitUntil: 'networkidle' })
  await page.evaluate(({ startDelta }) => {
    window.__ECHO_RACE_TEST__.setScenario({
      playerPos: 8000,
      speed: 0,
      rivals: [
        { rivalIndex: 0, delta: startDelta, x: 0.4 },
        { rivalIndex: 1, delta: 90000, x: 0 },
        { rivalIndex: 2, delta: 90000, x: 0 },
      ],
    })
  }, { startDelta })
  await page.waitForFunction(
    (pos) => window.__ECHO_RACE_TEST__?.getMetrics()?.playerPos === pos,
    8000,
    { timeout: 10000 },
  )
  await waitFrames(page)

  const shots = {}

  // Release the freeze so the player (accelerating from a stop) and the
  // rival (closing the gap set above) both evolve under real physics from
  // here — a genuine natural-driving sequence, not a frozen-player probe.
  await page.evaluate(() => window.__ECHO_RACE_TEST__.clearScenario())
  await page.evaluate(() => window.__ECHO_RACE_TEST__.holdUp(true))
  await page.keyboard.down('ArrowUp')

  // Closing speed is high enough (a rival can cover several hundred world
  // units per 250ms) that coarse polling can step clean over the ~300-unit
  // bump window between two samples — poll finer and allow some margin
  // either side of zero so the window is reliably hit.
  for (let i = 0; i < 250; i++) {
    await page.waitForTimeout(50)
    const m = await page.evaluate(() => window.__ECHO_RACE_TEST__?.getMetrics?.())
    if (!shots.catching && m?.rival && m.rival.delta < 1200 && m.rival.delta > 100) {
      shots.catching = path.join(OUT_DIR, 'natural-catching.png')
      await page.locator('canvas').screenshot({ path: shots.catching })
    }
    if (!shots.bump && m?.rival && m.rival.delta < 400 && m.rival.delta > -50) {
      shots.bump = path.join(OUT_DIR, 'natural-bump.png')
      await page.locator('canvas').screenshot({ path: shots.bump })
    }
    // A null rival means "culled" — true both when it's already passed and
    // pulled away, AND at the very start before it's caught up. Only trust
    // it as "passed" once we've actually seen the bump, so an early null
    // (still far behind) doesn't get mistaken for the finish of the
    // sequence.
    if (!shots.passed && shots.bump && m && (!m.rival || m.rival.cameraZ <= m.nearPlane + 5)) {
      shots.passed = path.join(OUT_DIR, 'natural-passed.png')
      await page.locator('canvas').screenshot({ path: shots.passed })
      break
    }
  }

  await page.keyboard.up('ArrowUp')
  if (!shots.passed) {
    shots.passed = path.join(OUT_DIR, 'natural-passed.png')
    await page.locator('canvas').screenshot({ path: shots.passed })
  }
  return shots
}

// Full field on the starting grid: no two racers (player + all rivals) may
// share both a near-identical track position AND lane — that would be a
// literal overlap on the grid. Read straight from a clean load before any
// scenario override is applied.
async function gridSpawnCheck(page, expectedCount) {
  await page.goto(page.baseURL, { waitUntil: 'networkidle' })
  await waitFrames(page, 2)
  const st = await page.evaluate(() => window.__ECHO_RACE_TEST__.getRaceState())
  if (st.opponents.length !== expectedCount) {
    throw new Error(`grid spawn: expected ${expectedCount} rivals, got ${st.opponents.length}`)
  }
  const racers = [
    { id: 'player', pos: st.playerPos, x: st.playerX },
    ...st.opponents.map((o) => ({ id: `r${o.rivalIndex}`, pos: o.pos, x: o.x })),
  ]
  for (let i = 0; i < racers.length; i++) {
    for (let j = i + 1; j < racers.length; j++) {
      const dp = Math.abs(racers[i].pos - racers[j].pos)
      const dx = Math.abs(racers[i].x - racers[j].x)
      if (dp < 100 && dx < 0.2) {
        throw new Error(`grid overlap: ${racers[i].id} & ${racers[j].id} (dpos=${dp.toFixed(1)}, dlane=${dx.toFixed(2)})`)
      }
    }
  }
  return { count: st.opponents.length, racers }
}

// Draw-order/full-field smoke: bunch the entire field ahead of the player at
// staggered depths (multiple beforePlayer draws in one frame) and confirm
// every rival is present and a frame renders without error. Screenshot kept
// for the record.
async function fullFieldShot(page, count) {
  const lanes = [-0.7, 0.7, 0, -0.4, 0.4, -0.85, 0.85, 0.2]
  const rivals = Array.from({ length: count }, (_, i) => ({
    rivalIndex: i, delta: 300 + i * 460, x: lanes[i % lanes.length],
  }))
  await page.evaluate((rivals) => {
    window.__ECHO_RACE_TEST__.freeze()
    window.__ECHO_RACE_TEST__.setScenario({ playerPos: 8000, speed: 0, rivals })
  }, rivals)
  await waitFrames(page, 3)
  const st = await page.evaluate(() => window.__ECHO_RACE_TEST__.getRaceState())
  await page.locator('canvas').screenshot({ path: path.join(OUT_DIR, `field-${count}.png`) })
  return st.opponents.length
}

// Track-agnostic smoke test: loads one specific track (?track=), places a
// rival at a handful of deltas scaled off that track's OWN actual length
// (so it works regardless of layout), and confirms opponent placement never
// goes null/NaN and carWidth stays monotonic through a near approach — the
// same depth-projection invariants the exhaustive sweep checks above, just
// without assuming where any hill or crest happens to fall.
async function smokeTestTrack(port, trackId) {
  const url = `http://localhost:${port}/race?verify=1&track=${trackId}`
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => !!window.__ECHO_RACE_TEST__, null, { timeout: 8000 })

  const config = await page.evaluate(() => window.__ECHO_RACE_TEST__.getRaceConfig())
  if (config.trackId !== trackId) throw new Error(`smoke ${trackId}: track did not load (got ${config.trackId})`)

  const { trackLength } = await page.evaluate(() => window.__ECHO_RACE_TEST__.getRaceState())
  if (!Number.isFinite(trackLength) || trackLength <= 0) throw new Error(`smoke ${trackId}: bad trackLength ${trackLength}`)

  // A handful of world positions spanning the whole course, so every
  // section (whatever it is) gets at least one sample.
  const positions = [0.05, 0.3, 0.55, 0.8].map((f) => Math.round(f * trackLength))
  const deltas = [6000, 1500, 500, 100, 0, -80, -250]

  let prevWidth = -Infinity
  let sawReset = false
  for (const pos of positions) {
    prevWidth = -Infinity // width only needs to be monotonic within one far->near sweep
    for (const delta of deltas) {
      await setScenario(page, pos, delta)
      const metrics = await page.evaluate(() => window.__ECHO_RACE_TEST__.getMetrics())
      const rival = metrics?.rival
      if (!rival) throw new Error(`smoke ${trackId} pos=${pos} delta=${delta}: rival culled unexpectedly`)
      if (!Number.isFinite(rival.carWidth) || !Number.isFinite(rival.sy)) {
        throw new Error(`smoke ${trackId} pos=${pos} delta=${delta}: non-finite placement (w=${rival.carWidth}, sy=${rival.sy})`)
      }
      if (rival.carWidth < prevWidth - 1) {
        throw new Error(`smoke ${trackId} pos=${pos} delta=${delta}: width not non-decreasing (${rival.carWidth.toFixed(1)} < prev ${prevWidth.toFixed(1)})`)
      }
      prevWidth = rival.carWidth
      sawReset = true
    }
  }
  if (!sawReset) throw new Error(`smoke ${trackId}: no samples taken`)

  await browser.close()
  console.log(`  smoke ${trackId}: trackLength=${trackLength.toFixed(0)}, ${positions.length * deltas.length} placements OK`)
}

async function main() {
  const PORT = await discoverPort()
  const BASE_URL = `http://localhost:${PORT}/race?verify=1${RIVALS != null ? `&rivals=${RIVALS}` : ''}`
  console.log(`Using dev server at ${BASE_URL}${RIVALS != null ? ` (full-field: ${RIVALS} rivals)` : ''}`)

  const hasVerify = await (async () => {
    const browser = await chromium.launch()
    const page = await browser.newPage()
    try {
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 8000 })
      return await page.evaluate(() => !!window.__ECHO_RACE_TEST__)
    } catch {
      return false
    } finally {
      await browser.close()
    }
  })()

  if (!hasVerify) {
    throw new Error(`verify hook missing at ${BASE_URL}`)
  }

  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
  page.baseURL = BASE_URL
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })

  // Full-field checks first (they navigate a clean page), before the sweep
  // starts applying scenario overrides.
  let gridInfo = null
  let fieldCount = null
  if (RIVALS != null) {
    gridInfo = await gridSpawnCheck(page, RIVALS)
    fieldCount = await fullFieldShot(page, RIVALS)
    if (fieldCount !== RIVALS) throw new Error(`full field: expected ${RIVALS} rivals rendered, got ${fieldCount}`)
  }

  // Probe once to read zPlayer/nearPlane/segmentLength — these only depend
  // on canvas size, not on playerPos or track elevation.
  const probe = await capture(page, 'probe', FLAT_POS, 0)
  const { zPlayer, nearPlane, segmentLength } = probe.metrics
  console.log(`zPlayer=${zPlayer.toFixed(1)} nearPlane=${nearPlane.toFixed(1)} segmentLength=${segmentLength}`)

  const sweep = buildSweep(zPlayer, nearPlane, segmentLength)

  const flatRows = await sweepPhase(page, 'flat', FLAT_POS, sweep)
  const hillRows = await sweepPhase(page, 'hill', HILL_POS, sweep)

  assertNoGapsAndMonotonic(flatRows, 'flat', nearPlane)
  assertNoGapsAndMonotonic(hillRows, 'hill', nearPlane)

  const flatRatio = assertAlongsideWidth(flatRows, 'flat')
  const hillRatio = assertAlongsideWidth(hillRows, 'hill')

  const flatAlignDiff = assertBottomAlignment(flatRows, 'flat')
  const hillAlignDiff = assertBottomAlignment(hillRows, 'hill')

  const flatSeam = await seamCheck(page, 'flat', FLAT_POS)
  const hillSeam = await seamCheck(page, 'hill', HILL_POS)

  // A couple of screenshots at representative checkpoints for the record.
  for (const [label, pos] of [['flat', FLAT_POS], ['hill', HILL_POS]]) {
    for (const delta of [6000, 400, 0, Math.round(1.5 * segmentLength - zPlayer), Math.round(nearPlane - zPlayer) + 20]) {
      await setScenario(page, pos, delta)
      await page.locator('canvas').screenshot({ path: path.join(OUT_DIR, `${label}-d${delta}.png`) })
    }
  }

  const dynamic = await dynamicFlickerTest(page, FLAT_POS)

  const shimmerFrames = await groundRowShimmerTest(page, CREST_POS, 150)
  assertNoShimmer(shimmerFrames, 'crest')

  const natural = await naturalCatchBumpPass(page)

  const report = {
    port: PORT,
    zPlayer, nearPlane, segmentLength,
    flatRows, hillRows, flatSeam, hillSeam,
    flatAlignDiff, hillAlignDiff,
    dynamic: { frames: dynamic.length },
    shimmer: { frames: shimmerFrames.length, visibleCount: shimmerFrames.filter((f) => f.visible).length },
    natural,
  }
  await writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))

  console.log('PASS opponent render regression')
  for (const row of flatRows) {
    console.log(`  flat delta=${row.delta}: z=${row.metrics.rival.cameraZ.toFixed(1)} w=${row.metrics.rival.carWidth.toFixed(1)} visPx=${row.visPx}`)
  }
  for (const row of hillRows) {
    console.log(`  hill  delta=${row.delta}: z=${row.metrics.rival.cameraZ.toFixed(1)} w=${row.metrics.rival.carWidth.toFixed(1)} visPx=${row.visPx}`)
  }
  console.log(`  alongside width ratio: flat=${flatRatio.toFixed(3)} hill=${hillRatio.toFixed(3)}`)
  console.log(`  bottom alignment: flat=${flatAlignDiff.toFixed(2)}px hill=${hillAlignDiff.toFixed(2)}px (both <= 2px)`)
  console.log(`  seam check: flat and hill both within 2px across the far/near-zone boundary`)
  console.log(`  dynamic flicker: ${dynamic.length} frames OK`)
  console.log(`  crest shimmer: ${shimmerFrames.length} frames, no isolated flicker (visible ${shimmerFrames.filter((f) => f.visible).length}/${shimmerFrames.length})`)
  console.log(`  natural drive: ${Object.keys(natural).join(', ')}`)
  if (RIVALS != null) {
    console.log(`  grid spawn: ${gridInfo.count} rivals + player, no overlap (${gridInfo.racers.length} racers checked)`)
    console.log(`  full field: ${fieldCount} rivals rendered ahead, draw-order OK (field-${fieldCount}.png)`)
  }

  await browser.close()

  console.log('checking opponent placement on every other track...')
  for (const trackId of OTHER_TRACK_IDS) {
    await smokeTestTrack(PORT, trackId)
  }
  console.log('PASS opponent render on all tracks')
}

main().catch((err) => {
  console.error('FAIL', err.message)
  process.exit(1)
})
