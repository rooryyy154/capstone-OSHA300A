import { useState } from 'react'
import ContactForm from '../components/contact/ContactForm.jsx'
import PageHeader from '../components/layout/PageHeader.jsx'
import PageAlert from '../components/states/PageAlert.jsx'
import { useYear } from '../lib/useYear.js'
import './Contact.css'

// The API's own sentence is more useful here than the generic one: "wait N minutes", "email
// couldn't be sent". A request that never reached the server has no body and keeps the default.
function contactMessage(error) {
  if (error.status === 429) {
    const seconds = Number(/(\d+) second/.exec(error.data?.detail ?? '')?.[1])
    const minutes = Math.max(1, Math.ceil(seconds / 60))
    return seconds
      ? `You've sent several messages in a short time. Please try again in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`
      : "You've sent several messages in a short time. Please try again later."
  }
  return error.data?.detail
}

export default function Contact() {
  // The years list doubles as the check that the backend is reachable when the page opens
  const { status, error: yearError, retry } = useYear()
  const [error, setError] = useState(null)

  const handleError = (err) => {
    setError(err)
    // The status is shown at the top of the page; bring it into view
    if (err) window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      {error ? (
        <PageAlert error={error} message={contactMessage(error)} />
      ) : (
        status === 'error' && <PageAlert error={yearError} onRetry={retry} />
      )}
      <PageHeader title="Contact" lead="Questions, corrections or ideas about PlantLine? Send me a message." />
      <div className="container contact">
        <ContactForm onError={handleError} />
        <aside className="contact__aside">
          <h2>How it works</h2>
          <ol>
            <li>Write your message and complete the quick robot check.</li>
            <li>We email you a 6-digit code to confirm the address is yours.</li>
            <li>Enter the code and your message is delivered.</li>
          </ol>
          <p>Your email address is used only to verify and reply to your message.</p>
        </aside>
      </div>
    </>
  )
}
