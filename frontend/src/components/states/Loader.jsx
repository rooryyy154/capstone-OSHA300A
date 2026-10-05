const DOTS = [8, 26, 44, 62]

/** Four dots moving in a wave, with a message. `inline` fits inside a button or a list row. */
export default function Loader({ label, detail, inline = false }) {
  return (
    <div className={`loader ${inline ? 'loader--inline' : ''}`} role="status" aria-live="polite">
      <svg className="loader__dots" viewBox="0 0 70 20" aria-hidden="true" focusable="false">
        {DOTS.map((cx, i) => (
          <circle key={cx} cx={cx} cy="10" r="6" style={{ animationDelay: `${i * 0.14}s` }} />
        ))}
      </svg>
      {label && (
        <span className="loader__text">
          <span className="loader__label">{label}</span>
          {detail && <span className="loader__detail">{detail}</span>}
        </span>
      )}
    </div>
  )
}
