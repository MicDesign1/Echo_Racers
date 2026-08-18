// Run fix-tmj-depth.mjs on all 9 hub chunks
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 3; col++) {
    const filename = `hub-${col}-${row}.tmj`
    const inputPath = path.join(__dirname, '..', 'maps', filename)
    const outputPath = path.join(__dirname, '..', 'maps', `${filename}.fixed`)
    
    console.log(`fixing ${filename}...`)
    execSync(`node scripts/fix-tmj-depth.mjs "${inputPath}" "${outputPath}"`, {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    })
    
    // Replace original with fixed version
    execSync(`mv "${outputPath}" "${inputPath}"`, {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    })
  }
}

console.log('all chunks fixed')
