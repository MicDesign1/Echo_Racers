import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
async function port() { for (let p = 5173; p <= 5190; p++) { try { const r = await fetch(`http://localhost:${p}/hub`, { signal: AbortSignal.timeout(500) }); if (r.ok) return p } catch { /* next */ } } throw new Error('no server') }
const P = await port()
const b = await chromium.launch()
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } })
await pg.goto(`http://localhost:${P}/hub`, { waitUntil: 'networkidle' })
await pg.waitForTimeout(1300)
await pg.screenshot({ path: path.join(__dirname, 'verify-screenshots', '_hub_big.png') })

// Simulate a stale saved position UNDER a tree canopy, then confirm reset to spawn.
await pg.goto(`http://localhost:${P}/hub?verify=1`, { waitUntil: 'networkidle' })
await pg.evaluate(() => {
  const k = 'echoRacers.default.settings'
  const s = JSON.parse(localStorage.getItem(k) || '{}')
  s.hub = { x: 13.5 * 48, y: 9.5 * 48, facing: 'down' } // under interior tree canopy
  localStorage.setItem(k, JSON.stringify(s))
})
await pg.reload({ waitUntil: 'networkidle' })
await pg.waitForFunction(() => !!window.__ECHO_HUB_TEST__, null, { timeout: 8000 })
const st = await pg.evaluate(() => window.__ECHO_HUB_TEST__.getState())
await b.close()
console.log('after stale-under-canopy reload, player at:', st.x, st.y, '(spawn=984,1080)')
