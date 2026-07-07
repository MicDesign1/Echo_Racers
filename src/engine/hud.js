import { HUD } from '../data/tuning.js'

function formatTime(t) {
  if (t == null) return '—'
  const minutes = Math.floor(t / 60)
  const seconds = (t % 60).toFixed(2).padStart(5, '0')
  return `${minutes}:${seconds}`
}

function roundedPanel(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
  ctx.stroke()
}

export function drawHud(ctx, width, game, colors) {
  const { panelLeft, panelRight } = HUD
  const rightX = width - panelRight.marginRight

  ctx.fillStyle = colors.hudPanel
  ctx.strokeStyle = colors.hudBorder
  ctx.lineWidth = 1.5
  roundedPanel(ctx, panelLeft.x, panelLeft.y, panelLeft.w, panelLeft.h, panelLeft.r)
  roundedPanel(ctx, rightX, panelRight.y, panelRight.w, panelRight.h, panelRight.r)

  ctx.fillStyle = colors.hudText
  ctx.font = HUD.speedFont
  ctx.fillText(
    Math.round(game.speed / HUD.speedDivisor1 / HUD.speedDivisor2) + '',
    panelLeft.x + HUD.speedTextOffset.x, panelLeft.y + HUD.speedTextOffset.y
  )
  ctx.font = HUD.labelFont
  ctx.fillStyle = colors.hudTextDim
  ctx.fillText('leagues/hr', panelLeft.x + HUD.labelTextOffset.x, panelLeft.y + HUD.labelTextOffset.y)

  ctx.font = HUD.lapFont
  const [lapOff, lastOff, bestOff] = HUD.lapLineOffsets
  ctx.fillStyle = colors.hudText
  ctx.fillText('Lap  ' + formatTime(game.lapTime), rightX + lapOff.x, panelRight.y + lapOff.y)
  ctx.fillStyle = colors.hudTextDim
  ctx.fillText('Last ' + formatTime(game.lastLapTime), rightX + lastOff.x, panelRight.y + lastOff.y)
  ctx.fillText('Best ' + formatTime(game.bestLapTime), rightX + bestOff.x, panelRight.y + bestOff.y)
}
