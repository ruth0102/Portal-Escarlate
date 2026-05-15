import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { NewsSearch, clearNewsSearchStorage } from './NewsSearch'
import { apiFetch } from '../../lib/api'
import { buildLoginRedirectPath } from '../../lib/auth/redirect'
import styles from './dashboard.module.css'

type SessionUser = {
  id: string
  email: string
  role: string
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [logoutError, setLogoutError] = useState('')
  const [logoutLoading, setLogoutLoading] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    async function loadSession() {
      try {
        const response = await apiFetch('/api/auth/me', {
          signal: controller.signal,
        })

        if (!response.ok) {
          navigate(buildLoginRedirectPath(), { replace: true })
          return
        }

        const payload = (await response.json()) as { user: SessionUser }
        setUser(payload.user)
      } catch {
        if (!controller.signal.aborted) {
          navigate(buildLoginRedirectPath(), { replace: true })
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadSession()

    return () => controller.abort()
  }, [navigate])

  async function handleLogout() {
    setLogoutError('')
    setLogoutLoading(true)

    try {
      const response = await apiFetch('/api/auth/logout', { method: 'POST' })

      if (!response.ok) {
        throw new Error('Falha ao encerrar a sessão.')
      }

      clearNewsSearchStorage()
      navigate('/login', { replace: true })
    } catch {
      setLogoutError('Não foi possível sair agora. Tente novamente.')
    } finally {
      setLogoutLoading(false)
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <section className={styles.panel}>
          <span className={styles.kicker}>Ala reservada</span>
          <h1 className={styles.title}>Carregando sessão</h1>
        </section>
      </main>
    )
  }

  if (!user) {
    return null
  }

  return (
    <main className={styles.page}>
      <section className={`${styles.panel} ${styles.dashboardPanel}`}>
        <div className={styles.header}>
          <div>
            <span className={styles.kicker}>Ala reservada</span>
            <h1 className={styles.title}>Portal Escarlate</h1>
          </div>

          <div className={styles.headerActions}>
            <Link className={styles.action} to="/configuracoes">
              Configurações
            </Link>

            <button
              className={styles.action}
              type="button"
              onClick={handleLogout}
              disabled={logoutLoading}
            >
              {logoutLoading ? 'Saindo...' : 'Sair'}
            </button>
          </div>
        </div>

        {logoutError ? <p className={styles.adminError}>{logoutError}</p> : null}

        <div className={styles.grid}>
          <article className={styles.cardWide}>
            <span className={styles.label}>Central de pesquisa</span>
            <strong className={styles.value}>Notícias, contexto e síntese editorial</strong>
            <p className={styles.copy}>
              Pesquise temas relevantes, navegue por resultados paginados e acompanhe uma
              síntese objetiva da página atual.
            </p>

            <NewsSearch />
          </article>
        </div>

        <div className={styles.mobileDashboardActions}>
          <Link className={styles.action} to="/configuracoes">
            Configurações
          </Link>

          <button
            className={styles.action}
            type="button"
            onClick={handleLogout}
            disabled={logoutLoading}
          >
            {logoutLoading ? 'Saindo...' : 'Sair'}
          </button>
        </div>
      </section>
    </main>
  )
}
