// Best-time persistence, namespaced per profile (e.g. `echoRacers.default.bestTimes`)
// so multiple save profiles can be added later without a key-format change.
const PROFILE_ID = 'default'

function storageKey(profile) {
  return `echoRacers.${profile}.bestTimes`
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

// A full lap of the current track is also the whole race for now (there's
// no multi-lap race yet), so bestLap and bestTotal move together here — but
// they're stored as separate fields so a future multi-lap race can update
// them independently without a save-data migration.
export function recordLapResult(trackId, lapTime, profile = PROFILE_ID) {
  const times = loadBestTimes(profile)
  const prev = times[trackId] || { bestLap: null, bestTotal: null }
  const isNewBestLap = prev.bestLap == null || lapTime < prev.bestLap
  const isNewBestTotal = prev.bestTotal == null || lapTime < prev.bestTotal
  const next = {
    bestLap: isNewBestLap ? lapTime : prev.bestLap,
    bestTotal: isNewBestTotal ? lapTime : prev.bestTotal,
  }
  times[trackId] = next
  saveBestTimes(times, profile)
  return { ...next, isNewBestLap, isNewBestTotal }
}
