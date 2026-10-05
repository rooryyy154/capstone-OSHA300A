import { useEffect, useRef, useState } from 'react'
import { postBenchmark } from '../api/client.js'
import BenchmarkForm from '../components/benchmark/BenchmarkForm.jsx'
import ResultPanel from '../components/benchmark/ResultPanel.jsx'
import PageHeader from '../components/layout/PageHeader.jsx'
import Loader from '../components/states/Loader.jsx'
import PageAlert from '../components/states/PageAlert.jsx'
import { useYear } from '../lib/useYear.js'
import './Benchmark.css'

const FIELDS = ['naics_code', 'annual_average_employees', 'total_hours_worked', 'total_recordable_cases', 'ownership', 'year']

// The API answers in well under a second; holding the loader this long keeps it from flashing
// and lets the user see that a new report was generated.
const MIN_LOADING_MS = 700

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export default function Benchmark() {
  const { year, status: yearStatus, error: yearError, retry: retryYears } = useYear()
  const [submitted, setSubmitted] = useState(null)
  const [response, setResponse] = useState({ key: null, result: null, error: null, fieldErrors: {} })
  const resultsRef = useRef(null)
  const scrollAfterSubmit = useRef(false)

  // One request per (submission, report year): changing the year in the header re-runs the last
  // calculation against that year's peers, and resubmitting the same numbers retries.
  const key = submitted ? JSON.stringify({ ...submitted, year }) : null
  const loading = key != null && response.key !== key

  useEffect(() => {
    if (!key) return undefined
    const controller = new AbortController()
    const body = JSON.parse(key)
    delete body.attempt
    if (body.year == null) delete body.year // years list unavailable: let the API use the latest

    const request = postBenchmark(body, { signal: controller.signal })
    Promise.allSettled([request, wait(MIN_LOADING_MS)]).then(([outcome]) => {
      if (controller.signal.aborted) return
      if (outcome.status === 'fulfilled') {
        setResponse({ key, result: outcome.value, error: null, fieldErrors: {} })
        // On narrow screens the results sit below the form
        if (scrollAfterSubmit.current && window.matchMedia('(max-width: 960px)').matches) {
          requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
        }
        scrollAfterSubmit.current = false
        return
      }
      const err = outcome.reason
      const fieldErrors = Object.fromEntries(
        FIELDS.filter((field) => err.data?.[field]).map((field) => [field, [].concat(err.data[field]).join(' ')]),
      )
      const error = Object.keys(fieldErrors).length === 0 ? err : null
      setResponse((current) => ({ key, result: current.result, error, fieldErrors }))
      // The status is shown at the top of the page; bring it into view
      if (error) window.scrollTo({ top: 0, behavior: 'smooth' })
    })
    return () => controller.abort()
  }, [key])

  const handleSubmit = (values) => {
    scrollAfterSubmit.current = true
    setSubmitted((current) => ({ ...values, attempt: (current?.attempt ?? 0) + 1 }))
  }

  const retry = () => {
    if (yearStatus === 'error') retryYears()
    if (submitted) setSubmitted((current) => ({ ...current, attempt: current.attempt + 1 }))
  }

  const { result, error, fieldErrors } = response
  // A failed calculation, or a backend that didn't answer the years request on page load
  const pageError = (!loading && error) || (yearStatus === 'error' ? yearError : null)

  let content
  if (loading && !result) {
    content = <Loader label="Calculating your benchmark" detail="Comparing your plant with every peer in your industry" />
  } else if (result && !(error && !loading)) {
    content = (
      <div className="calc__result-wrap">
        {loading && (
          <div className="refresh-overlay">
            <Loader inline label={year && result.input.year !== year ? `Updating for ${year}` : 'Recalculating'} />
          </div>
        )}
        <div className={loading ? 'is-refreshing' : undefined} aria-live="polite" aria-busy={loading}>
          <ResultPanel result={result} />
        </div>
      </div>
    )
  } else {
    content = (
      <div className="calc__empty">
        <h2>Your results will appear here</h2>
        <ul>
          <li>Your TRIR, with the range it could reasonably fall in</li>
          <li>Your exact percentile among peer plants</li>
          <li>Where you land on your industry's distribution</li>
          <li>How many cases a typical plant with your hours would have</li>
        </ul>
      </div>
    )
  }

  return (
    <>
      {pageError && <PageAlert error={pageError} onRetry={retry} />}
      <PageHeader
        title="Benchmark your plant"
        lead={`Four numbers from your ${year ?? ''} OSHA Form 300A. We calculate your total recordable incident rate (TRIR) and place it among every comparable plant in your industry.`}
      />
      <div className="container calc">
        <aside className="calc__form">
          <BenchmarkForm onSubmit={handleSubmit} loading={loading} serverErrors={fieldErrors} />
        </aside>
        <div className="calc__results" ref={resultsRef}>
          {content}
        </div>
      </div>
    </>
  )
}
