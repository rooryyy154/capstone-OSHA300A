import { ordinal } from '../../lib/format.js'

// Verdict bands from docs/decisions.md (D-005): <25 low, 25-75 typical, 75-90 high, 90+ very high
const BANDS = [
  { from: 0, to: 25, className: 'is-low' },
  { from: 25, to: 75, className: 'is-typical' },
  { from: 75, to: 90, className: 'is-high' },
  { from: 90, to: 100, className: 'is-very-high' },
]
const TICKS = [0, 25, 50, 75, 90, 100]

export default function PercentileMeter({ percentile }) {
  const clamped = Math.min(Math.max(percentile, 0), 100)
  return (
    <div className="meter">
      <div className="meter__head">
        <span className="meter__title">Percentile among peers</span>
        <span className="meter__value">{ordinal(percentile)}</span>
      </div>
      <div
        className="meter__track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percentile)}
        aria-label={`${ordinal(percentile)} percentile. Higher means a higher injury rate than more of your peers.`}
      >
        {BANDS.map((band) => (
          <span key={band.from} className={`meter__band ${band.className}`} style={{ left: `${band.from}%`, width: `${band.to - band.from}%` }} />
        ))}
        <span className="meter__marker" style={{ left: `${clamped}%` }} />
      </div>
      <div className="meter__ticks" aria-hidden="true">
        {TICKS.map((tick) => (
          <span key={tick} style={{ left: `${tick}%` }}>
            {tick}
          </span>
        ))}
      </div>
      <div className="meter__legend" aria-hidden="true">
        <span>Lower rate than peers</span>
        <span>Higher rate than peers</span>
      </div>
    </div>
  )
}
