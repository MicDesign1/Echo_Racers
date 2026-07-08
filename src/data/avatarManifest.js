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
//
// Hub Phase 1.7 adds STANDALONE body styles (pre-baked Mana Seed NPC sheets —
// see data/tuning.js HUB.npcSprite for their frame grid, confirmed on the
// actual files, not assumed). These do NOT conform to the char_a_p1 layer grid
// and never go through the palette-swap compositor: a standalone style's
// "colors" are whole alternate sheet files (`variants`), not a recolor ramp,
// and picking one locks out outfit/hair/hat (baked into the art). The
// descriptor keeps its existing seven fields — no new shape — by letting the
// `body` field carry a compound value for standalone looks: `${styleId}:${variantId}`
// (e.g. 'npcMan:c00'); a plain value with no ':' (e.g. 'c00') still means the
// legacy human skin-tone color, so old saves load unchanged.

import { AVATAR_PALETTES } from './avatarPalettes.js'

const LAYER_DIR = '/sprites/hub/layers'
const NPC_DIR = '/sprites/hub/npc'

// Drawing + picking order (hat draws last, on top of hair).
export const AVATAR_SLOTS = ['body', 'outfit', 'hair', 'hat']

// Styles per slot. `id` is stable (used in the descriptor + palette keys),
// `name` is the kid-facing label, `src` is the source sheet the compositor
// palette-swaps. Names are plain descriptors, never lore/place names.
//
// Standalone body styles carry `standalone: true` and a `variants` list
// (instead of a ramp-driven color list): each variant IS a whole alternate
// sheet file, sampled directly for its swatch color (no palette extraction —
// there's no ramp to extract, these are baked looks).
export const AVATAR_STYLES = {
  body: [
    { id: 'human', name: 'Body', src: `${LAYER_DIR}/char_a_p1_0bas_humn_v00.png` },
    {
      id: 'npcMan', name: 'Traveler (Man)', standalone: true,
      variants: [
        { id: 'c00', swatch: '#4890b0', src: `${NPC_DIR}/npc_man_a_v01.png` },
        { id: 'c01', swatch: '#b08898', src: `${NPC_DIR}/npc_man_a_v02.png` },
        { id: 'c02', swatch: '#389878', src: `${NPC_DIR}/npc_man_a_v03.png` },
        { id: 'c03', swatch: '#ab8c46', src: `${NPC_DIR}/npc_man_a_v04.png` },
      ],
    },
    {
      id: 'npcWoman', name: 'Traveler (Woman)', standalone: true,
      variants: [
        { id: 'c00', swatch: '#d6d69c', src: `${NPC_DIR}/npc_woman_a_v01.png` },
        { id: 'c01', swatch: '#70d8e8', src: `${NPC_DIR}/npc_woman_a_v02.png` },
        { id: 'c02', swatch: '#f8b848', src: `${NPC_DIR}/npc_woman_a_v03.png` },
        { id: 'c03', swatch: '#c7e5dc', src: `${NPC_DIR}/npc_woman_a_v04.png` },
      ],
    },
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
// per slot. `body`'s style/color both resolve through the compound-encoded
// `body` field itself (see parseBody/encodeBody) since it now holds more than
// one style; use getSlotStyleId/getSlotColorId/setSlotStyle/setSlotColor below
// rather than indexing these fields directly so that stays a single place.
export const SLOT_FIELDS = {
  body: { style: 'body', color: 'body' },
  outfit: { style: 'outfit', color: 'outfitColor' },
  hair: { style: 'hair', color: 'hairColor' },
  hat: { style: 'hat', color: 'hatColor' },
}

export function findStyle(slot, id) {
  return AVATAR_STYLES[slot].find((s) => s.id === id) || AVATAR_STYLES[slot][0]
}

// The ordered color list for a slot/style: ramp-driven colors for normal
// styles (from the generated palette data), or the raw variant list for a
// standalone style (each variant already has {id, swatch, src}).
export function colorList(slot, styleId) {
  const style = findStyle(slot, styleId)
  if (style?.standalone) return style.variants || []
  return AVATAR_PALETTES[slot]?.[styleId]?.colors || []
}

// --- body field compound encoding (standalone styles only) ---
// Legacy/human value: a plain color id, e.g. 'c00' -> { styleId: 'human', variantId: 'c00' }.
// Standalone value: 'styleId:variantId', e.g. 'npcMan:c00'.
export function parseBody(bodyValue) {
  const s = typeof bodyValue === 'string' ? bodyValue : ''
  const i = s.indexOf(':')
  if (i === -1) return { styleId: 'human', variantId: s }
  return { styleId: s.slice(0, i), variantId: s.slice(i + 1) }
}

export function encodeBody(styleId, variantId) {
  return styleId === 'human' ? variantId : `${styleId}:${variantId}`
}

export function isBodyStandalone(descriptor) {
  const { styleId } = parseBody(descriptor?.body)
  return !!findStyle('body', styleId).standalone
}

// --- generic slot accessors used by the customization screen. Every slot
// except body maps straight onto its two SLOT_FIELDS entries; body is the one
// slot whose style AND color live in the same compound-encoded field, so it's
// special-cased here ONCE rather than in the screen.
export function getSlotStyleId(slot, descriptor) {
  if (slot === 'body') return parseBody(descriptor.body).styleId
  const field = SLOT_FIELDS[slot].style
  return field ? descriptor[field] : AVATAR_STYLES[slot][0].id
}

export function getSlotColorId(slot, descriptor) {
  if (slot === 'body') return parseBody(descriptor.body).variantId
  return descriptor[SLOT_FIELDS[slot].color]
}

// Returns a NEW descriptor with `slot` switched to `styleId`, keeping the
// current color if it's still valid for the new style (else falling back to
// that style's first color) — same rule the screen previously inlined.
export function setSlotStyle(slot, descriptor, styleId) {
  const colors = colorList(slot, styleId)
  if (slot === 'body') {
    const curVariant = parseBody(descriptor.body).variantId
    const keepColor = colors.some((c) => c.id === curVariant)
    return { ...descriptor, body: encodeBody(styleId, keepColor ? curVariant : (colors[0]?.id || 'c00')) }
  }
  const field = SLOT_FIELDS[slot].style
  const colorField = SLOT_FIELDS[slot].color
  const keepColor = colors.some((c) => c.id === descriptor[colorField])
  return { ...descriptor, [field]: styleId, [colorField]: keepColor ? descriptor[colorField] : (colors[0]?.id || 'c00') }
}

export function setSlotColor(slot, descriptor, colorId) {
  if (slot === 'body') {
    const { styleId } = parseBody(descriptor.body)
    return { ...descriptor, body: encodeBody(styleId, colorId) }
  }
  return { ...descriptor, [SLOT_FIELDS[slot].color]: colorId }
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

function validBody(bodyValue) {
  const { styleId, variantId } = parseBody(bodyValue)
  const style = AVATAR_STYLES.body.find((s) => s.id === styleId) || AVATAR_STYLES.body[0]
  const validVariant = validColor('body', style.id, variantId)
  return encodeBody(style.id, validVariant)
}

// Coerces any (possibly stale / hand-edited / partial) descriptor to a valid
// one against the current manifest + palettes. Always returns a fresh plain
// object with exactly the seven descriptor fields. A standalone body's
// outfit/hair/hat fields are still normalized to valid values (never left
// stale/erroring) even though the renderer ignores them for that look.
export function normalizeAvatar(a) {
  const src = a && typeof a === 'object' ? a : {}
  const outfitStyle = findStyle('outfit', src.outfit).id
  const hairStyle = findStyle('hair', src.hair).id
  const hatStyle = findStyle('hat', src.hat).id // defaults to 'none' for old saves
  return {
    body: validBody(src.body),
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

// A random valid look: random body style (human or a standalone traveler) +
// random color/variant, and independently a random style + color for every
// other slot (harmless even when a standalone body will ignore them).
export function randomAvatar() {
  const bodyStyle = pick(AVATAR_STYLES.body)
  const bodyColor = pick(colorList('body', bodyStyle.id)).id
  const outfitStyle = pick(AVATAR_STYLES.outfit).id
  const hairStyle = pick(AVATAR_STYLES.hair).id
  const hatStyle = pick(AVATAR_STYLES.hat).id
  const hatColors = colorList('hat', hatStyle) // empty for 'none'
  return {
    body: encodeBody(bodyStyle.id, bodyColor),
    outfit: outfitStyle,
    outfitColor: pick(colorList('outfit', outfitStyle)).id,
    hair: hairStyle,
    hairColor: pick(colorList('hair', hairStyle)).id,
    hat: hatStyle,
    hatColor: hatColors.length ? pick(hatColors).id : 'c00',
  }
}
