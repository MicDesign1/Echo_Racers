// Dev-only helper: render an atlas (any file under public/sprites/hub/tiles/)
// upscaled with a labeled 16px grid, so tile cells can be picked by (col,row)
// for hand-authoring/verifying hubMap.js data. Not part of the game or the
// verify suite. Run: node scripts/inspect-tileset.mjs [filename.png]
import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ATLAS_FILE = process.argv[2] || 'forest-summer.png'
const OUT = path.join(__dirname, 'verify-screenshots', `tileset-grid-${path.parse(ATLAS_FILE).name}.png`)
const PORT = process.env.PORT || '5177'
const ATLAS = `http://localhost:${PORT}/sprites/hub/tiles/${ATLAS_FILE}`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } })
await page.goto(`http://localhost:${PORT}/hub`, { waitUntil: 'domcontentloaded' })
await page.setContent('<canvas id="c" width="1088" height="1088"></canvas>')
await page.evaluate(async (atlas) => {
  const img = new Image()
  img.src = atlas
  await img.decode()
  const c = document.getElementById('c')
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = false
  const TILE = 16
  const S = 4 // scale
  const off = 32 // label gutter
  ctx.fillStyle = '#222'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(img, 0, 0, img.width, img.height, off, off, img.width * S, img.height * S)
  ctx.strokeStyle = 'rgba(255,0,255,0.5)'
  ctx.fillStyle = '#0ff'
  ctx.font = '12px monospace'
  ctx.textAlign = 'center'
  const cols = img.width / TILE
  const rows = img.height / TILE
  for (let x = 0; x <= cols; x++) {
    ctx.beginPath(); ctx.moveTo(off + x * TILE * S, off); ctx.lineTo(off + x * TILE * S, off + rows * TILE * S); ctx.stroke()
    if (x < cols) ctx.fillText(String(x), off + x * TILE * S + (TILE * S) / 2, 20)
  }
  for (let y = 0; y <= rows; y++) {
    ctx.beginPath(); ctx.moveTo(off, off + y * TILE * S); ctx.lineTo(off + cols * TILE * S, off + y * TILE * S); ctx.stroke()
    if (y < rows) ctx.fillText(String(y), 14, off + y * TILE * S + (TILE * S) / 2 + 4)
  }
}, ATLAS)
await page.locator('#c').screenshot({ path: OUT })
await browser.close()
console.log('wrote', OUT)
