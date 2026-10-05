import { describeError } from '../../lib/errors.js'

/**
 * A status screen: the code, a short title, one sentence and an optional action. Pass `error`
 * (an ApiError) to derive them, or `code`/`title`/`message` directly (e.g. for 404). With
 * `error`, a `message` replaces the default sentence.
 */
export default function StatusMessage({ error, code, title, message, onRetry, action, compact = false }) {
  const state = error ? { ...describeError(error), ...(message ? { message } : {}) } : { code, title, message }
  return (
    <div className={`status ${compact ? 'status--compact' : ''}`} role={error ? 'alert' : undefined}>
      <span className="status__code">{state.code}</span>
      <div className="status__body">
        <h2 className="status__title">{state.title}</h2>
        <p className="status__message">{state.message}</p>
        {(onRetry || action) && (
          <div className="status__actions">
            {onRetry && (
              <button type="button" className="button button--outline button--small" onClick={onRetry}>
                Try again
              </button>
            )}
            {action}
          </div>
        )}
      </div>
    </div>
  )
}
