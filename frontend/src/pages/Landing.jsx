import { useCallback, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getInsights } from '../api/client.js'
import ColumnChart from '../components/charts/ColumnChart.jsx'
import HBarChart from '../components/charts/HBarChart.jsx'
import RangeStrip from '../components/charts/RangeStrip.jsx'
import Loader from '../components/states/Loader.jsx'
import PageAlert from '../components/states/PageAlert.jsx'
import { formatCompact, formatInt, formatPercent, formatRate, sizeBandLabel } from '../lib/format.js'
import { useApi } from '../lib/hooks.js'
import { useYear } from '../lib/useYear.js'
import './Landing.css'

const SECTOR_OF = { 31: '31-33', 32: '31-33', 33: '31-33', 44: '44-45', 45: '44-45', 48: '48-49', 49: '48-49' }
const sectorOf = (code) => SECTOR_OF[code.slice(0, 2)] ?? code.slice(0, 2)

// Sector names read better mid-sentence in lower case ("transportation and warehousing").
// Industry titles are official names and keep their capitals.
const lower = (text) => text.toLowerCase()

function compare(value, reference) {
  const ratio = value / reference
  if (ratio >= 2) return `${ratio >= 2.5 ? `${ratio.toFixed(1)} times` : 'more than twice'}`
  return `${Math.round((ratio - 1) * 100)}% above`
}

function Finding({ number, title, children, visual }) {
  return (
    <article className="finding">
      <div className="finding__text">
        <span className="finding__number">{String(number).padStart(2, '0')}</span>
        <h3>{title}</h3>
        {children}
      </div>
      <div className="finding__visual">{visual}</div>
    </article>
  )
}

function SectorFinding({ data, privateRate }) {
  const [top] = data.sectors
  const manufacturing = data.sectors.find((s) => s.code === '31-33')
  const drivers = data.top_industries.filter((i) => sectorOf(i.code) === top.code).slice(0, 2)
  return (
    <Finding
      number={1}
      title={`${top.title} has the highest injury rate of any sector`}
      visual={
        <HBarChart
          items={data.sectors.map((s, i) => ({ key: s.code, label: s.title, value: s.trir, highlight: i === 0, establishments: s.establishments }))}
          format={formatRate}
          reference={{ value: privateRate, label: `Private sector ${formatRate(privateRate)}` }}
          valueHeading="TRIR"
          tooltipDetail={(item) => `${formatInt(item.establishments)} establishments`}
          caption={`Recordable cases per 100 full-time workers, private establishments, ${data.year}.`}
        />
      }
    >
      <p>
        At <strong>{formatRate(top.trir)}</strong> recordable cases per 100 full-time workers, {lower(top.title)} runs{' '}
        {compare(top.trir, manufacturing.trir)} the manufacturing rate ({formatRate(manufacturing.trir)}) and well above the
        private-sector average of {formatRate(privateRate)}.
      </p>
      {drivers.length > 0 && (
        <p>
          {drivers.map((d, i) => (
            <span key={d.code}>
              {i > 0 && ' and '}
              {d.label} ({formatRate(d.trir)})
            </span>
          ))}{' '}
          {drivers.length > 1 ? 'are' : 'is'} among the highest-rate industries anywhere in the data.
        </p>
      )}
    </Finding>
  )
}

