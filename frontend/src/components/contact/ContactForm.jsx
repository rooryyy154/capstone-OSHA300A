import { Turnstile } from '@marsidev/react-turnstile'
import { useRef, useState } from 'react'
import { postContact, postContactVerify } from '../../api/client.js'
import Loader from '../states/Loader.jsx'

// Cloudflare's public dummy site key: the widget always passes and its token only works with
// the dummy secret the backend uses in development. Real keys come from the .env files.
const TEST_SITE_KEY = '1x00000000000000000000AA'
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || (import.meta.env.DEV ? TEST_SITE_KEY : '')

// Mirrors backend/contact/rules.py
const MESSAGE_MAX = 2000
const CODE_LENGTH = 6
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const EMPTY = { email: '', message: '', website: '' }
const first = (value) => [].concat(value)[0]

/**
 * The contact form, in two steps inside one component (D-010):
 *   'form'  email + message + captcha  →  POST /api/contact/         (emails a 6-digit code)
 *   'code'  the code from the email    →  POST /api/contact/verify/  (delivers the message)
 *   'done'  confirmation
 * Field errors are shown next to the field; anything else goes to `onError` for the page-level status.
 */
export default function ContactForm({ onError }) {
  const [step, setStep] = useState('form')
  const [values, setValues] = useState(EMPTY)
  const [token, setToken] = useState('')
  const [pending, setPending] = useState(null)
  const [code, setCode] = useState('')
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const turnstile = useRef(null)

  const update = (name, value) => {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  // A Turnstile token can be spent once, so any failed attempt needs a fresh one
  const resetCaptcha = () => {
    setToken('')
    turnstile.current?.reset()
  }

  const handleSend = async (event) => {
    event.preventDefault()
    const found = {}
    if (!EMAIL_PATTERN.test(values.email.trim())) found.email = 'Enter your email address, like name@example.com.'
    if (!values.message.trim()) found.message = 'Write your message.'
    else if (values.message.length > MESSAGE_MAX) found.message = `Keep your message under ${MESSAGE_MAX.toLocaleString('en-US')} characters.`
    if (!token) found.captcha = 'Complete the check above first.'
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setBusy(true)
    setNotice(null)
    onError(null)
    try {
      const data = await postContact({
        email: values.email.trim(),
        message: values.message.trim(),
        captcha_token: token,
        website: values.website,
      })
      setPending(data)
      setCode('')
      setToken('')
      setStep('code')
    } catch (err) {
      resetCaptcha()
      const fields = err.status === 400 && err.data && !err.data.detail ? err.data : null
      if (fields) {
        setErrors({
          email: fields.email && first(fields.email),
          message: fields.message && first(fields.message),
          captcha: fields.captcha_token && first(fields.captcha_token),
        })
      } else {
        onError(err)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleVerify = async (event) => {
    event.preventDefault()
    if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) {
      setErrors({ code: `Enter the ${CODE_LENGTH}-digit code from the email.` })
      return
    }
    setBusy(true)
    setErrors({})
    onError(null)
    try {
      await postContactVerify({ id: pending.id, code })
      setStep('done')
    } catch (err) {
      if (err.status === 400 && err.data?.code) {
        setErrors({ code: first(err.data.code) })
        setCode('')
      } else if (err.status === 410 || err.status === 404) {
        // The code expired or was used up: back to the form, with the message kept
        setNotice(err.data?.detail ?? 'That code is no longer valid. Please send your message again.')
        setPending(null)
        setStep('form')
      } else {
        onError(err)
      }
    } finally {
      setBusy(false)
    }
  }

  const startOver = () => {
    setValues(EMPTY)
    setPending(null)
    setErrors({})
    setNotice(null)
    setStep('form')
  }

  if (step === 'done') {
    return (
      <div className="contact-form" role="status">
        <h2>Message sent</h2>
        <p>Thanks for writing. I'll reply to {pending.email}.</p>
        <button type="button" className="button button--outline" onClick={startOver}>
          Send another message
        </button>
      </div>
    )
  }

  if (step === 'code') {
    return (
      <form className="contact-form" noValidate onSubmit={handleVerify}>
        <h2>Check your email</h2>
        <p>
          We sent a {CODE_LENGTH}-digit code to <strong>{pending.email}</strong>. Enter it below to send your message. The
          code expires in {pending.expires_in_minutes} minutes.
        </p>
        <div className="field">
          <label htmlFor="contact-code">Verification code</label>
          <input
            id="contact-code"
            className="input contact-form__code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            autoFocus
            value={code}
            aria-invalid={Boolean(errors.code) || undefined}
            aria-describedby={errors.code ? 'contact-code-error' : undefined}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, ''))
              setErrors({})
            }}
          />
          {errors.code && (
            <p id="contact-code-error" className="field__error">
              {errors.code}
            </p>
          )}
        </div>
        <div className="contact-form__actions">
          <button type="submit" className="button" disabled={busy}>
            {busy ? <Loader inline label="Verifying" /> : 'Verify and send'}
          </button>
          <button type="button" className="link-button" disabled={busy} onClick={() => setStep('form')}>
            Use a different email
          </button>
        </div>
      </form>
    )
  }

  return (
    <form className="contact-form" noValidate onSubmit={handleSend}>
      <h2>Send a message</h2>
      {notice && <p className="contact-form__notice">{notice}</p>}

      <div className="field">
        <label htmlFor="contact-email">Your email</label>
        <input
          id="contact-email"
          className="input"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          value={values.email}
          aria-invalid={Boolean(errors.email) || undefined}
          aria-describedby={errors.email ? 'contact-email-error' : undefined}
          onChange={(event) => update('email', event.target.value)}
        />
        {errors.email && (
          <p id="contact-email-error" className="field__error">
            {errors.email}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="contact-message">Message</label>
        <textarea
          id="contact-message"
          className="input contact-form__message"
          rows={7}
          value={values.message}
          aria-invalid={Boolean(errors.message) || undefined}
          aria-describedby={errors.message ? 'contact-message-error' : 'contact-message-count'}
          onChange={(event) => update('message', event.target.value)}
        />
        {errors.message && (
          <p id="contact-message-error" className="field__error">
            {errors.message}
          </p>
        )}
        <p id="contact-message-count" className="contact-form__count">
          {values.message.length.toLocaleString('en-US')} / {MESSAGE_MAX.toLocaleString('en-US')}
        </p>
      </div>

      {/* Honeypot: moved off-screen with CSS, so people never see it and only bots fill it in */}
      <div className="contact-form__website" aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={(event) => update('website', event.target.value)}
        />
      </div>

      <div className="field">
        {SITE_KEY ? (
          <Turnstile
            ref={turnstile}
            siteKey={SITE_KEY}
            options={{ theme: 'light', size: 'flexible' }}
            onSuccess={(value) => {
              setToken(value)
              setErrors((current) => ({ ...current, captcha: undefined }))
            }}
            onExpire={() => setToken('')}
            onError={() => setToken('')}
          />
        ) : (
          <p className="field__error">The contact form isn't set up yet: its captcha key is missing.</p>
        )}
        {errors.captcha && <p className="field__error">{errors.captcha}</p>}
      </div>

      <button type="submit" className="button" disabled={busy || !SITE_KEY}>
        {busy ? <Loader inline label="Sending" /> : 'Send message'}
      </button>
    </form>
  )
}
