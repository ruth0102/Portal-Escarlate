import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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
    return 'Valida'
  }

  if (status === 'expired') {
    return 'Expirada'
  }

  if (status === 'inactive') {
    return 'Inativa'
  }

  return 'Indisponivel'
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
      return 'Conexao Google cadastrada com sucesso.'
    }

    if (googleStatus === 'failed') {
      return 'Nao foi possivel concluir a conexao com o Google.'
    }

    if (googleStatus === 'invalid') {
      return 'A conexao Google expirou ou nao foi autorizada.'
    }

    return ''
  }, [googleStatus])

  async function loadConnections(signal?: AbortSignal) {
    const response = await fetch('/api/email-connections', { signal })
    const payload = (await response.json().catch(() => ({}))) as {
      connections?: EmailConnection[]
      message?: string
    }

    if (!response.ok) {
      throw new Error(payload.message ?? 'Nao foi possivel carregar as conexoes.')
    }

    setConnections(payload.connections ?? [])
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

        await loadConnections(controller.signal)
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar conexoes.')
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
      const response = await fetch('/api/email-connections/google/start', {
        method: 'POST',
      })
      const payload = (await response.json().catch(() => ({}))) as {
        url?: string
        message?: string
      }

      if (!response.ok || !payload.url) {
        throw new Error(payload.message ?? 'Nao foi possivel iniciar a conexao Google.')
      }

      window.location.assign(payload.url)
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : 'Nao foi possivel iniciar a conexao Google.',
      )
    }
  }

  async function handleRefresh() {
    setError('')
    setMessage('')

    try {
      await loadConnections()
      setMessage('Status das conexoes atualizado.')
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Nao foi possivel atualizar as conexoes.',
      )
    }
  }

  async function handlePriority(connection: EmailConnection, direction: -1 | 1) {
    const nextPriority = Math.max(1, connection.priority + direction)
    setBusyId(connection.id)
    setError('')
    setMessage('')

    try {
      const response = await fetch(`/api/email-connections/${connection.id}/priority`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ priority: nextPriority }),
      })
      const payload = (await response.json().catch(() => ({}))) as { message?: string }

      if (!response.ok) {
        throw new Error(payload.message ?? 'Nao foi possivel alterar a prioridade.')
      }

      await loadConnections()
      setMessage('Prioridade atualizada.')
    } catch (priorityError) {
      setError(
        priorityError instanceof Error
          ? priorityError.message
          : 'Nao foi possivel alterar a prioridade.',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(connection: EmailConnection) {
    const confirmed = window.confirm(`Remover a conexao ${connection.email}?`)

    if (!confirmed) {
      return
    }

    setBusyId(connection.id)
    setError('')
    setMessage('')

    try {
      const response = await fetch(`/api/email-connections/${connection.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string }
        throw new Error(payload.message ?? 'Nao foi possivel remover a conexao.')
      }

      await loadConnections()
      setMessage('Conexao removida.')
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Nao foi possivel remover a conexao.',
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
            <span className={styles.kicker}>Administracao</span>
            <h1 className={styles.title}>Conexoes de e-mail</h1>
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
            Testar conexoes
          </button>
        </div>

        {loading ? (
          <p className={styles.copy}>Carregando conexoes cadastradas.</p>
        ) : connections.length === 0 ? (
          <p className={styles.copy}>Nenhuma conexao de e-mail cadastrada.</p>
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
