import { useState } from 'react'
import { NavLink } from 'react-router-dom'

const LINKS = [
  { to: '/', label: 'Home' },
  { to: '/comments', label: 'Comments' },
  { to: '/credits', label: 'Credits' },
]

export default function NavBar() {
  // Collapse state lives in React so the mobile menu closes after navigating
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <nav className="navbar navbar-expand-md navbar-dark bg-dark">
      <div className="container">
        <NavLink className="navbar-brand fw-semibold" to="/" onClick={close}>
          OSHA Industry Benchmark
        </NavLink>
        <button
          className="navbar-toggler"
          type="button"
          aria-controls="mainNav"
          aria-expanded={open}
          aria-label="Toggle navigation"
          onClick={() => setOpen((current) => !current)}
        >
          <span className="navbar-toggler-icon" />
        </button>
        <div className={`collapse navbar-collapse ${open ? 'show' : ''}`} id="mainNav">
          <ul className="navbar-nav ms-auto">
            {LINKS.map(({ to, label }) => (
              <li className="nav-item" key={to}>
                <NavLink className="nav-link" to={to} end onClick={close}>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  )
}
