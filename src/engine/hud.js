import { HUD } from '../data/tuning.js'

export function formatTime(t) {
  if (t == null) return '—'
  const minutes = Math.floor(t / 60)
  const seconds = (t % 60).toFixed(2).padStart(5, '0')
  return `${minutes}:${seconds}`
}

export function ordinal(n) {
  if (n == null) return '—'
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

function roundedPanel(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
  ctx.stroke()
}

function drawSpeedPanel(ctx, colors, game) {
  const { panelLeft } = HUD
  ctx.fillStyle = colors.hudPanel
  ctx.strokeStyle = colors.hudBorder
  ctx.lineWidth = 1.5
  roundedPanel(ctx, panelLeft.x, panelLeft.y, panelLeft.w, panelLeft.h, panelLeft.r)

  ctx.fillStyle = colors.hudText
  ctx.font = HUD.speedFont
  ctx.fillText(
    Math.round(game.speed / HUD.speedDivisor1 / HUD.speedDivisor2) + '',
    panelLeft.x + HUD.speedTextOffset.x, panelLeft.y + HUD.speedTextOffset.y
  )
  ctx.font = HUD.labelFont
  ctx.fillStyle = colors.hudTextDim
  ctx.fillText('leagues/hr', panelLeft.x + HUD.labelTextOffset.x, panelLeft.y + HUD.labelTextOffset.y)
}

// Time-trial's original time-focused panel: current/last/best lap time,
// the biggest thing on screen since there's no placement to show instead.
function drawTimeTrialPanel(ctx, width, colors, game) {
  const { panelRight } = HUD
  const rightX = width - panelRight.marginRight
  ctx.fillStyle = colors.hudPanel
  ctx.strokeStyle = colors.hudBorder
  ctx.lineWidth = 1.5
  roundedPanel(ctx, rightX, panelRight.y, panelRight.w, panelRight.h, panelRight.r)

  ctx.font = HUD.lapFont
  const [lapOff, lastOff, bestOff] = HUD.lapLineOffsets
  ctx.fillStyle = colors.hudText
  ctx.fillText('Lap  ' + formatTime(game.lapTime), rightX + lapOff.x, panelRight.y + lapOff.y)
  ctx.fillStyle = colors.hudTextDim
  ctx.fillText('Last ' + formatTime(game.lastLapTime), rightX + lastOff.x, panelRight.y + lastOff.y)
  ctx.fillText('Best ' + formatTime(game.bestLapTime), rightX + bestOff.x, panelRight.y + bestOff.y)
}

// Race mode: place is the headline (big enough to read mid-drift without
// hunting for it), lap count secondary right beneath it, and lap/total
// times shrunk to a small corner readout — see HUD.racePlace/raceLapCount/
// raceTimes in tuning.js for every size and position used here.
function drawRaceHierarchy(ctx, width, game, colors) {
  const cx = width / 2
  ctx.textAlign = 'center'

  ctx.font = HUD.racePlace.font
  ctx.fillStyle = colors.resonanceGlow
  ctx.shadowColor = 'rgba(20, 10, 5, 0.65)'
  ctx.shadowBlur = 10
  ctx.fillText(ordinal(game.place).toUpperCase(), cx, HUD.racePlace.y)
  ctx.shadowBlur = 0

  ctx.font = HUD.raceLapCount.font
  ctx.fillStyle = colors.hudText
  ctx.fillText(`LAP ${game.lap}/${game.lapCount}`, cx, HUD.racePlace.y + HUD.raceLapCount.offsetY)
  ctx.textAlign = 'left'

  const t = HUD.raceTimes
  const rightX = width - t.marginRight
  ctx.fillStyle = colors.hudPanel
  ctx.strokeStyle = colors.hudBorder
  ctx.lineWidth = 1.5
  roundedPanel(ctx, rightX, t.y, t.w, t.h, t.r)

  ctx.font = t.font
  const [lapOff, totalOff, bestOff] = t.lineOffsets
  ctx.fillStyle = colors.hudText
  ctx.fillText('Lap   ' + formatTime(game.lapTime), rightX + lapOff.x, t.y + lapOff.y)
  ctx.fillStyle = colors.hudTextDim
  ctx.fillText('Total ' + formatTime(game.raceTime), rightX + totalOff.x, t.y + totalOff.y)
  ctx.fillText('Best  ' + formatTime(game.bestLapTime), rightX + bestOff.x, t.y + bestOff.y)
}

export function drawHud(ctx, width, game, colors) {
  drawSpeedPanel(ctx, colors, game)
  if (game.mode === 'race') {
    drawRaceHierarchy(ctx, width, game, colors)
  } else {
    drawTimeTrialPanel(ctx, width, colors, game)
  }
}
