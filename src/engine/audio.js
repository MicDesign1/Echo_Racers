import { AUDIO } from '../data/tuning.js'
import { getMuted, setMuted } from '../data/saves.js'
import { SOUND_MANIFEST, SOUND_POOLS, SOUNDS_DIR } from '../data/sounds.js'

// Single audio module for the whole game (Web Audio API, no libraries).
// Responsibilities:
//   - lazily create the AudioContext on the first user gesture (browsers
//     block/suspend audio before interaction — creating it early also logs a
//     console warning, so we defer creation entirely until ensureStarted());
//   - a master gain with a persisted M-key mute;
//   - channels: `sfx` (one-shots + drift), `ambient` (engine/wind/rival hums),
//     `music` (race track);
//   - synthesized beds/one-shots wired to live game state;
//   - a sampled layer (randomized attack/damage pools, race music, win cheer)
//     that falls back to synth and fails silently when clips are missing;
//   - lifecycle: race-end fade, Race Again restore, and a hard teardown on
//     unmount that stops every source and closes the context.
//
// Every trigger no-ops until ensureStarted() has run, so it is safe to call
// audio.update()/audio.playAttack()/etc. from the game loop before any gesture.

let ctx = null
let master = null
let sfxBus = null
let ambientBus = null
let musicBus = null
let noiseBuffer = null
let noiseSource = null

let engine = null // { osc1, osc2, sub, gain }
let wind = null // { filter, gain }
let drift = null // { gain }  (bandpass fed from the shared noise source)
let rivalHums = [] // [{ osc1, osc2, gain }]

// When true (race finished), the continuous beds stay faded and update() will
// not re-raise them. Cleared by raceRestart() on Race Again.
let raceEnded = false

let muted = getMuted()

// Every started source (oscillators, noise, one-shots, samples, music) is
// tracked so teardown() can stop all of them and verification can assert zero
// remain after unmount. Sources self-remove on 'ended'.
const activeSources = new Set()

// Decoded sample buffers keyed by filename (ctx-bound; cleared on teardown).
const sampleCache = new Map() // filename -> AudioBuffer | null (null = missing)

// Retrigger bookkeeping per pool: the currently-sounding voices.
const poolVoices = new Map() // poolName -> Set<{ src, gain }>

// Race music instances (usually one, briefly two during a fade-restart).
let musicActive = false
let musicTimer = null
const musicVoices = new Set() // { src, gain }

// Which clip each combat event picked — for verification ("varied sounds").
const pickLog = { attack: [], damage: [] }

// Debug counters so the (headless, silent) verification harness can confirm
// each trigger actually fired — see getDebugState().
const counters = { beep: 0, go: 0, zap: 0, hit: 0, playerHit: 0, boost: 0, results: 0, blip: 0, sample: 0, cheer: 0 }

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

function busFor(channel) {
  if (channel === 'ambient') return ambientBus
  if (channel === 'music') return musicBus
  return sfxBus
}

// Track a source for teardown; auto-untrack when it ends.
function registerSource(src) {
  activeSources.add(src)
  src.addEventListener('ended', () => activeSources.delete(src))
}

function stopSource(src) {
  try { src.stop() } catch { /* already stopped */ }
  try { src.disconnect() } catch { /* already gone */ }
  activeSources.delete(src)
}

function makeNoiseBuffer(context) {
  const length = Math.floor(context.sampleRate * 2)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  // Gently low-passed white noise (a simple running average) reads warmer
  // and less hissy than raw white noise — suits the wholesome tone rail.
  let last = 0
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    data[i] = last * 3.5
  }
  return buffer
}

