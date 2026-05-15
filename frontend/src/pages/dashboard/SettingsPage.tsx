import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { buildLoginRedirectPath } from '../../lib/auth/redirect'
import {
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  decreaseFontScale,
  getStoredFontScale,
  increaseFontScale,
  resetFontScale,
} from '../../lib/font-scale'
import styles from './dashboard.module.css'

type SessionUser = {
  id: string
  email: string
  role: string
}

export function SettingsPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fontScale, setFontScale] = useState(() => getStoredFontScale())
  const fontScaleSteps = Array.from(
    { length: Math.round((MAX_FONT_SCALE - MIN_FONT_SCALE) / 0.05) + 1 },
    (_, index) => Number((MIN_FONT_SCALE + index * 0.05).toFixed(2)),
  )

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
          setError('Não foi possível carregar as configurações da conta.')
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

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.header}>
          <div>
            <span className={styles.kicker}>Configurações</span>
            <h1 className={styles.title}>Conta e acesso</h1>
          </div>

          <div className={styles.headerActions}>
            <Link className={styles.actionLink} to="/dashboard">
              Voltar
            </Link>
          </div>
        </div>

        {error ? <p className={styles.adminError}>{error}</p> : null}

        {loading ? (
          <p className={styles.copy}>Carregando configurações da conta.</p>
        ) : user ? (
          <div className={styles.grid}>
            <article className={styles.card}>
              <span className={styles.label}>Conta ativa</span>
              <strong className={styles.value}>{user.email}</strong>
              <p className={styles.copy}>
                Esta conta está habilitada para acessar a pesquisa inteligente de notícias,
                sínteses assistidas por IA e recursos associados ao Portal Escarlate.
              </p>
            </article>

            <article className={styles.card}>
              <span className={styles.label}>Perfil</span>
              <strong className={styles.value}>
                {user.role === 'admin' ? 'Administrador' : 'Usuário'}
              </strong>
              <p className={styles.copy}>
                As permissões deste perfil definem quais áreas administrativas e recursos
                operacionais ficam disponíveis na plataforma.
              </p>
            </article>

            <article className={styles.cardWide}>
              <span className={styles.label}>Aparência</span>
              <strong className={styles.value}>Tamanho do texto</strong>
              <p className={styles.copy}>
                Ajuste a escala das fontes para melhorar a leitura. A preferência fica salva
                neste navegador para os próximos acessos.
              </p>
              <div className={styles.settingsControlRow}>
                <button
                  className={styles.fontScaleButton}
                  type="button"
                  aria-label="Diminuir tamanho do texto"
                  disabled={fontScale <= MIN_FONT_SCALE}
                  onClick={() => setFontScale(decreaseFontScale(fontScale))}
                >
                  a
                </button>
                <div
                  className={styles.fontScaleTrack}
                  aria-label="Escala atual do texto"
                  role="img"
                >
                  {fontScaleSteps.map((step) => (
                    <span
                      className={`${styles.fontScaleDot} ${
                        step <= fontScale ? styles.fontScaleDotActive : ''
                      }`}
                      key={step}
                    />
                  ))}
                </div>
                <button
                  className={styles.fontScaleButton}
                  type="button"
                  aria-label="Aumentar tamanho do texto"
                  disabled={fontScale >= MAX_FONT_SCALE}
                  onClick={() => setFontScale(increaseFontScale(fontScale))}
                >
                  A
                </button>
                <button
                  className={styles.newsPageButton}
                  type="button"
                  onClick={() => setFontScale(resetFontScale())}
                >
                  Padrão
                </button>
              </div>
            </article>

            {user.role === 'admin' ? (
              <article className={styles.cardWide}>
                <span className={styles.label}>Administração</span>
                <strong className={styles.value}>Ferramentas da plataforma</strong>
                <p className={styles.copy}>
                  Gerencie conexões de e-mail para envios automáticos e acompanhe métricas
                  de pesquisa agregadas por usuário e tema.
                </p>
                <div className={styles.adminButtonGroup}>
                  <Link className={styles.adminButton} to="/admin/email-connections">
                    Conexões
                  </Link>
                  <Link className={styles.adminButton} to="/admin/news-metrics">
                    Métricas
                  </Link>
                </div>
              </article>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  )
}
