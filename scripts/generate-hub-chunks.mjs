// Generate a 5×5 grid of 31×21 hub chunks (25 total maps). HOME (col 2, row 4)
// is the UNCHANGED original map from main; the other 24 are newly generated.
// Outer ring: water only on outer edges, shoreline continues around.
// Inner 3×3: no water/cliffs, just grass/forest continuing the original inland look.
//
// Output: maps/hub-{col}-{row}.tmj for each chunk.
// Run fix-tmj-depth.mjs + import-tiled-map.mjs after to produce hubMap.js.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Original HUB_MAP data from origin/main (read at the start of the session)
const ORIGINAL_HUB_MAP = {
  w: 31,
  h: 21,
  ground: [16,16,16,123,123,123,123,32,32,32,32,32,32,32,32,16,16,16,16,16,16,16,16,16,16,32,32,32,32,32,32,16,16,16,16,16,16,16,16,16,16,32,32,32,32,32,16,16,16,16,16,16,16,16,16,32,32,32,32,32,32,32,16,16,16,16,16,16,16,16,123,16,16,16,16,16,16,16,16,16,16,16,16,16,16,32,32,32,32,32,32,32,32,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,0,16,16,16,16,32,32,32,32,32,32,32,32,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,32,32,32,32,32,32,32,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,32,32,32,32,32,32,32,32,32,32,32,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,32,32,32,32,32,32,32,32,32,0,32,32,32,32,32,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,16,16,16,16,16,0,16,16,16,16,16,16,16,16,16,16,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,16,16,16,16,16,16,16,16,16,16,0,16,16,16,16,16,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,16,16,16,16,16,16,16,0,16,16,16,16,16,16,16,16,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,197,32,32,32,32,202,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,197,32,32,32,32,202,0,32,32,32,0,0,32,32,32,32,32,32,32,32,32,32,32,32,32,197,32,32,32,32,202,0,32,32,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,32,32,0,0,0,0,0,0,0,0,236,0,0,0,0,219,0,0,0,0,198,199,200,201,236,0,0,0,0,0,0,0,0,0,0,236,0,0,0,0,221,235,235,235,235,235,235,235,235,235,235,235,235,235,235,235,235,235,235,235,235,0,0,0,0,235,235,235,235,235,235,235],
  decorUnder: [[16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,-1,-1,-1,-1,-1,-1,-1,-1,16,16,16,16,16,16,16,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,16,16,-1,-1,-1,-1,-1,-1,-1,-1,-1,16,16,16,16,16,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,16,-1,-1,-1,-1,-1,-1,-1,-1,-1,16,16,16,16,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,16,16,16,16,16,16,16,16,16,16,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,16,16,16,16,16,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,91,92,93,94,95,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,91,92,93,94,95,-1,-1,-1,107,108,109,110,111,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,107,108,109,110,111,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,91,92,93,94,95,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,107,108,109,110,128,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,227,228,227,228,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,243,244,243,244,129,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,145,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,148,100,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],[-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,16,-1,123,124,125,126,127,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,85,86,87,88,-1,-1,-1,139,140,141,142,143,87,88,89,90,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,101,102,103,104,86,87,87,155,156,157,158,159,103,104,105,106,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,118,119,120,102,103,103,171,172,173,174,175,119,120,121,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,118,119,119,187,188,189,190,191,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,113,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,113,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,128,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],[-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,129,-1,-1,-1,-1,92,93,94,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,130,131,-1,-1,144,-1,-1,-1,108,109,110,-1,-1,-1,-1,-1,-1,-1,92,93,94,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,147,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,108,109,110,-1,-1,-1,-1,-1,-1,4,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,17,4,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,17,18,19,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,115,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,33,34,35,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,115,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,113,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,92,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,108,-1,-1,-1,-1,-1,-1,-1,112,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,356,357,358,359,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,372,373,374,375,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,229,230,231,232,233,234,230,231,232,233,230,231,232,233,186,230,231,232,233,-1,-1,-1,-1,-1,-1,229,230,231,232,233,234,-1,246,247,248,249,-1,246,247,248,249,-1,-1,-1,-1,-1,246,247,248,249,229,230,231,232,233,234,-1,246,247,248,249,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,246,247,248,249,-1,-1,-1,-1,-1,-1,-1]],
  decorOver: [[-1,53,54,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,69,70,71,72,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,14,15,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],[27,28,29,30,31,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,57,58,-1,-1,-1,-1,59,60,61,62,63,-1,-1,-1,-1,-1,43,44,45,46,47,-1,-1,55,-1,-1,-1,-1,-1,71,72,73,74,-1,-1,-1,-1,75,76,77,78,79,-1,-1,-1,-1,-1,59,60,61,62,63,70,71,71,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,91,-1,-1,-1,95,11,12,13,14,15,75,76,77,78,79,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,145,11,12,13,107,-1,-1,-1,111,27,28,29,30,31,91,-1,-1,-1,95,-1,-1,-1,-1,-1,-1,-1,-1,-1,146,-1,-1,-1,27,28,29,30,31,-1,-1,-1,43,44,45,46,47,107,-1,-1,-1,111,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,43,44,45,46,47,-1,-1,-1,59,60,61,62,63,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,59,60,61,62,63,-1,-1,-1,75,76,77,78,79,11,12,13,14,15,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,75,76,77,78,79,-1,-1,-1,-1,-1,-1,11,12,27,28,29,30,31,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,27,28,43,44,45,46,47,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,43,44,59,60,61,62,63,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,293,294,-1,-1,-1,-1,-1,-1,-1,-1,59,60,75,76,77,78,79,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,308,309,310,311,-1,-1,-1,-1,-1,-1,-1,75,76,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,324,325,326,327,-1,-1,-1,-1,-1,-1,-1,91,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,340,341,342,343,-1,-1,-1,-1,-1,-1,-1,107,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,213,-1,-1,-1,217,218,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,213,-1,-1,-1,217,218,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,213,-1,-1,-1,217,218,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1]],
  spawn: { tx: 16, ty: 10 },
  zones: [
    { id: 'trialGate', tx: 8, ty: 5, radius: 104, label: 'Races', action: 'practice', labelTile: {tx:7,ty:0} },
    { id: 'lodge', tx: 20, ty: 16, radius: 92, label: 'Lodge', action: 'avatar', labelTile: {tx:20,ty:16} },
  ],
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const mapsDir = path.join(rootDir, 'maps')
fs.mkdirSync(mapsDir, { recursive: true })

const W = 31
const H = 21
const GRID_SIZE = 5
const HOME_COL = 2
const HOME_ROW = 4

// Atlas helper functions (forest-summer.png: 16 cols)
const A = (c, r) => r * 16 + c
const L = (c, r) => 256 + r * 16 + c // lodge.png: starts at 256

// Tile constants from tile-grammar.md
// Real grass is A(0,1)=16, A(0,2)=32, A(0,3)=48 (NOT A(0,0)=0 which is a HOLE)
const GRASS = A(0, 1) // 16
const GRASS2 = A(0, 2) // 32
const GRASS3 = A(0, 3) // 48
const DIRT = A(4, 2)
const WATER = A(13, 14)

// Fill a rect in a layer
function fillRect(layer, w, h, left, top, right, bottom, tile) {
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      layer[y * w + x] = tile
    }
  }
}

