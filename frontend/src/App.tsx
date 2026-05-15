import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AuthPortal } from './components/auth/AuthPortal'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { EmailConnectionsPage } from './pages/dashboard/EmailConnectionsPage'
import { NewsMetricsPage } from './pages/dashboard/NewsMetricsPage'
import { FictionalNewsPage } from './pages/news/FictionalNewsPage'
import { NewsSummaryPage } from './pages/news-summary/NewsSummaryPage'
import { NewsSummaryPreparePage } from './pages/news-summary/NewsSummaryPreparePage'
import { TermsPage } from './pages/terms/TermsPage'
import { VerifyEmailPage } from './pages/verify-email/VerifyEmailPage'
import { apiFetch } from './lib/api'
import { sanitizeLoginRedirect } from './lib/auth/redirect'

function AuthEntryPage({ initialMode, loginNotice }: { initialMode?: 'login'; loginNotice?: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    async function checkExistingSession() {
      try {
        const response = await apiFetch('/api/auth/me', {
          signal: controller.signal,
        })

        if (response.ok) {
          const redirectTo = sanitizeLoginRedirect(new URLSearchParams(location.search).get('redirect'))
          navigate(redirectTo, { replace: true })
          return
        }
      } catch {
        // Sem sessao valida: exibe o login normalmente.
      } finally {
        if (!controller.signal.aborted) {
          setCheckingSession(false)
        }
      }
    }

    checkExistingSession()

    return () => controller.abort()
  }, [location.search, navigate])

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
      <Route path="/news/summary/prepare" element={<NewsSummaryPreparePage />} />
      <Route path="/news/summary" element={<NewsSummaryPage />} />
      <Route path="/admin/email-connections" element={<EmailConnectionsPage />} />
      <Route path="/admin/news-metrics" element={<NewsMetricsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
