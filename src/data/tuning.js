// Centralized game-feel constants. Adjust here rather than scattering magic
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

// Speeds/accelerations are in world units/sec (and /sec^2) — scaled against
// ROAD.segmentLength so "maxSpeed" means "segments crossed per second".
export const RACE = {
  maxSpeed: 7200,
  accel: 1800,
  brakeDecel: 4800,
  friction: 1200,
  offRoadMaxSpeed: 2400,
  offRoadDecel: 3600,
  steerRate: 2.5,
  centrifugalStrength: 0.3,
}

export const CREATURE_STAT_RANGES = {
  spd: [10, 100],
  atk: [10, 100],
  def: [10, 100],
  hp: [50, 200],
}
