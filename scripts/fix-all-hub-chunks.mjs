// Run fix-tmj-depth.mjs on all generated hub chunks (5×5 grid).
// Each chunk is fixed in-place (input replaced with the corrected version).

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const mapsDir = path.join(rootDir, 'maps')
const fixScript = path.join(__dirname, 'fix-tmj-depth.mjs')

const GRID_SIZE = 5

console.log('Fixing depth for all 5×5 hub chunks...')

for (let row = 0; row < GRID_SIZE; row++) {
  for (let col = 0; col < GRID_SIZE; col++) {
    const chunkName = `hub-${col}-${row}`
    const inputPath = path.join(mapsDir, `${chunkName}.tmj`)
    const fixedPath = path.join(mapsDir, `${chunkName}-fixed.tmj`)

    console.log(`Fixing ${chunkName}.tmj...`)
    try {
      execSync(`node "${fixScript}" "${inputPath}" "${fixedPath}"`, {
        cwd: rootDir,
        stdio: 'inherit',
      })
      // Replace original with fixed
      fs.renameSync(fixedPath, inputPath)
      console.log(`  → ${chunkName}.tmj updated`)
    } catch (err) {
      console.error(`  ✗ Error fixing ${chunkName}.tmj:`, err.message)
      process.exit(1)
    }
  }
}

console.log('Done. Run scripts/import-tiled-map.mjs next.')
