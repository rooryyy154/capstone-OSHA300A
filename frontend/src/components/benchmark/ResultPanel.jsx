import { formatInt, formatRate } from '../../lib/format.js'
import { VERDICT_LABELS, differenceText, footnoteText, headlineText, significanceText } from '../../lib/resultText.js'
import Histogram from '../charts/Histogram.jsx'
import PercentileMeter from './PercentileMeter.jsx'

const VERDICT_STYLES = {
  low: { className: 'is-low', icon: 'M5 8l5 5 5-5' },
  typical: { className: 'is-typical', icon: 'M4 10h12' },
  high: { className: 'is-high', icon: 'M5 12l5-5 5 5' },
  very_high: { className: 'is-very-high', icon: 'M5 12l5-5 5 5M5 17l5-5 5 5' },
}

function VerdictBadge({ verdict }) {
  const { className, icon } = VERDICT_STYLES[verdict]
  return (
    <span className={`verdict ${className}`}>
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path d={icon} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {VERDICT_LABELS[verdict]}
    </span>
  )
}

// The sentences live in lib/resultText.js, shared with the PDF report
export default function ResultPanel({ result }) {
  const { plant, cohort, rank, comparison, histogram, warnings, input } = result
  const difference = comparison && differenceText(comparison)

  return (
    <section className="result" aria-labelledby="result-title">
      <header className="result__header">
        <div>
          <h2 id="result-title" className="visually-hidden">
            Your {input.year} result
          </h2>
          <div className="result__trir">
            <span className="result__trir-value">{formatRate(plant.trir)}</span>
            <span className="result__trir-unit">TRIR</span>
          </div>
          <p className="result__range">
            95% range {formatRate(plant.trir_interval.low)} to {formatRate(plant.trir_interval.high)} · one more case adds{' '}
            {formatRate(plant.one_case_adds)}
          </p>
        </div>
        {comparison && <VerdictBadge verdict={comparison.verdict} />}
      </header>

      {warnings.length > 0 && (
        <div className="result__warnings">
          {warnings.map((warning) => (
            <p key={warning.code}>{warning.message}</p>
          ))}
        </div>
      )}

      {cohort && (
        <>
          <p className="result__sentence">{headlineText(result)}</p>
          <PercentileMeter percentile={rank.percentile} />

          <dl className="result__stats">
            <div>
              <dt>Peer median</dt>
              <dd>{formatRate(cohort.median)}</dd>
            </div>
            <div>
              <dt>Your difference</dt>
              <dd>
                {difference.value}
                {difference.note && <span className="result__stat-note">{difference.note}</span>}
              </dd>
            </div>
            <div>
              <dt>Expected cases</dt>
              <dd>
                {comparison.expected_cases_at_median.toFixed(1)}
                <span className="result__stat-note">
                  at the median rate · you had {formatInt(input.total_recordable_cases)}
                </span>
              </dd>
            </div>
            <div>
              <dt>Industry-wide rate</dt>
              <dd>
                {formatRate(cohort.pooled_trir)}
                <span className="result__stat-note">all peer cases ÷ all peer hours</span>
              </dd>
            </div>
          </dl>

          <div className="result__chart">
            <h3>How {formatInt(cohort.establishment_count)} peers are distributed</h3>
            <Histogram histogram={histogram} userTrir={plant.trir} median={cohort.median} />
          </div>

          <div className="result__note">
            <h3>Is the difference real?</h3>
            <p>{significanceText(result)}</p>
          </div>

          <p className="result__footer">{footnoteText(result)}</p>
        </>
      )}
    </section>
  )
}
