import { useTooltip } from '../../lib/hooks.js'
import DataTable from './DataTable.jsx'
import Tooltip from './Tooltip.jsx'

/**
 * Ranked horizontal bars, one series. `highlight` marks the item the story is about;
 * everything else stays muted. An optional reference line (e.g. the national rate) runs
 * across all rows. Values sit at the bar tips; the table view repeats every number.
 */
export default function HBarChart({ items, format, reference, caption, valueHeading, tooltipDetail }) {
  const { containerRef, tip, show, hide } = useTooltip()
  const max = Math.max(...items.map((item) => item.value), reference?.value ?? 0) || 1
  const pct = (value) => `${(value / max) * 100}%`

  return (
    <figure className="viz">
      <div className="hbar" ref={containerRef}>
        {reference && (
          <div className="hbar__row hbar__overlay" aria-hidden="true">
            <span />
            <div className="hbar__track">
              <div className="hbar__reference" style={{ left: pct(reference.value) }}>
                <span>{reference.label}</span>
              </div>
            </div>
          </div>
        )}
        <ul className="hbar__list">
          {items.map((item) => {
            const content = { value: format(item.value), label: item.label, detail: tooltipDetail?.(item) }
            return (
              <li
                key={item.key}
                className={`hbar__row ${item.highlight ? 'is-highlight' : ''}`}
                tabIndex={0}
                aria-label={`${item.label}: ${format(item.value)}`}
                onPointerMove={(event) => show(event, content)}
                onPointerLeave={hide}
                onFocus={(event) => show(event, content)}
                onBlur={hide}
              >
                <span className="hbar__label">
                  {item.label}
                  {item.sublabel && <span className="hbar__sublabel">{item.sublabel}</span>}
                </span>
                <div className="hbar__track">
                  <div className="hbar__fill">
                    <span className="hbar__bar" style={{ width: pct(item.value) }} />
                    <span className="hbar__value">{format(item.value)}</span>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
        <Tooltip tip={tip} />
      </div>
      {caption && <figcaption className="viz__caption">{caption}</figcaption>}
      <DataTable
        columns={[{ key: 'label', heading: 'Name' }, { key: 'value', heading: valueHeading, numeric: true, format }]}
        rows={items}
      />
    </figure>
  )
}
