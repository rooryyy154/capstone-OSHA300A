import { formatInt, formatRate } from '../../lib/format.js'
import { useElementWidth, useTooltip } from '../../lib/hooks.js'
import { HISTOGRAM_MARGIN as MARGIN, binLabel, columnPath, histogramLayout } from '../../lib/histogramLayout.js'
import DataTable from './DataTable.jsx'
import Tooltip from './Tooltip.jsx'

const HEIGHT = 280

/**
 * Distribution of TRIR across the peer group. Every bin is muted except the one the user's
 * plant falls in; a labeled line marks the user's exact TRIR and another the peer median.
 * The geometry lives in lib/histogramLayout.js, shared with the PDF report.
 */
export default function Histogram({ histogram, userTrir, median }) {
  const [sizeRef, width] = useElementWidth()
  const { containerRef, tip, show, hide } = useTooltip()
  const { bins } = histogram
  const layout = width > 0 ? histogramLayout({ histogram, userTrir, median, width, height: HEIGHT }) : null

  const marker = (m, text, className) => (
    <g className={className}>
      <line x1={m.x} x2={m.x} y1={m.lineTop} y2={layout.baselineY} />
      <text x={m.textX} y={m.labelY} textAnchor={m.anchor}>
        {text}
      </text>
    </g>
  )

  return (
    <figure className="viz">
      <div className="histogram" ref={containerRef}>
        <div ref={sizeRef}>
          {layout && (
            <svg
              width={width}
              height={HEIGHT}
              role="img"
              aria-label={`Histogram of TRIR across ${formatInt(bins.reduce((s, b) => s + b.count, 0))} peer plants. Your TRIR is ${formatRate(userTrir)}; the median is ${formatRate(median)}.`}
            >
              {layout.yTicks.map(({ tick, y }) => (
                <g key={tick} className="histogram__grid">
                  <line x1={MARGIN.left} x2={MARGIN.left + layout.innerW} y1={y} y2={y} />
                  <text x={MARGIN.left - 8} y={y} dy="0.32em" textAnchor="end">
                    {formatInt(tick)}
                  </text>
                </g>
              ))}

              {layout.bars.map((bar) => {
                const content = {
                  value: `${formatInt(bar.bin.count)} plants`,
                  label: `TRIR ${binLabel(bar.bin)}`,
                  detail: bar.isUser ? 'Your plant is in this range' : undefined,
                }
                return (
                  <g key={bar.bin.start}>
                    {bar.bin.count > 0 && (
                      <path className={bar.isUser ? 'histogram__bar is-user' : 'histogram__bar'} d={columnPath(bar.x, bar.y, bar.w, bar.h)} />
                    )}
                    <rect
                      className="histogram__hit"
                      x={bar.slotX}
                      y={MARGIN.top}
                      width={bar.w + 2}
                      height={layout.innerH}
                      tabIndex={0}
                      aria-label={`${content.label}: ${content.value}`}
                      onPointerMove={(event) => show(event, content)}
                      onPointerLeave={hide}
                      onFocus={(event) => show(event, content)}
                      onBlur={hide}
                    />
                  </g>
                )
              })}

              <line className="histogram__baseline" x1={MARGIN.left} x2={MARGIN.left + layout.innerW} y1={layout.baselineY} y2={layout.baselineY} />
              {layout.xTicks.map((t) => (
                <text key={t.bin.start} className="histogram__tick" x={t.x} y={HEIGHT - MARGIN.bottom + 18} textAnchor="middle">
                  {t.label}
                </text>
              ))}
              <text className="histogram__axis-label" x={MARGIN.left + layout.innerW} y={HEIGHT - 4} textAnchor="end">
                TRIR (cases per 100 full-time workers)
              </text>
              <text className="histogram__axis-label" x={4} y={MARGIN.top - 14}>
                Plants
              </text>

              {marker(layout.markers.median, `Peer median ${formatRate(median)}`, 'histogram__median')}
              {marker(layout.markers.user, `Your plant ${formatRate(userTrir)}`, 'histogram__user')}
            </svg>
          )}
        </div>
        <Tooltip tip={tip} />
      </div>
      <figcaption className="viz__caption">
        Each bar counts peer plants in a TRIR range. The dark bar is the range your plant falls in.
      </figcaption>
      <DataTable
        columns={[
          { key: 'range', heading: 'TRIR range' },
          { key: 'count', heading: 'Plants', numeric: true, format: formatInt },
        ]}
        rows={bins.map((bin) => ({ key: bin.start, range: binLabel(bin), count: bin.count }))}
      />
    </figure>
  )
}
