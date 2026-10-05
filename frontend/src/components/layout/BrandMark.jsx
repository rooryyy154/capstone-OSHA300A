// A sawtooth factory roofline: the "plant" in PlantLine
export default function BrandMark({ className }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="4" fill="var(--green-800)" />
      <path d="M5 24V14l6 4v-4l6 4v-4l6 4V8h4v16z" fill="#fff" />
    </svg>
  )
}
