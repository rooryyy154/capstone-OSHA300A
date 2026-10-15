import { Document, Line, Page, Path, Rect, StyleSheet, Svg, Text, View } from '@react-pdf/renderer'
import { formatInt, formatRate, ordinal } from '../../lib/format.js'
import { columnPath, histogramLayout } from '../../lib/histogramLayout.js'
import {
  OWNERSHIP_LABELS,
  VERDICT_LABELS,
  differenceText,
  footnoteText,
  headlineText,
  significanceText,
} from '../../lib/resultText.js'

// Same palette as index.css. The PDF uses the standard Helvetica and Times faces, which every
// PDF reader has, so no font files are bundled.
const C = {
  green900: '#103a28',
  green800: '#155236',
  green700: '#12784a',
  green500: '#5cb585',
  green200: '#b9dcc7',
  green100: '#e4f2ea',
  gray900: '#1b1b1b',
  gray700: '#454745',
  gray600: '#5d5f5d',
  gray300: '#c9ccc9',
  gray200: '#dcdfdc',
  gray100: '#eceeec',
  grid: '#e3e5e3',
  amber700: '#8a4b00',
  amber100: '#fcefd9',
  red700: '#a1261c',
  red100: '#fbe7e5',
}

const VERDICT_COLORS = {
  low: { color: C.green900, backgroundColor: C.green100 },
  typical: { color: C.gray700, backgroundColor: C.gray100 },
  high: { color: C.amber700, backgroundColor: C.amber100 },
  very_high: { color: C.red700, backgroundColor: C.red100 },
}

const PAGE_WIDTH = 612 // US Letter, points
const PAGE_MARGIN = 40
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 60, paddingHorizontal: PAGE_MARGIN, fontFamily: 'Helvetica', fontSize: 9.5, color: C.gray900, lineHeight: 1.4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  brand: { fontFamily: 'Times-Bold', fontSize: 17, color: C.green800 },
  headerMeta: { fontSize: 8, color: C.gray600, textAlign: 'right' },
  title: { fontFamily: 'Times-Bold', fontSize: 21, marginTop: 12, lineHeight: 1.2 },
  subtitle: { fontSize: 9.5, color: C.gray700, marginTop: 3 },
  inputs: { flexDirection: 'row', marginTop: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.gray200 },
  cell: { flex: 1, paddingVertical: 6, paddingRight: 8 },
  cellDivider: { borderLeftWidth: 1, borderLeftColor: C.gray200, paddingLeft: 8 },
  cellLabel: { fontSize: 7.5, color: C.gray600, textTransform: 'uppercase', letterSpacing: 0.4 },
  cellValue: { fontFamily: 'Helvetica-Bold', fontSize: 11, marginTop: 2 },
  cellNote: { fontSize: 7.5, color: C.gray600, marginTop: 1 },
  trirRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 12 },
  trirValue: { fontFamily: 'Helvetica-Bold', fontSize: 40, color: C.green900, lineHeight: 1 },
  trirUnit: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: C.gray600, marginLeft: 6, marginBottom: 5 },
  trirRange: { fontSize: 8.5, color: C.gray700, marginTop: 4 },
  verdict: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10 },
  warning: { fontSize: 8.5, color: C.gray700, marginTop: 6 },
  headline: { fontFamily: 'Times-Bold', fontSize: 12.5, marginTop: 10, lineHeight: 1.35 },
  sectionLabel: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: C.gray700, textTransform: 'uppercase', letterSpacing: 0.5 },
  h3: { fontFamily: 'Times-Bold', fontSize: 11.5, marginTop: 11, marginBottom: 2 },
  caption: { fontSize: 7.5, color: C.gray600, marginTop: 2 },
  note: { fontSize: 9.5, color: C.gray900 },
  footnote: { fontSize: 7.5, color: C.gray600, marginTop: 8 },
  footer: { position: 'absolute', bottom: 24, left: PAGE_MARGIN, right: PAGE_MARGIN, fontSize: 7, color: C.gray600, borderTopWidth: 1, borderTopColor: C.gray200, paddingTop: 6 },
})

const svgText = (size, color = C.gray600, family = 'Helvetica') => ({ fontSize: size, fontFamily: family, fill: color })

