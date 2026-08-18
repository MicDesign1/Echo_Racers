import { chromium } from 'playwright'

const PORT = 5173
const url = `http://localhost:${PORT}/hub?verify=1`

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 960, height: 640 } })

// Listen for console messages
page.on('console', msg => {
  if (msg.type() === 'log') {
    console.log('BROWSER:', msg.text())
  }
})

await page.goto(url, { waitUntil: 'networkidle' })

// Wait for scene to load
await page.waitForFunction(() => {
  const s = window.__ECHO_HUB_TEST__?.getState()
  return s?.atlasLoaded === true && s?.composited === true
}, null, { timeout: 10000 })

console.log('Scene loaded')

// Start walking right from near the east edge
const result = await page.evaluate(async () => {
  const H = window.__ECHO_HUB_TEST__
  const info = H.getMapInfo()
  const TW = info.tilePx
  
  console.log(`Starting at ${info.mapId}, size ${info.w}x${info.h}, TW=${TW}`)
  console.log(`Chunk width in px: ${info.w * TW}`)
  
  // Position near right edge
  H.setPos((info.w - 2) * TW, 7 * TW)
  const before = H.getState()
  console.log(`Before: x=${before.x.toFixed(1)}, mapId=${before.mapId}`)
  
  // Walk right for 3 seconds
  const after = H.simulateMove(1, 0, 3000)
  console.log(`After: x=${after.x.toFixed(1)}, mapId=${after.mapId}`)
  
  return { before, after }
})

console.log('Result:', result)

await browser.close()
