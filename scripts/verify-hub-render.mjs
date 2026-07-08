/**
 * Headless sanity for the tiled walkable hub (src/screens/HubScene.jsx):
 *   1. the scene constructs, its verify hook + forest atlas load,
 *   2. the map loads at the expected size and the player's avatar composites,
 *   3. walkability: a known path tile is walkable; water / tree / border tiles
 *      are blocked,
 *   4. every interaction zone triggers inside its radius and clears outside,
 *   5. the palette-swap composite of a NON-default look is 512x512, contains a
 *      target-ramp color, and builds once per descriptor,
 *   6. movement walks + faces correctly on open ground and cannot cross into
 *      water (feet-box vs the walkability grid),
 *   7. the camera clamps to the map at both corners,
 *   8. position persists across a reload (per-profile localStorage),
 *   9. ambient critters construct, animate, and stay on walkable ground while
 *      wandering (never enter water/trees/zones).
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

  // 1. Scene constructs / hook present, atlas + composite ready.
  const hasHook = await page.evaluate(() => !!window.__ECHO_HUB_TEST__)
  if (!hasHook) throw new Error('verify hook __ECHO_HUB_TEST__ missing (scene did not construct)')
  await page.waitForFunction(() => {
    const s = window.__ECHO_HUB_TEST__.getState()
    return s.atlasLoaded === true && s.composited === true
  }, null, { timeout: 10000 })
  console.log('  atlas + avatar composite loaded')

  // 2. Map size.
  const info = await page.evaluate(() => window.__ECHO_HUB_TEST__.getMapInfo())
  if (info.w !== 40 || info.h !== 28) throw new Error(`map size ${info.w}x${info.h}, expected 40x28`)
  console.log(`  map: ${info.w}x${info.h} tiles, ${info.tilePx}px/tile, spawn (${info.spawn.tx},${info.spawn.ty})`)

  // 3. Walkability grid.
  const walk = await page.evaluate((spawn) => {
    const H = window.__ECHO_HUB_TEST__
    return {
      spawn: H.isWalkableTile(spawn.tx, spawn.ty),
      water: H.isWalkableTile(20, 26),
      tree: H.isWalkableTile(13, 13),
      border: H.isWalkableTile(0, 0),
    }
  }, info.spawn)
  if (!walk.spawn) throw new Error('walkability: spawn/path tile should be walkable')
  if (walk.water) throw new Error('walkability: water tile (20,26) should be blocked')
  if (walk.tree) throw new Error('walkability: tree-trunk tile (13,13) should be blocked')
  if (walk.border) throw new Error('walkability: border tile (0,0) should be blocked')
  console.log('  walkability: path walkable; water / tree / border blocked')

  // 4. Zones trigger inside radius, clear just outside.
  const zones = await page.evaluate(() => window.__ECHO_HUB_TEST__.getZones())
  if (zones.length < 2) throw new Error(`expected >=2 hub zones, got ${zones.length}`)
  for (const z of zones) {
    const r = await page.evaluate(({ zx, zy, rad, id }) => {
      const H = window.__ECHO_HUB_TEST__
      H.setPos(zx, zy)
      const center = H.getState().activeZone
      H.setPos(zx + (rad - 6), zy)
      const justInside = H.getState().activeZone
      H.setPos(zx + (rad + 8), zy)
      const justOutside = H.getState().activeZone
      return { center, justInside, justOutside, id }
    }, { zx: z.x, zy: z.y, rad: z.radius, id: z.id })
    if (r.center !== z.id) throw new Error(`zone ${z.id}: center not active (got ${r.center})`)
    if (r.justInside !== z.id) throw new Error(`zone ${z.id}: inside radius not active (got ${r.justInside})`)
    if (r.justOutside === z.id) throw new Error(`zone ${z.id}: still active just outside radius`)
    console.log(`  zone '${z.label}' (${z.id}): triggers inside r=${z.radius}, clears outside`)
  }

  // 5. Palette-swap composite of a NON-default look (also covers Part B styles).
  const skin = AVATAR_PALETTES.body.human
  const skinIdx = skin.colors.findIndex((c) => c.ramp[0] !== skin.sourceRamp[0])
  const targetHex = skin.colors[skinIdx].ramp[0]
  const descriptor = { body: skin.colors[skinIdx].id, outfit: 'forester', outfitColor: 'c00', hair: 'bob', hairColor: 'c00' }
  const probe1 = await page.evaluate(({ d, t }) => window.__ECHO_HUB_TEST__.compositeProbe(d, t), { d: descriptor, t: targetHex })
  if (probe1.width !== 512 || probe1.height !== 512) throw new Error(`composite dims ${probe1.width}x${probe1.height}, expected 512x512`)
  if (!probe1.found) throw new Error(`composite missing target-ramp color ${targetHex}`)
  if (probe1.builtNow !== 1) throw new Error(`expected composite to build once, builtNow=${probe1.builtNow}`)
  const probe2 = await page.evaluate(({ d, t }) => window.__ECHO_HUB_TEST__.compositeProbe(d, t), { d: descriptor, t: targetHex })
  if (probe2.builtNow !== 0) throw new Error(`expected cache hit on repeat, builtNow=${probe2.builtNow}`)
  console.log(`  composite: 512x512, target ${targetHex} present, built once then cached`)

  // 5b. A NEWLY added style (the hat slot) composites cleanly (Part B).
  const hat = AVATAR_PALETTES.hat.straw
  const hatIdx = hat.colors.findIndex((c) => c.ramp[0] !== hat.sourceRamp[0])
  const hatHex = hat.colors[hatIdx].ramp[0]
  const hatDesc = { ...descriptor, hat: 'straw', hatColor: hat.colors[hatIdx].id }
  const hatProbe = await page.evaluate(({ d, t }) => window.__ECHO_HUB_TEST__.compositeProbe(d, t), { d: hatDesc, t: hatHex })
  if (hatProbe.width !== 512 || hatProbe.height !== 512) throw new Error(`hat composite dims ${hatProbe.width}x${hatProbe.height}`)
  if (!hatProbe.found) throw new Error(`hat composite missing target-ramp color ${hatHex}`)
  if (hatProbe.builtNow !== 1) throw new Error(`expected hat composite to build once, builtNow=${hatProbe.builtNow}`)
  console.log(`  composite (new hat style 'straw'): 512x512, target ${hatHex} present, built once`)

  // 6. Movement + facing on open ground; cannot cross into water.
  const facings = await page.evaluate(() => {
    const H = window.__ECHO_HUB_TEST__
    const open = { x: 25.5 * 48, y: 20.5 * 48 } // open interior grass
    const out = {}
    H.setPos(open.x, open.y); out.right = H.simulateMove(1, 0, 400)
    H.setPos(open.x, open.y); out.left = H.simulateMove(-1, 0, 400)
    H.setPos(open.x, open.y); out.down = H.simulateMove(0, 1, 400)
    H.setPos(open.x, open.y); out.up = H.simulateMove(0, -1, 400)
    return { out, open }
  })
  const f = facings.out
  if (f.right.facing !== 'right' || !(f.right.x > facings.open.x)) throw new Error(`move right failed: ${JSON.stringify(f.right)}`)
  if (f.left.facing !== 'left' || !(f.left.x < facings.open.x)) throw new Error(`move left failed: ${JSON.stringify(f.left)}`)
  if (f.down.facing !== 'down' || !(f.down.y > facings.open.y)) throw new Error(`move down failed: ${JSON.stringify(f.down)}`)
  if (f.up.facing !== 'up' || !(f.up.y < facings.open.y)) throw new Error(`move up failed: ${JSON.stringify(f.up)}`)
  console.log('  walk: all 4 directions move + face correctly on open ground')

  const water = await page.evaluate(() => {
    const H = window.__ECHO_HUB_TEST__
    H.setPos(25.5 * 48, 23 * 48) // grass just above the bottom lake (row 25 = water)
    const start = H.getState().y
    const end = H.simulateMove(0, 1, 2500)
    return { start, endY: end.y, waterTop: 25 * 48 }
  })
  if (!(water.endY > water.start)) throw new Error(`collision: player did not walk toward water (${water.start} -> ${water.endY})`)
  if (water.endY >= water.waterTop) throw new Error(`collision: player crossed into water (endY ${water.endY.toFixed(1)} >= ${water.waterTop})`)
  console.log(`  collision: stopped at lake edge (endY=${water.endY.toFixed(1)}, water=${water.waterTop})`)

  // 7. Camera clamps at both corners.
  const world = await page.evaluate(() => window.__ECHO_HUB_TEST__.getWorld())
  const view = await page.evaluate(() => window.__ECHO_HUB_TEST__.getState())
  const cams = await page.evaluate((w) => {
    const H = window.__ECHO_HUB_TEST__
    return { tl: H.cameraAt(0, 0), br: H.cameraAt(w.w, w.h) }
  }, world)
  if (cams.tl.x !== 0 || cams.tl.y !== 0) throw new Error(`camera top-left not (0,0): ${JSON.stringify(cams.tl)}`)
  const expX = Math.max(0, world.w - view.viewW)
  const expY = Math.max(0, world.h - view.viewH)
  if (!approx(cams.br.x, expX) || !approx(cams.br.y, expY)) throw new Error(`camera bottom-right ${JSON.stringify(cams.br)}, expected (${expX},${expY})`)
  console.log(`  camera: clamps (0,0) at top-left and (${expX},${expY}) at bottom-right`)

  // 8. Position persists across reload.
  const target = { x: 25.5 * 48, y: 20.5 * 48 }
  await page.evaluate((t) => { const H = window.__ECHO_HUB_TEST__; H.setPos(t.x, t.y); H.save() }, target)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(() => !!window.__ECHO_HUB_TEST__, null, { timeout: 8000 })
  const restored = await page.evaluate(() => window.__ECHO_HUB_TEST__.getState())
  if (!approx(restored.x, target.x, 2) || !approx(restored.y, target.y, 2)) {
    throw new Error(`persist: expected ~(${target.x},${target.y}), got (${restored.x.toFixed(1)},${restored.y.toFixed(1)})`)
  }
  console.log(`  persist: position restored after reload (${restored.x.toFixed(0)},${restored.y.toFixed(0)})`)

  // 9. Ambient wildlife (Part C): critters construct, animate, and NEVER end up
  //    on an unwalkable tile after simulating several seconds of wandering.
  const c0 = await page.evaluate(() => window.__ECHO_HUB_TEST__.getCritters())
  if (c0.length < 2) throw new Error(`expected >=2 critters, got ${c0.length}`)
  const cShort = await page.evaluate(() => window.__ECHO_HUB_TEST__.stepCritters(600))
  const animated = cShort.some((c, i) => c.animFrame !== c0[i].animFrame)
  if (!animated) throw new Error('critters did not animate over 600ms')
  const cLong = await page.evaluate(() => window.__ECHO_HUB_TEST__.stepCritters(8000))
  const info2 = await page.evaluate(() => window.__ECHO_HUB_TEST__.getMapInfo())
  for (const c of cLong) {
    const tx = Math.floor(c.x / info2.tilePx)
    const ty = Math.floor(c.y / info2.tilePx)
    const ok = await page.evaluate(([x, y]) => window.__ECHO_HUB_TEST__.isWalkableTile(x, y), [tx, ty])
    if (!ok) throw new Error(`critter on unwalkable tile (${tx},${ty}) after wandering`)
  }
  console.log(`  wildlife: ${c0.length} critters animate + stay on walkable ground after 8s`)

  // Screenshot for the record: player at spawn on the tiled map.
  await page.evaluate((spawn) => window.__ECHO_HUB_TEST__.setPos((spawn.tx + 0.5) * 48, (spawn.ty + 0.5) * 48), info.spawn)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  await page.locator('canvas').screenshot({ path: path.join(OUT_DIR, 'hub-scene.png') })

  console.log('PASS hub render sanity')
  await browser.close()
}

main().catch((err) => {
  console.error('FAIL', err.message)
  process.exit(1)
})
