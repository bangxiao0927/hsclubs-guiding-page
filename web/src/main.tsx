import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { Header } from './components/Header'
import { StatusPage } from './components/StatusPage'
import { useTheme } from './useTheme'
import './index.css'

const StatusApp = () => {
  const [theme, toggleTheme] = useTheme()
  return (
    <>
      <Header title="HS Clubs" theme={theme} onToggleTheme={toggleTheme} />
      <StatusPage />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.pathname === '/status' ? <StatusApp /> : <App />}
  </StrictMode>,
)
