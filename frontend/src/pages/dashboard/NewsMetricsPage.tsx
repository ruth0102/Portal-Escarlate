import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import styles from './dashboard.module.css'

type SessionUser = {
  id: string
  email: string
  role: string
}

type ThemeMetric = {
  theme: string
  totalSearches: number
  uniqueUsers: number
}

type UserMetric = {
  email: string
  totalSearches: number
  themes: Array<{
    theme: string
    totalSearches: number
  }>
}

type NewsMetricsResponse = {
  generatedAt: string
  totalSearches: number
  themes: ThemeMetric[]
  users: UserMetric[]
  message?: string
}

function BarRow(props: {
  label: string
  value: number
  max: number
  secondary?: string
  selected?: boolean
  onClick?: () => void
}) {
  const width = props.max > 0 ? Math.max(4, Math.round((props.value / props.max) * 100)) : 0

  return (
    <button
      className={`${styles.metricRow} ${props.selected ? styles.metricRowSelected : ''}`}
      type="button"
      onClick={props.onClick}
      disabled={!props.onClick}
    >
      <div className={styles.metricRowHeader}>
        <span>{props.label}</span>
        <strong>{props.value}</strong>
      </div>
      <div className={styles.metricTrack}>
        <span className={styles.metricBar} style={{ width: `${width}%` }} />
      </div>
      {props.secondary && <span className={styles.metricSecondary}>{props.secondary}</span>}
    </button>
  )
}

export function NewsMetricsPage() {
  const navigate = useNavigate()
  const [metrics, setMetrics] = useState<NewsMetricsResponse | null>(null)
  const [selectedUserEmail, setSelectedUserEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const selectedUser = useMemo(
    () => metrics?.users.find((item) => item.email === selectedUserEmail) ?? metrics?.users[0],
    [metrics, selectedUserEmail],
  )

  const maxThemeSearches = Math.max(0, ...(metrics?.themes.map((theme) => theme.totalSearches) ?? []))
  const maxThemeUsers = Math.max(0, ...(metrics?.themes.map((theme) => theme.uniqueUsers) ?? []))
  const maxUserSearches = Math.max(0, ...(metrics?.users.map((item) => item.totalSearches) ?? []))
  const maxSelectedUserThemeSearches = Math.max(
    0,
    ...(selectedUser?.themes.map((theme) => theme.totalSearches) ?? []),
  )

  async function loadMetrics(signal?: AbortSignal) {
    const response = await fetch('/api/news/metrics', { signal })
    const payload = (await response.json().catch(() => ({}))) as NewsMetricsResponse

    if (!response.ok) {
      throw new Error(payload.message ?? 'Nao foi possivel carregar as metricas.')
    }

    setMetrics(payload)
    setSelectedUserEmail((current) => current || payload.users[0]?.email || '')
  }

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const sessionResponse = await fetch('/api/auth/me', {
          signal: controller.signal,
        })

        if (!sessionResponse.ok) {
          navigate('/', { replace: true })
          return
        }

        const sessionPayload = (await sessionResponse.json()) as { user: SessionUser }

        if (sessionPayload.user.role !== 'admin') {
          navigate('/dashboard', { replace: true })
          return
        }

        await loadMetrics(controller.signal)
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar metricas.')
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    load()

    return () => controller.abort()
  }, [navigate])

  async function handleRefresh() {
    setError('')

    try {
      setLoading(true)
      await loadMetrics()
    } catch (refreshError) {
      setError(
        refreshError instanceof Error ? refreshError.message : 'Nao foi possivel atualizar metricas.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.header}>
          <div>
            <span className={styles.kicker}>Administracao</span>
            <h1 className={styles.title}>Metricas de pesquisa</h1>
          </div>

          <div className={styles.headerActions}>
            <Link className={styles.actionLink} to="/dashboard">
              Voltar
            </Link>
            <button className={styles.action} type="button" onClick={handleRefresh}>
              Atualizar
            </button>
          </div>
        </div>

        {error && <p className={styles.adminError}>{error}</p>}

        {loading ? (
          <p className={styles.copy}>Gerando metricas com apoio da IA.</p>
        ) : !metrics || metrics.themes.length === 0 ? (
          <p className={styles.copy}>Ainda nao ha historico suficiente para gerar metricas.</p>
        ) : (
          <div className={styles.metricsGrid}>
            <article className={styles.metricPanel}>
              <span className={styles.label}>Temas por total de pesquisas</span>
              <strong className={styles.value}>{metrics.totalSearches} pesquisas</strong>
              <div className={styles.metricRows}>
                {metrics.themes.map((theme) => (
                  <BarRow
                    key={theme.theme}
                    label={theme.theme}
                    value={theme.totalSearches}
                    max={maxThemeSearches}
                    secondary={`${theme.uniqueUsers} usuario(s)`}
                  />
                ))}
              </div>
            </article>

            <article className={styles.metricPanel}>
              <span className={styles.label}>Temas por usuarios unicos</span>
              <strong className={styles.value}>1 por usuario em cada tema</strong>
              <div className={styles.metricRows}>
                {metrics.themes.map((theme) => (
                  <BarRow
                    key={theme.theme}
                    label={theme.theme}
                    value={theme.uniqueUsers}
                    max={maxThemeUsers}
                    secondary={`${theme.totalSearches} pesquisa(s) totais`}
                  />
                ))}
              </div>
            </article>

            <article className={styles.metricPanel}>
              <span className={styles.label}>Usuarios</span>
              <strong className={styles.value}>{metrics.users.length} usuario(s)</strong>
              <div className={styles.metricRows}>
                {metrics.users.map((metricUser) => (
                  <BarRow
                    key={metricUser.email}
                    label={metricUser.email}
                    value={metricUser.totalSearches}
                    max={maxUserSearches}
                    selected={metricUser.email === selectedUser?.email}
                    onClick={() => setSelectedUserEmail(metricUser.email)}
                  />
                ))}
              </div>
            </article>

            <article className={styles.metricPanel}>
              <span className={styles.label}>Temas do usuario</span>
              <strong className={styles.value}>{selectedUser?.email}</strong>
              <div className={styles.metricRows}>
                {selectedUser?.themes.map((theme) => (
                  <BarRow
                    key={theme.theme}
                    label={theme.theme}
                    value={theme.totalSearches}
                    max={maxSelectedUserThemeSearches}
                  />
                ))}
              </div>
            </article>
          </div>
        )}
      </section>
    </main>
  )
}
