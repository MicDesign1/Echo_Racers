/**
 * Sample manifest — the recorded-audio layer that sits ON TOP of (and, where a
 * clip exists, in front of) the synthesized sounds in engine/audio.js.
 *
 * Missing files fail silently: any empty pool or absent/undecoded clip makes
 * the caller fall back to the synth default (see engine/audio.js), so the game
 * still runs with an empty sounds folder.
 *
 * NAMING CONVENTION (all lowercase, hyphen-separated, in public/sounds/):
 *
 *   attack-<type>-<n>.mp3     creature attack-fire voices. <type> is a creature
 *                             type (fire, iron, storm, phantom, …) or `any`
 *                             for the generic clip. <n> = variant index.
 *   damage-<type>-<n>.mp3     being-hit voices, same <type>/<n> scheme.
 *   ambient-<name>.mp3        looping environment beds.
 *   music-<name>-<n>.mp3      music tracks.
 *   ui-<name>.mp3             menu / results one-shots.
 *
 * ENTRY / POOL SHAPE — every entry (and pool) may carry:
 *   file            : filename in public/sounds/ (single-clip entries)
 *   files           : array of filenames (pools — see pickFromPool)
 *   channel         : 'sfx' | 'ambient' | 'music'
 *   gain            : linear playback level (0..1)
 *   retrigger       : 'restart' = a new play cancels the pool's current voice
 *                     (tight, no pile-up); 'overlap' = voices layer, capped at
 *                     maxVoices
 *   maxVoices       : (overlap only) max simultaneous voices
 *   pitchVariation  : per-play random playbackRate shift (± this fraction)
 *   loop            : true for continuous beds
 */
export const SOUNDS_DIR = '/sounds/'

/**
 * Random pools. pickFromPool(name) returns a random file from the pool each
 * play. Typed combat does NOT exist yet, so combat currently pulls from the
 * WHOLE pool regardless of creature type. When typed combat lands, the pick
 * becomes type-keyed (pickForType('attack', type) with fallback to the full
 * pool) — the swap points are marked in engine/audio.js (playAttack/playDamage).
 *
 * Pools list EVERY matching clip currently in public/sounds/.
 */
export const SOUND_POOLS = {
  // ATTACK pool — all attack-*.mp3
  attack: {
    files: [
      'attack-any-1.mp3',
      'attack-fire-1.mp3',
      'attack-iron-1.mp3',
      'attack-storm-1.mp3',
      'attack-phantom-1.mp3',
      'attack-phantom-2.mp3',
    ],
    channel: 'sfx',
    gain: 0.8,
    retrigger: 'restart',
    pitchVariation: 0.1,
  },
  // DAMAGE pool — all damage-*.mp3
  damage: {
    files: [
      'damage-fire-1.mp3',
      'damage-iron-1.mp3',
      'damage-phantom-1.mp3',
      'damage-storm-1.mp3',
      'damage-thorn-2.mp3',
    ],
    channel: 'sfx',
    gain: 0.85,
    retrigger: 'restart',
    pitchVariation: 0.12,
  },
}

// Single-clip events.
export const SOUND_MANIFEST = {
  // Race music — not seamlessly loopable, so engine/audio.js fades it out near
  // the end and restarts a fresh instance with a short fade-in (no dead gap).
  'music.race': { file: 'music-race-1.mp3', channel: 'music', gain: 1.0, pitchVariation: 0, loop: false },
  // Victory cheer — played on the results screen for 1st place ONLY.
  'ui.win': { file: 'ui-win-cheer.mp3', channel: 'sfx', gain: 0.9, pitchVariation: 0 },
}