function buildEngine() {
  const e = AUDIO.engine
  const gain = ctx.createGain()
  gain.gain.value = e.idleGain
  gain.connect(ambientBus)

  const osc1 = ctx.createOscillator()
  osc1.type = e.waveform
  osc1.frequency.value = e.idleFreq
  const osc2 = ctx.createOscillator()
  osc2.type = e.waveform
  osc2.frequency.value = e.idleFreq
  osc2.detune.value = e.detuneCents
  const sub = ctx.createOscillator()
  sub.type = 'sine'
  sub.frequency.value = e.idleFreq * e.subRatio
  const subGain = ctx.createGain()
  subGain.gain.value = e.subMix

  osc1.connect(gain)
  osc2.connect(gain)
  sub.connect(subGain).connect(gain)
  osc1.start(); osc2.start(); sub.start()
  registerSource(osc1); registerSource(osc2); registerSource(sub)
  engine = { osc1, osc2, sub, gain }
}

function buildWind() {
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = AUDIO.wind.minCutoff
  filter.Q.value = AUDIO.wind.q
  const gain = ctx.createGain()
  gain.gain.value = 0
  noiseSource.connect(filter).connect(gain).connect(ambientBus)
  wind = { filter, gain }
}

function buildDrift() {
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = AUDIO.drift.cutoff
  filter.Q.value = AUDIO.drift.q
  const gain = ctx.createGain()
  gain.gain.value = 0
  noiseSource.connect(filter).connect(gain).connect(sfxBus)
  drift = { gain }
}

function ensureRivalHums(count) {
  const r = AUDIO.rivalEngine
  while (rivalHums.length < count) {
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(ambientBus)
    const osc1 = ctx.createOscillator()
    osc1.type = r.waveform
    osc1.frequency.value = r.idleFreq
    const osc2 = ctx.createOscillator()
    osc2.type = r.waveform
    osc2.frequency.value = r.idleFreq
    osc2.detune.value = r.detuneCents
    osc1.connect(gain); osc2.connect(gain)
    osc1.start(); osc2.start()
    registerSource(osc1); registerSource(osc2)
    rivalHums.push({ osc1, osc2, gain })
  }
}

function applyMute() {
  if (!master) return
  const target = muted ? 0 : AUDIO.master
  master.gain.setTargetAtTime(target, ctx.currentTime, AUDIO.muteGlide)
}

// Create the audio graph (once) and resume the context. Call from a real
// user-gesture handler (keydown/pointerdown). Idempotent and safe to spam.
export function ensureStarted() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : AUDIO.master
    master.connect(ctx.destination)
    sfxBus = ctx.createGain()
    sfxBus.gain.value = AUDIO.sfxGain
    sfxBus.connect(master)
    ambientBus = ctx.createGain()
    ambientBus.gain.value = AUDIO.ambientGain
    ambientBus.connect(master)
    musicBus = ctx.createGain()
    musicBus.gain.value = AUDIO.music.volume // independent music level
    musicBus.connect(master)

    noiseBuffer = makeNoiseBuffer(ctx)
    noiseSource = ctx.createBufferSource()
    noiseSource.buffer = noiseBuffer
    noiseSource.loop = true
    noiseSource.start()
    registerSource(noiseSource)

    buildEngine()
    buildWind()
    buildDrift()
    preloadSamples()
  }
  if (ctx.state === 'suspended') ctx.resume()
}

export function suspend() {
  if (ctx && ctx.state === 'running') ctx.suspend()
}

// Hard teardown for RaceTrack unmount: stop EVERY source and close the
// context so zero audio survives leaving the race. A later ensureStarted()
// rebuilds the whole graph from scratch.
export function teardown() {
  if (!ctx) return
  if (musicTimer) { clearTimeout(musicTimer); musicTimer = null }
  musicActive = false
  for (const src of Array.from(activeSources)) stopSource(src)
  activeSources.clear()
  poolVoices.clear()
  musicVoices.clear()
  try { ctx.close() } catch { /* already closing */ }
  ctx = null; master = null; sfxBus = null; ambientBus = null; musicBus = null
  engine = null; wind = null; drift = null; rivalHums = []
  noiseSource = null; noiseBuffer = null
  raceEnded = false
  // Buffers were decoded against the now-closed context; drop them so the
  // next context re-decodes cleanly.
  sampleCache.clear()
}

