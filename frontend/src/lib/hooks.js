import { useCallback, useEffect, useRef, useState } from 'react'

// Width of an element, kept current with ResizeObserver (charts render in real pixels)
export function useElementWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

export function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/**
 * Runs `load` whenever it changes (pass null to wait). The previous data stays available while
 * a new request is in flight, so pages can dim the old render instead of flashing empty.
 */
export function useApi(load) {
  const [state, setState] = useState({ data: null, error: null, source: null, attempt: 0 })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!load) return undefined
    const controller = new AbortController()
    load({ signal: controller.signal })
      .then((data) => setState({ data, error: null, source: load, attempt }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState((current) => ({ data: current.data, error, source: load, attempt }))
      })
    return () => controller.abort()
  }, [load, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const loading = load != null && (state.source !== load || state.attempt !== attempt)
  return { data: state.data, error: loading ? null : state.error, loading, reload }
}

// One floating tooltip per chart. Marks call show() on hover and focus, hide() on leave and blur.
export function useTooltip() {
  const containerRef = useRef(null)
  const [tip, setTip] = useState(null)

  const show = useCallback((event, content) => {
    const container = containerRef.current
    if (!container) return
    const box = container.getBoundingClientRect()
    const anchor = event.clientX != null && event.type.startsWith('pointer')
      ? { x: event.clientX, y: event.clientY }
      : (() => {
          const target = event.currentTarget.getBoundingClientRect()
          return { x: target.left + target.width / 2, y: target.top }
        })()
    setTip({ x: anchor.x - box.left, y: anchor.y - box.top, content, width: box.width })
  }, [])

  const hide = useCallback(() => setTip(null), [])

  return { containerRef, tip, show, hide }
}
