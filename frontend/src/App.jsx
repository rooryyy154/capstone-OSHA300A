import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import SiteFooter from './components/layout/SiteFooter.jsx'
import SiteHeader from './components/layout/SiteHeader.jsx'
import Benchmark from './pages/Benchmark.jsx'
import Contact from './pages/Contact.jsx'
import Credits from './pages/Credits.jsx'
import Landing from './pages/Landing.jsx'
import NotFound from './pages/NotFound.jsx'

function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

export default function App() {
  return (
    <div className="site">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <ScrollToTop />
      <SiteHeader />

      <main id="main" className="site-main">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/benchmark" element={<Benchmark />} />
          <Route path="/contact" element={<Contact />} />
          {/* The Contact page replaced the old Comments placeholder */}
          <Route path="/comments" element={<Navigate to="/contact" replace />} />
          <Route path="/credits" element={<Credits />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <SiteFooter />
    </div>
  )
}