export function isStarted() { return !!ctx }
export function isMuted() { return muted }

export function toggleMute() {
  muted = !muted
  setMuted(muted)
  applyMute()
  return muted
}

// ---- Race lifecycle -----------------------------------------------------

// Race finished: fade the continuous beds and music to silence over
// raceEndFadeSec as the results screen appears, and freeze update() so it
// won't re-raise them. Combat sounds are gated off by the caller.
export function raceEndFade() {
  if (!ctx || ctx.state !== 'running') return
  raceEnded = true
  const now = ctx.currentTime
  const fade = AUDIO.raceEndFadeSec
  const rampDown = (param) => {
    param.cancelScheduledValues(now)
    param.setValueAtTime(Math.max(0.0001, param.value), now)
    param.linearRampToValueAtTime(0.0001, now + fade)
  }
  if (engine) rampDown(engine.gain.gain)
  if (wind) rampDown(wind.gain.gain)
  if (drift) rampDown(drift.gain.gain)
  for (const v of rivalHums) rampDown(v.gain.gain)
  stopMusic(fade)
}

// Race Again: let the beds come back (update() resumes) and clear any leftover
// fade schedule. Music restarts on the next GO.
export function raceRestart() {
  raceEnded = false
  if (!ctx) return
  const now = ctx.currentTime
  const reset = (param, val) => { param.cancelScheduledValues(now); param.setValueAtTime(val, now) }
  if (engine) reset(engine.gain.gain, AUDIO.engine.idleGain)
  if (wind) reset(wind.gain.gain, 0)
  if (drift) reset(drift.gain.gain, 0)
  for (const v of rivalHums) reset(v.gain.gain, 0)
}

// ---- Continuous, state-driven beds -------------------------------------

// Called every frame with a snapshot of game state. No-ops before start and
// after race end (so the race-end fade holds).
//   state = { speed, maxSpeed, drifting, rivals: [{ speed, gap }] }
export function update(state) {
  if (!ctx || ctx.state !== 'running' || raceEnded) return
  const now = ctx.currentTime
  const glide = AUDIO.paramGlide
  const spd = clamp(state.speed / state.maxSpeed, 0, 1)

  const e = AUDIO.engine
  const engFreq = e.idleFreq + (e.maxFreq - e.idleFreq) * Math.pow(spd, e.freqCurve)
  const engGain = e.idleGain + (e.maxGain - e.idleGain) * spd
  engine.osc1.frequency.setTargetAtTime(engFreq, now, glide)
  engine.osc2.frequency.setTargetAtTime(engFreq, now, glide)
  engine.sub.frequency.setTargetAtTime(engFreq * e.subRatio, now, glide)
  engine.gain.gain.setTargetAtTime(engGain, now, glide)

  const w = AUDIO.wind
  wind.filter.frequency.setTargetAtTime(w.minCutoff + (w.maxCutoff - w.minCutoff) * spd, now, glide)
  wind.gain.gain.setTargetAtTime(w.minGain + (w.maxGain - w.minGain) * Math.pow(spd, w.gainCurve), now, glide)

  const d = AUDIO.drift
  drift.gain.gain.setTargetAtTime(state.drifting ? d.gain : 0, now, state.drifting ? d.attack : d.release)

  const rivals = state.rivals || []
  ensureRivalHums(rivals.length)
  const r = AUDIO.rivalEngine
  for (let i = 0; i < rivalHums.length; i++) {
    const voice = rivalHums[i]
    const info = rivals[i]
    if (!info) { voice.gain.gain.setTargetAtTime(0, now, glide); continue }
    const proximity = clamp(1 - Math.abs(info.gap) / r.rangeWorld, 0, 1)
    const rspd = clamp(info.speed / state.maxSpeed, 0, 1)
    const freq = r.idleFreq + (r.maxFreq - r.idleFreq) * Math.pow(rspd, AUDIO.engine.freqCurve)
    voice.osc1.frequency.setTargetAtTime(freq, now, glide)
    voice.osc2.frequency.setTargetAtTime(freq, now, glide)
    voice.gain.gain.setTargetAtTime(r.maxGain * proximity, now, glide)
  }
}

