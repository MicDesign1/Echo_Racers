import { Link } from 'react-router-dom'
import './HomePage.css'

export default function HomePage() {
  return (
    <div className="home-page">
      <h1>Animalian: Echo Racers</h1>
      <Link to="/practice" className="home-page-link">Practice Race</Link>
      {/* Temporary dev entries into the walkable hub prototype + avatar screen. */}
      <Link to="/hub" className="home-page-link home-page-link-dev">Hub (dev)</Link>
      <Link to="/avatar" className="home-page-link home-page-link-dev">Avatar (dev)</Link>
    </div>
  )
}
