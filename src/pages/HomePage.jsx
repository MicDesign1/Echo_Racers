import { Link } from 'react-router-dom'
import './HomePage.css'

// Title / entry screen. The hub (/hub) is the game's home world — this screen
// is just the front door into it. (Profile/settings will live here later as
// overlays.)
export default function HomePage() {
  return (
    <div className="home-page">
      <h1>Animalian: Echo Racers</h1>
      <Link to="/hub" className="home-page-play">Play</Link>
    </div>
  )
}
