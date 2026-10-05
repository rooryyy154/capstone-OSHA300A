import StatusMessage from './StatusMessage.jsx'

/** A page-level status right under the navigation band, so it's the first thing the user sees. */
export default function PageAlert({ error, message, onRetry }) {
  return (
    <div className="page-alert">
      <div className="container">
        <StatusMessage error={error} message={message} onRetry={onRetry} />
      </div>
    </div>
  )
}
