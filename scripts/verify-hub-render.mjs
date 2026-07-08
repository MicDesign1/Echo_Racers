/**
 * Headless sanity for the Phase-1 walkable hub (src/screens/HubScene.jsx):
 *   1. the scene constructs and exposes its verify hook,
 *   2. all three Mana Seed player sprite layers resolve (load),
 *   3. the Trial Gate interaction zone triggers at the right distance
 *      (inside its radius true, just outside false),
 *   4. keyboard-style movement walks + faces correctly and cannot pass
 *      through an obstacle (slides/stops at its edge),
 *   5. position persists across a reload (per-profile localStorage).
 * Mirrors scripts/verify-opponents-render.mjs (Vite port auto-detect, a
 * verify-gated window hook driven directly rather than through rAF timing).
 * Prereq: dev server running.  Run: node scripts/verify-hub-render.mjs
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
      const res = await fetch(`http://localhost:${port}/hub`, { signal: AbortSignal.timeout(600) })
      if (res.ok) return String(port)
    } catch {
      // try next port
    }
  }
  throw new Error('No Vite dev server found on ports 5173–5190')
}

function approx(a, b, eps = 1.5) {
  return Math.abs(a - b) <= eps
}

async function main() {
  const PORT = await discoverPort()
  const BASE_URL = `http://localhost:${PORT}/hub?verify=1`
  console.log(`Using dev server at ${BASE_URL}`)

  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })

  // 1. Scene constructs / hook present.
  const hasHook = await page.evaluate(() => !!window.__ECHO_HUB_TEST__)
  if (!hasHook) throw new Error('verify hook __ECHO_HUB_TEST__ missing (scene did not construct)')

  // 2. All three sprite layers resolve.
  await page.waitForFunction(() => {
    const s = window.__ECHO_HUB_TEST__.getState()
    return s.layersLoaded === true
  }, null, { timeout: 10000 })
  const state0 = await page.evaluate(() => window.__ECHO_HUB_TEST__.getState())
  if (state0.layerCount !== 3) throw new Error(`expected 3 sprite layers, got ${state0.layerCount}`)
  console.log(`  sprite layers: ${state0.layerCount} resolved`)

  // 3. Zone triggers at the right distance.
  const gate = await page.evaluate(() => window.__ECHO_HUB_TEST__.getGate())
  const zone = await page.evaluate(({ gx, gy, r }) => {
    const H = window.__ECHO_HUB_TEST__
    H.setPos(gx, gy)
    const center = H.getState().inZone
    H.setPos(gx + (r - 4), gy)
    const justInside = H.getState().inZone
    H.setPos(gx + (r + 4), gy)
    const justOutside = H.getState().inZone
    return { center, justInside, justOutside }
  }, { gx: gate.x, gy: gate.y, r: gate.radius })
  if (!zone.center) throw new Error('zone: player at gate center not detected inside')
  if (!zone.justInside) throw new Error(`zone: player ${4}px inside radius not detected inside`)
  if (zone.justOutside) throw new Error(`zone: player ${4}px outside radius wrongly detected inside`)
  console.log(`  trial gate: triggers inside r=${gate.radius}, clears outside`)

  // 4. Movement + facing + obstacle collision (slide/stop at edge).
  const obstacles = await page.evaluate(() => window.__ECHO_HUB_TEST__.getObstacles())
  const facings = await page.evaluate(() => {
    const H = window.__ECHO_HUB_TEST__
    const out = {}
    // Open spot away from obstacles/gate.
    H.setPos(480, 300)
    out.right = H.simulateMove(1, 0, 400)
    H.setPos(480, 300)
    out.left = H.simulateMove(-1, 0, 400)
    H.setPos(480, 300)
    out.down = H.simulateMove(0, 1, 400)
    H.setPos(480, 300)
    out.up = H.simulateMove(0, -1, 400)
    return out
  })
  if (facings.right.facing !== 'right' || !(facings.right.x > 480)) throw new Error(`move right failed: ${JSON.stringify(facings.right)}`)
  if (facings.left.facing !== 'left' || !(facings.left.x < 480)) throw new Error(`move left failed: ${JSON.stringify(facings.left)}`)
  if (facings.down.facing !== 'down' || !(facings.down.y > 300)) throw new Error(`move down failed: ${JSON.stringify(facings.down)}`)
  if (facings.up.facing !== 'up' || !(facings.up.y < 300)) throw new Error(`move up failed: ${JSON.stringify(facings.up)}`)
  console.log(`  walk: all 4 directions move + face correctly`)

  const o = obstacles[0]
  const feet = await page.evaluate(({ ox, oy, oh }) => {
    const H = window.__ECHO_HUB_TEST__
    // Start just left of the obstacle, feet vertically inside its span, and
    // walk right into it for a generous duration.
    H.setPos(ox - 60, oy + oh - 4)
    const start = H.getState().x
    const end = H.simulateMove(1, 0, 2000)
    return { start, endX: end.x }
  }, { ox: o.x, oy: o.y, oh: o.h })
  if (!(feet.endX > feet.start)) throw new Error(`collision: player did not walk toward obstacle (start ${feet.start} end ${feet.endX})`)
  if (feet.endX >= o.x) throw new Error(`collision: player penetrated obstacle (endX ${feet.endX.toFixed(1)} >= obstacle left ${o.x})`)
  console.log(`  collision: stopped at obstacle edge (endX=${feet.endX.toFixed(1)}, wall=${o.x})`)

  // 5. Position persists across reload.
  const persistTarget = { x: 300, y: 500 }
  await page.evaluate(({ x, y }) => {
    const H = window.__ECHO_HUB_TEST__
    H.setPos(x, y)
    H.save()
  }, persistTarget)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(() => !!window.__ECHO_HUB_TEST__, null, { timeout: 8000 })
  const restored = await page.evaluate(() => window.__ECHO_HUB_TEST__.getState())
  if (!approx(restored.x, persistTarget.x, 2) || !approx(restored.y, persistTarget.y, 2)) {
    throw new Error(`persist: expected ~(${persistTarget.x},${persistTarget.y}), got (${restored.x.toFixed(1)},${restored.y.toFixed(1)})`)
  }
  console.log(`  persist: position restored after reload (${restored.x.toFixed(0)},${restored.y.toFixed(0)})`)

  // Screenshot for the record: player standing in the gate.
  await page.evaluate(({ gx, gy }) => window.__ECHO_HUB_TEST__.setPos(gx, gy + 40), { gx: gate.x, gy: gate.y })
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  await page.locator('canvas').screenshot({ path: path.join(OUT_DIR, 'hub-scene.png') })

  console.log('PASS hub render sanity')
  await browser.close()
}

main().catch((err) => {
  console.error('FAIL', err.message)
  process.exit(1)
})
