import { createContext, useContext } from 'react'

// The OSHA report year the whole site shows; provided by <YearProvider> in year.jsx.
// status: 'loading' | 'ready' | 'error'
export const YearContext = createContext({
  years: [],
  year: null,
  setYear: () => {},
  status: 'loading',
  error: null,
  retry: () => {},
})

export const useYear = () => useContext(YearContext)
