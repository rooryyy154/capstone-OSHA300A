import { useState } from 'react'
import Loader from '../states/Loader.jsx'
import IndustryPicker from './IndustryPicker.jsx'

// Mirrors backend/core/rules.py so most mistakes are caught before the request (D-004, D-008)
const MIN_HOURS_PER_EMPLOYEE = 250
const MAX_HOURS_PER_EMPLOYEE = 8760

const NUMBER_FIELDS = [
  { name: 'annual_average_employees', label: 'Annual average number of employees', placeholder: 'e.g. 120', min: 1 },
  { name: 'total_hours_worked', label: 'Total hours worked by all employees', placeholder: 'e.g. 240,000', min: 1 },
  { name: 'total_recordable_cases', label: 'Total recordable cases', placeholder: 'e.g. 4', min: 0 },
]

const OWNERSHIP = [
  { value: 'private', label: 'Private' },
  { value: 'government', label: 'Government' },
  { value: 'all', label: 'All' },
]

const EMPTY = {
  naics_code: '',
  annual_average_employees: '',
  total_hours_worked: '',
  total_recordable_cases: '',
  ownership: 'private',
}

const parseCount = (text) => {
  const clean = String(text).replace(/[,\s]/g, '')
  return /^\d+$/.test(clean) ? Number(clean) : null
}

function validate(values) {
  const errors = {}
  if (!/^\d{6}$/.test(values.naics_code)) errors.naics_code = 'Pick your industry from the list, or type its 6-digit NAICS code.'

  const numbers = {}
  for (const field of NUMBER_FIELDS) {
    const number = parseCount(values[field.name])
    if (number == null || number < field.min) {
      errors[field.name] = field.min === 0 ? 'Enter a whole number, 0 or more.' : 'Enter a whole number of at least 1.'
    }
    numbers[field.name] = number
  }

  const { annual_average_employees: employees, total_hours_worked: hours, total_recordable_cases: cases } = numbers
  if (!errors.total_hours_worked && !errors.annual_average_employees) {
    const perEmployee = hours / employees
    if (perEmployee < MIN_HOURS_PER_EMPLOYEE || perEmployee > MAX_HOURS_PER_EMPLOYEE) {
      errors.total_hours_worked = `That's ${Math.round(perEmployee).toLocaleString('en-US')} hours per employee. It should be between 250 and 8,760.`
    }
  }
  if (!errors.total_recordable_cases && !errors.annual_average_employees && cases > employees) {
    errors.total_recordable_cases = "Recordable cases can't be more than the number of employees."
  }
  return { errors, numbers }
}

export default function BenchmarkForm({ onSubmit, loading, serverErrors }) {
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const shown = { ...errors, ...serverErrors }

  const update = (name, value) => {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const { errors: found, numbers } = validate(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    onSubmit({ naics_code: values.naics_code, ownership: values.ownership, ...numbers })
  }

  const errorId = (name) => (shown[name] ? `${name}-error` : undefined)

  return (
    <form className="calc-form" noValidate onSubmit={handleSubmit}>
      <h2 className="calc-form__title">Your plant</h2>

      <div className="field">
        <label htmlFor="naics_code">Industry (NAICS code)</label>
        <IndustryPicker
          id="naics_code"
          value={values.naics_code}
          onChange={(code) => update('naics_code', code)}
          invalid={Boolean(shown.naics_code)}
          describedBy={errorId('naics_code')}
        />
        {shown.naics_code && (
          <p id="naics_code-error" className="field__error">
            {shown.naics_code}
          </p>
        )}
      </div>

      {NUMBER_FIELDS.map((field) => (
        <div className="field" key={field.name}>
          <label htmlFor={field.name}>{field.label}</label>
          <input
            id={field.name}
            className="input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder={field.placeholder}
            value={values[field.name]}
            aria-invalid={Boolean(shown[field.name]) || undefined}
            aria-describedby={errorId(field.name)}
            onChange={(event) => update(field.name, event.target.value)}
          />
          {shown[field.name] && (
            <p id={`${field.name}-error`} className="field__error">
              {shown[field.name]}
            </p>
          )}
        </div>
      ))}

      <fieldset className="field segmented">
        <legend>Compare with</legend>
        <div className="segmented__options">
          {OWNERSHIP.map((option) => (
            <label key={option.value} className={values.ownership === option.value ? 'is-checked' : undefined}>
              <input
                type="radio"
                name="ownership"
                value={option.value}
                checked={values.ownership === option.value}
                onChange={() => update('ownership', option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <button type="submit" className="button calc-form__submit" disabled={loading}>
        {loading ? <Loader inline label="Calculating" /> : 'Calculate my TRIR'}
      </button>
    </form>
  )
}
