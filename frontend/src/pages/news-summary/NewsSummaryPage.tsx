import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import styles from './news-summary.module.css'

type SummaryState = 'loading' | 'success' | 'error'

type StoredNewsArticle = {
  shortId: string
  title: string
  description: string
  url: string
  source: string
  publishedAt: string
  author?: string
}

type StoredPageState = {
  query?: string
  articles?: StoredNewsArticle[]
}

const PAGE_STATE_KEY = 'portal-escarlate:news-search-page-state'

interface SummaryData {
  title: string
  author: string
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

  useEffect(() => {
    const controller = new AbortController()

    async function loadSummary() {
      try {
        const idParam = searchParams.get('id')?.trim() || ''

        let storedState: StoredPageState | null = null

        try {
          const raw = window.localStorage.getItem(PAGE_STATE_KEY)
          storedState = raw ? (JSON.parse(raw) as StoredPageState) : null
        } catch {
          storedState = null
        }

        const articles = Array.isArray(storedState?.articles) ? storedState.articles : []
        const article = idParam ? articles.find((item) => item.shortId === idParam) : undefined

        if (!article) {
          setState('error')
          setError('Não foi possível localizar a notícia no localStorage para gerar o resumo.')
          return
        }

        const response = await fetch('/api/news/summarize', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            title: article.title,
            url: article.url,
            description: article.description,
            source: article.source,
            publishedAt: article.publishedAt,
            author: article.author ?? '',
          }),
          signal: controller.signal,
        })

        const payload = (await response.json().catch(() => ({}))) as
          | SummaryData
          | { message?: string }

        if (!response.ok) {
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
      } catch (err) {
        if (!controller.signal.aborted) {
          setState('error')
          setError('Erro ao carregar o resumo da notícia.')
        }
      }
    }

    loadSummary()

    return () => controller.abort()
  }, [searchParams])

  if (state === 'loading') {
    return (
      <main className={styles.page}>
        <section className={styles.loadingContainer}>
          <div className={styles.spinner} />
          <p className={styles.loadingText}>Gerando resumo com inteligência artificial...</p>
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
