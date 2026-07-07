import { Link } from 'react-router-dom'
import './HomePage.css'

export default function HomePage() {
  return (
    <div className="home-page">
      <h1>Animalian: Echo Racers</h1>
      <Link to="/practice" className="home-page-link">Practice Race</Link>
    </div>
  )
}
