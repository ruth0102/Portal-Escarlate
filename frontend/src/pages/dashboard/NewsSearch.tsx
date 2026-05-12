import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import styles from './dashboard.module.css'

type NewsArticle = {
  title: string
  description: string
  url: string
  source: string
  publishedAt: string
}

type SearchResponse = {
  articles?: NewsArticle[]
  totalResults?: number
  totalPages?: number
  page?: number
  pageSize?: number
  message?: string
}

type SearchHistoryResponse = {
  queries?: string[]
  message?: string
}

type AiSummaryResponse = {
  summary?: string
  message?: string
}

const previewArticles: NewsArticle[] = [
  {
    title: 'A curadoria de noticias sera conectada ao backend',
    description:
      'A interface ja replica o painel do projeto Next. A proxima etapa liga a NewsAPI no backend separado.',
    url: '#',
    source: 'Portal Escarlate',
    publishedAt: new Date().toISOString(),
  },
]

const SEARCH_HISTORY_KEY = 'portal-escarlate:news-search-history'
const MAX_HISTORY_ITEMS = 10

export function clearNewsSearchHistoryStorage() {
  window.localStorage.removeItem(SEARCH_HISTORY_KEY)
}

function formatPublishedAt(value: string) {
  if (!value) {
    return 'Horario nao informado'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Horario nao informado'
  }

  return date.toLocaleString('pt-BR')
}

