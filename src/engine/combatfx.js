import { COMBAT } from '../data/tuning.js'

// The attack telegraph: a resonance pulse/bolt traveling from the
// attacker's creature-silhouette rider (`from`) to the target's (`to`),
// with `t` in 0..1 being the trip progress. Drawn additive so it reads as
// the machines' resonance light, in the attacker's own glow color
// (`glowRGB`). `targetWidth` scales the head so a far-off bolt stays a
// point and a nearby one reads as a bright orb. This is the single most
// important cue — nobody presses a button, so the hit must be visibly
// caused by something arriving.
export function drawAttackBolt(ctx, from, to, t, glowRGB, targetWidth) {
  const hx = from.x + (to.x - from.x) * t
  const hy = from.y + (to.y - from.y) * t
  const core = Math.max(COMBAT.telegraphMinCorePx, targetWidth * COMBAT.telegraphCoreFraction)

  // A short streaking tail trailing the head, for a sense of travel.
  const tailT = Math.max(0, t - 0.2)
  const tx = from.x + (to.x - from.x) * tailT
  const ty = from.y + (to.y - from.y) * tailT

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  const tail = ctx.createLinearGradient(tx, ty, hx, hy)
  tail.addColorStop(0, `rgba(${glowRGB}, 0)`)
  tail.addColorStop(1, `rgba(${glowRGB}, 0.5)`)
  ctx.strokeStyle = tail
  ctx.lineWidth = core * 0.7
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(tx, ty)
  ctx.lineTo(hx, hy)
  ctx.stroke()

  const head = ctx.createRadialGradient(hx, hy, 0, hx, hy, core)
  head.addColorStop(0, `rgba(${glowRGB}, 0.95)`)
  head.addColorStop(0.5, `rgba(${glowRGB}, 0.5)`)
  head.addColorStop(1, `rgba(${glowRGB}, 0)`)
  ctx.fillStyle = head
  ctx.beginPath()
  ctx.arc(hx, hy, core, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

// A brief screen-edge glow pulse, drawn only when the PLAYER is the victim
// (`intensity` 0..1, fading out). Center-transparent to keep the road and
// HUD readable; it blooms inward from the frame edges so a hit taken
// mid-drift is unmissable even when the player's eyes are on the apex, not
// on their own car.
export function drawPlayerHitEdge(ctx, width, height, intensity, glowRGB) {
  if (intensity <= 0) return
  const inner = Math.min(width, height) * COMBAT.edgePulseInnerFraction
  const outer = Math.max(width, height) * COMBAT.edgePulseOuterFraction
  const grad = ctx.createRadialGradient(width / 2, height / 2, inner, width / 2, height / 2, outer)
  grad.addColorStop(0, `rgba(${glowRGB}, 0)`)
  grad.addColorStop(0.6, `rgba(${glowRGB}, ${0.35 * COMBAT.edgePulseAlpha * intensity})`)
  grad.addColorStop(1, `rgba(${glowRGB}, ${COMBAT.edgePulseAlpha * intensity})`)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}
