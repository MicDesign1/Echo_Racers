import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { RACE, DIFFICULTY } from '../data/tuning.js'
import { getPracticeConfig, setPracticeConfig, getOrigin } from '../data/saves.js'
import './PracticeSetup.css'

// Out-of-box difficulty: Racer, so a first-time player doesn't start on the
// easiest tier. A persisted last-used choice (below) overrides this.
const DEFAULT_DIFFICULTY = 'Racer'
const DEFAULT_RIVAL_COUNT = 3

// Short, plain-language blurbs — no story framing (that's Bible-dependent).
// Keyed by tier name; falls back to the tier's own label if one is missing.
const TIER_BLURBS = {
  Cadet: 'Relaxed pace — a gentle field, good for learning the course.',
  Racer: 'A real contest — rivals push you the whole way.',
  Ace: 'Ruthless — rivals match your top speed and never ease up.',
}

const TIER_NAMES = Object.keys(DIFFICULTY)
const RIVAL_COUNTS = Array.from({ length: RACE.maxRivalCount }, (_, i) => i + 1)

// Reads the persisted choice and clamps it to what the current build supports,
// so a stale/hand-edited value can never launch an invalid race.
function initialChoices() {
  const saved = getPracticeConfig()
  const difficulty = DIFFICULTY[saved.difficulty] ? saved.difficulty : DEFAULT_DIFFICULTY
  const rawCount = Number(saved.rivalCount)
  const rivalCount = Number.isFinite(rawCount)
    ? Math.max(1, Math.min(RACE.maxRivalCount, Math.round(rawCount)))
    : DEFAULT_RIVAL_COUNT
  return { difficulty, rivalCount }
}

export default function PracticeSetup() {
  const navigate = useNavigate()
  // Where to go on "back" and after the race — a reload-proof origin from
  // sessionStorage (defaults to the hub, the game's home). Survives a hard
  // reload mid-setup, unlike react-router location.state.
  const returnTo = getOrigin()
  const [{ difficulty, rivalCount }, setChoices] = useState(initialChoices)

  const setDifficulty = (d) => setChoices((c) => ({ ...c, difficulty: d }))
  const setRivalCount = (n) => setChoices((c) => ({ ...c, rivalCount: n }))

  function startRace() {
    // Write the choices into the config Session 1 created (the single source
    // opponents/grid/combat read through activeRaceConfig), then persist them
    // as the next default and launch. trackId is left as-is — one track today.
    RACE.raceMode = 'practice'
    RACE.practice = { ...RACE.practice, difficulty, rivalCount }
    setPracticeConfig({ difficulty, rivalCount, trackId: RACE.practice.trackId })
    // Origin persists in sessionStorage, so the race returns to the hub even
    // after a hard reload — no navigation state needed.
    navigate('/race')
  }

  return (
    <div className="practice-setup">
      <div className="practice-card">
        <h1 className="practice-title">Practice Race</h1>
        <p className="practice-subtitle">Set up a quick race, then hit the circuit.</p>

        <section className="setup-section">
          <h2 className="setup-label">Rivals</h2>
          <div className="count-grid" role="group" aria-label="Number of rivals">
            {RIVAL_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                className={`count-btn${n === rivalCount ? ' is-selected' : ''}`}
                aria-pressed={n === rivalCount}
                onClick={() => setRivalCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="setup-hint">{rivalCount} rival{rivalCount === 1 ? '' : 's'} on the grid</p>
        </section>

        <section className="setup-section">
          <h2 className="setup-label">Difficulty</h2>
          <div className="tier-list" role="group" aria-label="Difficulty">
            {TIER_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                className={`tier-card${name === difficulty ? ' is-selected' : ''}`}
                aria-pressed={name === difficulty}
                onClick={() => setDifficulty(name)}
              >
                <span className="tier-name">{DIFFICULTY[name].label || name}</span>
                <span className="tier-blurb">{TIER_BLURBS[name] || ''}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Track selection placeholder — themed tracks don't exist yet. This
            slot is where the future multi-track session wires real choices;
            it's intentionally disabled so the layout is already in place. */}
        <section className="setup-section">
          <h2 className="setup-label">Track</h2>
          <div className="track-slot is-disabled" aria-disabled="true">
            <span className="track-name">Circuit One</span>
            <span className="track-note">More tracks coming soon</span>
          </div>
        </section>

        <div className="setup-actions">
          <button type="button" className="start-btn" onClick={startRace}>
            Start Race
          </button>
          <Link to={returnTo} className="setup-back">
            {returnTo === '/hub' ? 'Back to hub' : 'Back to menu'}
          </Link>
        </div>
      </div>
    </div>
  )
}
