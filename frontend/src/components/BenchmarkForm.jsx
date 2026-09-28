import { useState } from 'react'

const FIELDS = [
  {
    name: 'naics_code',
    label: 'Industry (NAICS code)',
    placeholder: 'e.g. 332710',
    type: 'text',
    inputMode: 'numeric',
    pattern: '\\d{6}',
    maxLength: 6,
    error: 'Enter a 6-digit NAICS code.',
  },
  {
    name: 'annual_average_employees',
    label: 'Annual average number of employees',
    placeholder: 'e.g. 120',
    type: 'number',
    min: 1,
    step: 1,
    error: 'Enter a whole number of at least 1.',
  },
  {
    name: 'total_hours_worked',
    label: 'Total hours worked by all employees',
    placeholder: 'e.g. 240000',
    type: 'number',
    min: 1,
    step: 1,
    error: 'Enter a whole number greater than 0.',
  },
  {
    name: 'total_recordable_cases',
    label: 'Total recordable cases',
    placeholder: 'e.g. 4',
    type: 'number',
    min: 0,
    step: 1,
    error: 'Enter a whole number, 0 or more.',
  },
]

const EMPTY = Object.fromEntries(FIELDS.map((field) => [field.name, '']))

export default function BenchmarkForm() {
  const [values, setValues] = useState(EMPTY)
  const [validated, setValidated] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleChange = (event) => {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setSubmitted(false)
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    setValidated(true)
    if (!event.currentTarget.checkValidity()) return
    // TODO: POST values to /api/benchmark/ once the endpoint exists (Phase 3)
    setSubmitted(true)
  }

  return (
    <form className={`card shadow-sm ${validated ? 'was-validated' : ''}`} noValidate onSubmit={handleSubmit}>
      <div className="card-body p-4">
        <h2 className="h4 mb-1">Your plant</h2>
        <p className="text-body-secondary mb-4">All four values come from your OSHA Form 300A for the same year.</p>

        {FIELDS.map(({ name, label, error, ...inputProps }) => (
          <div className="mb-4" key={name}>
            <label htmlFor={name} className="form-label fw-semibold">
              {label}
            </label>
            <input
              {...inputProps}
              id={name}
              name={name}
              className="form-control"
              required
              value={values[name]}
              onChange={handleChange}
            />
            <div className="invalid-feedback">{error}</div>
          </div>
        ))}

        <button type="submit" className="btn btn-primary btn-lg w-100">
          Compare my plant
        </button>

        {submitted && (
          <div className="alert alert-info mt-4 mb-0" role="status">
            The benchmark calculation is not connected yet. The API endpoint comes in Phase 3.
          </div>
        )}
      </div>
    </form>
  )
}