// ---- Synth one-shots ----------------------------------------------------

// A single enveloped tone (optionally pitch-gliding), with an optional
// detuned partner for shimmer. Routed to the given bus.
function tone(bus, { waveform, freqStart, freqEnd, duration, gain, detuneCents }) {
  const now = ctx.currentTime
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, now)
  g.gain.linearRampToValueAtTime(gain, now + Math.min(0.02, duration * 0.25))
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  g.connect(bus)

  const stopAt = now + duration + 0.05
  const mkOsc = (detune) => {
    const osc = ctx.createOscillator()
    osc.type = waveform
    osc.frequency.setValueAtTime(freqStart, now)
    if (freqEnd != null && freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + duration)
    }
    if (detune) osc.detune.setValueAtTime(detune, now)
    osc.connect(g)
    osc.start(now)
    osc.stop(stopAt)
    registerSource(osc)
  }
  mkOsc(0)
  if (detuneCents) mkOsc(detuneCents)
}

function chord(bus, { waveform, freqs, duration, gain }) {
  for (const f of freqs) tone(bus, { waveform, freqStart: f, duration, gain })
}

export function countdownBeep() {
  if (!ctx || ctx.state !== 'running') return
  tone(sfxBus, { ...AUDIO.countdown.beep, freqStart: AUDIO.countdown.beep.freq })
  counters.beep++
}

export function countdownGo() {
  if (!ctx || ctx.state !== 'running') return
  chord(sfxBus, AUDIO.countdown.go)
  counters.go++
}

// Synth combat fallbacks (used when the sampled pool is empty / not loaded).
export function zap(fromPlayer) {
  if (!ctx || ctx.state !== 'running') return
  const z = AUDIO.combat.zap
  const shift = fromPlayer ? 1.08 : 1.0 // the player's own creature reads brighter
  tone(sfxBus, { ...z, freqStart: z.freqStart * shift, freqEnd: z.freqEnd * shift })
  counters.zap++
}

export function hit(isPlayerVictim) {
  if (!ctx || ctx.state !== 'running') return
  tone(sfxBus, isPlayerVictim ? AUDIO.combat.playerHit : AUDIO.combat.hit)
  if (isPlayerVictim) counters.playerHit++
  else counters.hit++
}

export function boost() {
  if (!ctx || ctx.state !== 'running') return
  tone(sfxBus, AUDIO.boost)
  counters.boost++
}

export function results() {
  if (!ctx || ctx.state !== 'running') return
  const u = AUDIO.ui.results
  u.freqs.forEach((f, i) => {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    const start = ctx.currentTime + i * u.noteGap
    osc.type = u.waveform
    osc.frequency.setValueAtTime(f, start)
    g.gain.setValueAtTime(0.0001, start)
    g.gain.linearRampToValueAtTime(u.gain, start + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, start + u.duration)
    osc.connect(g).connect(sfxBus)
    osc.start(start)
    osc.stop(start + u.duration + 0.05)
    registerSource(osc)
  })
  counters.results++
}

export function blip() {
  if (!ctx || ctx.state !== 'running') return
  tone(sfxBus, { ...AUDIO.ui.blip, freqStart: AUDIO.ui.blip.freq })
  counters.blip++
}

// ---- Sample layer (pools + single clips) --------------------------------

// Fetch + decode one file, cached by filename. Missing/error caches null so
// the caller falls back to synth and we never retry a known-bad file.
function loadFile(filename) {
  if (sampleCache.has(filename)) return
  if (!ctx) return
  fetch(`${SOUNDS_DIR}${filename}`)
    .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error('missing'))))
    .then((ab) => ctx.decodeAudioData(ab))
    .then((buf) => { sampleCache.set(filename, buf) })
    .catch(() => { sampleCache.set(filename, null) })
}

