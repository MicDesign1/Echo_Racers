// Avatar style manifest — the SINGLE source of truth for which look-styles
// exist, driving the customization UI (never hardcode filenames in
// components). Each style points at ONE "source" sprite sheet (the Mana Seed
// v00/v01 "base ramp" variant); its selectable COLORS come from the ramp data
// in avatarPalettes.js (generated from the official variant files), applied by
// the palette-swap compositor (engine/avatarComposite.js).
//
// Slots are drawn/composited in this order (Mana Seed layer order):
//   body (0bas, skin) -> outfit (1out) -> hair (4har) -> hat (5hat)
// The avatar descriptor is a plain serializable object:
//   { body, outfit, outfitColor, hair, hairColor, hat, hatColor }
// where `body` selects the skin color (the body has a single style), and each
// *Color field selects a color id from that slot/style's ramp list. The hat slot
// includes a 'none' style (no sheet) so a bare-headed look is a valid choice.

import { AVATAR_PALETTES } from './avatarPalettes.js'

const LAYER_DIR = '/sprites/hub/layers'

// Drawing + picking order (hat draws last, on top of hair).
export const AVATAR_SLOTS = ['body', 'outfit', 'hair', 'hat']

// Styles per slot. `id` is stable (used in the descriptor + palette keys),
// `name` is the kid-facing label, `src` is the source sheet the compositor
// palette-swaps. Names are plain descriptors, never lore/place names.
export const AVATAR_STYLES = {
  body: [
    { id: 'human', name: 'Body', src: `${LAYER_DIR}/char_a_p1_0bas_humn_v00.png` },
  ],
  outfit: [
    { id: 'forester', name: 'Forester', src: `${LAYER_DIR}/char_a_p1_1out_fstr_v01.png` },
    { id: 'farmer', name: 'Farmer', src: `${LAYER_DIR}/char_a_p1_1out_pfpn_v01.png` },
  ],
  hair: [
    { id: 'bob', name: 'Bob', src: `${LAYER_DIR}/char_a_p1_4har_bob1_v00.png` },
    { id: 'dap', name: 'Swept', src: `${LAYER_DIR}/char_a_p1_4har_dap1_v00.png` },
  ],
  // 'none' has no sheet (bare-headed); the compositor skips styles with no
  // palette entry, so it simply draws nothing for that slot.
  hat: [
    { id: 'none', name: 'None', src: null },
    { id: 'straw', name: 'Straw Hat', src: `${LAYER_DIR}/char_a_p1_5hat_pfht_v01.png` },
    { id: 'pointed', name: 'Pointed Hat', src: `${LAYER_DIR}/char_a_p1_5hat_pnty_v01.png` },
  ],
}

// Which descriptor field carries the STYLE id and which carries the COLOR id,
// per slot. (`body` is both: single style, so its field holds the skin color.)
export const SLOT_FIELDS = {
  body: { style: null, color: 'body' },
  outfit: { style: 'outfit', color: 'outfitColor' },
  hair: { style: 'hair', color: 'hairColor' },
  hat: { style: 'hat', color: 'hatColor' },
}

export function findStyle(slot, id) {
  return AVATAR_STYLES[slot].find((s) => s.id === id) || AVATAR_STYLES[slot][0]
}

// The ordered color list for a slot/style (from the generated ramp data).
export function colorList(slot, styleId) {
  return AVATAR_PALETTES[slot]?.[styleId]?.colors || []
}

// Default look — reproduces the Phase-1 sprite (v00 skin, forester v01, bob
// v00), since c00 of each style is the identity/base-ramp color.
export const DEFAULT_AVATAR = {
  body: 'c00',
  outfit: 'forester',
  outfitColor: 'c00',
  hair: 'bob',
  hairColor: 'c00',
  hat: 'none',
  hatColor: 'c00',
}

function validColor(slot, styleId, colorId) {
  const list = colorList(slot, styleId)
  return list.some((c) => c.id === colorId) ? colorId : (list[0]?.id || 'c00')
}

// Coerces any (possibly stale / hand-edited / partial) descriptor to a valid
// one against the current manifest + palettes. Always returns a fresh plain
// object with exactly the five descriptor fields.
export function normalizeAvatar(a) {
  const src = a && typeof a === 'object' ? a : {}
  const bodyStyle = 'human' // single body style
  const outfitStyle = findStyle('outfit', src.outfit).id
  const hairStyle = findStyle('hair', src.hair).id
  const hatStyle = findStyle('hat', src.hat).id // defaults to 'none' for old saves
  return {
    body: validColor('body', bodyStyle, src.body),
    outfit: outfitStyle,
    outfitColor: validColor('outfit', outfitStyle, src.outfitColor),
    hair: hairStyle,
    hairColor: validColor('hair', hairStyle, src.hairColor),
    hat: hatStyle,
    hatColor: validColor('hat', hatStyle, src.hatColor),
  }
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// A random valid look: random style + random color per slot.
export function randomAvatar() {
  const outfitStyle = pick(AVATAR_STYLES.outfit).id
  const hairStyle = pick(AVATAR_STYLES.hair).id
  const hatStyle = pick(AVATAR_STYLES.hat).id
  const hatColors = colorList('hat', hatStyle) // empty for 'none'
  return {
    body: pick(colorList('body', 'human')).id,
    outfit: outfitStyle,
    outfitColor: pick(colorList('outfit', outfitStyle)).id,
    hair: hairStyle,
    hairColor: pick(colorList('hair', hairStyle)).id,
    hat: hatStyle,
    hatColor: hatColors.length ? pick(hatColors).id : 'c00',
  }
}