function DeathsFinding({ data }) {
  const byDeaths = [...data.sectors].sort((a, b) => b.deaths - a.deaths)
  const [deadliest] = byDeaths
  const totalDeaths = data.sectors.reduce((sum, s) => sum + s.deaths, 0)
  const highestRate = data.sectors[0]
  const construction = data.sectors.find((s) => s.code === '23')
  const retail = data.sectors.find((s) => s.code === '44-45')
  const lowRateDeadliest = deadliest.code === '23' && construction.trir < retail.trir

  return (
    <Finding
      number={2}
      title={lowRateDeadliest ? 'Construction has a low injury rate, and the most deaths' : `${deadliest.title} reported the most deaths`}
      visual={
        <HBarChart
          items={byDeaths.slice(0, 6).map((s, i) => ({ key: s.code, label: s.title, value: s.deaths, highlight: i === 0, trir: s.trir }))}
          format={formatInt}
          valueHeading="Deaths"
          tooltipDetail={(item) => `TRIR ${formatRate(item.trir)}`}
          caption="Work-related deaths recorded on Form 300A, private establishments, six sectors with the most deaths."
        />
      }
    >
      {lowRateDeadliest ? (
        <p>
          Construction's rate of <strong>{formatRate(construction.trir)}</strong> is less than half of retail's (
          {formatRate(retail.trir)}). Yet construction workplaces recorded <strong>{formatInt(construction.deaths)} deaths</strong>,
          more than any other sector and {formatPercent(construction.deaths / totalDeaths)} of all private-sector deaths in
          the data.
        </p>
      ) : (
        <p>
          {deadliest.title} recorded {formatInt(deadliest.deaths)} deaths, {formatPercent(deadliest.deaths / totalDeaths)} of
          all private-sector deaths, while {lower(highestRate.title)} had the highest injury rate.
        </p>
      )}
      <p>A recordable-case rate measures how often people get hurt, not how badly. Read it alongside severity.</p>
    </Finding>
  )
}

function IndustryFinding({ data, privateRate }) {
  const [top] = data.top_industries
  return (
    <Finding
      number={3}
      title={`${top.label}: the highest rate of any large industry`}
      visual={
        <HBarChart
          items={data.top_industries.map((ind, i) => ({
            key: ind.code,
            label: ind.label,
            sublabel: `NAICS ${ind.code}`,
            value: ind.trir,
            highlight: i === 0,
            establishments: ind.establishments,
          }))}
          format={formatRate}
          reference={{ value: privateRate, label: `Private sector ${formatRate(privateRate)}` }}
          valueHeading="TRIR"
          tooltipDetail={(item) => `${formatInt(item.establishments)} establishments`}
          caption="Industries with at least 200 private establishments, ranked by TRIR."
        />
      }
    >
      <p>
        Among industries with at least 200 establishments, {top.label} recorded{' '}
        <strong>{formatRate(top.trir)}</strong> cases per 100 full-time workers, {compare(top.trir, privateRate)} the
        private-sector rate.
      </p>
      {top.median_trir >= top.trir * 0.75 && (
        <p>
          Even the median establishment in this industry recorded {formatRate(top.median_trir)}, so the rate isn't the work
          of a few outliers.
        </p>
      )}
    </Finding>
  )
}

function SizeFinding({ data }) {
  const bands = data.size_bands
  const smallest = bands[0]
  const largest = bands[bands.length - 1]
  const highestRate = Math.max(...bands.map((b) => b.trir))
  return (
    <Finding
      number={4}
      title={`${formatPercent(data.totals.share_zero)} of workplaces recorded zero cases, mostly small ones`}
      visual={
        <ColumnChart
          items={bands.map((b) => ({ key: b.min_employees, label: sizeBandLabel(b), value: b.share_zero, trir: b.trir, establishments: b.establishments }))}
          format={(v) => formatPercent(v)}
          categoryHeading="Employees"
          valueHeading="Share with zero cases"
          axisLabel="Employees per workplace"
          tooltipDetail={(item) => `${formatInt(item.establishments)} establishments · pooled TRIR ${formatRate(item.trir)}`}
          caption="Share of private establishments with no recordable cases, by size."
        />
      }
    >
      <p>
        Among workplaces with fewer than {formatInt(smallest.max_employees + 1)} employees,{' '}
        <strong>{formatPercent(smallest.share_zero)}</strong> recorded no cases at all; among those with{' '}
        {formatInt(largest.min_employees)} or more, only {formatPercent(largest.share_zero)} did.
      </p>
      <p>
        Taken together, though, the smallest workplaces had a rate of {formatRate(smallest.trir)}
        {smallest.trir >= highestRate * 0.95 ? ', about as high as any size class' : ''}. Fewer hours worked means fewer
        chances to record a case in any one year, so a zero says less than it seems.
      </p>
    </Finding>
  )
}