// Preload every pool clip + single-clip sample so combat/music can play
// immediately. Fires on ensureStarted; early triggers before decode complete
// fall back to synth. Files that 404 fail silently (cached null).
function preloadSamples() {
  const files = new Set()
  for (const pool of Object.values(SOUND_POOLS)) for (const f of pool.files || []) files.add(f)
  for (const entry of Object.values(SOUND_MANIFEST)) if (entry.file) files.add(entry.file)
  for (const f of files) loadFile(f)
}

// Pick a random filename from a named pool (or null if empty / undefined).
export function pickFromPool(poolName) {
  const pool = SOUND_POOLS[poolName]
  if (!pool || !pool.files || !pool.files.length) return null
  return pool.files[Math.floor(Math.random() * pool.files.length)]
}

// Play a specific preloaded file with a pool's gain/pitch/retrigger policy.
// Returns true if it played, false if the buffer isn't available yet (caller
// then uses the synth fallback).
function playPoolFile(poolName, filename) {
  const pool = SOUND_POOLS[poolName]
  const buf = sampleCache.get(filename)
  if (!pool || !buf) return false

  let voices = poolVoices.get(poolName)
  if (!voices) { voices = new Set(); poolVoices.set(poolName, voices) }
  if (pool.retrigger === 'restart') {
    for (const v of voices) stopSource(v.src)
    voices.clear()
  } else if (pool.retrigger === 'overlap' && pool.maxVoices) {
    while (voices.size >= pool.maxVoices) {
      const oldest = voices.values().next().value
      stopSource(oldest.src)
      voices.delete(oldest)
    }
  }

  const voice = playBuffer(buf, { channel: pool.channel, gain: pool.gain, pitchVariation: pool.pitchVariation })
  voices.add(voice)
  voice.src.addEventListener('ended', () => voices.delete(voice))
  if (pickLog[poolName]) pickLog[poolName].push(filename)
  counters.sample++
  return true
}

// Low-level: play a decoded buffer once with pitch variation. Returns
// { src, gain } and tracks the source for teardown.
function playBuffer(buf, { channel, gain, pitchVariation }) {
  const now = ctx.currentTime
  const src = ctx.createBufferSource()
  src.buffer = buf
  const v = pitchVariation || 0
  src.playbackRate.value = 1 + (Math.random() * 2 - 1) * v
  const g = ctx.createGain()
  g.gain.value = gain != null ? gain : 1
  src.connect(g).connect(busFor(channel))
  registerSource(src)
  src.start(now)
  return { src, gain: g }
}

// Combat attack fire — every racer. Sampled random pool is primary; synth zap
// is the fallback. See tuning AUDIO.combat.useSampledAttack.
export function playAttack(fromPlayer) {
  if (!ctx || ctx.state !== 'running') return
  // FUTURE TYPED COMBAT SWAP POINT: when creature types exist, replace
  // pickFromPool('attack') with pickForType('attack', attackerType) and fall
  // back to the full pool. Today every racer draws from the whole attack pool.
  const file = AUDIO.combat.useSampledAttack ? pickFromPool('attack') : null
  if (file && playPoolFile('attack', file)) return
  zap(fromPlayer) // synth fallback (or primary when sampled attack is off)
}

// Being-hit — every racer. Sampled random pool primary; synth thump fallback.
export function playDamage(isPlayerVictim) {
  if (!ctx || ctx.state !== 'running') return
  // FUTURE TYPED COMBAT SWAP POINT: when creature types exist, replace
  // pickFromPool('damage') with pickForType('damage', targetType) and fall
  // back to the full pool. Today every hit draws from the whole damage pool.
  const file = AUDIO.combat.useSampledDamage ? pickFromPool('damage') : null
  if (file && playPoolFile('damage', file)) return
  hit(isPlayerVictim) // synth fallback (or primary when sampled damage is off)
}

