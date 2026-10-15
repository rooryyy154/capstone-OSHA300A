import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The PDF export chunk (@react-pdf/renderer, ~1.2 MB) is loaded only when someone clicks
    // "Download PDF", so its size doesn't affect page load; don't warn about it.
    chunkSizeWarningLimit: 1300,
  },
})
