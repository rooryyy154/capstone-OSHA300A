import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './components/charts/charts.css'
import './components/states/states.css'
import App from './App.jsx'
import { YearProvider } from './lib/year.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <YearProvider>
        <App />
      </YearProvider>
    </BrowserRouter>
  </StrictMode>,
)
