// Cloudflare Turnstile client-side error codes, grouped as in Cloudflare's documentation
// (developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/).
// Each becomes a status with the code itself as the number, like the site's other errors.
const SETUP = {
  title: "Security check isn't set up correctly",
  message: "The robot check can't run on this page right now. Please try again later or reach out another way.",
}

const CAPTCHA_STATES = [
  { match: ['110100', '110110', '400020', '400070'], ...SETUP },
  {
    match: ['110200', '400021'],
    title: 'Security check not allowed here',
    message: "This address isn't authorized for the robot check yet. Please try again later.",
  },
  {
    match: ['110600', '110620'],
    title: 'Security check timed out',
    message: 'The robot check took too long. Complete it again, then send your message.',
  },
  {
    match: ['200100'],
    title: "Your device's clock looks wrong",
    message: "Check that your computer's date and time are correct, then reload the page.",
  },
  {
    match: ['200500'],
    title: "Security check couldn't load",
    message: 'Something blocked the robot check from loading, such as an ad blocker or a weak connection. Reload and try again.',
  },
]

const FAILED = {
  title: 'Security check failed',
  message: "We couldn't confirm you're not a robot. Complete the check again, then send your message.",
}

/** A Turnstile error code (as reported by the widget) → { code, title, message } for StatusMessage. */
export function describeCaptchaError(code) {
  const text = String(code ?? '')
  const known = CAPTCHA_STATES.find((state) => state.match.includes(text))
  const { title, message } = known ?? FAILED // 300xxx, 600xxx and anything unknown
  return { code: text || 'Error', title, message }
}

/** The server rejected the token (missing, spent, or refused by Cloudflare's siteverify). */
export const CAPTCHA_REJECTED = { code: 400, ...FAILED }