function Cell({ label, value, note, first }) {
  return (
    <View style={first ? s.cell : [s.cell, s.cellDivider]}>
      <Text style={s.cellLabel}>{label}</Text>
      <Text style={s.cellValue}>{value}</Text>
      {note ? <Text style={s.cellNote}>{note}</Text> : null}
    </View>
  )
}

const BANDS = [
  { from: 0, to: 25, fill: C.green200 },
  { from: 25, to: 75, fill: C.gray200 },
  { from: 75, to: 90, fill: '#f3d3a4' },
  { from: 90, to: 100, fill: '#efb3ad' },
]

function PercentileBar({ percentile }) {
  const width = CONTENT_WIDTH
  const x = (p) => (Math.min(Math.max(p, 0), 100) / 100) * width
  return (
    <Svg width={width} height={34} viewBox={`0 0 ${width} 34`}>
      {BANDS.map((band) => (
        <Rect key={band.from} x={x(band.from)} y={8} width={x(band.to) - x(band.from) - 1.5} height={8} fill={band.fill} />
      ))}
      <Rect x={x(percentile) - 1.5} y={3} width={3} height={18} fill={C.gray900} />
      {[0, 25, 50, 75, 90, 100].map((tick) => (
        <Text key={tick} x={x(tick)} y={31} textAnchor={tick === 0 ? 'start' : tick === 100 ? 'end' : 'middle'} style={svgText(7)}>
          {String(tick)}
        </Text>
      ))}
    </Svg>
  )
}

const CHART_HEIGHT = 176
const CHART_MARGIN = { top: 46, right: 8, bottom: 30, left: 36 }

function HistogramChart({ histogram, userTrir, median }) {
  const width = CONTENT_WIDTH
  const layout = histogramLayout({
    histogram,
    userTrir,
    median,
    width,
    height: CHART_HEIGHT,
    margin: CHART_MARGIN,
    labelWidth: 84,
    minTickGap: 26,
  })
  const right = CHART_MARGIN.left + layout.innerW
  const marker = (m, label, color, strokeWidth) => (
    <>
      <Line x1={m.x} x2={m.x} y1={m.lineTop} y2={layout.baselineY} stroke={color} strokeWidth={strokeWidth} />
      <Text x={m.textX} y={m.labelY} textAnchor={m.anchor} style={svgText(8, color, 'Helvetica-Bold')}>
        {label}
      </Text>
    </>
  )

  return (
    <Svg width={width} height={CHART_HEIGHT} viewBox={`0 0 ${width} ${CHART_HEIGHT}`}>
      {layout.yTicks.map(({ tick, y }) => (
        <Line key={`g${tick}`} x1={CHART_MARGIN.left} x2={right} y1={y} y2={y} stroke={C.grid} strokeWidth={0.75} />
      ))}
      {layout.yTicks.map(({ tick, y }) => (
        <Text key={`t${tick}`} x={CHART_MARGIN.left - 5} y={y + 2.5} textAnchor="end" style={svgText(7)}>
          {formatInt(tick)}
        </Text>
      ))}
      {layout.bars
        .filter((bar) => bar.bin.count > 0)
        .map((bar) => (
          <Path key={bar.bin.start} d={columnPath(bar.x, bar.y, bar.w, bar.h, 3)} fill={bar.isUser ? C.green700 : C.green500} />
        ))}
      <Line x1={CHART_MARGIN.left} x2={right} y1={layout.baselineY} y2={layout.baselineY} stroke={C.gray300} strokeWidth={0.75} />
      {layout.xTicks.map((t) => (
        <Text key={t.bin.start} x={t.x} y={layout.baselineY + 11} textAnchor="middle" style={svgText(7)}>
          {t.label}
        </Text>
      ))}
      <Text x={right} y={CHART_HEIGHT - 3} textAnchor="end" style={svgText(7)}>
        TRIR (cases per 100 full-time workers)
      </Text>
      <Text x={2} y={CHART_MARGIN.top - 10} style={svgText(7)}>
        Plants
      </Text>
      {marker(layout.markers.median, `Peer median ${formatRate(median)}`, C.gray700, 0.75)}
      {marker(layout.markers.user, `Your plant ${formatRate(userTrir)}`, C.green900, 1.5)}
    </Svg>
  )
}

