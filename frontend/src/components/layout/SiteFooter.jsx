import { Link } from 'react-router-dom'
import BrandMark from './BrandMark.jsx'

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-primary">
        <div className="container footer-grid">
          <div>
            <div className="footer-brand">
              <BrandMark />
              PlantLine
            </div>
            <p className="footer-note">
              Compare your plant's injury rate with every workplace in your industry, using the Form 300A summaries
              employers submit to OSHA.
            </p>
          </div>
          <div>
            <h2>Explore</h2>
            <ul>
              <li>
                <Link to="/">Findings</Link>
              </li>
              <li>
                <Link to="/benchmark">Benchmark your plant</Link>
              </li>
              <li>
                <Link to="/#methodology">Methodology</Link>
              </li>
              <li>
                <Link to="/contact">Contact</Link>
              </li>
              <li>
                <Link to="/credits">Credits</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2>Data</h2>
            <ul>
              <li>
                <a href="https://www.osha.gov/Establishment-Specific-Injury-and-Illness-Data" target="_blank" rel="noreferrer">
                  OSHA Injury Tracking Application
                </a>
              </li>
              <li>
                <a href="https://www.osha.gov/recordkeeping/forms" target="_blank" rel="noreferrer">
                  Recordkeeping forms 300, 300A, 301
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  )
}
