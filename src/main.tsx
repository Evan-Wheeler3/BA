import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { startSync } from './cloud/sync'
import { capIdleTimers } from './state/actions'
import { getState, subscribe } from './state/store'

// ---- Theme (system / light / dark) ----
const media = window.matchMedia('(prefers-color-scheme: dark)')
function applyTheme() {
  const pref = getState().settings.theme
  const dark = pref === 'dark' || (pref === 'system' && media.matches)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#020617' : '#4f46e5')
}
applyTheme()
media.addEventListener('change', applyTheme)
subscribe(applyTheme)

// ---- Long-idle protection for timers left running ----
capIdleTimers()
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') capIdleTimers()
})

// ---- Optional cloud sync (no-op when Supabase isn't configured) ----
startSync()

// ---- Service worker (production only) ----
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => console.warn('SW registration failed', err))
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
