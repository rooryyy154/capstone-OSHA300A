import { useEffect, useId, useRef, useState } from 'react'
import { searchIndustries } from '../../api/client.js'
import { describeError } from '../../lib/errors.js'
import { formatInt } from '../../lib/format.js'
import { useDebounced } from '../../lib/hooks.js'
import { useYear } from '../../lib/useYear.js'
import Loader from '../states/Loader.jsx'

/**
 * NAICS combobox: type a code or words from the industry name and pick from the list.
 * Typing a full 6-digit code works without picking, so users who know their code aren't slowed down.
 * The dropdown also reports its state: searching, no matches, or search unavailable.
 */
export default function IndustryPicker({ id, value, onChange, invalid, describedBy }) {
  const listId = useId()
  const { year } = useYear()
  const inputRef = useRef(null)
  const [query, setQuery] = useState(value ?? '')
  const [results, setResults] = useState({ key: null, options: [], error: null })
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [selected, setSelected] = useState(null)
  const debounced = useDebounced(query.trim(), 200)

  const typed = query.trim()
  const wanted = !selected && typed.length >= 2 && year != null
  const key = `${debounced}|${year}`

  useEffect(() => {
    if (selected || debounced.length < 2 || year == null) return undefined
    const controller = new AbortController()
    searchIndustries(debounced, year, { signal: controller.signal })
      .then((options) => {
        setResults({ key, options, error: null })
        setActive(-1)
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setResults({ key, options: [], error })
      })
    return () => controller.abort()
  }, [debounced, year, selected, key])

  let status = 'idle'
  if (wanted) {
    if (debounced !== typed || results.key !== key) status = 'loading'
    else if (results.error) status = 'error'
    else if (results.options.length === 0) status = 'empty'
    else status = 'ready'
  }
  const visible = status === 'ready' ? results.options : []
  const showPanel = open && status !== 'idle'
  const showList = showPanel && status === 'ready'

  const choose = (option) => {
    setSelected(option)
    setQuery(`${option.code} · ${option.label}`)
    setOpen(false)
    onChange(option.code)
  }

  const handleInput = (event) => {
    const text = event.target.value
    setQuery(text)
    setSelected(null)
    setOpen(document.activeElement === inputRef.current)
    onChange(/^\d{6}$/.test(text.trim()) ? text.trim() : '')
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!showList) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => (i + 1) % visible.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => (i <= 0 ? visible.length - 1 : i - 1))
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault()
      choose(visible[active])
    }
  }

  return (
    <div className="combobox">
      <input
        ref={inputRef}
        id={id}
        className="input"
        type="text"
        role="combobox"
        autoComplete="off"
        placeholder="Type a NAICS code or industry, e.g. 332710 or machine shops"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={query}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {showPanel && !showList && (
        <div className="combobox__list combobox__state">
          {status === 'loading' && <Loader inline label="Searching industries" />}
          {status === 'empty' && (
            <p role="status">
              No industries match “{typed}”.{' '}
              {/\d/.test(typed) ? `Try a shorter code, such as ${typed.replace(/\D/g, '').slice(0, 3)}.` : 'Try another word or a NAICS code.'}
            </p>
          )}
          {status === 'error' && (
            <p role="alert">
              <strong>{describeError(results.error).code}</strong> · Industry search is unavailable. You can still type
              your 6-digit NAICS code.
            </p>
          )}
        </div>
      )}
      {showList && (
        <ul id={listId} className="combobox__list" role="listbox">
          {visible.map((option, i) => (
            <li
              key={option.code}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : undefined}
              onMouseDown={(event) => {
                event.preventDefault()
                choose(option)
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="combobox__code">{option.code}</span>
              <span className="combobox__label">{option.label}</span>
              <span className="combobox__count">{formatInt(option.establishment_count)} plants</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