function OwnershipFinding({ data }) {
  const find = (key) => data.ownership.find((o) => o.ownership === key)
  const privateSector = find('private')
  const state = find('state_government')
  const local = find('local_government')
  if (!privateSector || !state || !local) return null
  const localHigher = local.trir > privateSector.trir
  return (
    <Finding
      number={5}
      title={localHigher ? 'Local government workplaces report higher rates than private ones' : 'Public and private workplaces differ'}
      visual={
        <HBarChart
          items={[
            { key: 'private', label: 'Private', value: privateSector.trir, establishments: privateSector.establishments },
            { key: 'state', label: 'State government', value: state.trir, establishments: state.establishments },
            { key: 'local', label: 'Local government', value: local.trir, highlight: localHigher, establishments: local.establishments },
          ]}
          format={formatRate}
          valueHeading="TRIR"
          tooltipDetail={(item) => `${formatInt(item.establishments)} establishments`}
          caption="Recordable cases per 100 full-time workers by owner, all sectors."
        />
      }
    >
      <p>
        Local government establishments, such as cities, counties, school districts and transit or water agencies, recorded{' '}
        <strong>{formatRate(local.trir)}</strong> cases per 100 full-time workers,{' '}
        {localHigher ? `${Math.round((local.trir / privateSector.trir - 1) * 100)}% higher than` : 'compared with'} the private
        sector ({formatRate(privateSector.trir)}). State government recorded {formatRate(state.trir)}.
      </p>
      <p>
        Because the gap is this wide, PlantLine compares private plants with private plants unless you choose a different peer
        group.
      </p>
    </Finding>
  )
}

function SpreadFinding({ data }) {
  const industries = data.largest_industries
  const widest = [...industries].sort((a, b) => b.p90 - b.median - (a.p90 - a.median))[0]
  return (
    <Finding
      number={6}
      title="Inside a single industry, rates vary widely"
      visual={<RangeStrip items={industries} caption="TRIR spread in the five largest private industries by number of establishments." />}
    >
      <p>
        In {widest.label}, the typical establishment recorded <strong>{formatRate(widest.median)}</strong>. One in ten
        recorded {formatRate(widest.p90)} or more
        {widest.p10 === 0 ? ', and at least one in ten recorded none at all' : ''}.
      </p>
      <p>An industry average can't tell you where your own plant falls. A percentile can.</p>
    </Finding>
  )
}