// Check if a tile ID is safe to stamp trees/decor on (grass, not water/cliff/rock)
function isSafeGround(tileId) {
  if (tileId === -1) return true // empty is OK
  if (tileId === GRASS || tileId === GRASS2 || tileId === GRASS3) return true
  if (tileId === DIRT) return true
  if (tileId === WATER) return false
  // Cliff family (cols 5-10, all rows) is blocking
  const c = tileId % 16
  const r = Math.floor(tileId / 16)
  if (c >= 5 && c <= 10) return false // cliff/rock family
  if (c === 4 && (r === 8 || r === 9)) return false // big boulder
  return true // assume OK for other decor
}

// Check if a tree can be stamped at (tx, ty) without overlapping water/rock OR other trees
function canStampTree(chunk, tx, ty) {
  const w = chunk.width
  const h = chunk.height
  // Check full footprint + buffer: canopy 5x5 at (ty-4 to ty) + trunk 3x2 at (ty+1 to ty+2)
  // Add 2-tile buffer around the tree to prevent dense packing
  const buffer = 2
  
  // Canopy check (with buffer)
  for (let dr = -4 - buffer; dr <= 0 + buffer; dr++) {
    for (let dc = -2 - buffer; dc <= 2 + buffer; dc++) {
      const x = tx + dc
      const y = ty + dr
      if (x < 0 || x >= w || y < 0 || y >= h) return false
      const gid = chunk.ground[y * w + x]
      if (!isSafeGround(gid)) return false
      // Check if there's already a tree here (canopy or trunk)
      for (let layer = 0; layer < chunk.decorOver.length; layer++) {
        const existing = chunk.decorOver[layer][y * w + x]
        if (existing >= 11 && existing <= 95 && existing % 16 >= 11 && existing % 16 <= 15) return false
      }
      for (let layer = 0; layer < chunk.decorUnder.length; layer++) {
        const existing = chunk.decorUnder[layer][y * w + x]
        if (existing >= 92 && existing <= 110 && [92,93,94,108,109,110].includes(existing)) return false
      }
    }
  }
  // Trunk check (with buffer)
  for (let dr = 1 - buffer; dr <= 2 + buffer; dr++) {
    for (let dc = -1 - buffer; dc <= 1 + buffer; dc++) {
      const x = tx + dc
      const y = ty + dr
      if (x < 0 || x >= w || y < 0 || y >= h) return false
      const gid = chunk.ground[y * w + x]
      if (!isSafeGround(gid)) return false
      // Check if there's already a tree here
      for (let layer = 0; layer < chunk.decorOver.length; layer++) {
        const existing = chunk.decorOver[layer][y * w + x]
        if (existing >= 11 && existing <= 95 && existing % 16 >= 11 && existing % 16 <= 15) return false
      }
      for (let layer = 0; layer < chunk.decorUnder.length; layer++) {
        const existing = chunk.decorUnder[layer][y * w + x]
        if (existing >= 92 && existing <= 110 && [92,93,94,108,109,110].includes(existing)) return false
      }
    }
  }
  return true
}