/**
 * The one-page PDF version of a benchmark result. Everything comes from the API response the
 * page already has; the plant name is typed by the user and only ever exists in this file.
 */
export default function ReportDocument({ result, plantName, generatedAt }) {
  const { input, industry, plant, cohort, rank, comparison, histogram, warnings } = result
  const industryName = industry.label ? `${industry.label} (NAICS ${industry.code})` : `NAICS ${industry.code}`
  const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(generatedAt)
  const difference = comparison && differenceText(comparison)

  return (
    <Document title={`PlantLine report${plantName ? ` · ${plantName}` : ''}`} author="PlantLine" creator="PlantLine" producer="PlantLine">
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <Text style={s.brand}>PlantLine</Text>
          <Text style={s.headerMeta}>
            Injury benchmark report{'\n'}Generated {date}
          </Text>
        </View>

        <Text style={s.title}>{plantName || 'Your plant'}</Text>
        <Text style={s.subtitle}>
          {industryName} · {input.year} OSHA Form 300A data
        </Text>

        <View style={s.inputs}>
          <Cell first label="Average employees" value={formatInt(input.annual_average_employees)} />
          <Cell label="Hours worked" value={formatInt(input.total_hours_worked)} />
          <Cell label="Recordable cases" value={formatInt(input.total_recordable_cases)} />
          <Cell label="Compared with" value={OWNERSHIP_LABELS[input.ownership]} />
        </View>

        <View style={s.trirRow}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <Text style={s.trirValue}>{formatRate(plant.trir)}</Text>
              <Text style={s.trirUnit}>TRIR</Text>
            </View>
            <Text style={s.trirRange}>
              95% range {formatRate(plant.trir_interval.low)} to {formatRate(plant.trir_interval.high)} · one more case adds{' '}
              {formatRate(plant.one_case_adds)}
            </Text>
          </View>
          {comparison ? (
            <Text style={[s.verdict, VERDICT_COLORS[comparison.verdict]]}>{VERDICT_LABELS[comparison.verdict]}</Text>
          ) : null}
        </View>

        {warnings.map((warning) => (
          <Text key={warning.code} style={s.warning}>
            {warning.message}
          </Text>
        ))}

        {cohort ? (
          <>
            <Text style={s.headline}>{headlineText(result)}</Text>

            <View style={{ marginTop: 8 }}>
              <Text style={s.sectionLabel}>Percentile among peers: {ordinal(rank.percentile)}</Text>
              <View style={{ marginTop: 4 }}>
                <PercentileBar percentile={rank.percentile} />
              </View>
            </View>

            <View style={[s.inputs, { marginTop: 8 }]}>
              <Cell first label="Peer median" value={formatRate(cohort.median)} />
              <Cell label="Your difference" value={difference.value} note={difference.note} />
              <Cell
                label="Expected cases"
                value={comparison.expected_cases_at_median.toFixed(1)}
                note={`at the median rate · you had ${formatInt(input.total_recordable_cases)}`}
              />
              <Cell label="Industry-wide rate" value={formatRate(cohort.pooled_trir)} note="all peer cases ÷ all peer hours" />
            </View>

            <Text style={s.h3}>How {formatInt(cohort.establishment_count)} peers are distributed</Text>
            <HistogramChart histogram={histogram} userTrir={plant.trir} median={cohort.median} />
            <Text style={s.caption}>
              Each bar counts peer plants in a TRIR range. The dark bar is the range your plant falls in.
            </Text>

            <Text style={s.h3}>Is the difference real?</Text>
            <Text style={s.note}>{significanceText(result)}</Text>

            <Text style={s.footnote}>{footnoteText(result)}</Text>
          </>
        ) : null}

        <Text style={s.footer} fixed>
          Source: OSHA Injury Tracking Application (ITA), Form 300A summaries, calendar year {input.year}. Employer-reported
          data; OSHA does not verify individual submissions. PlantLine is an independent tool, not affiliated with OSHA or
          the U.S. Department of Labor. TRIR = recordable cases × 200,000 ÷ hours worked.
        </Text>
      </Page>
    </Document>
  )
}
