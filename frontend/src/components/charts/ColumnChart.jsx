import { useTooltip } from '../../lib/hooks.js'
import DataTable from './DataTable.jsx'
import Tooltip from './Tooltip.jsx'

/** Columns for ordered categories (e.g. plant size bands), one series, value on each cap. */
export default function ColumnChart({ items, format, caption, categoryHeading, valueHeading, tooltipDetail, axisLabel }) {
  const { containerRef, tip, show, hide } = useTooltip()
  const max = Math.max(...items.map((item) => item.value)) || 1

  return (
    <figure className="viz">
      <div className="columns" ref={containerRef}>
        <ul className="columns__plot">
          {items.map((item) => {
            const content = { value: format(item.value), label: item.label, detail: tooltipDetail?.(item) }
            return (
              <li
                key={item.key}
                className="columns__slot"
                tabIndex={0}
                aria-label={`${item.label}: ${format(item.value)}`}
                onPointerMove={(event) => show(event, content)}
                onPointerLeave={hide}
                onFocus={(event) => show(event, content)}
                onBlur={hide}
              >
                <span className="columns__value">{format(item.value)}</span>
                <span className="columns__bar" style={{ height: `${(item.value / max) * 100}%` }} />
              </li>
            )
          })}
        </ul>
        <ul className="columns__labels" aria-hidden="true">
          {items.map((item) => (
            <li key={item.key}>{item.label}</li>
          ))}
        </ul>
        {axisLabel && <div className="columns__axis-label">{axisLabel}</div>}
        <Tooltip tip={tip} />
      </div>
      {caption && <figcaption className="viz__caption">{caption}</figcaption>}
      <DataTable
        columns={[
          { key: 'label', heading: categoryHeading },
          { key: 'value', heading: valueHeading, numeric: true, format },
        ]}
        rows={items}
      />
    </figure>
  )
}
