import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { buildLoginRedirectPath } from '../../lib/auth/redirect'
import styles from './news-summary.module.css'

type SummaryState = 'loading' | 'success' | 'error'

interface SummaryData {
  id?: string
  title: string
  author: string
  source?: string
  publishedAt?: string
  urlToImage: string
  url: string
  summary: string
  provider?: string
  model?: string
}

export function NewsSummaryPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<SummaryState>('loading')
  const [data, setData] = useState<SummaryData | null>(null)
  const [error, setError] = useState('')
  const [shareStatus, setShareStatus] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      controller.abort()
      setState('error')
      setError('O carregamento do resumo demorou mais que o esperado. Tente novamente.')
    }, 20000)

    async function loadSummary() {
      try {
        const idParam = searchParams.get('id')?.trim() || ''

        if (!idParam) {
          window.clearTimeout(timeout)
          setState('error')
          setError('Resumo não informado.')
          return
        }

        const response = await apiFetch(`/api/news/summaries/${encodeURIComponent(idParam)}`, {
          signal: controller.signal,
        })

        const payload = (await response.json().catch(() => ({}))) as SummaryData | { message?: string }

        if (!response.ok) {
          if (response.status === 401) {
            window.clearTimeout(timeout)
            navigate(buildLoginRedirectPath(), { replace: true })
            return
          }

          window.clearTimeout(timeout)
          setState('error')
          setError(
            'message' in payload
              ? payload.message ?? 'Não foi possível gerar o resumo.'
              : 'Não foi possível gerar o resumo.',
          )
          return
        }

        setData(payload as SummaryData)
        setState('success')
        window.clearTimeout(timeout)
      } catch (err) {
        if (!controller.signal.aborted) {
          setState('error')
          setError('Erro ao carregar o resumo da notícia.')
        }
      }
    }

    loadSummary()

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [searchParams])

  if (state === 'loading') {
    return (
      <main className={styles.page}>
        <section className={styles.loadingContainer}>
          <div className={styles.spinner} />
          <p className={styles.loadingText}>Carregando resumo com inteligência artificial...</p>
        </section>
      </main>
    )
  }

  if (state === 'error' || !data) {
    return (
      <main className={styles.page}>
        <section className={styles.errorContainer}>
          <h1 className={styles.errorTitle}>Erro ao carregar</h1>
          <p className={styles.errorMessage}>{error}</p>
          <button className={styles.backButton} type="button" onClick={() => navigate('/dashboard')}>
            Voltar para dashboard
          </button>
        </section>
      </main>
    )
  }

  const summaryData = data

  async function handleShare() {
    const shareUrl = window.location.href

    setShareStatus('')

    try {
      if (navigator.share) {
        await navigator.share({
          title: summaryData.title,
          text: 'Resumo da notícia no Portal Escarlate',
          url: shareUrl,
        })
        return
      }

      await navigator.clipboard.writeText(shareUrl)
      setShareStatus('Link copiado')
      window.setTimeout(() => setShareStatus(''), 2400)
    } catch {
      setShareStatus('Não foi possível compartilhar')
      window.setTimeout(() => setShareStatus(''), 2400)
    }
  }

  return (
    <main className={styles.page}>
      <article className={styles.summaryArticle}>
        <div className={styles.header}>
          <button
            className={styles.backLink}
            type="button"
            onClick={() => navigate('/dashboard')}
          >
            ← Voltar
          </button>
          <span className={styles.brandPill}>Portal Escarlate</span>
        </div>

        <section className={styles.hero}>
          {data.urlToImage ? (
            <img className={styles.featuredImage} src={data.urlToImage} alt={data.title} />
          ) : (
            <div className={styles.featuredFallback}>
              <span>Portal Escarlate</span>
              <strong>Imagem da notícia indisponível</strong>
            </div>
          )}

          <div className={styles.heroCopy}>
            <span className={styles.heroEyebrow}>Leitura guiada por IA</span>
            <h1 className={styles.title}>{data.title}</h1>
            <div className={styles.shareRow}>
              <button className={styles.shareButton} type="button" onClick={handleShare}>
                Compartilhar
              </button>
              {shareStatus ? <span className={styles.shareStatus}>{shareStatus}</span> : null}
            </div>
            <p className={styles.heroText}>
              Uma síntese objetiva da notícia, organizada para leitura rápida e clara.
            </p>

            <div className={styles.metaRow}>
              <span className={styles.author}>{data.author}</span>
              <span className={styles.aiCredit}>
                Resumo gerado por IA {data.model ? `(${data.model})` : ''}
              </span>
            </div>
          </div>
        </section>

        <div className={styles.content}>
          <div className={styles.summaryHeader}>
            <span className={styles.summaryLabel}>Síntese com IA</span>
            <div className={styles.metaNote}>
              <span>Resumo criado para leitura rápida</span>
              <span>{data.provider ? `Fonte IA: ${data.provider}` : 'Fonte IA: Portal Escarlate'}</span>
            </div>
          </div>

          <div className={styles.summaryText}>{data.summary}</div>

          <div className={styles.footer}>
            {data.url && (
              <a
                className={styles.readMore}
                href={data.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                Ler matéria completa →
              </a>
            )}
          </div>
        </div>
      </article>
    </main>
  )
}
