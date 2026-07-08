# Hub tile grammar — the answer key for hubMap.js

Read once, keep updating: this is the reference for how the hub's tile atlases
actually assemble into recognizable structures, so future map sessions don't
have to re-derive it from scratch. Everything below was confirmed by rendering
the atlas at 4x with a labeled 16px grid (`node scripts/inspect-tileset.mjs`,
output at `scripts/verify-screenshots/tileset-grid.png`) and cropping/zooming
specific regions — never guessed from memory. `A(col, row)` is the existing
hubMap.js helper: `A(col, row) = row * 16 + col`.

Reference material studied: every image in `E:\KID GAME\map-refs\` (read-only —
never copied into the repo), the live atlas at
`public/sprites/hub/tiles/forest-summer.png` (256x256, 16x16 tiles, 16 cols),
and the timber sheets in `..\manaseed2\tilesets\`.

## Atlas 1: forest-summer.png (16px tiles, 16 cols x 16 rows)

### Plain fills
- `A(0, r)` for r=0..5 — plain grass (the reusable "nothing" filler; already
  `GRASS`).
- `A(0, 3)` — grass variant for light texture scatter (already `GRASS2`).
- `A(4, r)` for r=0..4 — solid brown dirt, no grass blend (already `DIRT`,
  used as `A(4,2)`). Good for interior path fill once bordered by the edge
  tiles below — never carpet a whole area with just this, it reads flat.
- Water fill: `A(11..13, 13)` and `A(11..13, 14)` — teal/navy water texture
  (existing `WATER = A(13,14)` is a valid deep-water fill tile).
- Cobblestone-ish dirt-floor texture: `A(11,15)`, `A(12,15)` — small ground
  variant swatches (not a full autotile block, just single fill tiles).

### Dirt-patch / path autotile block (cols 1-3, rows 0-5)
A classic rounded-blob autotile for a dirt clearing/path sitting in grass.
Use these to border ANY dirt area instead of a flat rect fill:

| Tile | Role |
| --- | --- |
| `A(1,0)` | top-left outer corner (grass outside, dirt curves in) |
| `A(2,0)` | top edge (concave notch) |
| `A(3,0)` | top-right outer corner (mirror of A(1,0)) |
| `A(1,1)` / `A(3,1)` | left/right edge, grass sliver top corner |
| `A(2,1)`, `A(2,2)`, `A(1,2)`, `A(3,2)` | fill / straight edge |
| `A(2,3)` | dirt with a round GRASS ISLAND inset (decorative — a patch of grass poking through the path) |
| `A(1,3)` / `A(3,3)` | left/right edge with grass notch |
| `A(1,4)` / `A(3,4)` | left/right edge, grass wedge at bottom corner |
| `A(1,5)` | bottom-left outer corner |
| `A(2,5)` | bottom edge (concave notch) |
| `A(3,5)` | bottom-right outer corner (mirror of A(1,5)) |

Build a dirt patch as: top row `[A(1,0), A(2,0)…, A(3,0)]`, middle rows
`[A(1,1|2), A(4,row) fill…, A(3,1|2)]`, bottom row
`[A(1,5), A(2,5)…, A(3,5)]`. Drop in `A(2,3)` occasionally in the middle for
the grass-island variant instead of plain dirt fill.

### Decor (non-blocking unless noted)
- Flowers: `A(0..3, 6)` and `A(0..3, 7)` — two density variants, scatter freely.
- Small rock/pebble decor: `A(4, 6)`, `A(4, 7)`.
- Bushes: `A(0,8)` spiky dark, `A(1,8)` teal rounded (already `BUSH`),
  `A(2,8)` bigger rounded (has transparent corners — don't butt other decor
  tight against it).
- Big smooth boulder (2 tiles tall): `A(4,8)` + `A(4,9)` stacked (already
  used as `ROCK = A(4,8)`, but it's actually the TOP half of a 2-tall
  boulder — pair it with `A(4,9)` below for the full rock, or keep using
  just the top half as a flatter single-tile pebble like the current map does).

### Decorative low stone wall (garden fence, optional)
An L-shaped low wall, distinct from the natural cliff (lighter gray brick vs.
the cliff's pink/tan rock):
- Horizontal run: `A(2,10)`, `A(3,10)` / `A(2,11)`, `A(3,11)` / `A(2,12)`, `A(3,12)` (3 rows tall, 2 cols wide, repeatable horizontally by reusing the same 2 columns).
- Vertical corner return: `A(0,11)` down through `A(0,13)`, `A(1,12)`-`A(1,14)`.
- A separate, bigger boulder pair sits at `A(2,14)`/`A(3,14)` + `A(2,15)`/`A(3,15)` (2x2), unrelated to the wall.
Blocks walkability where placed. Nice as a small accent (e.g. bordering the
Mirror clearing) — not required for the main grammar.

### Tree (canopy + trunk) — already implemented correctly
Confirmed matches the existing `stampTree()` in hubMap.js exactly:
- Canopy: `A(11+c, r)` for r=0..4, c=0..4 (cols 11-15, rows 0-4) → decorOver.
- Trunk: `A(12+c, 5+r)` for r=0..1, c=0..2 (cols 12-14, rows 5-6) → decorUnder + block.
No changes needed here; reuse as-is for tree walls/borders.

### Tree-wall borders — atlas limitation
The marketing reference `yoqNec.png` shows a dedicated 8x8 "supertile" tree-wall
system (pre-fused corner/edge tree clusters). **Our atlas does not include
that** — `forest-summer.png` only has the single individual tree (above).
Tree WALLS/borders must be built by densely repeating individual `stampTree()`
calls with tight spacing (as the current map already does), not by improvising
fused corner tiles that don't exist here. Noting per the brief's scope guard
instead of substituting something invented.

### Cliff structure (cols 5-10, rows 0-15) — the big one
One continuous cliff/plateau motif, three parts stacked:

**1. Rounded grassy cap (rows 0-3, cols 5-10)** — a mound/plateau silhouette.
Interior (`A(6..9, 1..3)` roughly) is mostly transparent/unused in the
atlas — just fill with plain grass (`A(0,r)`) there, the atlas only supplies
the edge:
- `A(6,0)` top-left corner, `A(7,0)`/`A(8,0)` top edge, `A(9,0)` top-right corner
- `A(5,1)`, `A(5,2)`, `A(5,3)` left edge; `A(10,1)`, `A(10,2)`, `A(10,3)` right edge
- `A(6,3)` has a decorative round dirt/grass inset variant

**2. Cliff face (rows 4-10, repeatable body, cols 5-10)**
- Cap transition into the vertical face: `A(5,4)`..`A(10,4)` (scalloped grass-to-rock lip)
- Repeatable rock body rows: `A(6..9, 5)`, `A(6..9, 6)` (solid rock texture, repeat as many rows as needed for height); side edges `A(5, 5..9)` / `A(10, 5..9)`
- Vegetated ledge variant (use occasionally instead of a plain body row, for
  visual variety — matches reference `2BWZE9.png`'s mossy cliff faces):
  `A(6..9, 8)` (grass with small root/crack decoration at cols 7-8)
- A second body row option: `A(6..9, 9)`

**3. Base — pick ONE depending on what the cliff meets:**
- Meets water (cliff drops straight into a lake/pool): `A(5,11)` left corner,
  `A(6..9, 11)` scalloped bottom-lip-with-water-foam edge, `A(10,11)` right
  corner. Open water fill (`A(6..9, 12)`) sits directly below/inside.
- A SECOND full cap+face+water-base repeat exists at rows 12-15 (same tiles,
  `A(6,13)`..`A(10,15)` etc.) — used to stack a taller terraced cliff (cap →
  face → water pool → another cap → face → water again), confirmed by
  cropping; not a distinct new tile set.
- **Atlas limitation:** there is no flat sand/grass-to-water "beach" edge
  anywhere in this atlas (checked all 16 columns) — water is only ever
  bordered by cliff here. The lake must be rimmed with the cliff-base-meets-
  water edge above, not a flat rect fill with a hard grass/water seam (the
  current map's approach) and not an invented sandy beach.

### Cave mouth (cols 11-14, rows 7-10)
- `A(11,7)` grass-cliff top-left cap, `A(12,7)`/`A(13,7)` top cap over the
  opening, `A(14,7)` top-right cap
- `A(11,8)` left cliff side, `A(12,8)`/`A(13,8)` dark archway interior (tree
  root decoration on the right one), `A(14,8)` right cliff side
- `A(11,9)`/`A(14,9)` sides continue, `A(12,9)`/`A(13,9)` interior continues
- `A(11,10)` bottom-left corner, `A(12,10)`/`A(13,10)` brown cave-floor tiles, `A(14,10)` bottom-right corner
No interaction — purely decorative per this session's scope (no zone/label).

## Atlas 2: timber house (`..\manaseed2\tilesets\simplified full timber.png`)

256x128px, 16px tiles. This is a **pre-assembled single building illustration**
with a few stray material swatches scattered around it (a wall-texture swatch
top-left, a clipped second-building fragment at the right edge that runs off
the canvas) — it is NOT a tileable grid to compose from. Confirmed by
cropping with a 16px grid overlay.

**Usable clean house: `cols 4-11, rows 2-7` (8x6 tiles = 128x96px).** Crop
exactly that rectangle — anything outside it is a stray swatch or clipped.
- Rows 2-5 (roof, pitched, two gables + a small side wing): decorOver —
  entities should walk behind the eave overhang.
- Rows 6-7 (log-cabin walls: two shuttered windows, one green double door):
  decorUnder + blocked (walls are solid).

The OTHER timber file, `home interiors, timber roof.png` (512x256), is an
annotated INTERIOR wall/floor tileset with permanent purple guide-arrow
overlays baked into the pixels (labels like "Basic wall top", "Inside
corners" are literally drawn on it) — it is documentation, not clean usable
tile art, and isn't needed for an exterior landmark anyway. Not used.

**Engine note:** the tilemap engine's `ground`/`decorUnder`/`decorOver` arrays
assume ONE atlas (tile id = row*16+col into that single image). Rather than
inventing an ID-offset scheme to smuggle a second atlas through those arrays,
the house is added as its OWN small fixed-position stamp (a second, separate
image + a dedicated draw call), the same way critters already sit outside the
tile-layer system — this is the "register a second atlas" the brief allows
without a full engine rewrite.

## Known atlas limitations (don't improvise substitutes)
- No flat beach/sand water edge — lake must be cliff-rimmed.
- No dedicated tree-wall supertile connectors — tree borders stay
  individually-stamped trees, just densely spaced.
