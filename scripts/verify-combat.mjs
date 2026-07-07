/**
 * Verification for the minimal auto-attack combat feel pass (CLAUDE.md
 * COMBAT DESIGN). Exercises the real running game via the same verify hook
 * the opponent-render regression uses (window.__ECHO_RACE_TEST__):
 *
 *   (a) hold the player alongside a rival past the cooldown period and
 *       confirm an attack fires, measuring the ~15% speed drop in logs and
 *       capturing the traveling telegraph in a screenshot;
 *   (b) confirm the PLAYER is hit under the same conditions, with the
 *       screen-edge pulse armed (playerHitEdgePulse > 0), screenshot;
 *   (c) force two rivals bunched together and capture a rival-vs-rival
 *       exchange (an attack whose attacker and target are both rivals);
 *   (d) confirm ZERO combat events during the countdown and in time-trial;
 *   (e) is the separate opponents-render regression, run on its own.
 *
 * Isolation trick: attackRangeLane (0.7) is wider than collision.rangeLane
 * (0.5), so placing two racers at a lane gap of 0.6 puts them inside attack
 * range but OUTSIDE collision range — combat fires with no collision
 * speed-penalty confounding the measurement.
 *
 * Prereq: dev server running (Vite port auto-detected from 5173 upward)
 * Run: node scripts/verify-combat.mjs
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

async function combatState(page) {
  return page.evaluate(() => window.__ECHO_RACE_TEST__.getCombatState())
}

// (a) speed-drop + (b) player-hit + telegraph screenshots. Player and rival
// pinned at delta 400 / lane gap 0.6: inside attack range, outside collision
// range. Player speed is NOT pinned (setOverride omits speed) and holdUp is
// held, so speed climbs and a combat hit shows as a sharp single-frame dip.
async function playerVsRivalPass(page) {
  await page.evaluate(() => {
    window.__ECHO_RACE_TEST__.setMode('race')
    window.__ECHO_RACE_TEST__.setOverride({
      pos: 8000,
      playerX: 0,
      rivals: [
        { rivalIndex: 0, delta: 400, x: 0.6, speed: 6000 },
        { rivalIndex: 1, delta: 90000, x: 0 },
        { rivalIndex: 2, delta: 90000, x: 0 },
      ],
    })
    window.__ECHO_RACE_TEST__.holdUp(true)
  })

  const baseline = await combatState(page)
  const samples = []
  let prevSpeed = null
  const drops = []
  let telegraphShot = false
  let edgePulseShot = false

  // ~5s of frames — long enough to clear the 3s cooldown at least once.
  for (let i = 0; i < 320; i++) {
    await raf(page)
    const s = await combatState(page)
    samples.push({ i, speed: s.playerSpeed, events: s.events, cd: s.playerAttackCooldown })
    if (prevSpeed != null && prevSpeed > 3000 && s.playerSpeed < prevSpeed * 0.92) {
      drops.push({ i, before: prevSpeed, after: s.playerSpeed, pct: 1 - s.playerSpeed / prevSpeed })
    }
    prevSpeed = s.playerSpeed
    if (!telegraphShot && s.activeAttacks > 0) {
      await page.locator('canvas').screenshot({ path: path.join(OUT_DIR, 'combat-telegraph.png') })
      telegraphShot = true
    }
    if (!edgePulseShot && s.playerHitEdgePulse > 0) {
      await page.locator('canvas').screenshot({ path: path.join(OUT_DIR, 'combat-player-hit.png') })
      edgePulseShot = true
    }
  }

  await page.evaluate(() => window.__ECHO_RACE_TEST__.holdUp(false))
  const final = await combatState(page)
  return {
    eventsFired: final.events - baseline.events,
    playerHits: final.playerHits - baseline.playerHits,
    drops,
    telegraphShot,
    edgePulseShot,
    samples,
  }
}

// (c) two rivals bunched, player far away. Rivals 0 and 1 sit 400 apart at
// lane gap 0.6; the player is thousands of units back so it's out of range
// of both — any attack fired must be rival-vs-rival.
async function rivalVsRivalPass(page) {
  await page.evaluate(() => {
    window.__ECHO_RACE_TEST__.setMode('race')
    window.__ECHO_RACE_TEST__.freeze()
    window.__ECHO_RACE_TEST__.setOverride({
      pos: 8000,
      playerX: 0,
      speed: 0,
      rivals: [
        { rivalIndex: 0, delta: 5000, x: 0.0, speed: 6000 },
        { rivalIndex: 1, delta: 5400, x: 0.6, speed: 6000 },
        { rivalIndex: 2, delta: 90000, x: 0 },
      ],
    })
  })

  const baseline = await combatState(page)
  let shot = false
  let exchange = 0
  for (let i = 0; i < 60; i++) {
    await raf(page)
    const s = await combatState(page)
    // rival0 and rival1 both on cooldown => they've fired at each other
    if (s.opponents[0].attackCooldown > 0 && s.opponents[1].attackCooldown > 0) exchange += 1
    if (!shot && s.activeAttacks > 0) {
      await page.locator('canvas').screenshot({ path: path.join(OUT_DIR, 'combat-rival-vs-rival.png') })
      shot = true
    }
  }
  const final = await combatState(page)
  return {
    eventsFired: final.events - baseline.events,
    playerHits: final.playerHits - baseline.playerHits, // must stay 0
    mutualCooldownFrames: exchange,
    shot,
  }
}

// (d1) no combat during the countdown. Re-arm the countdown, place two
// racers point-blank, and confirm the event counter never moves while the
// countdown is running.
async function countdownGatePass(page) {
  await page.evaluate(() => {
    window.__ECHO_RACE_TEST__.setMode('race')
    window.__ECHO_RACE_TEST__.setOverride({
      pos: 8000,
      playerX: 0,
      speed: 6000,
      rivals: [
        { rivalIndex: 0, delta: 200, x: 0.2, speed: 6000 },
        { rivalIndex: 1, delta: 90000, x: 0 },
        { rivalIndex: 2, delta: 90000, x: 0 },
      ],
    })
    window.__ECHO_RACE_TEST__.startCountdown()
  })
  const baseline = await combatState(page)
  let maxCountdown = 0
  for (let i = 0; i < 45; i++) {
    await raf(page)
    const s = await combatState(page)
    maxCountdown = Math.max(maxCountdown, s.countdownRemaining)
    if (s.countdownRemaining <= 0) break
  }
  const during = await combatState(page)
  return {
    eventsWhileCounting: during.events - baseline.events,
    sawCountdown: maxCountdown > 0,
  }
}

// (d2) no combat in time-trial. Flip RACE.mode to timetrial, place two
// racers point-blank, run, confirm the event counter never moves. Restore
// race mode afterward.
async function timeTrialGatePass(page) {
  await page.evaluate(() => {
    window.__ECHO_RACE_TEST__.setMode('timetrial')
    window.__ECHO_RACE_TEST__.setOverride({
      pos: 8000,
      playerX: 0,
      speed: 6000,
      rivals: [
        { rivalIndex: 0, delta: 200, x: 0.2, speed: 6000 },
        { rivalIndex: 1, delta: 90000, x: 0 },
        { rivalIndex: 2, delta: 90000, x: 0 },
      ],
    })
    window.__ECHO_RACE_TEST__.holdUp(true)
  })
  const baseline = await combatState(page)
  for (let i = 0; i < 90; i++) await raf(page)
  const after = await combatState(page)
  await page.evaluate(() => {
    window.__ECHO_RACE_TEST__.holdUp(false)
    window.__ECHO_RACE_TEST__.setMode('race')
  })
  return { eventsInTimeTrial: after.events - baseline.events, mode: after.mode }
}

async function main() {
  const PORT = await discoverPort()
  const BASE_URL = `http://localhost:${PORT}/race?verify=1`
  console.log(`Using dev server at ${BASE_URL}`)
  await mkdir(OUT_DIR, { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  const ok = await page.evaluate(() => !!window.__ECHO_RACE_TEST__?.getCombatState)
  if (!ok) throw new Error(`combat verify hook missing at ${BASE_URL}`)

  const pvr = await playerVsRivalPass(page)
  const rvr = await rivalVsRivalPass(page)
  const cdg = await countdownGatePass(page)
  const ttg = await timeTrialGatePass(page)

  const problems = []
  if (pvr.eventsFired < 1) problems.push('(a) no combat events fired while alongside a rival')
  if (pvr.drops.length < 1) problems.push('(a) no measurable player speed drop recorded')
  if (!pvr.telegraphShot) problems.push('(a) telegraph screenshot not captured')
  if (pvr.playerHits < 1) problems.push('(b) player was never hit')
  if (!pvr.edgePulseShot) problems.push('(b) player-hit edge-pulse screenshot not captured')
  if (rvr.eventsFired < 1) problems.push('(c) no rival-vs-rival events fired')
  if (rvr.playerHits !== 0) problems.push('(c) player was hit during the rival-vs-rival isolation')
  if (!rvr.shot) problems.push('(c) rival-vs-rival screenshot not captured')
  if (!cdg.sawCountdown) problems.push('(d) countdown never observed active')
  if (cdg.eventsWhileCounting !== 0) problems.push(`(d) ${cdg.eventsWhileCounting} combat events fired during countdown`)
  if (ttg.eventsInTimeTrial !== 0) problems.push(`(d) ${ttg.eventsInTimeTrial} combat events fired in time-trial`)

  console.log('\n--- combat verification ---')
  console.log(`(a) events fired alongside rival: ${pvr.eventsFired}`)
  for (const d of pvr.drops) {
    console.log(`    speed drop @frame ${d.i}: ${d.before.toFixed(0)} -> ${d.after.toFixed(0)} (${(d.pct * 100).toFixed(1)}%)`)
  }
  console.log(`    telegraph screenshot: ${pvr.telegraphShot}`)
  console.log(`(b) player hits: ${pvr.playerHits}, edge-pulse screenshot: ${pvr.edgePulseShot}`)
  console.log(`(c) rival-vs-rival events: ${rvr.eventsFired}, player hits (must be 0): ${rvr.playerHits}, mutual-cooldown frames: ${rvr.mutualCooldownFrames}, screenshot: ${rvr.shot}`)
  console.log(`(d) countdown observed: ${cdg.sawCountdown}, events during countdown: ${cdg.eventsWhileCounting}`)
  console.log(`(d) events in time-trial: ${ttg.eventsInTimeTrial} (mode after=${ttg.mode})`)

  await browser.close()

  if (problems.length) {
    console.error('\nFAIL combat verification:')
    for (const p of problems) console.error('  - ' + p)
    process.exit(1)
  }
  console.log('\nPASS combat verification')
}

main().catch((err) => {
  console.error('FAIL', err.message)
  process.exit(1)
})
