import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthPortal } from './components/auth/AuthPortal'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { EmailConnectionsPage } from './pages/dashboard/EmailConnectionsPage'
import { NewsMetricsPage } from './pages/dashboard/NewsMetricsPage'
import { TermsPage } from './pages/terms/TermsPage'
import { VerifyEmailPage } from './pages/verify-email/VerifyEmailPage'

function HomePage() {
  return <AuthPortal />
}

function LoginPage() {
  const location = useLocation()
  const verified = new URLSearchParams(location.search).get('verified') === '1'

  return (
    <AuthPortal
      initialMode="login"
      loginNotice={verified ? 'E-mail verificado. Login liberado.' : undefined}
    />
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/termos-de-uso" element={<TermsPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/admin/email-connections" element={<EmailConnectionsPage />} />
      <Route path="/admin/news-metrics" element={<NewsMetricsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
