import { useCallback, useMemo, useState } from 'react'
import { getYears } from '../api/client.js'
import { useApi } from './hooks.js'
import { YearContext } from './useYear.js'

/**
 * The OSHA report year the whole site shows. The list comes from the years loaded in
 * PostgreSQL (GET /api/years/), so loading another year with `load_ita` adds it here.
 */
export function YearProvider({ children }) {
  const load = useCallback((options) => getYears(options), [])
  const { data, error, loading, reload } = useApi(load)
  const [chosen, setYear] = useState(null)

  const years = useMemo(() => data?.years ?? [], [data])
  // Until the user picks one, the newest loaded year
  const year = chosen ?? years[0] ?? null
  const status = loading ? 'loading' : error ? 'error' : 'ready'

  const value = useMemo(() => ({ years, year, setYear, status, error, retry: reload }), [years, year, status, error, reload])
  return <YearContext.Provider value={value}>{children}</YearContext.Provider>
}
