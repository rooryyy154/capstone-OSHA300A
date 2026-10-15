import { useState } from 'react'
import Loader from '../states/Loader.jsx'

const NAME_MAX = 80

/**
 * "Download PDF" for the result on screen (D-012). The PDF is built in the browser from data the
 * page already has, so it needs no server call and no captcha. The plant name is only written
 * into the file; it's never sent or stored.
 */
export default function ExportReport({ result, disabled }) {
  const [plantName, setPlantName] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const handleExport = async () => {
    setBusy(true)
    setFailed(false)
    try {
      // The PDF library is large, so it loads only when someone actually exports
      const { downloadReport } = await import('../../lib/exportReport.js')
      await downloadReport(result, plantName.trim())
    } catch (error) {
      console.error('PDF export failed', error)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="export" aria-labelledby="export-title">
      <h3 id="export-title">Export your report</h3>
      <p className="export__lead">
        Download these results as a one-page PDF. The plant name only appears in your file; it isn't sent anywhere.
      </p>
      <div className="export__row">
        <div className="field export__field">
          <label htmlFor="export-plant-name">Plant name (optional)</label>
          <input
            id="export-plant-name"
            className="input"
            type="text"
            maxLength={NAME_MAX}
            autoComplete="organization"
            placeholder="e.g. Riverside Machining, Plant 2"
            value={plantName}
            onChange={(event) => setPlantName(event.target.value)}
          />
        </div>
        <button type="button" className="button" disabled={busy || disabled} onClick={handleExport}>
          {busy ? <Loader inline label="Preparing PDF" /> : 'Download PDF'}
        </button>
      </div>
      {failed && (
        <p className="field__error" role="alert">
          The PDF couldn't be created. Please try again.
        </p>
      )}
    </section>
  )
}