// Stamp a tree (canopy in decorOver, trunk in decorUnder)
// Canopy: 5x5 at A(11+dc, 0..4), trunk: 3x2 at A(12+dc, 5..6)
// Trunk positioned mostly BELOW canopy to match HOME (minimal overlap)
function stampTree(chunk, tx, ty) {
  if (!canStampTree(chunk, tx, ty)) return false
  
  const { ground, decorUnder, decorOver } = chunk
  const w = chunk.width
  // Canopy: 5x5 at (tx-2, ty-4) through (tx+2, ty)
  for (let dr = 0; dr < 5; dr++) {
    for (let dc = 0; dc < 5; dc++) {
      const x = tx - 2 + dc
      const y = ty - 4 + dr
      if (x >= 0 && x < w && y >= 0 && y < chunk.height) {
        decorOver[0][y * w + x] = A(11 + dc, dr)
      }
    }
  }
  // Trunk: 3x2 at (tx-1, ty+1) through (tx+1, ty+2)
  // One row below canopy bottom to match HOME's layout
  for (let dr = 0; dr < 2; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      const x = tx - 1 + dc
      const y = ty + 1 + dr
      if (x >= 0 && x < w && y >= 0 && y < chunk.height) {
        decorUnder[0][y * w + x] = A(12 + dc, 5 + dr)
      }
    }
  }
  return true
}

// Add cliff + water along an edge
function addCliffWithWater(chunk, edge) {
  const w = chunk.width
  const h = chunk.height
  const { ground, decorUnder } = chunk

  if (edge === 'north') {
    // Top edge: water rows 0-3, cliff face rows 4-5
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < w; x++) {
        ground[y * w + x] = WATER
      }
    }
    // Cliff base meeting water (row 3)
    for (let x = 1; x < w - 1; x++) {
      decorUnder[0][3 * w + x] = A(6 + (x % 4), 11)
    }
    decorUnder[0][3 * w] = A(5, 11) // left corner
    decorUnder[0][3 * w + w - 1] = A(10, 11) // right corner
    // Cliff body (rows 4-5)
    for (let y = 4; y < 6; y++) {
      for (let x = 1; x < w - 1; x++) {
        decorUnder[0][y * w + x] = A(6 + (x % 4), 5)
      }
      decorUnder[0][y * w] = A(5, 5)
      decorUnder[0][y * w + w - 1] = A(10, 5)
    }
  } else if (edge === 'south') {
    // Bottom edge: cliff rows h-6 to h-4, water rows h-3 to h-1
    for (let y = h - 3; y < h; y++) {
      for (let x = 0; x < w; x++) {
        ground[y * w + x] = WATER
      }
    }
    // Cliff body (rows h-6 to h-5)
    for (let y = h - 6; y < h - 4; y++) {
      for (let x = 1; x < w - 1; x++) {
        decorUnder[0][y * w + x] = A(6 + (x % 4), 5)
      }
      decorUnder[0][y * w] = A(5, 5)
      decorUnder[0][y * w + w - 1] = A(10, 5)
    }
    // Cliff base meeting water (row h-4)
    for (let x = 1; x < w - 1; x++) {
      decorUnder[0][(h - 4) * w + x] = A(6 + (x % 4), 11)
    }
    decorUnder[0][(h - 4) * w] = A(5, 11)
    decorUnder[0][(h - 4) * w + w - 1] = A(10, 11)
  } else if (edge === 'west') {
    // Left edge: water cols 0-3, cliff face cols 4-5
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < 4; x++) {
        ground[y * w + x] = WATER
      }
    }
    // Cliff base + body cols 4-5
    for (let x = 4; x < 6; x++) {
      for (let y = 1; y < h - 1; y++) {
        decorUnder[0][y * w + x] = A(6 + (y % 4), 5)
      }
    }
  } else if (edge === 'east') {
    // Right edge: cliff face cols w-6 to w-5, water cols w-4 to w-1
    for (let y = 0; y < h; y++) {
      for (let x = w - 4; x < w; x++) {
        ground[y * w + x] = WATER
      }
    }
    // Cliff body cols w-6 to w-5
    for (let x = w - 6; x < w - 4; x++) {
      for (let y = 1; y < h - 1; y++) {
        decorUnder[0][y * w + x] = A(6 + (y % 4), 5)
      }
    }
  }
}

