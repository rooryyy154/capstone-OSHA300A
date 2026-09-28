import { Route, Routes } from 'react-router-dom'
import NavBar from './components/NavBar.jsx'
import Comments from './pages/Comments.jsx'
import Credits from './pages/Credits.jsx'
import Home from './pages/Home.jsx'

export default function App() {
  return (
    <div className="d-flex flex-column min-vh-100">
      <NavBar />

      <main className="flex-grow-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/comments" element={<Comments />} />
          <Route path="/credits" element={<Credits />} />
        </Routes>
      </main>
    </div>
  )
}
