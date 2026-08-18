/**
 * Verification for the boost system (always-accel + charge meter + track pickups).
 * Exercises the real running game via the verify hook (window.__ECHO_RACE_TEST__):
 *
 *   (a) Always-accel: confirm the car accelerates without up/W held
 *   (b) Boost activation: charge the meter, fire boost, confirm speed increase
 *   (c) Boost meter refills after use
 *   (d) Track pickup collection: place player on a pickup, confirm boost fires
 *   (e) Pickup respawn: confirm pickup disappears and reappears after respawn time
 *
 * Runs on Circuit One (the reference track). The boost system is track-agnostic
 * (charge/activation logic doesn't depend on geometry), but pickups are per-track
 * data, so this script verifies one track's pickup list end-to-end.
 *
 * Prereq: dev server running (Vite port auto-detected from 5173 upward)
 * Run: node scripts/verify-boost.mjs
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, 'verify-screenshots')

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

const raf = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(r)))

async function getBoostState(page) {
  return page.evaluate(() => {
    const g = window.__ECHO_RACE_TEST__.getRaceState()
    return {
      charge: window.gameRef?.current?.boostState?.charge ?? 0,
      active: window.gameRef?.current?.boostState?.active ?? false,
      playerSpeed: g.playerSpeed,
      playerPos: g.playerPos,
      playerX: g.playerX,
      pickups: window.gameRef?.current?.pickups?.length ?? 0,
      pickupStates: window.gameRef?.current?.pickupStates?.map(s => s.respawnTimer) ?? [],
    }
  })
}

// (a) Always-accel: car accelerates without throttle held
async function alwaysAccelPass(page) {
  console.log('\n(a) Always-accel test: car accelerates without up/W held')
  await page.evaluate(() => {
    window.__ECHO_RACE_TEST__.setMode('race')
    window.__ECHO_RACE_TEST__.setOverride({ pos: 5000, playerX: 0, speed: 0 })
    // Do NOT hold up — alwaysAccel should accelerate on its own
    window.__ECHO_RACE_TEST__.freeze()
  })

  await raf(page)
  const before = await getBoostState(page)
  
  // Wait ~1 second of frames
  for (let i = 0; i < 60; i++) await raf(page)
  
  const after = await getBoostState(page)
  console.log(`  Before: speed=${before.playerSpeed.toFixed(0)}`)
  console.log(`  After:  speed=${after.playerSpeed.toFixed(0)}`)
  
  if (after.playerSpeed > before.playerSpeed + 1000) {
    console.log('  ✓ Car accelerated without throttle held (always-accel works)')
  } else {
    throw new Error(`Always-accel failed: speed didn't increase (${before.playerSpeed} -> ${after.playerSpeed})`)
  }
}

// (b) Boost activation: charge meter fills, fire boost, confirm speed increase
async function boostActivationPass(page) {
  console.log('\n(b) Boost activation test: charge meter + manual fire')
  await page.evaluate(() => {
    window.__ECHO_RACE_TEST__.setOverride({ pos: 8000, playerX: 0, speed: 8000 })
    window.__ECHO_RACE_TEST__.freeze()
  })

  // Wait for charge to fill (charge rate is 0.12/sec, need 0.15 minimum = ~1.3sec)
  for (let i = 0; i < 90; i++) await raf(page)
  
  const beforeFire = await getBoostState(page)
  console.log(`  Charge before fire: ${beforeFire.charge.toFixed(2)}`)
  
  if (beforeFire.charge < 0.15) {
    throw new Error(`Charge didn't fill: ${beforeFire.charge} (expected >= 0.15)`)
  }

  // Fire boost (simulate E key press)
  await page.evaluate(() => {
    const keys = window.keysRef?.current
    if (keys) keys.boost = true
  })
  await raf(page)
  
  const afterFire = await getBoostState(page)
  console.log(`  Charge after fire: ${afterFire.charge.toFixed(2)}`)
  console.log(`  Boost active: ${afterFire.active}`)
  console.log(`  Speed: ${beforeFire.playerSpeed.toFixed(0)} -> ${afterFire.playerSpeed.toFixed(0)}`)
  
  if (!afterFire.active) {
    throw new Error('Boost did not activate')
  }
  if (afterFire.charge > 0.05) {
    throw new Error(`Charge not consumed: ${afterFire.charge} (expected ~0)`)
  }
  
  console.log('  ✓ Boost activated and charge consumed')
  
  // Screenshot active boost
  await page.locator('canvas').screenshot({ path: path.join(OUT_DIR, 'boost-active.png') })
}

// (c) Boost meter refills after use
async function boostRefillPass(page) {
  console.log('\n(c) Boost refill test: meter refills after activation')
  await page.evaluate(() => {
    window.__ECHO_RACE_TEST__.freeze()
  })

  const before = await getBoostState(page)
  console.log(`  Charge before wait: ${before.charge.toFixed(2)}`)
  
  // Wait ~2 seconds for refill (charge rate 0.12/sec = ~0.24 charge)
  for (let i = 0; i < 120; i++) await raf(page)
  
  const after = await getBoostState(page)
  console.log(`  Charge after wait: ${after.charge.toFixed(2)}`)
  
  if (after.charge > before.charge + 0.2) {
    console.log('  ✓ Boost meter refilled naturally')
  } else {
    throw new Error(`Boost meter didn't refill: ${before.charge} -> ${after.charge}`)
  }
}

// (d) Track pickup collection: place player on a pickup, confirm boost fires
async function pickupCollectionPass(page) {
  console.log('\n(d) Pickup collection test: run over a pickup, boost fires')
  
  // Get the first pickup position from the track
  const pickupPos = await page.evaluate(() => {
    const pickups = window.gameRef?.current?.pickups ?? []
    if (pickups.length === 0) throw new Error('Track has no pickups')
    return { segment: pickups[0].segment, offset: pickups[0].offset }
  })
  
  console.log(`  Pickup at segment ${pickupPos.segment}, offset ${pickupPos.offset}`)
  
  // Place player on the pickup
  await page.evaluate((seg) => {
    window.__ECHO_RACE_TEST__.setOverride({
      pos: seg * 200, // segment to world units
      playerX: window.gameRef.current.pickups[0].offset,
      speed: 5000,
    })
    window.__ECHO_RACE_TEST__.freeze()
  }, pickupPos.segment)

  await raf(page)
  const before = await getBoostState(page)
  console.log(`  Before: active=${before.active}, respawn=${before.pickupStates[0]?.toFixed(1)}`)
  
  // Run a few frames to trigger collection
  for (let i = 0; i < 10; i++) await raf(page)
  
  const after = await getBoostState(page)
  console.log(`  After:  active=${after.active}, respawn=${after.pickupStates[0]?.toFixed(1)}`)
  
  if (after.active && after.pickupStates[0] > 0) {
    console.log('  ✓ Pickup collected, boost activated, respawn timer armed')
  } else {
    throw new Error(`Pickup collection failed: active=${after.active}, timer=${after.pickupStates[0]}`)
  }
}

// (e) Pickup respawn: confirm pickup disappears and reappears
async function pickupRespawnPass(page) {
  console.log('\n(e) Pickup respawn test: pickup reappears after respawn time')
  
  const before = await getBoostState(page)
  console.log(`  Respawn timer before: ${before.pickupStates[0]?.toFixed(1)}s`)
  
  if (before.pickupStates[0] <= 0) {
    throw new Error('Pickup should be respawning from previous test')
  }
  
  // We won't actually wait 18 seconds; just confirm the timer counts down
  for (let i = 0; i < 60; i++) await raf(page)
  
  const after = await getBoostState(page)
  console.log(`  Respawn timer after:  ${after.pickupStates[0]?.toFixed(1)}s`)
  
  if (after.pickupStates[0] < before.pickupStates[0] - 0.5) {
    console.log('  ✓ Respawn timer counting down (pickup will reappear)')
  } else {
    throw new Error(`Respawn timer not decrementing: ${before.pickupStates[0]} -> ${after.pickupStates[0]}`)
  }
}

async function main() {
  const port = await discoverPort()
  console.log(`Using dev server at http://localhost:${port}`)
  
  await mkdir(OUT_DIR, { recursive: true })
  
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  
  try {
    await page.goto(`http://localhost:${port}/race?verify=1`)
    await page.waitForFunction(() => typeof window.__ECHO_RACE_TEST__ !== 'undefined', { timeout: 5000 })
    
    await alwaysAccelPass(page)
    await boostActivationPass(page)
    await boostRefillPass(page)
    await pickupCollectionPass(page)
    await pickupRespawnPass(page)
    
    console.log('\n✓ All boost system tests passed')
  } catch (err) {
    console.error('\n✗ Test failed:', err.message)
    process.exit(1)
  } finally {
    await browser.close()
  }
}

main()