// Victory cheer — results screen, 1st place only. Returns true if it played.
export function playWinCheer() {
  if (!ctx || ctx.state !== 'running') return false
  const entry = SOUND_MANIFEST['ui.win']
  const buf = entry && sampleCache.get(entry.file)
  if (!buf) return false
  playBuffer(buf, { channel: entry.channel, gain: entry.gain, pitchVariation: entry.pitchVariation })
  counters.cheer++
  return true
}

// ---- Race music (fade-restart, not seamlessly loopable) -----------------

export function startRaceMusic() {
  if (!ctx || ctx.state !== 'running') return
  musicActive = true
  playMusicInstance()
}

function playMusicInstance() {
  if (!ctx || !musicActive) return
  const entry = SOUND_MANIFEST['music.race']
  const buf = entry && sampleCache.get(entry.file)
  if (!buf) return // not loaded / missing -> no music (no synth fallback), silent
  const now = ctx.currentTime
  const dur = buf.duration
  const fadeIn = AUDIO.music.fadeIn
  const fadeOut = AUDIO.music.fadeOut
  const level = entry.gain != null ? entry.gain : 1
  const fadeOutStart = Math.max(fadeIn, dur - fadeOut)

  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, now)
  g.gain.linearRampToValueAtTime(level, now + fadeIn)
  g.gain.setValueAtTime(level, now + fadeOutStart)
  g.gain.linearRampToValueAtTime(0.0001, now + dur)

  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(g).connect(musicBus)
  registerSource(src)
  src.start(now)
  src.stop(now + dur + 0.1)

  const voice = { src, gain: g }
  musicVoices.add(voice)
  src.addEventListener('ended', () => musicVoices.delete(voice))

  // Start the next instance right as this one begins fading, so the new
  // fade-in overlaps the old fade-out — no dead gap beyond the fades.
  if (musicTimer) clearTimeout(musicTimer)
  musicTimer = setTimeout(playMusicInstance, fadeOutStart * 1000)
}

function stopMusic(fade) {
  musicActive = false
  if (musicTimer) { clearTimeout(musicTimer); musicTimer = null }
  if (!ctx) return
  const now = ctx.currentTime
  for (const v of musicVoices) {
    try {
      v.gain.gain.cancelScheduledValues(now)
      v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), now)
      v.gain.gain.linearRampToValueAtTime(0.0001, now + fade)
      v.src.stop(now + fade + 0.05)
    } catch { /* voice already ended */ }
  }
}

// ---- Debug (verification only) -----------------------------------------

export function getPickLog() {
  return { attack: [...pickLog.attack], damage: [...pickLog.damage] }
}

export function getDebugState() {
  return {
    started: !!ctx,
    ctxState: ctx ? ctx.state : 'none',
    muted,
    master: master ? +master.gain.value.toFixed(4) : null,
    engineFreq: engine ? +engine.osc1.frequency.value.toFixed(1) : null,
    engineGain: engine ? +engine.gain.gain.value.toFixed(4) : null,
    windGain: wind ? +wind.gain.gain.value.toFixed(4) : null,
    driftGain: drift ? +drift.gain.gain.value.toFixed(4) : null,
    rivalGains: rivalHums.map((r) => +r.gain.gain.value.toFixed(4)),
    raceEnded,
    activeSources: activeSources.size,
    musicActive,
    musicVoices: musicVoices.size,
    musicDuration: (() => { const b = sampleCache.get(SOUND_MANIFEST['music.race'].file); return b ? +b.duration.toFixed(2) : null })(),
    samplesLoaded: [...sampleCache.values()].filter(Boolean).length,
    distinctAttack: new Set(pickLog.attack).size,
    distinctDamage: new Set(pickLog.damage).size,
    attackPicks: pickLog.attack.length,
    damagePicks: pickLog.damage.length,
    counters: { ...counters },
  }
}
