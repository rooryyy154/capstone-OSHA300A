// Turns any API failure into a status the user can read: a code, a short title and one sentence.
// A request that never reaches the server has no HTTP status; it's shown as 503 (service unavailable).
const STATES = {
  400: { title: 'Request not valid', message: 'Something in the request was not accepted. Check your numbers and try again.' },
  404: { title: 'Not found', message: "We couldn't find what you were looking for." },
  429: { title: 'Too many requests', message: 'Please wait a few seconds before trying again.' },
  500: { title: 'Server error', message: 'Something went wrong on our side. Please try again in a moment.' },
  503: { title: 'Service unavailable', message: "We can't reach PlantLine's data right now. Please try again in a moment." },
}

export function describeError(error) {
  const status = error?.status || 503
  const state = STATES[status] ?? (status >= 500 ? STATES[500] : STATES[400])
  // 400s carry a specific reason from the API (e.g. a year that isn't loaded); show it
  const message = status === 400 && error?.data?.detail ? error.data.detail : state.message
  return { code: status, title: state.title, message }
}
