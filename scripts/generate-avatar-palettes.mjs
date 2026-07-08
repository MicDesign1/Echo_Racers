/**
 * Generates src/data/avatarPalettes.js from the OFFICIAL Mana Seed variant
 * files (exact pixels — never eyeballed). Each style ships ONE source sheet
 * (the v00/v01 "base ramp" variant, see avatarManifest.js); its selectable
 * colors are the other variants of that same style. This script derives, per
 * style:
 *   - sourceRamp : the ordered set of source colors that get recolored across
 *                  variants (the "ramp"), dark -> light by luminance.
 *   - colors[]   : one entry per variant { id, swatch, ramp } where ramp[i] is
 *                  the color that sourceRamp[i] becomes in that variant. The
 *                  correspondence is read by PIXEL LOCATION (same art, recolored
 *                  palette) so it's exact and index-aligned — no shader, no
 *                  luminance-guessing across palettes.
 * Non-ramp pixels (outline, eyes, anything identical across variants) are left
 * out of the ramp, so the runtime swap touches only what actually recolors.
 *
 * Prereq: dev server running (serves /sprites/hub/layers/*.png from public/).
 * Run:    node scripts/generate-avatar-palettes.mjs
 */
import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AVATAR_STYLES } from '../src/data/avatarManifest.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_FILE = path.join(__dirname, '..', 'src', 'data', 'avatarPalettes.js')
const LAYER_DIR = '/sprites/hub/layers'

// Color variant files per style id (color axis = the vNN number). Index order
// here IS the color id order (c00, c01, ...). The FIRST entry must equal the
// style's source sheet in avatarManifest.js, so c00 is the identity/default.
const VARIANT_FILES = {
  human: range(0, 10).map((n) => `char_a_p1_0bas_humn_v${p2(n)}.png`),
  forester: range(1, 5).map((n) => `char_a_p1_1out_fstr_v${p2(n)}.png`),
  farmer: range(1, 5).map((n) => `char_a_p1_1out_pfpn_v${p2(n)}.png`),
  bob: range(0, 13).map((n) => `char_a_p1_4har_bob1_v${p2(n)}.png`),
  dap: range(0, 13).map((n) => `char_a_p1_4har_dap1_v${p2(n)}.png`),
}

function range(a, b) { const o = []; for (let i = a; i <= b; i++) o.push(i); return o }
function p2(n) { return String(n).padStart(2, '0') }

async function discoverPort() {
  if (process.env.PORT) return String(process.env.PORT)
  for (let port = 5173; port <= 5190; port++) {
    try {
      const res = await fetch(`http://localhost:${port}/hub`, { signal: AbortSignal.timeout(600) })
      if (res.ok) return String(port)
    } catch { /* try next */ }
  }
  throw new Error('No Vite dev server found on ports 5173–5190')
}

async function main() {
  const PORT = await discoverPort()
  const BASE = `http://localhost:${PORT}`
  console.log(`Generating avatar palettes from ${BASE}${LAYER_DIR}`)

  const browser = await chromium.launch()
  const page = await browser.newPage()
  // Load a same-origin page so image fetches below aren't treated as CORS.
  await page.goto(`${BASE}/hub`, { waitUntil: 'domcontentloaded' })

  const result = {} // slot -> styleId -> { sourceRamp, colors }

  for (const slot of Object.keys(AVATAR_STYLES)) {
    result[slot] = {}
    for (const style of AVATAR_STYLES[slot]) {
      const files = VARIANT_FILES[style.id]
      if (!files) throw new Error(`no VARIANT_FILES for style ${style.id}`)
      const sourceUrl = `${BASE}${style.src}`
      const variantUrls = files.map((f) => `${BASE}${LAYER_DIR}/${f}`)

      const data = await page.evaluate(async ({ sourceUrl, variantUrls }) => {
        async function pixels(url) {
          const img = new Image()
          img.src = url
          await img.decode()
          const c = document.createElement('canvas')
          c.width = img.naturalWidth
          c.height = img.naturalHeight
          const ctx = c.getContext('2d', { willReadFrequently: true })
          ctx.imageSmoothingEnabled = false
          ctx.drawImage(img, 0, 0)
          return { data: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }
        }
        const key = (r, g, b) => (r << 16) | (g << 8) | b
        const src = await pixels(sourceUrl)
        const variants = []
        for (const u of variantUrls) variants.push(await pixels(u))

        // For each source color, record the target color at the same location
        // in each variant (first occurrence). Track which source colors ever
        // change (the ramp) vs. stay identical (outline/eyes -> ignored).
        const srcSeen = new Map() // srcKey -> { r,g,b, targets: [key per variant] }
        const n = src.data.length / 4
        for (let i = 0; i < n; i++) {
          const o = i * 4
          if (src.data[o + 3] < 128) continue // treat as transparent
          const r = src.data[o], g = src.data[o + 1], b = src.data[o + 2]
          const sk = key(r, g, b)
          let rec = srcSeen.get(sk)
          if (!rec) { rec = { r, g, b, targets: new Array(variants.length).fill(null) }; srcSeen.set(sk, rec) }
          for (let v = 0; v < variants.length; v++) {
            if (rec.targets[v] !== null) continue
            const vd = variants[v].data
            if (vd[o + 3] < 128) continue
            rec.targets[v] = key(vd[o], vd[o + 1], vd[o + 2])
          }
        }

        const changed = []
        for (const [sk, rec] of srcSeen) {
          if (rec.targets.some((t) => t !== null && t !== sk)) changed.push(rec)
        }
        // Order the ramp dark -> light by luminance for a stable, readable index.
        const lum = (c) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
        changed.sort((a, b2) => lum(a) - lum(b2))

        const toHex = (k) => '#' + (k & 0xffffff).toString(16).padStart(6, '0')
        const sourceRamp = changed.map((c) => toHex(key(c.r, c.g, c.b)))
        // Representative swatch: a slightly-light ramp entry (index ~60%).
        const swIdx = Math.min(changed.length - 1, Math.max(0, Math.round((changed.length - 1) * 0.6)))
        const colors = variantUrls.map((u, v) => {
          const ramp = changed.map((c) => {
            const t = c.targets[v]
            return toHex(t == null ? key(c.r, c.g, c.b) : t)
          })
          return { swatch: ramp[swIdx] || sourceRamp[swIdx] || '#000000', ramp }
        })
        return { sourceRamp, colors }
      }, { sourceUrl, variantUrls })

      result[slot][style.id] = {
        sourceRamp: data.sourceRamp,
        colors: data.colors.map((c, i) => ({ id: `c${p2(i)}`, swatch: c.swatch, ramp: c.ramp })),
      }
      console.log(`  ${slot}/${style.id}: ramp ${data.sourceRamp.length} shades, ${data.colors.length} colors`)
    }
  }

  await browser.close()

  const header = `// GENERATED by scripts/generate-avatar-palettes.mjs — do not edit by hand.
// Exact color ramps extracted from the official Mana Seed variant sprites.
// Shape: AVATAR_PALETTES[slot][styleId] = { sourceRamp:[hex], colors:[{id,swatch,ramp:[hex]}] }
// The compositor (engine/avatarComposite.js) maps sourceRamp[i] -> ramp[i]
// by exact RGB match; non-ramp pixels are untouched, alpha preserved.
`
  const body = `export const AVATAR_PALETTES = ${JSON.stringify(result, null, 2)}\n`
  await writeFile(OUT_FILE, header + body, 'utf8')
  console.log(`Wrote ${OUT_FILE}`)
}

main().catch((err) => {
  console.error('FAIL', err.message)
  process.exit(1)
})
