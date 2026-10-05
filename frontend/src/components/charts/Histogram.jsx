import { formatInt, formatRate } from '../../lib/format.js'
import { useElementWidth, useTooltip } from '../../lib/hooks.js'
import DataTable from './DataTable.jsx'
import Tooltip from './Tooltip.jsx'

const HEIGHT = 280
const MARGIN = { top: 48, right: 12, bottom: 40, left: 48 }

function niceStep(max, targetTicks = 4) {
  const raw = max / targetTicks
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)
  return step
}

function binLabel(bin) {
  if (bin.end == null) return `${formatRate(bin.start)} or more`
  return `${formatRate(bin.start)} to ${formatRate(bin.end - 0.01)}`
}

// Rounded 4px top corners, square at the baseline
function columnPath(x, y, w, h) {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

/**
 * Distribution of TRIR across the peer group. Every bin is muted except the one the user's
 * plant falls in; a labeled line marks the user's exact TRIR and another the peer median.
 */
export default function Histogram({ histogram, userTrir, median }) {
  const [sizeRef, width] = useElementWidth()
  const { containerRef, tip, show, hide } = useTooltip()
  const { bins, bin_width: binWidth } = histogram
  const n = bins.length
  const innerW = Math.max(width - MARGIN.left - MARGIN.right, 0)
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom
  const slot = innerW / n
  const maxCount = Math.max(...bins.map((b) => b.count), 1)
  const step = niceStep(maxCount)
  const yMax = Math.ceil(maxCount / step) * step
  const y = (count) => MARGIN.top + innerH - (count / yMax) * innerH
  const yTicks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step)

  const lastStart = bins[n - 1].start
  const binIndex = (value) => Math.min(Math.floor(value / binWidth), n - 1)
  const x = (value) =>
    value >= lastStart ? MARGIN.left + (n - 1) * slot + slot / 2 : MARGIN.left + (value / binWidth) * slot
  const userBin = binIndex(userTrir)

  // Label every k-th bin edge so tick labels stay at least ~44px apart
  const every = Math.max(1, Math.ceil(44 / Math.max(slot, 1)))
  const xTicks = bins.map((bin, i) => ({ i, bin })).filter(({ i }) => i % every === 0)

  // Each label sits on the side facing away from the other line, so neither line crosses it
  const userX = x(userTrir)
  const medianX = x(median)
  const LABEL_WIDTH = 130
  const side = (px, otherX) => {
    const preferred = px >= otherX ? 'start' : 'end'
    if (preferred === 'start' && px + LABEL_WIDTH > MARGIN.left + innerW) return 'end'
    if (preferred === 'end' && px - LABEL_WIDTH < 0) return 'start'
    return preferred
  }

  // A line starts at its own label's row, so the top-row label is never crossed. When there's
  // no room to face away (narrow screens), the label the other line would cut goes on top.
  const crosses = (px, otherX) => {
    const anchor = side(px, otherX)
    return anchor === 'start' ? otherX > px && otherX < px + LABEL_WIDTH : otherX < px && otherX > px - LABEL_WIDTH
  }
  const medianOnTop = crosses(medianX, userX) && !crosses(userX, medianX)
  const userRow = medianOnTop ? 1 : 0
  const medianRow = medianOnTop ? 0 : 1

  const marker = (value, row, text, className, otherX) => {
    const px = x(value)
    const anchor = side(px, otherX)
    const textX = anchor === 'end' ? px - 6 : px + 6
    const labelY = row === 0 ? 16 : 34
    return (
      <g className={className}>
        <line x1={px} x2={px} y1={labelY - 12} y2={MARGIN.top + innerH} />
        <text x={textX} y={labelY} textAnchor={anchor}>
          {text}
        </text>
      </g>
    )
  }

  return (
    <figure className="viz">
      <div className="histogram" ref={containerRef}>
        <div ref={sizeRef}>
          {width > 0 && (
            <svg
              width={width}
              height={HEIGHT}
              role="img"
              aria-label={`Histogram of TRIR across ${formatInt(bins.reduce((s, b) => s + b.count, 0))} peer plants. Your TRIR is ${formatRate(userTrir)}; the median is ${formatRate(median)}.`}
            >
              {yTicks.map((tick) => (
                <g key={tick} className="histogram__grid">
                  <line x1={MARGIN.left} x2={MARGIN.left + innerW} y1={y(tick)} y2={y(tick)} />
                  <text x={MARGIN.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
                    {formatInt(tick)}
                  </text>
                </g>
              ))}

              {bins.map((bin, i) => {
                const h = MARGIN.top + innerH - y(bin.count)
                const bx = MARGIN.left + i * slot + 1
                const bw = Math.max(slot - 2, 1)
                const content = {
                  value: `${formatInt(bin.count)} plants`,
                  label: `TRIR ${binLabel(bin)}`,
                  detail: i === userBin ? 'Your plant is in this range' : undefined,
                }
                return (
                  <g key={bin.start}>
                    {bin.count > 0 && (
                      <path className={i === userBin ? 'histogram__bar is-user' : 'histogram__bar'} d={columnPath(bx, y(bin.count), bw, h)} />
                    )}
                    <rect
                      className="histogram__hit"
                      x={MARGIN.left + i * slot}
                      y={MARGIN.top}
                      width={slot}
                      height={innerH}
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

              <line className="histogram__baseline" x1={MARGIN.left} x2={MARGIN.left + innerW} y1={MARGIN.top + innerH} y2={MARGIN.top + innerH} />
              {xTicks.map(({ i, bin }) => (
                <text key={bin.start} className="histogram__tick" x={MARGIN.left + i * slot} y={HEIGHT - MARGIN.bottom + 18} textAnchor="middle">
                  {bin.end == null ? `${bin.start}+` : bin.start}
                </text>
              ))}
              <text className="histogram__axis-label" x={MARGIN.left + innerW} y={HEIGHT - 4} textAnchor="end">
                TRIR (cases per 100 full-time workers)
              </text>
              <text className="histogram__axis-label" x={4} y={MARGIN.top - 14}>
                Plants
              </text>

              {marker(median, medianRow, `Peer median ${formatRate(median)}`, 'histogram__median', userX)}
              {marker(userTrir, userRow, `Your plant ${formatRate(userTrir)}`, 'histogram__user', medianX)}
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