// Scatter decor (flowers, bushes, pebbles) — only on safe ground
function scatterDecor(chunk) {
  const w = chunk.width
  const h = chunk.height
  const { ground, decorUnder } = chunk
  const count = Math.floor((w * h) / 50)
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * (w - 2)) + 1
    const y = Math.floor(Math.random() * (h - 2)) + 1
    const idx = y * w + x
    if (decorUnder[0][idx] === -1 && isSafeGround(ground[idx])) {
      const roll = Math.random()
      if (roll < 0.3) {
        decorUnder[0][idx] = A(Math.floor(Math.random() * 4), 6) // flowers
      } else if (roll < 0.5) {
        decorUnder[0][idx] = A(Math.floor(Math.random() * 3), 8) // bushes
      } else if (roll < 0.6) {
        decorUnder[0][idx] = A(4, 6) // pebble
      }
    }
  }
}

// Create a blank chunk with mixed grass ground (16, 32, 48)
function createChunk(w, h) {
  const grassTiles = [GRASS, GRASS2, GRASS3]
  const ground = new Array(w * h).fill(0).map(() => {
    // Mix grass tiles: 50% GRASS (16), 40% GRASS2 (32), 10% GRASS3 (48)
    const r = Math.random()
    if (r < 0.5) return GRASS
    if (r < 0.9) return GRASS2
    return GRASS3
  })
  const decorUnder = [new Array(w * h).fill(-1), new Array(w * h).fill(-1), new Array(w * h).fill(-1)]
  const decorOver = [new Array(w * h).fill(-1), new Array(w * h).fill(-1)]
  return { width: w, height: h, ground, decorUnder, decorOver }
}

// Convert a hubMap.js-format chunk to Tiled .tmj layers
function toGid(tileId) {
  // -1 = empty, else tile id + 1 (Tiled's gid encoding)
  return tileId === -1 ? 0 : tileId + 1
}

function generateTMJ(chunk, filename) {
  const { width, height, ground, decorUnder, decorOver } = chunk
  const layers = []

  // Ground layer
  layers.push({
    id: 1,
    name: 'ground',
    type: 'tilelayer',
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width,
    height,
    data: ground.map(toGid),
  })

  // decorUnder layers
  decorUnder.forEach((layer, i) => {
    layers.push({
      id: 2 + i,
      name: `decor-under-${i + 1}`,
      type: 'tilelayer',
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      width,
      height,
      data: layer.map(toGid),
    })
  })

  // decorOver layers
  decorOver.forEach((layer, i) => {
    layers.push({
      id: 5 + i,
      name: `decor-over-${i + 1}`,
      type: 'tilelayer',
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      width,
      height,
      data: layer.map(toGid),
    })
  })

  const tmj = {
    compressionlevel: -1,
    height,
    infinite: false,
    layers,
    nextlayerid: 10,
    nextobjectid: 1,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.10.2',
    tileheight: 16,
    tilesets: [
      {
        firstgid: 1,
        name: 'forest-summer',
        source: '../public/sprites/hub/tiles/forest-summer.png',
        tilecount: 256,
        tilewidth: 16,
        tileheight: 16,
        columns: 16,
      },
      {
        firstgid: 257,
        name: 'lodge',
        source: '../public/sprites/hub/tiles/lodge.png',
        tilecount: 128,
        tilewidth: 16,
        tileheight: 16,
        columns: 16,
      },
    ],
    tilewidth: 16,
    type: 'map',
    version: '1.10',
    width,
  }

  fs.writeFileSync(filename, JSON.stringify(tmj, null, 2), 'utf8')
  console.log(`Generated ${path.basename(filename)}`)
}

