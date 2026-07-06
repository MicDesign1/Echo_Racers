// Centralized game-feel constants. Placeholder values — not yet tuned against
// the actual road-rendering engine. Adjust here rather than scattering magic
// numbers through engine/component code.

export const ROAD = {
  segmentLength: 200,
  segmentsPerColor: 3,
  roadWidth: 2000,
  cameraDepth: 0.84,
  cameraHeight: 1000,
  drawDistance: 300,
  fov: 100,
}

export const RACE = {
  maxSpeed: 300,
  accel: 0.6,
  decel: 0.9,
  offRoadDecel: 0.3,
  centrifugalStrength: 0.3,
}

export const CREATURE_STAT_RANGES = {
  spd: [10, 100],
  atk: [10, 100],
  def: [10, 100],
  hp: [50, 200],
}
