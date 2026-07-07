// Projects a track-space point into 2D screen space by perspective division:
// scale shrinks proportionally to distance from the camera (cameraDepth/z),
// which is what makes the road narrow toward a vanishing point at the horizon.
export function project(p, cameraX, cameraY, cameraZ, cameraDepth, width, height, roadWidth) {
  const camX = p.world.x - cameraX
  const camY = p.world.y - cameraY
  const camZ = p.world.z - cameraZ
  p.camera.x = camX
  p.camera.y = camY
  p.camera.z = camZ
  const scale = cameraDepth / camZ
  p.screen.x = width / 2 + scale * camX * width / 2
  p.screen.y = height / 2 - scale * camY * height / 2
  p.screen.w = scale * roadWidth * width / 2
}

function quad(ctx, x1, y1, w1, x2, y2, w2, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x1 - w1, y1)
  ctx.lineTo(x2 - w2, y2)
  ctx.lineTo(x2 + w2, y2)
  ctx.lineTo(x1 + w1, y1)
  ctx.closePath()
  ctx.fill()
}

export function renderSegment(ctx, width, x1, y1, w1, x2, y2, w2, colors) {
  ctx.fillStyle = colors.grass
  ctx.fillRect(0, y2, width, y1 - y2)

  quad(ctx, x1, y1, w1 * 1.15, x2, y2, w2 * 1.15, colors.rumble)
  quad(ctx, x1, y1, w1, x2, y2, w2, colors.road)
}
