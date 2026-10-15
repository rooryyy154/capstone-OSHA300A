import { formatInt, formatPercent, formatRate } from './format.js'

// The sentences that explain a benchmark result, shared by the results panel and the PDF report
// so both always say the same thing.

export const VERDICT_LABELS = {
  low: 'Lower than most peers',
  typical: 'Typical for your industry',
  high: 'Higher than most peers',
  very_high: 'Among the highest',
}

export const OWNERSHIP_LABELS = { private: 'Private plants', government: 'Government plants', all: 'All plants' }

const OWNER_WORDS = { private: 'private', government: 'government', all: '' }

/** "private establishments in Machine Shops (NAICS 332710)" */
export function peerDescription(result) {
  const { cohort, industry } = result
  const owner = OWNER_WORDS[cohort.ownership]
  const establishments = `${owner ? `${owner} ` : ''}establishments`
  if (cohort.level === 6 && industry.label) return `${establishments} in ${industry.label} (NAICS ${cohort.naics_prefix})`
  return `${establishments} in NAICS ${cohort.naics_prefix}`
}

/** The one-sentence verdict under the TRIR. */
export function headlineText(result) {
  const { plant, rank, cohort } = result
  const peers = peerDescription(result)
  const tiedShare = rank.tied / cohort.establishment_count
  if (plant.trir === 0 && tiedShare >= 0.1) {
    return `You're tied with ${formatPercent(tiedShare)} of ${peers} at zero recordable cases.`
  }
  const belowShare = rank.below / cohort.establishment_count
  const tied = tiedShare >= 0.01 ? `, and tied with ${formatPercent(tiedShare)}` : ''
  return `Your TRIR is higher than ${formatPercent(belowShare)} of ${peers}${tied}.`
}

/** "Is the difference real?" — read against the 95% range of the plant's own TRIR. */
export function significanceText(result) {
  const { plant, comparison, cohort, input } = result
  const { low, high } = plant.trir_interval
  const cases = input.total_recordable_cases
  if (comparison.differs_from_median === 'above') {
    return `Even at the low end of its 95% range (${formatRate(low)}), your TRIR is above the peer median of ${formatRate(cohort.median)}. A gap this size is unlikely to be chance.`
  }
  if (comparison.differs_from_median === 'below') {
    return `Even at the high end of its 95% range (${formatRate(high)}), your TRIR is below the peer median of ${formatRate(cohort.median)}. That's unlikely to be luck alone.`
  }
  if (cases === 0) {
    return `With no recordable cases this year, your true rate could still reasonably be as high as ${formatRate(high)}. A zero is good news, but one year of it doesn't prove your plant is safer than its peers. Several years of data would tell you more.`
  }
  if (plant.trir === cohort.median) return 'Your TRIR matches the peer median exactly.'
  return `With ${formatInt(cases)} recordable ${cases === 1 ? 'case' : 'cases'}, your true rate could reasonably be anywhere from ${formatRate(low)} to ${formatRate(high)}. That range includes the peer median (${formatRate(cohort.median)}), so this year's difference could be chance. Several years of data would tell you more.`
}

/** "+1.15" and "52% above" for the difference from the peer median. */
export function differenceText(comparison) {
  const difference = comparison.difference_from_median
  const value = `${difference > 0 ? '+' : ''}${formatRate(difference)}`
  const note =
    comparison.percent_from_median == null
      ? null
      : `${Math.abs(comparison.percent_from_median).toFixed(0)}% ${difference >= 0 ? 'above' : 'below'}`
  return { value, note }
}

/** The small print under the results. */
export function footnoteText(result) {
  const { cohort, rank } = result
  return `Compared with ${formatInt(cohort.establishment_count)} ${peerDescription(result)}, ${cohort.year} data. ${formatPercent(cohort.share_zero)} of them recorded zero cases. Your percentile counts half of the plants tied with you (${formatInt(rank.tied)}).`
}
