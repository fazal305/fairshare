import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import { AuthProvider } from './lib/auth'
import './index.css'
import { init } from './lib/bugwatcher.js'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'

const { hostname } = window.location
const environment = /^(localhost|127\.0\.0\.1)$/.test(hostname)
  ? 'development'
  : /-git-|-(?=[a-z]*\d)[a-z0-9]{9}-[a-z0-9]+\.vercel\.app$|^deploy-preview-\d+--.+\.netlify\.app$/.test(hostname)
    ? 'staging'
    : 'production'

if (environment !== 'development') {
  init({
    key: 'bwp_pk_ArT3Awz3vdPF573xQ7cP3Fi4Te67XxWQVof3Gvyu',
    endpoint: 'https://bugwatcher-pings-api.onrender.com/api/v1/ping',
    environment,
    maxReports: 20,
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Analytics />
        <SpeedInsights />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
