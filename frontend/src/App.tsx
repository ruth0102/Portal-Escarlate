import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AuthPortal } from './components/auth/AuthPortal'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { EmailConnectionsPage } from './pages/dashboard/EmailConnectionsPage'
import { NewsMetricsPage } from './pages/dashboard/NewsMetricsPage'
import { FictionalNewsPage } from './pages/news/FictionalNewsPage'
import { NewsSummaryPage } from './pages/news-summary/NewsSummaryPage'
import { TermsPage } from './pages/terms/TermsPage'
import { VerifyEmailPage } from './pages/verify-email/VerifyEmailPage'

function AuthEntryPage({ initialMode, loginNotice }: { initialMode?: 'login'; loginNotice?: string }) {
  const navigate = useNavigate()
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    async function loadSession() {
      try {
        const response = await fetch('/api/auth/me', {
          signal: controller.signal,
        })

        if (response.ok) {
          navigate('/dashboard', { replace: true })
          return
        }
      } catch {
        // fall through and render auth portal
      } finally {
        if (!controller.signal.aborted) {
          setCheckingSession(false)
        }
      }
    }

    loadSession()

    return () => controller.abort()
  }, [navigate])

  if (checkingSession) {
    return null
  }

  return <AuthPortal initialMode={initialMode} loginNotice={loginNotice} />
}

function HomePage() {
  return <AuthEntryPage />
}

function LoginPage() {
  const location = useLocation()
  const verified = new URLSearchParams(location.search).get('verified') === '1'

  return <AuthEntryPage initialMode="login" loginNotice={verified ? 'E-mail verificado. Login liberado.' : undefined} />
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/termos-de-uso" element={<TermsPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/news/portal-escarlate" element={<FictionalNewsPage />} />
      <Route path="/news/summary" element={<NewsSummaryPage />} />
      <Route path="/admin/email-connections" element={<EmailConnectionsPage />} />
      <Route path="/admin/news-metrics" element={<NewsMetricsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
