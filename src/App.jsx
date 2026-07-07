import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import PracticeSetup from './pages/PracticeSetup.jsx'
import RaceTrack from './screens/RaceTrack.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/practice" element={<PracticeSetup />} />
        <Route path="/race" element={<RaceTrack />} />
      </Routes>
    </BrowserRouter>
  )
}
