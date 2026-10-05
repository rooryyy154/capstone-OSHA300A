// Value first, label second: the reader already knows which mark they pointed at
export default function Tooltip({ tip }) {
  if (!tip) return null
  const { x, y, width, content } = tip
  const flip = x > width - 180
  return (
    <div
      className="viz-tooltip"
      role="status"
      style={{ left: x, top: y, transform: `translate(${flip ? 'calc(-100% - 12px)' : '12px'}, calc(-100% - 8px))` }}
    >
      <strong>{content.value}</strong>
      <span>{content.label}</span>
      {content.detail && <span className="viz-tooltip__detail">{content.detail}</span>}
    </div>
  )
}
