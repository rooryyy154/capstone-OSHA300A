import { formatInt, formatRate } from '../../lib/format.js'
import { useTooltip } from '../../lib/hooks.js'
import DataTable from './DataTable.jsx'
import Tooltip from './Tooltip.jsx'

function axisStep(value) {
  return value > 20 ? 10 : 5
}

/**
 * The spread inside each industry: a hairline from the 10th to the 90th percentile, a band
 * for the middle half (25th-75th), and a dot at the median.
 */
export default function RangeStrip({ items, caption }) {
  const { containerRef, tip, show, hide } = useTooltip()
  const highest = Math.max(...items.map((item) => item.p90))
  const step = axisStep(highest)
  const max = Math.ceil(highest / step) * step
  const pct = (value) => `${(value / max) * 100}%`
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step)

  return (
    <figure className="viz">
      <ul className="range-legend" aria-hidden="true">
        <li>
          <span className="range-legend__whisker" />
          10th–90th percentile
        </li>
        <li>
          <span className="range-legend__box" />
          Middle half of plants
        </li>
        <li>
          <span className="range-legend__dot" />
          Median
        </li>
      </ul>
      <div className="range" ref={containerRef}>
        <ul className="range__list">
          {items.map((item) => {
            const content = {
              value: `Median ${formatRate(item.median)}`,
              label: item.label,
              detail: `10th ${formatRate(item.p10)} · 25th ${formatRate(item.p25)} · 75th ${formatRate(item.p75)} · 90th ${formatRate(item.p90)}`,
            }
            return (
              <li
                key={item.code}
                className="range__row"
                tabIndex={0}
                aria-label={`${item.label}: median ${formatRate(item.median)}, 90th percentile ${formatRate(item.p90)}`}
                onPointerMove={(event) => show(event, content)}
                onPointerLeave={hide}
                onFocus={(event) => show(event, content)}
                onBlur={hide}
              >
                <span className="range__label">
                  {item.label}
                  <span className="range__sublabel">{formatInt(item.establishments)} plants</span>
                </span>
                <div className="range__track">
                  <span className="range__whisker" style={{ left: pct(item.p10), width: pct(item.p90 - item.p10) }} />
                  <span className="range__box" style={{ left: pct(item.p25), width: pct(item.p75 - item.p25) }} />
                  <span className="range__dot" style={{ left: pct(item.median) }} />
                  <span className="range__end" style={{ left: pct(item.p90) }}>
                    {formatRate(item.p90)}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
        <div className="range__axis" aria-hidden="true">
          <span />
          <div className="range__ticks">
            {ticks.map((tick) => (
              <span key={tick} style={{ left: pct(tick) }}>
                {tick}
              </span>
            ))}
          </div>
        </div>
        <Tooltip tip={tip} />
      </div>
      {caption && <figcaption className="viz__caption">{caption}</figcaption>}
      <DataTable
        columns={[
          { key: 'label', heading: 'Industry' },
          { key: 'p10', heading: '10th', numeric: true, format: formatRate },
          { key: 'p25', heading: '25th', numeric: true, format: formatRate },
          { key: 'median', heading: 'Median', numeric: true, format: formatRate },
          { key: 'p75', heading: '75th', numeric: true, format: formatRate },
          { key: 'p90', heading: '90th', numeric: true, format: formatRate },
        ]}
        rows={items.map((item) => ({ ...item, key: item.code }))}
      />
    </figure>
  )
}
