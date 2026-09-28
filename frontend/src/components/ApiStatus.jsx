import { useEffect, useState } from 'react'
import { getHealth } from '../api/client.js'

export default function ApiStatus() {
  const [state, setState] = useState({ status: 'loading', error: null })

  useEffect(() => {
    const controller = new AbortController()
    getHealth({ signal: controller.signal })
      .then(() => setState({ status: 'ok', error: null }))
      .catch((err) => {
        if (err.name !== 'AbortError') setState({ status: 'error', error: err.message })
      })
    return () => controller.abort()
  }, [])

  if (state.status === 'loading') return <span>Checking API…</span>
  if (state.status === 'error') return <span className="text-danger">API: {state.error}</span>
  return <span className="text-success">API connected</span>
}
