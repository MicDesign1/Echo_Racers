/**
 * Dev-only tool: renders the FULL hub map (all tile layers, no HUD chrome
 * needed) to tmp/hub-snapshot.png, so an agent/dev can actually look at the
 * map. Reuses the real HubScene + its __ECHO_HUB_TEST__ verify hook (same
 * approach as verify-hub-render.mjs) rather than reimplementing tile drawing
 * standalone, so the snapshot can never drift from what the game actually
 * draws. The viewport is sized to the full world so the camera clamp keeps
 * it pinned at (0,0) and the whole map fits in one shot.
 * Prereq: dev server running. Run: node scripts/render-hub-snapshot.mjs
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'tmp')
const OUT_FILE = path.join(OUT_DIR, 'hub-snapshot.png')

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

async function main() {
  const PORT = await discoverPort()
  const BASE_URL = `http://localhost:${PORT}/hub?verify=1`
  console.log(`Using dev server at ${BASE_URL}`)

  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch()

  // First a small pass just to ask the scene its world size.
  const probePage = await browser.newPage({ viewport: { width: 960, height: 640 } })
  await probePage.goto(BASE_URL, { waitUntil: 'networkidle' })
  await probePage.waitForFunction(() => !!window.__ECHO_HUB_TEST__, null, { timeout: 10000 })
  await probePage.waitForFunction(() => window.__ECHO_HUB_TEST__.getState().atlasLoaded === true, null, { timeout: 10000 })
  const world = await probePage.evaluate(() => window.__ECHO_HUB_TEST__.getWorld())
  await probePage.close()

  // Full-map pass: viewport == world size, so the camera clamp pins to (0,0)
  // and every tile is visible in a single frame.
  const page = await browser.newPage({ viewport: { width: world.w, height: world.h } })
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => !!window.__ECHO_HUB_TEST__, null, { timeout: 10000 })
  await page.waitForFunction(() => window.__ECHO_HUB_TEST__.getState().atlasLoaded === true, null, { timeout: 10000 })
  // Park the player off in a corner-adjacent open spot so it doesn't sit on
  // top of interesting map content; entities aren't the point of this shot.
  await page.evaluate(() => window.__ECHO_HUB_TEST__.setPos(48 * 1.5, 48 * 7.5))
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

  await page.locator('canvas').screenshot({ path: OUT_FILE })
  console.log(`Wrote ${OUT_FILE} (${world.w}x${world.h})`)

  await browser.close()
}

main().catch((err) => {
  console.error('FAIL', err.message)
  process.exit(1)
})
