/**
 * Regression for hill-crest air time (track length/hill-smoothing/air-time
 * pass — see src/engine/airtime.js and AIR in src/data/tuning.js).
 * Pins the player at each track's own real peak-crest segment (found via a
 * one-off calibration sample of the actual built elevation profile, not
 * guessed) and asserts:
 *   - fast + sharp crest launches (playerAirborne true)
 *   - slow + sharp crest does NOT launch
 *   - fast + a flat/non-crest spot does NOT launch
 *   - Long Circuit's peak crest (by design the gentlest of the five, under
 *     AIR.crestThreshold) never launches even at full speed
 *   - landing always settles back to grounded (no stuck-airborne state)
 * Prereq: dev server running (Vite port auto-detected from 5173 upward)
 * Run: node scripts/verify-airtime.mjs
 */
import { chromium } from 'playwright'

const FAST_SPEED = 11220 // 0.85 * maxSpeed (220*60)
const SLOW_SPEED = 3960 // 0.3 * maxSpeed, well under AIR.launchSpeedPercent (0.6)
const FLAT_POS = 4000 // early straight on every track

// Real peak-crest world positions, precomputed from the actual built
// elevation profile (crestSharpnessAt, segmentLength=200) — not assumed.
const CREST_POS = {
  'trial-circuit-1': 170400,
  'winding-circuit-1': 97600, // re-derived after fixing the lap's elevation-seam mismatch (its hill split into an up/down bump, moving the apex slightly)
  'highland-circuit-1': 67000,
  'coastal-circuit-1': 117200,
  'long-circuit-1': 293200, // gentlest crest of the five — expected to NEVER launch
}

async function discoverPort() {
  if (process.env.PORT) return String(process.env.PORT)
  for (let port = 5173; port <= 5190; port++) {
    try {
      const res = await fetch(`http://localhost:${port}/race`, { signal: AbortSignal.timeout(600) })
      if (res.ok) return String(port)
    } catch { /* try next port */ }
  }
  throw new Error('No Vite dev server found on ports 5173-5190')
}

async function waitFrames(page, count = 6) {
  for (let i = 0; i < count; i++) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  }
}

async function pinAndSample(page, pos, speed, frames = 8) {
  await page.evaluate(({ pos, speed }) => {
    window.__ECHO_RACE_TEST__.freeze()
    window.__ECHO_RACE_TEST__.setOverride({ pos, speed })
  }, { pos, speed })
  await waitFrames(page, frames)
  return page.evaluate(() => window.__ECHO_RACE_TEST__.getAirState())
}

// Polls until the arc lands, stopping the instant playerAirborne goes false
// — bounded well under the full launch->land->cooldown relaunch cycle
// (~1.4s+ worst case) so this can never mistake a SECOND launch for a
// landing that never happened.
async function waitForLanding(page, maxMs = 1200, stepMs = 30) {
  for (let waited = 0; waited < maxMs; waited += stepMs) {
    const s = await page.evaluate(() => window.__ECHO_RACE_TEST__.getAirState())
    if (!s.playerAirborne) return true
    await page.waitForTimeout(stepMs)
  }
  return false
}

async function testTrack(port, trackId) {
  const url = `http://localhost:${port}/race?verify=1&track=${trackId}`
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => !!window.__ECHO_RACE_TEST__, null, { timeout: 8000 })

  const config = await page.evaluate(() => window.__ECHO_RACE_TEST__.getRaceConfig())
  if (config.trackId !== trackId) throw new Error(`${trackId}: track did not load (got ${config.trackId})`)

  const crestPos = CREST_POS[trackId]
  const isGentleTrack = trackId === 'long-circuit-1'

  // Flat spot, fast: never launches.
  const flatFast = await pinAndSample(page, FLAT_POS, FAST_SPEED)
  if (flatFast.playerAirborne) throw new Error(`${trackId}: launched on a flat spot at speed (should never happen)`)

  // Crest, slow: never launches (speed gate).
  const crestSlow = await pinAndSample(page, crestPos, SLOW_SPEED)
  if (crestSlow.playerAirborne) throw new Error(`${trackId}: launched at slow speed on the crest (speed gate failed)`)

  // Crest, fast: launches (fast+sharp) — except Long Circuit's gentlest-by-
  // design crest, which should stay grounded (crest-sharpness gate).
  const crestFast = await pinAndSample(page, crestPos, FAST_SPEED)
  if (isGentleTrack) {
    if (crestFast.playerAirborne) throw new Error(`${trackId}: launched on its gentle crest at speed (crest-sharpness gate failed)`)
  } else {
    if (!crestFast.playerAirborne) throw new Error(`${trackId}: did NOT launch on its own sharpest crest at speed`)
    // Let the arc play out and confirm it lands (never stuck airborne).
    if (!(await waitForLanding(page))) throw new Error(`${trackId}: still airborne after 1.2s — stuck?`)
  }

  await browser.close()
  console.log(`  ${trackId}: flatFast=grounded slowCrest=grounded fastCrest=${isGentleTrack ? 'grounded (by design)' : 'launched+landed'} OK`)
}

async function main() {
  const PORT = await discoverPort()
  console.log(`Using dev server on port ${PORT}`)
  for (const trackId of Object.keys(CREST_POS)) {
    await testTrack(PORT, trackId)
  }
  console.log('PASS air-time verification (all tracks)')
}

main().catch((err) => {
  console.error('FAIL', err.message)
  process.exit(1)
})