// Generate HOME chunk (col 2, row 4) from ORIGINAL_HUB_MAP
function generateHomeChunk() {
  const filename = path.join(mapsDir, `hub-${HOME_COL}-${HOME_ROW}.tmj`)
  const chunk = {
    width: ORIGINAL_HUB_MAP.w,
    height: ORIGINAL_HUB_MAP.h,
    ground: [...ORIGINAL_HUB_MAP.ground],
    decorUnder: ORIGINAL_HUB_MAP.decorUnder.map(layer => [...layer]),
    decorOver: ORIGINAL_HUB_MAP.decorOver.map(layer => [...layer]),
  }
  generateTMJ(chunk, filename)
}

// Generate a new chunk based on its grid position
function generateNewChunk(col, row) {
  const chunk = createChunk(W, H)
  const isOuterRing = col === 0 || col === GRID_SIZE - 1 || row === 0 || row === GRID_SIZE - 1
  
  // HOME's immediate east/west neighbors (hub-1-4 and hub-3-4) need walkable
  // forest on their shared edge with HOME, since those are HOME's real exits.
  // HOME has south water, so these neighbors also have south water (continuing
  // the beach), but their west/east edges connecting to HOME are open forest.
  const isHomeWestNeighbor = (col === HOME_COL - 1 && row === HOME_ROW) // hub-1-4
  const isHomeEastNeighbor = (col === HOME_COL + 1 && row === HOME_ROW) // hub-3-4

  if (isOuterRing) {
    // Outer ring: add shoreline on outer edges ONLY
    // For HOME's neighbors, skip the edge that connects to HOME
    if (row === 0) addCliffWithWater(chunk, 'north')
    if (row === GRID_SIZE - 1) addCliffWithWater(chunk, 'south')
    if (col === 0 && !isHomeWestNeighbor) addCliffWithWater(chunk, 'west')
    if (col === GRID_SIZE - 1 && !isHomeEastNeighbor) addCliffWithWater(chunk, 'east')

    // Scatter trees inland (match HOME's density: ~9 trees per 31x21 map)
    const treeCount = 8
    let treesPlaced = 0
    let attempts = 0
    while (treesPlaced < treeCount && attempts < treeCount * 5) {
      const tx = Math.floor(Math.random() * (W - 10)) + 5
      const ty = Math.floor(Math.random() * (H - 10)) + 5
      if (stampTree(chunk, tx, ty)) treesPlaced++
      attempts++
    }
  } else {
    // Inner 3x3: no water, just forest/grass
    // Add sparse tree groves (match HOME's density)
    const treeGroves = 2
    for (let g = 0; g < treeGroves; g++) {
      const cx = Math.floor(Math.random() * (W - 12)) + 6
      const cy = Math.floor(Math.random() * (H - 10)) + 5
      const groveSize = 3 + Math.floor(Math.random() * 2) // 3-4 trees per grove
      let treesPlaced = 0
      let attempts = 0
      while (treesPlaced < groveSize && attempts < groveSize * 5) {
        const tx = cx + Math.floor(Math.random() * 10) - 5
        const ty = cy + Math.floor(Math.random() * 8) - 4
        if (tx >= 5 && tx < W - 5 && ty >= 5 && ty < H - 5) {
          if (stampTree(chunk, tx, ty)) treesPlaced++
        }
        attempts++
      }
    }
  }

  scatterDecor(chunk)
  const filename = path.join(mapsDir, `hub-${col}-${row}.tmj`)
  generateTMJ(chunk, filename)
}

// Generate all 25 chunks
console.log(`Generating 5×5 grid of hub chunks (HOME at ${HOME_COL},${HOME_ROW})...`)
for (let row = 0; row < GRID_SIZE; row++) {
  for (let col = 0; col < GRID_SIZE; col++) {
    if (col === HOME_COL && row === HOME_ROW) {
      generateHomeChunk()
    } else {
      generateNewChunk(col, row)
    }
  }
}
console.log('Done. Run scripts/fix-all-hub-chunks.mjs next.')
