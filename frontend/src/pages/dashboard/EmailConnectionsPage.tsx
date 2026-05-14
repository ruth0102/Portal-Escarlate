import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { buildLoginRedirectPath } from '../../lib/auth/redirect'
import styles from './dashboard.module.css'

type SessionUser = {
  id: string
  email: string
  role: string
}

type EmailConnection = {
  id: string
  provider: string
  email: string
  active: boolean
  priority: number
  createdAt: string
  updatedAt: string
  health: {
    status: string
    message: string
  }
}

function getHealthLabel(status: string) {
  if (status === 'valid') {
    return 'Válida'
  }

  if (status === 'expired') {
    return 'Expirada'
  }

  if (status === 'inactive') {
    return 'Inativa'
  }

  return 'Indisponível'
}

export function EmailConnectionsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [connections, setConnections] = useState<EmailConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const googleStatus = searchParams.get('google')

  const googleMessage = useMemo(() => {
    if (googleStatus === 'connected') {
      return 'Conexão Google cadastrada com sucesso.'
    }

    if (googleStatus === 'failed') {
      return 'Não foi possível concluir a conexão com o Google.'
    }

    if (googleStatus === 'invalid') {
      return 'A conexão Google expirou ou não foi autorizada.'
    }

    return ''
  }, [googleStatus])

  async function loadConnections(signal?: AbortSignal) {
    const response = await apiFetch('/api/email-connections', { signal })
    const payload = (await response.json().catch(() => ({}))) as {
      connections?: EmailConnection[]
      message?: string
    }

    if (!response.ok) {
      throw new Error(payload.message ?? 'Não foi possível carregar as conexões.')
    }

    setConnections(payload.connections ?? [])
  }

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const sessionResponse = await apiFetch('/api/auth/me', {
          signal: controller.signal,
        })

        if (!sessionResponse.ok) {
          navigate(buildLoginRedirectPath(), { replace: true })
          return
        }

        const sessionPayload = (await sessionResponse.json()) as { user: SessionUser }

        if (sessionPayload.user.role !== 'admin') {
          navigate('/dashboard', { replace: true })
          return
        }

        await loadConnections(controller.signal)
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar conexões.')
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

  async function handleConnectGoogle() {
    setError('')
    setMessage('')

    try {
      const response = await apiFetch('/api/email-connections/google/start', {
        method: 'POST',
      })
      const payload = (await response.json().catch(() => ({}))) as {
        url?: string
        message?: string
      }

      if (!response.ok || !payload.url) {
        throw new Error(payload.message ?? 'Não foi possível iniciar a conexão Google.')
      }

      window.location.assign(payload.url)
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : 'Não foi possível iniciar a conexão Google.',
      )
    }
  }

  async function handleRefresh() {
    setError('')
    setMessage('')

    try {
      await loadConnections()
      setMessage('Status das conexões atualizado.')
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Não foi possível atualizar as conexões.',
      )
    }
  }

  async function handlePriority(connection: EmailConnection, direction: -1 | 1) {
    const nextPriority = Math.max(1, connection.priority + direction)
    setBusyId(connection.id)
    setError('')
    setMessage('')

    try {
      const response = await apiFetch(`/api/email-connections/${connection.id}/priority`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ priority: nextPriority }),
      })
      const payload = (await response.json().catch(() => ({}))) as { message?: string }

      if (!response.ok) {
        throw new Error(payload.message ?? 'Não foi possível alterar a prioridade.')
      }

      await loadConnections()
      setMessage('Prioridade atualizada.')
    } catch (priorityError) {
      setError(
        priorityError instanceof Error
          ? priorityError.message
          : 'Não foi possível alterar a prioridade.',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(connection: EmailConnection) {
    const confirmed = window.confirm(`Remover a conexão ${connection.email}?`)

    if (!confirmed) {
      return
    }

    setBusyId(connection.id)
    setError('')
    setMessage('')

    try {
      const response = await apiFetch(`/api/email-connections/${connection.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string }
        throw new Error(payload.message ?? 'Não foi possível remover a conexão.')
      }

      await loadConnections()
      setMessage('Conexão removida.')
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Não foi possível remover a conexão.',
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.header}>
          <div>
            <span className={styles.kicker}>Administração</span>
            <h1 className={styles.title}>Conexões de e-mail</h1>
          </div>

          <div className={styles.headerActions}>
            <Link className={styles.actionLink} to="/dashboard">
              Voltar
            </Link>
            <button className={styles.action} type="button" onClick={handleConnectGoogle}>
              Conectar Google
            </button>
          </div>
        </div>

        {(googleMessage || message || error) && (
          <p className={error ? styles.adminError : styles.adminMessage}>
            {error || googleMessage || message}
          </p>
        )}

        <div className={styles.connectionToolbar}>
          <button className={styles.newsButton} type="button" onClick={handleRefresh}>
            Testar conexões
          </button>
        </div>

        {loading ? (
          <p className={styles.copy}>Carregando conexões cadastradas.</p>
        ) : connections.length === 0 ? (
          <p className={styles.copy}>Nenhuma conexão de e-mail cadastrada.</p>
        ) : (
          <div className={styles.connectionList}>
            {connections.map((connection) => (
              <article className={styles.connectionItem} key={connection.id}>
                <div>
                  <span className={styles.label}>{connection.provider}</span>
                  <strong className={styles.value}>{connection.email}</strong>
                  <p className={styles.copy}>
                    Prioridade {connection.priority} • {getHealthLabel(connection.health.status)}
                  </p>
                  <p className={styles.connectionHealth}>{connection.health.message}</p>
                </div>

                <div className={styles.connectionActions}>
                  <button
                    className={styles.newsPageButton}
                    type="button"
                    disabled={busyId === connection.id || connection.priority <= 1}
                    onClick={() => handlePriority(connection, -1)}
                  >
                    Subir
                  </button>
                  <button
                    className={styles.newsPageButton}
                    type="button"
                    disabled={busyId === connection.id}
                    onClick={() => handlePriority(connection, 1)}
                  >
                    Descer
                  </button>
                  <button
                    className={styles.dangerButton}
                    type="button"
                    disabled={busyId === connection.id}
                    onClick={() => handleDelete(connection)}
                  >
                    Remover
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