export default function Landing() {
  const { year: selectedYear, status: yearStatus, error: yearError, retry: retryYears } = useYear()
  const load = useCallback((options) => getInsights(selectedYear, options), [selectedYear])
  const { data, error, loading, reload } = useApi(selectedYear ? load : null)
  const failed = yearStatus === 'error' || (error && !data)
  // Shown right under the navigation, before anything else on the page
  const pageError = yearStatus === 'error' ? { error: yearError, retry: retryYears } : error ? { error, retry: reload } : null
  const { hash } = useLocation()
  const year = data?.year ?? selectedYear

  // Links to /#methodology arrive before the page has content; scroll once it renders
  useEffect(() => {
    if (!hash) return
    document.getElementById(hash.slice(1))?.scrollIntoView()
  }, [hash, data])

  const totals = data?.totals
  const privateRate = data?.ownership.find((o) => o.ownership === 'private')?.trir

  return (
    <>
      {pageError && <PageAlert error={pageError.error} onRetry={pageError.retry} />}

      <section className="hero">
        <div className="container hero__grid">
          <div>
            <h1>
              What {totals ? formatInt(totals.establishments) : 'U.S.'} workplaces reported about injuries
              {year ? ` in ${year}` : ''}
            </h1>
            <p className="hero__lead">
              Each year, larger employers and those in higher-hazard industries send OSHA a summary of their recordable
              injuries and illnesses. We cleaned the {year ?? 'latest'} submissions and compared them industry by industry. Here is what
              stands out, and how to see where your own plant stands.
            </p>
            <div className="hero__actions">
              <Link className="button" to="/benchmark">
                Benchmark your plant
              </Link>
              <a className="button button--outline" href="#findings">
                Read the findings
              </a>
            </div>
          </div>
          <aside className="hero__figure" aria-label="National injury rate">
            <span className="hero__figure-value">
              {totals ? formatRate(totals.trir) : failed ? '–' : <Loader inline />}
            </span>
            <span className="hero__figure-label">
              recordable injuries and illnesses per 100 full-time workers, all reporting establishments
            </span>
            <span className="hero__figure-note">
              The median establishment recorded {totals ? formatRate(totals.median_trir) : '–'}.
            </span>
          </aside>
        </div>
      </section>

      {!data && !pageError && (
        <section id="findings" className="section">
          <div className="container">
            <Loader
              label={year ? `Loading the ${year} findings` : 'Loading the findings'}
              detail="Reading every establishment's Form 300A summary"
            />
          </div>
        </section>
      )}

      {totals && (
        <section className={`stat-band ${loading ? 'is-refreshing' : ''}`} aria-label={`${year} totals`}>
          <div className="container stat-band__grid">
            <div className="stat">
              <span className="stat__value">{formatCompact(totals.recordable_cases)}</span>
              <span className="stat__label">recordable injuries and illnesses</span>
            </div>
            <div className="stat">
              <span className="stat__value">{formatPercent(totals.dart_cases / totals.recordable_cases)}</span>
              <span className="stat__label">of cases meant days away from work, restricted duty or a job transfer</span>
            </div>
            <div className="stat">
              <span className="stat__value">{formatInt(totals.deaths)}</span>
              <span className="stat__label">work-related deaths recorded</span>
            </div>
            <div className="stat">
              <span className="stat__value">{formatCompact(totals.employees)}</span>
              <span className="stat__label">employees covered, {formatCompact(totals.hours_worked)} hours worked</span>
            </div>
          </div>
        </section>
      )}

      {data && (
        <section id="findings" className={`section ${loading ? 'is-refreshing' : ''}`}>
          <div className="container">
            <div className="section-intro">
              <h2>Six findings from the {year} data</h2>
              <p>
                Rates are OSHA incidence rates: recordable cases × 200,000 ÷ hours worked, or cases per 100 full-time
                workers. They are pooled across establishments, so each one counts in proportion to its hours. Breakdowns
                cover private establishments unless noted.
              </p>
            </div>
            <SectorFinding data={data} privateRate={privateRate} />
            <DeathsFinding data={data} />
            <IndustryFinding data={data} privateRate={privateRate} />
            <SizeFinding data={data} />
            <OwnershipFinding data={data} />
            <SpreadFinding data={data} />
          </div>
        </section>
      )}

      <section className="cta-band">
        <div className="container cta-band__grid">
          <div>
            <h2>Where does your plant stand?</h2>
            <p>
              Enter four numbers from your {year ?? ''} OSHA Form 300A. PlantLine calculates your TRIR and places it among every
              comparable plant in your industry.
            </p>
            <Link className="button button--light" to="/benchmark">
              Benchmark your plant
            </Link>
          </div>
          <ul className="cta-band__points">
            <li>An exact percentile, counted against every peer plant</li>
            <li>Compare with private, government or all establishments</li>
            <li>Nothing you enter is stored</li>
          </ul>
        </div>
      </section>

      <section id="methodology" className="section methodology">
        <div className="container">
          <div className="prose">
            <h2>How we built this</h2>
            <p>
              The data is OSHA's Injury Tracking Application (ITA) release of Form 300A summaries for calendar year{' '}
              {year}. Establishments with 250 or more employees, and those with 20 to 249 employees in
              designated higher-hazard industries, must submit these summaries electronically each year.
            </p>
            <p>
              Before any calculation we removed records that fail basic quality checks: workplaces with fewer than 10,000
              hours worked (where a single case moves the rate by 20 points or more), hours per employee outside 250 to 8,760,
              invalid industry codes, and more recordable cases than employees. Older retail industry codes were mapped to the
              2022 NAICS edition so stores compare with their real peers.
              {totals && ` ${formatInt(totals.establishments)} establishments remain.`}
            </p>
            <p>
              The data is self-reported and OSHA does not verify individual submissions. It also isn't a random sample of U.S.
              workplaces: small employers outside the designated industries don't have to report.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
