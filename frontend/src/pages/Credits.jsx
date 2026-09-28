const STACK = ['React', 'Vite', 'Bootstrap', 'Django', 'Django REST Framework', 'PostgreSQL']

export default function Credits() {
  return (
    <div className="container py-5">
      <h1 className="mb-4">Credits</h1>

      <section className="mb-5">
        <h2 className="h4">Data</h2>
        <p>
          Injury and illness data comes from the{' '}
          <a href="https://www.osha.gov/Establishment-Specific-Injury-and-Illness-Data" target="_blank" rel="noreferrer">
            OSHA Injury Tracking Application (ITA)
          </a>
          , Form 300A summary data. Establishments submit this data themselves, and OSHA does not verify it.
        </p>
      </section>

      <section className="mb-5">
        <h2 className="h4">Built with</h2>
        <div className="d-flex flex-wrap gap-2">
          {STACK.map((tool) => (
            <span key={tool} className="badge text-bg-secondary fs-6 fw-normal">
              {tool}
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}
