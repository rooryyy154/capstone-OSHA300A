import PageHeader from '../components/layout/PageHeader.jsx'

const STACK = ['React', 'Vite', 'Django', 'Django REST Framework', 'PostgreSQL', 'pandas', 'SciPy']

export default function Credits() {
  return (
    <>
      <PageHeader title="Credits" />
      <div className="container">
        <div className="prose">
          <section>
            <h2>Data</h2>
            <p>
              Injury and illness data comes from the{' '}
              <a href="https://www.osha.gov/Establishment-Specific-Injury-and-Illness-Data" target="_blank" rel="noreferrer">
                OSHA Injury Tracking Application (ITA)
              </a>
              , Form 300A summary data. Establishments submit this data themselves, and OSHA does not verify it.
            </p>
          </section>

          <section>
            <h2>Built with</h2>
            <ul className="tag-list">
              {STACK.map((tool) => (
                <li key={tool}>{tool}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  )
}
