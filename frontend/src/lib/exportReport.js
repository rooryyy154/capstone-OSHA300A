import { pdf } from '@react-pdf/renderer'
import { createElement } from 'react'
import ReportDocument from '../components/report/ReportDocument.jsx'

// Loaded only when someone clicks "Download PDF" (dynamic import), so the PDF library never
// slows down the rest of the site. Everything happens in the browser: nothing is sent anywhere.

const slug = (text) =>
  text
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .slice(0, 60)

export function reportFileName(result, plantName) {
  const name = slug(plantName ?? '') || `naics-${result.industry.code}`
  return `PlantLine-${name}-${result.input.year}.pdf`
}

export function createReportBlob(result, plantName, generatedAt = new Date()) {
  return pdf(createElement(ReportDocument, { result, plantName, generatedAt })).toBlob()
}

export async function downloadReport(result, plantName) {
  const blob = await createReportBlob(result, plantName)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = reportFileName(result, plantName)
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
