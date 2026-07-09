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
import { encodeBody } from '../src/data/avatarManifest.js'
import { HUB_MAP } from '../src/data/hubMap.js'

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
  if (info.w !== 31 || info.h !== 21) throw new Error(`map size ${info.w}x${info.h}, expected 31x21`)
  console.log(`  map: ${info.w}x${info.h} tiles, ${info.tilePx}px/tile, spawn (${info.spawn.tx},${info.spawn.ty})`)

  // 2b. Reachability: spawn and every zone must sit on walkable ground, all
  // in the SAME connected component — otherwise a zone could be technically
  // "walkable" but unreachable from spawn. Checked directly against the data
  // (not the page) so it stays a hard permanent guard, not a rendering probe.
  {
    const { w, h, walk: grid, spawn, zones } = HUB_MAP
    const idx = (x, y) => y * w + x
    const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h
    const seen = new Uint8Array(w * h)
    const stack = [[spawn.tx, spawn.ty]]
    seen[idx(spawn.tx, spawn.ty)] = 1
    while (stack.length) {
      const [x, y] = stack.pop()
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy
        if (!inb(nx, ny)) continue
        const ni = idx(nx, ny)
        if (seen[ni] || grid[ni] !== 1) continue
        seen[ni] = 1
        stack.push([nx, ny])
      }
    }
    if (grid[idx(spawn.tx, spawn.ty)] !== 1) throw new Error(`reachability: spawn (${spawn.tx},${spawn.ty}) is not walkable`)
    for (const z of zones) {
      if (grid[idx(z.tx, z.ty)] !== 1) throw new Error(`reachability: zone '${z.id}' (${z.tx},${z.ty}) is not walkable`)
      if (!seen[idx(z.tx, z.ty)]) throw new Error(`reachability: zone '${z.id}' (${z.tx},${z.ty}) is not reachable from spawn`)
    }
    console.log(`  reachability: spawn and all ${zones.length} zone(s) walkable and mutually reachable`)
  }

  // 3. Walkability grid.
  const walk = await page.evaluate((spawn) => {
    const H = window.__ECHO_HUB_TEST__
    return {
      spawn: H.isWalkableTile(spawn.tx, spawn.ty),
      water: H.isWalkableTile(10, 18),
      tree: H.isWalkableTile(22, 2),
      edgeTree: H.isWalkableTile(3, 0),
      lodgeRoof: H.isWalkableTile(19, 11),
      lodgeWall: H.isWalkableTile(19, 14),
    }
  }, info.spawn)
  if (!walk.spawn) throw new Error('walkability: spawn/path tile should be walkable')
  if (walk.water) throw new Error('walkability: cliff/water tile (10,18) should be blocked')
  if (walk.tree) throw new Error('walkability: tree-trunk tile (22,2) should be blocked')
  if (walk.edgeTree) throw new Error('walkability: map-edge tree tile (3,0) should be blocked')
  if (!walk.lodgeRoof) throw new Error('walkability: lodge roof tile (19,11) should be walkable (walk-under, like tree canopy)')
  if (walk.lodgeWall) throw new Error('walkability: lodge wall tile (19,14) should be blocked')
  console.log('  walkability: path walkable; cliff-water / tree / edge-tree blocked; lodge roof walkable, lodge wall blocked')

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

  // 5c. Standalone body (Hub Phase 1.7 — a baked Mana Seed NPC sheet) short-
  // circuits the compositor entirely: no layer compositing, no palette swap,
  // dims match its OWN grid (128x256, not the char_a_p1 512x512), built once
  // then cached same as any other look.
  const standaloneDesc = { body: encodeBody('npcMan', 'c00'), outfit: 'forester', outfitColor: 'c00', hair: 'bob', hairColor: 'c00', hat: 'none', hatColor: 'c00' }
  const standaloneProbe = await page.evaluate((d) => window.__ECHO_HUB_TEST__.compositeProbe(d), standaloneDesc)
  if (standaloneProbe.width !== 128 || standaloneProbe.height !== 256) throw new Error(`standalone composite dims ${standaloneProbe.width}x${standaloneProbe.height}, expected 128x256`)
  if (standaloneProbe.builtNow !== 1) throw new Error(`expected standalone composite to build once, builtNow=${standaloneProbe.builtNow}`)
  const standaloneProbe2 = await page.evaluate((d) => window.__ECHO_HUB_TEST__.compositeProbe(d), standaloneDesc)
  if (standaloneProbe2.builtNow !== 0) throw new Error(`expected cache hit on repeat, builtNow=${standaloneProbe2.builtNow}`)
  console.log("  composite (standalone body 'npcMan'): 128x256, no palette swap, built once then cached")

  // 5c-2. Facing rows aren't just distinct — the RIGHT-mapped row must
  // actually be the right-facing art and the LEFT-mapped row the left-facing
  // art. An earlier pass had these backwards despite passing every other
  // check, so this pins it down with an objective landmark (the eye — the
  // darkest opaque pixel in the frame — sits in the right half of the frame
  // for a right-facing sprite, left half for left-facing) instead of relying
  // on a human looking at a screenshot.
  const rightEyeX = await page.evaluate(
    ({ d, fs }) => window.__ECHO_HUB_TEST__.frameEyeX(d, 0, 1, fs),
    { d: standaloneDesc, fs: 32 },
  )
  const leftEyeX = await page.evaluate(
    ({ d, fs }) => window.__ECHO_HUB_TEST__.frameEyeX(d, 0, 3, fs),
    { d: standaloneDesc, fs: 32 },
  )
  if (!(rightEyeX > 16)) throw new Error(`standalone body row1 (mapped to 'right') should be right-facing (eye x>16), got x=${rightEyeX}`)
  if (!(leftEyeX < 16)) throw new Error(`standalone body row3 (mapped to 'left') should be left-facing (eye x<16), got x=${leftEyeX}`)
  console.log(`  standalone body: row1 is right-facing (eye x=${rightEyeX}), row3 is left-facing (eye x=${leftEyeX})`)

  // 5d. A legacy-shaped descriptor (human body, pre-Phase-1.7 save format)
  // still composites through the normal layer path, unaffected by the
  // standalone-body addition.
  const legacyDesc = { body: 'c00', outfit: 'forester', outfitColor: 'c00', hair: 'bob', hairColor: 'c00', hat: 'none', hatColor: 'c00' }
  const legacyProbe = await page.evaluate((d) => window.__ECHO_HUB_TEST__.compositeProbe(d), legacyDesc)
  if (legacyProbe.width !== 512 || legacyProbe.height !== 512) throw new Error(`legacy composite dims ${legacyProbe.width}x${legacyProbe.height}, expected 512x512`)
  console.log('  composite (legacy human-body descriptor): still composites via the layer path (512x512)')

  // 6. Movement + facing on open ground; cannot cross into water.
  const facings = await page.evaluate(() => {
    const H = window.__ECHO_HUB_TEST__
    const open = { x: 10.5 * 48, y: 9.5 * 48 } // open interior grass
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
    H.setPos(14.5 * 48, 15.5 * 48) // grass just above the cliff/water shoreline (row 17 = blocked)
    const start = H.getState().y
    const end = H.simulateMove(0, 1, 2500)
    return { start, endY: end.y, cliffTop: 17 * 48 }
  })
  if (!(water.endY > water.start)) throw new Error(`collision: player did not walk toward the shoreline (${water.start} -> ${water.endY})`)
  if (water.endY >= water.cliffTop) throw new Error(`collision: player crossed into the cliff/water (endY ${water.endY.toFixed(1)} >= ${water.cliffTop})`)
  console.log(`  collision: stopped at the shoreline (endY=${water.endY.toFixed(1)}, cliffTop=${water.cliffTop})`)

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
  const target = { x: 10.5 * 48, y: 9.5 * 48 }
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

  // 10. Standalone body integration (Hub Phase 1.7): saving an NPC body
  // descriptor and reloading picks up its own 32px/4-frame grid (not the
  // char_a_p1 64px/6-frame one), and the player still walks + faces + animates
  // correctly in all 4 directions with it equipped.
  const SETTINGS_KEY = 'echoRacers.default.settings'
  const priorAvatar = await page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return (raw ? JSON.parse(raw) : {}).avatar ?? null
  }, SETTINGS_KEY)
  const npcDescriptor = { body: 'npcMan:c00', outfit: 'forester', outfitColor: 'c00', hair: 'bob', hairColor: 'c00', hat: 'none', hatColor: 'c00' }
  await page.evaluate(({ key, avatar }) => {
    const raw = localStorage.getItem(key)
    const settings = raw ? JSON.parse(raw) : {}
    settings.avatar = avatar
    localStorage.setItem(key, JSON.stringify(settings))
  }, { key: SETTINGS_KEY, avatar: npcDescriptor })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(() => !!window.__ECHO_HUB_TEST__, null, { timeout: 8000 })
  await page.waitForFunction(() => window.__ECHO_HUB_TEST__.getState().atlasLoaded === true, null, { timeout: 8000 })

  const npcState0 = await page.evaluate(() => window.__ECHO_HUB_TEST__.getState())
  if (!npcState0.spriteStandalone) throw new Error('expected standalone sprite mode after equipping the npcMan body')
  if (npcState0.spriteFrameSize !== 32) throw new Error(`expected npc frameSize 32, got ${npcState0.spriteFrameSize}`)
  if (npcState0.spriteWalkFrames !== 4) throw new Error(`expected npc walkFrames 4, got ${npcState0.spriteWalkFrames}`)
  console.log('  standalone body: sprite grid is 32px/4-frame (not the 64px/6-frame composited grid)')

  const npcOpen = { x: 10.5 * 48, y: 9.5 * 48 }
  const npcFacings = {}
  for (const [dir, vec] of Object.entries({ right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] })) {
    await page.evaluate((p) => window.__ECHO_HUB_TEST__.setPos(p.x, p.y), npcOpen)
    npcFacings[dir] = await page.evaluate(([dx, dy]) => window.__ECHO_HUB_TEST__.simulateMove(dx, dy, 400), vec)
  }
  if (npcFacings.right.facing !== 'right' || !(npcFacings.right.x > npcOpen.x)) throw new Error(`npc move right failed: ${JSON.stringify(npcFacings.right)}`)
  if (npcFacings.left.facing !== 'left' || !(npcFacings.left.x < npcOpen.x)) throw new Error(`npc move left failed: ${JSON.stringify(npcFacings.left)}`)
  if (npcFacings.down.facing !== 'down' || !(npcFacings.down.y > npcOpen.y)) throw new Error(`npc move down failed: ${JSON.stringify(npcFacings.down)}`)
  if (npcFacings.up.facing !== 'up' || !(npcFacings.up.y < npcOpen.y)) throw new Error(`npc move up failed: ${JSON.stringify(npcFacings.up)}`)
  console.log('  standalone body: walks + faces correctly in all 4 directions')

  await page.evaluate((p) => window.__ECHO_HUB_TEST__.setPos(p.x, p.y), npcOpen)
  const beforeFrame = await page.evaluate(() => window.__ECHO_HUB_TEST__.getState().animFrame)
  await page.evaluate(() => window.__ECHO_HUB_TEST__.simulateMove(1, 0, 500))
  const npcAfter = await page.evaluate(() => window.__ECHO_HUB_TEST__.getState())
  if (!npcAfter.moving) throw new Error('expected standalone body to still be moving after simulated input')
  if (npcAfter.animFrame === beforeFrame) throw new Error('standalone body animFrame did not advance over 500ms of walking')
  if (npcAfter.animFrame < 0 || npcAfter.animFrame >= npcState0.spriteWalkFrames) {
    throw new Error(`animFrame ${npcAfter.animFrame} out of range for walkFrames ${npcState0.spriteWalkFrames}`)
  }
  console.log('  standalone body: animFrame cycles within its own 4-frame range while walking')

  // Restore whatever avatar was saved before this test (or clear it) so the
  // final record screenshot below reflects the normal composited look.
  await page.evaluate(({ key, avatar }) => {
    const raw = localStorage.getItem(key)
    const settings = raw ? JSON.parse(raw) : {}
    if (avatar) settings.avatar = avatar
    else delete settings.avatar
    localStorage.setItem(key, JSON.stringify(settings))
  }, { key: SETTINGS_KEY, avatar: priorAvatar })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(() => !!window.__ECHO_HUB_TEST__, null, { timeout: 8000 })
  await page.waitForFunction(() => window.__ECHO_HUB_TEST__.getState().atlasLoaded === true, null, { timeout: 8000 })

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
