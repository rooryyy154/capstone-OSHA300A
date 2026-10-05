import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useYear } from '../../lib/useYear.js'
import BrandMark from './BrandMark.jsx'

const NAV = [
  { to: '/', label: 'Findings', end: true },
  { to: '/benchmark', label: 'Benchmark your plant' },
  { to: '/contact', label: 'Contact' },
  { to: '/credits', label: 'Credits' },
]

function YearSelect() {
  const { years, year, setYear, status } = useYear()
  const placeholder = status === 'loading' ? 'Loading…' : status === 'error' ? 'No data' : 'Year'
  return (
    <label className="year-select" title={status === 'error' ? "The list of report years couldn't load" : undefined}>
      <span className="visually-hidden">OSHA report year</span>
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        <rect x="2.5" y="4" width="15" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M2.5 8h15M6.5 2v4M13.5 2v4" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      <select value={year ?? ''} disabled={years.length === 0} onChange={(event) => setYear(Number(event.target.value))}>
        {years.length === 0 && <option value="">{placeholder}</option>}
        {years.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function SiteHeader() {
  // Menu state lives in React so the mobile menu closes after navigating
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <header>
      <div className="site-header">
        <div className="container site-header__inner">
          <Link className="brand" to="/" onClick={close}>
            <BrandMark className="brand__mark" />
            <span className="brand__name">PlantLine</span>
          </Link>
          <ul className="header-links">
            <li>
              <Link to="/#methodology">Methodology</Link>
            </li>
            <li>
              <a href="https://www.osha.gov/Establishment-Specific-Injury-and-Illness-Data" target="_blank" rel="noreferrer">
                OSHA ITA data
              </a>
            </li>
          </ul>
        </div>
      </div>

      <nav className="main-nav" aria-label="Main">
        <div className="container main-nav__inner">
          <YearSelect />
          <button
            className="nav-toggle"
            type="button"
            aria-expanded={open}
            aria-controls="main-nav-list"
            onClick={() => setOpen((current) => !current)}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="2" />
            </svg>
            Menu
          </button>
          <ul id="main-nav-list" className={`main-nav__list ${open ? 'open' : ''}`}>
            {NAV.map(({ to, label, end }) => (
              <li key={to}>
                <NavLink className="main-nav__link" to={to} end={end} onClick={close}>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </header>
  )
}
