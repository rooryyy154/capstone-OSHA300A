import { formatRate } from './format.js'

// Geometry of the TRIR histogram, shared by the on-screen chart (SVG) and the PDF report, so
// both draw exactly the same bars, ticks and markers.

export const HISTOGRAM_MARGIN = { top: 48, right: 12, bottom: 40, left: 48 }

function niceStep(max, targetTicks = 4) {
  const raw = max / targetTicks
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)
}

export function binLabel(bin) {
  if (bin.end == null) return `${formatRate(bin.start)} or more`
  return `${formatRate(bin.start)} to ${formatRate(bin.end - 0.01)}`
}

// Rounded top corners, square at the baseline
export function columnPath(x, y, w, h, radius = 4) {
  const r = Math.min(radius, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

/**
 * Everything needed to draw the histogram at a given size.
 * `labelWidth` is the room a marker label needs; `minTickGap` the space between x tick labels.
 */
export function histogramLayout({ histogram, userTrir, median, width, height, margin = HISTOGRAM_MARGIN, labelWidth = 130, minTickGap = 44 }) {
  const { bins, bin_width: binWidth } = histogram
  const n = bins.length
  const innerW = Math.max(width - margin.left - margin.right, 0)
  const innerH = height - margin.top - margin.bottom
  const slot = innerW / n
  const maxCount = Math.max(...bins.map((b) => b.count), 1)
  const step = niceStep(maxCount)
  const yMax = Math.ceil(maxCount / step) * step
  const y = (count) => margin.top + innerH - (count / yMax) * innerH
  const yTicks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step)

  const lastStart = bins[n - 1].start
  const x = (value) =>
    value >= lastStart ? margin.left + (n - 1) * slot + slot / 2 : margin.left + (value / binWidth) * slot
  const userBin = Math.min(Math.floor(userTrir / binWidth), n - 1)

  const bars = bins.map((bin, i) => {
    const top = y(bin.count)
    return {
      i,
      bin,
      slotX: margin.left + i * slot,
      x: margin.left + i * slot + 1,
      y: top,
      w: Math.max(slot - 2, 1),
      h: margin.top + innerH - top,
      isUser: i === userBin,
    }
  })

  // Label every k-th bin edge so tick labels stay apart
  const every = Math.max(1, Math.ceil(minTickGap / Math.max(slot, 1)))
  const xTicks = bins
    .map((bin, i) => ({ i, bin, x: margin.left + i * slot, label: bin.end == null ? `${bin.start}+` : String(bin.start) }))
    .filter(({ i }) => i % every === 0)

  // Each label sits on the side facing away from the other line, so neither line crosses it
  const userX = x(userTrir)
  const medianX = x(median)
  const side = (px, otherX) => {
    const preferred = px >= otherX ? 'start' : 'end'
    if (preferred === 'start' && px + labelWidth > margin.left + innerW) return 'end'
    if (preferred === 'end' && px - labelWidth < 0) return 'start'
    return preferred
  }
  // A line starts at its own label's row, so the top-row label is never crossed. When there's
  // no room to face away (narrow screens), the label the other line would cut goes on top.
  const crosses = (px, otherX) => {
    const anchor = side(px, otherX)
    return anchor === 'start' ? otherX > px && otherX < px + labelWidth : otherX < px && otherX > px - labelWidth
  }
  const medianOnTop = crosses(medianX, userX) && !crosses(userX, medianX)
  const marker = (px, otherX, row) => {
    const anchor = side(px, otherX)
    const labelY = row === 0 ? 16 : 34
    return { x: px, anchor, textX: anchor === 'end' ? px - 6 : px + 6, labelY, lineTop: labelY - 12 }
  }

  return {
    bins,
    innerW,
    innerH,
    baselineY: margin.top + innerH,
    yTicks: yTicks.map((tick) => ({ tick, y: y(tick) })),
    bars,
    xTicks,
    userBin,
    markers: {
      user: marker(userX, medianX, medianOnTop ? 1 : 0),
      median: marker(medianX, userX, medianOnTop ? 0 : 1),
    },
  }
}
