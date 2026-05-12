import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NewsSearch } from './NewsSearch'
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

  useEffect(() => {
    const controller = new AbortController()

    async function loadSession() {
      try {
        const response = await fetch('/api/auth/me', {
          signal: controller.signal,
        })

        if (!response.ok) {
          navigate('/', { replace: true })
          return
        }

        const payload = (await response.json()) as { user: SessionUser }
        setUser(payload.user)
      } catch {
        if (!controller.signal.aborted) {
          navigate('/', { replace: true })
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
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    navigate('/', { replace: true })
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <section className={styles.panel}>
          <span className={styles.kicker}>Ala reservada</span>
          <h1 className={styles.title}>Carregando sessao</h1>
        </section>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.header}>
          <div>
            <span className={styles.kicker}>Ala reservada</span>
            <h1 className={styles.title}>Portal Escarlate</h1>
          </div>

          <button className={styles.action} type="button" onClick={handleLogout}>
            Sair
          </button>
        </div>

        <div className={styles.grid}>
          <article className={styles.card}>
            <span className={styles.label}>Conta ativa</span>
            <strong className={styles.value}>{user?.email}</strong>
            <p className={styles.copy}>
              Acesso liberado para acompanhar buscas, sinteses e historico de curadoria do
              Portal Escarlate.
            </p>
          </article>

          <article className={styles.card}>
            <span className={styles.label}>Perfil</span>
            <strong className={styles.value}>
              {user?.role === 'admin' ? 'Administrador' : 'Usuario'}
            </strong>
            <p className={styles.copy}>
              Permissoes aplicadas para organizar o acesso aos recursos editoriais e de
              pesquisa.
            </p>
          </article>

          <article className={styles.cardWide}>
            <span className={styles.label}>Central de pesquisa</span>
            <strong className={styles.value}>Noticias, contexto e sintese editorial</strong>
            <p className={styles.copy}>
              Pesquise temas relevantes, navegue por resultados paginados e acompanhe uma
              sintese objetiva da pagina atual.
            </p>

            <NewsSearch />
          </article>
        </div>
      </section>
    </main>
  )
}