function loadSearchHistory() {
  try {
    const raw = window.localStorage.getItem(SEARCH_HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : []

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

function saveSearchHistory(history: string[]) {
  window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history))
}

function mergeSearchHistory(primary: string[], secondary: string[]) {
  const next: string[] = []

  for (const item of [...primary, ...secondary]) {
    const normalized = item.trim()

    if (
      normalized.length >= 2 &&
      !next.some((current) => current.toLowerCase() === normalized.toLowerCase())
    ) {
      next.push(normalized)
    }
  }

  return next.slice(0, MAX_HISTORY_ITEMS)
}

export function NewsSearch() {
  const newsSearchRef = useRef<HTMLDivElement | null>(null)
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [articles, setArticles] = useState<NewsArticle[]>(previewArticles)
  const [hasSearched, setHasSearched] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalResults, setTotalResults] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [aiSummary, setAiSummary] = useState('')
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false)
  const [aiSummaryError, setAiSummaryError] = useState('')

  const canSubmit = useMemo(() => query.trim().length >= 2 && !loading, [query, loading])
  const suggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return history.slice(0, 6)
    }

    return history
      .filter((item) => item.toLowerCase().includes(normalizedQuery))
      .slice(0, 6)
  }, [history, query])

  useEffect(() => {
    const localHistory = loadSearchHistory()
    setHistory(localHistory)

    const controller = new AbortController()

    async function loadRemoteHistory() {
      try {
        const response = await fetch('/api/news/search/history', {
          signal: controller.signal,
        })

        if (!response.ok) {
          return
        }

        const data = (await response.json().catch(() => ({}))) as SearchHistoryResponse
        const remoteHistory = Array.isArray(data.queries)
          ? data.queries.filter((item): item is string => typeof item === 'string')
          : []
        const merged = mergeSearchHistory(remoteHistory, localHistory)

        setHistory(merged)
        saveSearchHistory(merged)
      } catch {
        if (!controller.signal.aborted) {
          setHistory(localHistory)
        }
      }
    }

    loadRemoteHistory()

    return () => controller.abort()
  }, [])

  function rememberSearch(value: string) {
    const normalized = value.trim()

    if (normalized.length < 2) {
      return
    }

    setHistory((current) => {
      const next = [
        normalized,
        ...current.filter((item) => item.toLowerCase() !== normalized.toLowerCase()),
      ].slice(0, MAX_HISTORY_ITEMS)

      saveSearchHistory(next)
      return next
    })
  }

  async function summarizePage(input: { query: string; articles: NewsArticle[] }) {
    const summarizableArticles = input.articles.filter(
      (article) => article.title || article.description,
    )

    if (summarizableArticles.length === 0) {
      setAiSummary('')
      setAiSummaryError('')
      return
    }

    setAiSummary('')
    setAiSummaryError('')
    setAiSummaryLoading(true)

    try {
      const response = await fetch('/api/news-summary', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: input.query,
          articles: summarizableArticles.map((article) => ({
            title: article.title,
            description: article.description,
            source: article.source,
            publishedAt: article.publishedAt,
          })),
        }),
      })

      const data = (await response.json().catch(() => ({}))) as AiSummaryResponse & {
        error?: string
      }

      if (!response.ok) {
        setAiSummaryError(data.message ?? data.error ?? 'Nao foi possivel gerar o resumo da pagina.')
        return
      }

      setAiSummary(data.summary ?? '')
    } catch {
      setAiSummaryError('Servico de IA indisponivel para resumir esta pagina.')
    } finally {
      setAiSummaryLoading(false)
    }
  }

  async function searchNews(input: { query: string; page: number; isSearch: boolean }) {
    setError('')
    setAiSummary('')
    setAiSummaryError('')
    setHasSearched(true)
    setLoading(true)

    try {
      const response = await fetch('/api/news/search', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: input.query,
          page: input.page,
          isSearch: input.isSearch,
        }),
      })

      const data = (await response.json().catch(() => ({}))) as SearchResponse

      if (!response.ok) {
        setArticles(previewArticles)
        setError(
          data.message ??
            (response.status === 404
              ? 'Backend de noticias ainda nao foi migrado.'
              : 'Falha ao buscar noticias.'),
        )
        return
      }

      const nextArticles = data.articles ?? []

      setArticles(nextArticles)
      setActiveQuery(input.query)
      rememberSearch(input.query)
      setPage(data.page ?? input.page)
      setTotalPages(data.totalPages ?? 1)
      setTotalResults(data.totalResults ?? 0)
      setPageSize(data.pageSize ?? 20)
      void summarizePage({ query: input.query, articles: nextArticles })
    } catch {
      setArticles(previewArticles)
      setError('Backend de noticias ainda nao esta disponivel.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSuggestionsOpen(false)
    await searchNews({ query: query.trim(), page: 1, isSearch: true })
  }

  async function selectSuggestion(value: string) {
    setQuery(value)
    setSuggestionsOpen(false)
    await searchNews({ query: value, page: 1, isSearch: true })
  }

  async function goToPage(nextPage: number) {
    const normalizedPage = Math.min(Math.max(nextPage, 1), totalPages)
    const queryToUse = activeQuery || query.trim()

    if (!queryToUse || normalizedPage === page || loading) {
      return
    }

    await searchNews({ query: queryToUse, page: normalizedPage, isSearch: false })

    window.history.replaceState(null, '', '#news-search')
    window.requestAnimationFrame(() => {
      newsSearchRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  return (
    <div id="news-search" className={styles.newsBox} ref={newsSearchRef}>
      <form className={styles.newsForm} onSubmit={handleSubmit}>
        <label className={styles.newsLabel} htmlFor="news-query">
          Buscar noticias recentes
        </label>

        <div className={styles.newsControls}>
          <div className={styles.newsInputWrap}>
            <input
              id="news-query"
              className={styles.newsInput}
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value)
                setSuggestionsOpen(true)
              }}
              onFocus={() => setSuggestionsOpen(true)}
              onBlur={() => {
                window.setTimeout(() => setSuggestionsOpen(false), 120)
              }}
              placeholder="Ex.: politica, economia, transparencia"
              autoComplete="off"
            />

            {suggestionsOpen && suggestions.length > 0 ? (
              <div className={styles.newsSuggestions} role="listbox">
                {suggestions.map((item) => (
                  <button
                    className={styles.newsSuggestion}
                    type="button"
                    key={item}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSuggestion(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button className={styles.newsButton} type="submit" disabled={!canSubmit}>
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </form>

      {error ? <p className={styles.newsError}>{error}</p> : null}

      {hasSearched && !loading && !error && articles.length === 0 ? (
        <p className={styles.newsHint}>Nenhuma noticia encontrada para este termo.</p>
      ) : null}

      {hasSearched && !error ? (
        <div className={styles.newsPaginationSummary}>
          <span>
            Pagina {page} de {totalPages} • {totalResults} resultados encontrados • {pageSize} por
            pagina
          </span>
        </div>
      ) : null}

      {hasSearched && !error ? (
        <section className={styles.aiSummaryBox} aria-live="polite">
          <span className={styles.aiSummaryLabel}>Sintese da pagina</span>
          {aiSummaryLoading ? (
            <p className={styles.aiSummaryText}>Gerando resumo central das noticias...</p>
          ) : aiSummary ? (
            <p className={styles.aiSummaryText}>{aiSummary}</p>
          ) : aiSummaryError ? (
            <p className={styles.aiSummaryError}>{aiSummaryError}</p>
          ) : (
            <p className={styles.aiSummaryText}>
              A sintese sera exibida aqui quando houver noticias para resumir.
            </p>
          )}
        </section>
      ) : null}

      {articles.length > 0 ? (
        <>
          <ul className={styles.newsList}>
            {articles.map((article) => (
              <li className={styles.newsItem} key={article.url + article.title}>
                <a
                  className={styles.newsLink}
                  href={article.url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {article.title}
                </a>
                <p className={styles.newsMeta}>
                  {article.source} • {formatPublishedAt(article.publishedAt)}
                </p>
                {article.description ? (
                  <p className={styles.newsDescription}>{article.description}</p>
                ) : null}
              </li>
            ))}
          </ul>

          {hasSearched && totalPages > 1 ? (
            <div className={styles.newsPagination}>
              <button
                className={styles.newsPageButton}
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => goToPage(page - 1)}
              >
                Anterior
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                className={styles.newsPageButton}
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => goToPage(page + 1)}
              >
                Proxima
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
