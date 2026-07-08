/**
 * Headless sanity for the walkable hub (src/screens/HubScene.jsx):
 *   1. the scene constructs and exposes its verify hook,
 *   2. the player's composited avatar sheet builds (palette compositor),
 *   3. every interaction zone triggers at the right distance (inside radius
 *      true, just outside clears), driven from HUB.zones data,
 *   4. the palette-swap composite of a NON-default look is 512x512, contains a
 *      target-ramp color, and is built once per descriptor (not per call),
 *   5. keyboard-style movement walks + faces correctly and cannot pass through
 *      an obstacle (slides/stops at its edge),
 *   6. position persists across a reload (per-profile localStorage).
 * Mirrors scripts/verify-opponents-render.mjs (Vite port auto-detect, a
 * verify-gated window hook driven directly rather than through rAF timing).
 * Prereq: dev server running.  Run: node scripts/verify-hub-render.mjs
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AVATAR_PALETTES } from '../src/data/avatarPalettes.js'

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

  // 2. The player's composited avatar sheet builds.
  await page.waitForFunction(() => window.__ECHO_HUB_TEST__.getState().composited === true, null, { timeout: 10000 })
  console.log(`  avatar composite: player sheet built`)

  // 3. Every zone triggers inside its radius and clears just outside.
  const zones = await page.evaluate(() => window.__ECHO_HUB_TEST__.getZones())
  if (zones.length < 2) throw new Error(`expected >=2 hub zones, got ${zones.length}`)
  for (const z of zones) {
    const r = await page.evaluate(({ zx, zy, rad, id }) => {
      const H = window.__ECHO_HUB_TEST__
      H.setPos(zx, zy)
      const center = H.getState().activeZone
      H.setPos(zx + (rad - 4), zy)
      const justInside = H.getState().activeZone
      H.setPos(zx + (rad + 6), zy)
      const justOutside = H.getState().activeZone
      return { center, justInside, justOutside, id }
    }, { zx: z.x, zy: z.y, rad: z.radius, id: z.id })
    if (r.center !== z.id) throw new Error(`zone ${z.id}: center not active (got ${r.center})`)
    if (r.justInside !== z.id) throw new Error(`zone ${z.id}: inside radius not active (got ${r.justInside})`)
    if (r.justOutside === z.id) throw new Error(`zone ${z.id}: still active just outside radius`)
    console.log(`  zone '${z.label}' (${z.id}): triggers inside r=${z.radius}, clears outside`)
  }

  // 4. Palette-swap composite of a NON-default look.
  const skin = AVATAR_PALETTES.body.human
  const skinIdx = skin.colors.findIndex((c) => c.ramp[0] !== skin.sourceRamp[0])
  if (skinIdx < 0) throw new Error('no non-identity skin color found in palettes')
  const targetHex = skin.colors[skinIdx].ramp[0]
  const descriptor = {
    body: skin.colors[skinIdx].id,
    outfit: 'forester', outfitColor: 'c00',
    hair: 'bob', hairColor: 'c00',
  }
  const probe1 = await page.evaluate(({ d, t }) => window.__ECHO_HUB_TEST__.compositeProbe(d, t), { d: descriptor, t: targetHex })
  if (probe1.width !== 512 || probe1.height !== 512) throw new Error(`composite dims ${probe1.width}x${probe1.height}, expected 512x512`)
  if (!probe1.found) throw new Error(`composite missing target-ramp color ${targetHex}`)
  if (probe1.builtNow !== 1) throw new Error(`expected composite to build once, builtNow=${probe1.builtNow}`)
  const probe2 = await page.evaluate(({ d, t }) => window.__ECHO_HUB_TEST__.compositeProbe(d, t), { d: descriptor, t: targetHex })
  if (probe2.builtNow !== 0) throw new Error(`expected cache hit (builtNow=0) on repeat, got ${probe2.builtNow}`)
  console.log(`  composite: 512x512, target ${targetHex} present, built once then cached`)

  // 5. Movement + facing + obstacle collision (slide/stop at edge).
  const obstacles = await page.evaluate(() => window.__ECHO_HUB_TEST__.getObstacles())
  const facings = await page.evaluate(() => {
    const H = window.__ECHO_HUB_TEST__
    const out = {}
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
    H.setPos(ox - 60, oy + oh - 4)
    const start = H.getState().x
    const end = H.simulateMove(1, 0, 2000)
    return { start, endX: end.x }
  }, { ox: o.x, oy: o.y, oh: o.h })
  if (!(feet.endX > feet.start)) throw new Error(`collision: player did not walk toward obstacle (start ${feet.start} end ${feet.endX})`)
  if (feet.endX >= o.x) throw new Error(`collision: player penetrated obstacle (endX ${feet.endX.toFixed(1)} >= obstacle left ${o.x})`)
  console.log(`  collision: stopped at obstacle edge (endX=${feet.endX.toFixed(1)}, wall=${o.x})`)

  // 6. Position persists across reload.
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

  // Screenshot for the record: player standing near the first zone.
  await page.evaluate(({ zx, zy }) => window.__ECHO_HUB_TEST__.setPos(zx, zy + 40), { zx: zones[0].x, zy: zones[0].y })
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  await page.locator('canvas').screenshot({ path: path.join(OUT_DIR, 'hub-scene.png') })

  console.log('PASS hub render sanity')
  await browser.close()
}

main().catch((err) => {
  console.error('FAIL', err.message)
  process.exit(1)
})
