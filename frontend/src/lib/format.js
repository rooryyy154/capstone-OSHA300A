const integer = new Intl.NumberFormat('en-US')
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 })

export const formatInt = (value) => integer.format(Math.round(value))

export const formatCompact = (value) => compact.format(value)

export const formatRate = (value) => (value == null ? '–' : value.toFixed(2))

export const formatPercent = (share, digits = 0) => `${(share * 100).toFixed(digits)}%`

export function ordinal(n) {
  const rounded = Math.round(n)
  const suffix = ['th', 'st', 'nd', 'rd'][(rounded % 100 >= 11 && rounded % 100 <= 13) || rounded % 10 > 3 ? 0 : rounded % 10]
  return `${rounded}${suffix}`
}

export function sizeBandLabel({ min_employees: min, max_employees: max }) {
  return max == null ? `${formatInt(min)}+` : `${formatInt(min)}–${formatInt(max)}`
}
