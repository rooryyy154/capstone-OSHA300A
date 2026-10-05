import { formatInt, formatPercent, formatRate } from '../../lib/format.js'
import Histogram from '../charts/Histogram.jsx'
import PercentileMeter from './PercentileMeter.jsx'

const VERDICTS = {
  low: { label: 'Lower than most peers', className: 'is-low', icon: 'M5 8l5 5 5-5' },
  typical: { label: 'Typical for your industry', className: 'is-typical', icon: 'M4 10h12' },
  high: { label: 'Higher than most peers', className: 'is-high', icon: 'M5 12l5-5 5 5' },
  very_high: { label: 'Among the highest', className: 'is-very-high', icon: 'M5 12l5-5 5 5M5 17l5-5 5 5' },
}

const OWNER_WORDS = { private: 'private', government: 'government', all: '' }

function VerdictBadge({ verdict }) {
  const { label, className, icon } = VERDICTS[verdict]
  return (
    <span className={`verdict ${className}`}>
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path d={icon} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </span>
  )
}

function peerDescription(result) {
  const { cohort, industry } = result
  const owner = OWNER_WORDS[cohort.ownership]
  const establishments = `${owner ? `${owner} ` : ''}establishments`
  if (cohort.level === 6 && industry.label) return `${establishments} in ${industry.label} (NAICS ${cohort.naics_prefix})`
  return `${establishments} in NAICS ${cohort.naics_prefix}`
}

function Headline({ result }) {
  const { plant, rank, cohort } = result
  const peers = peerDescription(result)
  const tiedShare = rank.tied / cohort.establishment_count
  if (plant.trir === 0 && tiedShare >= 0.1) {
    return (
      <p className="result__sentence">
        You're tied with {formatPercent(tiedShare)} of {peers} at zero recordable cases.
      </p>
    )
  }
  const belowShare = rank.below / cohort.establishment_count
  return (
    <p className="result__sentence">
      Your TRIR is higher than {formatPercent(belowShare)} of {peers}
      {tiedShare >= 0.01 ? `, and tied with ${formatPercent(tiedShare)}` : ''}.
    </p>
  )
}

function Significance({ result }) {
  const { plant, comparison, cohort, input } = result
  const { low, high } = plant.trir_interval
  const cases = input.total_recordable_cases
  if (comparison.differs_from_median === 'above') {
    return (
      <p>
        Even at the low end of its 95% range ({formatRate(low)}), your TRIR is above the peer median of{' '}
        {formatRate(cohort.median)}. A gap this size is unlikely to be chance.
      </p>
    )
  }
  if (comparison.differs_from_median === 'below') {
    return (
      <p>
        Even at the high end of its 95% range ({formatRate(high)}), your TRIR is below the peer median of{' '}
        {formatRate(cohort.median)}. That's unlikely to be luck alone.
      </p>
    )
  }
  if (cases === 0) {
    return (
      <p>
        With no recordable cases this year, your true rate could still reasonably be as high as {formatRate(high)}. A zero is
        good news, but one year of it doesn't prove your plant is safer than its peers. Several years of data would tell you
        more.
      </p>
    )
  }
  if (plant.trir === cohort.median) {
    return <p>Your TRIR matches the peer median exactly.</p>
  }
  return (
    <p>
      With {formatInt(cases)} recordable {cases === 1 ? 'case' : 'cases'}, your true rate could reasonably be anywhere from{' '}
      {formatRate(low)} to {formatRate(high)}. That range includes the peer median ({formatRate(cohort.median)}), so this
      year's difference could be chance. Several years of data would tell you more.
    </p>
  )
}

export default function ResultPanel({ result }) {
  const { plant, cohort, rank, comparison, histogram, warnings, input } = result
  const difference = comparison?.difference_from_median

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
          <Headline result={result} />
          <PercentileMeter percentile={rank.percentile} />

          <dl className="result__stats">
            <div>
              <dt>Peer median</dt>
              <dd>{formatRate(cohort.median)}</dd>
            </div>
            <div>
              <dt>Your difference</dt>
              <dd>
                {difference > 0 ? '+' : ''}
                {formatRate(difference)}
                {comparison.percent_from_median != null && (
                  <span className="result__stat-note">
                    {Math.abs(comparison.percent_from_median).toFixed(0)}% {difference >= 0 ? 'above' : 'below'}
                  </span>
                )}
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
            <Significance result={result} />
          </div>

          <p className="result__footer">
            Compared with {formatInt(cohort.establishment_count)} {peerDescription(result)}, {cohort.year} data.{' '}
            {formatPercent(cohort.share_zero)} of them recorded zero cases. Your percentile counts half of the plants tied with
            you ({formatInt(rank.tied)}).
          </p>
        </>
      )}
    </section>
  )
}
