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

  if (state.status === 'loading') return <p className="api-status">Checking API…</p>
  if (state.status === 'error') return <p className="api-status error">API: {state.error}</p>
  return <p className="api-status ok">API connected</p>
}
