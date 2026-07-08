import { Link } from 'react-router-dom'
import './HomePage.css'

export default function HomePage() {
  return (
    <div className="home-page">
      <h1>Animalian: Echo Racers</h1>
      <Link to="/practice" className="home-page-link">Practice Race</Link>
      {/* Temporary dev entry into the Phase-1 walkable hub prototype. */}
      <Link to="/hub" className="home-page-link home-page-link-dev">Hub (dev)</Link>
    </div>
  )
}
