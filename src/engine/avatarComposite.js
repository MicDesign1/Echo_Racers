// Avatar compositor: turns a plain descriptor
//   { body, outfit, outfitColor, hair, hairColor, hat, hatColor }
// into ONE cached composited sprite sheet (body -> outfit -> hair -> hat), with a
// palette-ramp color swap applied per layer (source ramp -> the chosen color's
// ramp, exact RGB match, alpha preserved, non-ramp pixels untouched).
//
// Caching is two-tier: source layer images are loaded once (module cache), and
// finished composites are cached by a stable stringify of the descriptor — so
// compositing happens once per distinct look, never per frame.
import { AVATAR_STYLES, findStyle, colorList, parseBody } from '../data/avatarManifest.js'
import { AVATAR_PALETTES } from '../data/avatarPalettes.js'

const imageCache = new Map() // src -> { img, promise, loaded }
const compositeCache = new Map() // key -> HTMLCanvasElement
let buildCount = 0 // composites actually built (for verify: once per change)

function loadImage(src) {
  let rec = imageCache.get(src)
  if (rec) return rec
  const img = new Image()
  rec = { img, loaded: false, promise: null }
  rec.promise = new Promise((resolve) => {
    img.onload = () => { rec.loaded = true; resolve(rec) }
    img.onerror = () => { rec.loaded = false; resolve(rec) }
  })
  img.src = src
  imageCache.set(src, rec)
  return rec
}

function hexToKey(hex) {
  const n = parseInt(hex.slice(1), 16)
  return n & 0xffffff
}

// Resolve a descriptor into the ordered layers to draw: each { src, swap }
// where swap maps a source packed-RGB key -> target packed-RGB (identity pairs
// dropped, so unchanged pixels are never touched).
function resolveLayers(descriptor) {
  const out = []
  const add = (slot, styleId, colorId) => {
    const style = slot === 'body' ? AVATAR_STYLES.body[0] : findStyle(slot, styleId)
    const pal = AVATAR_PALETTES[slot]?.[style.id]
    if (!pal) return
    const colors = colorList(slot, style.id)
    const color = colors.find((c) => c.id === colorId) || colors[0]
    const swap = new Map()
    if (color) {
      for (let i = 0; i < pal.sourceRamp.length; i++) {
        const s = hexToKey(pal.sourceRamp[i])
        const t = hexToKey(color.ramp[i] ?? pal.sourceRamp[i])
        if (s !== t) swap.set(s, t)
      }
    }
    out.push({ src: style.src, swap })
  }
  add('body', 'human', descriptor.body)
  add('outfit', descriptor.outfit, descriptor.outfitColor)
  add('hair', descriptor.hair, descriptor.hairColor)
  add('hat', descriptor.hat, descriptor.hatColor) // 'none'/unknown -> no palette -> skipped
  return out
}

// Draw one source image onto ctx with its palette swap applied. Assumes the
// image is loaded and the same dimensions as the sheet.
function drawSwapped(ctx, img, swap, w, h) {
  const tmp = document.createElement('canvas')
  tmp.width = w
  tmp.height = h
  const tctx = tmp.getContext('2d', { willReadFrequently: true })
  tctx.imageSmoothingEnabled = false
  tctx.drawImage(img, 0, 0, w, h)
  if (swap.size > 0) {
    const id = tctx.getImageData(0, 0, w, h)
    const d = id.data
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue
      const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]
      const t = swap.get(key)
      if (t !== undefined) {
        d[i] = (t >> 16) & 0xff
        d[i + 1] = (t >> 8) & 0xff
        d[i + 2] = t & 0xff
      }
    }
    tctx.putImageData(id, 0, 0)
  }
  ctx.drawImage(tmp, 0, 0)
}

export function descriptorKey(descriptor) {
  return [
    descriptor.body, descriptor.outfit, descriptor.outfitColor,
    descriptor.hair, descriptor.hairColor,
    descriptor.hat, descriptor.hatColor,
  ].join('|')
}

// Ensure the composite for `descriptor` exists (loading any missing source
// images first). Resolves to the finished sheet canvas. Cheap on a cache hit.
export async function ensureComposite(descriptor) {
  const key = descriptorKey(descriptor)
  const cached = compositeCache.get(key)
  if (cached) return cached

  // Standalone bodies (pre-baked Mana Seed NPC sheets) short-circuit: no
  // layer compositing, no palette swap, just the loaded sheet image itself
  // cached as "the composite" (an Image draws via ctx.drawImage exactly like
  // a canvas, so callers don't need to care which they got).
  const { styleId, variantId } = parseBody(descriptor.body)
  const bodyStyle = findStyle('body', styleId)
  if (bodyStyle.standalone) {
    const variant = colorList('body', styleId).find((c) => c.id === variantId) || colorList('body', styleId)[0]
    const rec = loadImage(variant.src)
    await rec.promise
    if (!rec.loaded) return null
    compositeCache.set(key, rec.img)
    buildCount += 1
    return rec.img
  }

  const layers = resolveLayers(descriptor)
  const recs = layers.map((l) => loadImage(l.src))
  await Promise.all(recs.map((r) => r.promise))

  const first = recs.find((r) => r.loaded)?.img
  const w = first?.naturalWidth || 512
  const h = first?.naturalHeight || 512

  const sheet = document.createElement('canvas')
  sheet.width = w
  sheet.height = h
  const ctx = sheet.getContext('2d')
  ctx.imageSmoothingEnabled = false
  for (let i = 0; i < layers.length; i++) {
    if (recs[i].loaded) drawSwapped(ctx, recs[i].img, layers[i].swap, w, h)
  }

  compositeCache.set(key, sheet)
  buildCount += 1
  return sheet
}

// Synchronous cache read for the render loop; null until ensureComposite has
// finished building this descriptor.
export function getComposite(descriptor) {
  return compositeCache.get(descriptorKey(descriptor)) || null
}

// Number of composites actually built — used by the verify script to prove
// compositing is once-per-descriptor, not per-frame.
export function getBuildCount() {
  return buildCount
}
