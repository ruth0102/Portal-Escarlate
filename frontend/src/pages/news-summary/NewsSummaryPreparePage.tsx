import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { buildLoginRedirectPath } from '../../lib/auth/redirect'
import styles from './news-summary.module.css'

type StoredNewsArticle = {
  shortId: string
  title: string
  description: string
  url: string
  urlToImage?: string
  source: string
  publishedAt: string
  author?: string
}

type StoredPageState = {
  articles?: StoredNewsArticle[]
}

type ArticleSummaryCreateResponse = {
  summaryId?: string
  message?: string
}

const PAGE_STATE_KEY = 'portal-escarlate:news-search-page-state'

function loadStoredArticle(shortId: string) {
  try {
    const raw = window.localStorage.getItem(PAGE_STATE_KEY)
    const storedState = raw ? (JSON.parse(raw) as StoredPageState) : null
    const articles = Array.isArray(storedState?.articles) ? storedState.articles : []

    return articles.find((article) => article.shortId === shortId) ?? null
  } catch {
    return null
  }
}

export function NewsSummaryPreparePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [message, setMessage] = useState('Preparando a notícia para análise.')
  const [error, setError] = useState('')

  useEffect(() => {
    const shortId = searchParams.get('id')?.trim() || ''

    if (!shortId) {
      setError('Notícia não informada para resumo.')
      return undefined
    }

    const article = loadStoredArticle(shortId)

    if (!article) {
      setError('Não foi possível localizar a notícia nesta sessão para gerar o resumo.')
      return undefined
    }

    const articleForSummary = article
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      controller.abort()
      setError('A geração do resumo demorou mais que o esperado. Tente novamente.')
    }, 60000)

    async function prepareSummary() {
      setMessage('Gerando resumo com inteligência artificial.')

      try {
        const response = await apiFetch('/api/news/summarize', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            title: articleForSummary.title,
            url: articleForSummary.url,
            urlToImage: articleForSummary.urlToImage ?? '',
            description: articleForSummary.description,
            source: articleForSummary.source,
            publishedAt: articleForSummary.publishedAt,
            author: articleForSummary.author ?? '',
          }),
          signal: controller.signal,
        })
        const payload = (await response.json().catch(() => ({}))) as ArticleSummaryCreateResponse

        if (!response.ok || !payload.summaryId) {
          if (response.status === 401) {
            window.clearTimeout(timeout)
            navigate(buildLoginRedirectPath(), { replace: true })
            return
          }

          setError(payload.message ?? 'Não foi possível gerar o resumo da notícia.')
          return
        }

        setMessage('Resumo encontrado. Abrindo leitura.')
        window.clearTimeout(timeout)
        navigate(`/news/summary?id=${encodeURIComponent(payload.summaryId)}`, { replace: true })
      } catch {
        if (!controller.signal.aborted) {
          setError('Serviço de resumo indisponível no momento.')
        }
      }
    }

    void prepareSummary()

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [navigate, searchParams])

  if (error) {
    return (
      <main className={styles.page}>
        <section className={styles.errorContainer}>
          <h1 className={styles.errorTitle}>Erro ao preparar resumo</h1>
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
      <section className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p className={styles.loadingText}>{message}</p>
      </section>
    </main>
  )
}
