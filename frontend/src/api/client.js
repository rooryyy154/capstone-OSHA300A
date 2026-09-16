// Base URL of the Django API. Override with VITE_API_URL in frontend/.env
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError('Could not reach the server. Is Django running?', 0)
  }

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = data?.detail ?? `Request failed (${response.status})`
    throw new ApiError(message, response.status, data)
  }

  return data
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
}

export const getHealth = (options) => api.get('/health/', options)
