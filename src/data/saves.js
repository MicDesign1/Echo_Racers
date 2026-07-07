// Best-time persistence, namespaced per profile (e.g. `echoRacers.default.bestTimes`)
// so multiple save profiles can be added later without a key-format change.
const PROFILE_ID = 'default'

function storageKey(profile) {
  return `echoRacers.${profile}.bestTimes`
}

// Player settings live in a sibling key (`echoRacers.<profile>.settings`) —
// same namespacing scheme as best times, so it fits the existing save
// structure without changing the best-time record shape. Currently just the
// audio mute flag; other preferences can be added as fields here later.
function settingsKey(profile) {
  return `echoRacers.${profile}.settings`
}

function loadSettings(profile) {
  try {
    const raw = localStorage.getItem(settingsKey(profile))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function getMuted(profile = PROFILE_ID) {
  return loadSettings(profile).muted === true
}

export function setMuted(muted, profile = PROFILE_ID) {
  try {
    const settings = loadSettings(profile)
    settings.muted = muted === true
    localStorage.setItem(settingsKey(profile), JSON.stringify(settings))
  } catch {
    // Storage unavailable (private browsing, quota) — mute just won't persist.
  }
  return muted === true
}

// Last-used Practice setup choices (difficulty / rivalCount / trackId), stored
// as a plain object on the same settings record so the setup screen can default
// to what the player picked last time. Stored raw; the caller validates against
// the current DIFFICULTY tiers / rival-count bounds when reading, so an old or
// hand-edited value can never push an invalid config into a race.
export function getPracticeConfig(profile = PROFILE_ID) {
  const p = loadSettings(profile).practice
  return p && typeof p === 'object' ? p : {}
}

export function setPracticeConfig(config, profile = PROFILE_ID) {
  try {
    const settings = loadSettings(profile)
    settings.practice = config
    localStorage.setItem(settingsKey(profile), JSON.stringify(settings))
  } catch {
    // Storage unavailable (private browsing, quota) — choices just won't persist.
  }
  return config
}

function loadBestTimes(profile) {
  try {
    const raw = localStorage.getItem(storageKey(profile))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveBestTimes(times, profile) {
  try {
    localStorage.setItem(storageKey(profile), JSON.stringify(times))
  } catch {
    // Storage unavailable (private browsing, quota) — best times just won't persist.
  }
}

export function getBestTimes(trackId, profile = PROFILE_ID) {
  return loadBestTimes(profile)[trackId] || { bestLap: null, bestTotal: null }
}

// bestLap and bestTotal are independent fields on the same record: bestLap
// updates on every single lap (both modes), bestTotal only on completing a
// full race (recordRaceResult, below) — so a lap time never overwrites the
// best full-race total. Same storage shape as before, so previously saved
// { bestLap, bestTotal } records still load unchanged.
export function recordLapResult(trackId, lapTime, profile = PROFILE_ID) {
  const times = loadBestTimes(profile)
  const prev = times[trackId] || { bestLap: null, bestTotal: null }
  const isNewBestLap = prev.bestLap == null || lapTime < prev.bestLap
  const next = { ...prev, bestLap: isNewBestLap ? lapTime : prev.bestLap }
  times[trackId] = next
  saveBestTimes(times, profile)
  return { ...next, isNewBestLap }
}

// Called once, when a full lapCount-lap race is completed (RACE.mode ===
// 'race') — updates bestTotal only, independently of any lap's bestLap.
export function recordRaceResult(trackId, totalTime, profile = PROFILE_ID) {
  const times = loadBestTimes(profile)
  const prev = times[trackId] || { bestLap: null, bestTotal: null }
  const isNewBestTotal = prev.bestTotal == null || totalTime < prev.bestTotal
  const next = { ...prev, bestTotal: isNewBestTotal ? totalTime : prev.bestTotal }
  times[trackId] = next
  saveBestTimes(times, profile)
  return { ...next, isNewBestTotal }
}
