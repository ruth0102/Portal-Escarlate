import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import styles from './dashboard.module.css'

type NewsArticle = {
  shortId: string
  title: string
  description: string
  url: string
  urlToImage?: string
  source: string
  publishedAt: string
  author?: string
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

type SummarySegment = {
  shortId: string
  text: string
}

type AiSummaryResponse = {
  summary?: string
  markedSummary?: string
  segments?: SummarySegment[]
  message?: string
}

function LoadingSignal({ label }: { label: string }) {
  return (
    <span className={styles.loadingSignal} aria-hidden="true">
      <span className={styles.loadingCore} />
      <span className={styles.loadingOrbit} />
      <span className={styles.loadingLabel}>{label}</span>
    </span>
  )
}

const previewArticles: NewsArticle[] = [
  {
    shortId: 'preview-escarlate',
    title: 'Portal Escarlate lança plataforma de notícias inteligentes',
    description:
      'Portal Escarlate é uma plataforma de notícias para acompanhar assuntos relevantes em política, economia, ciência, cultura e outras áreas.',
    url: '/news/portal-escarlate',
    source: 'Portal Escarlate',
    publishedAt: new Date().toISOString(),
    author: 'Equipe Portal Escarlate',
  },
]

const SEARCH_HISTORY_KEY = 'portal-escarlate:news-search-history'
const MAX_HISTORY_ITEMS = 10
const PAGE_STATE_KEY = 'portal-escarlate:news-search-page-state'

export function clearNewsSearchHistoryStorage() {
  window.localStorage.removeItem(SEARCH_HISTORY_KEY)
}

export function clearNewsSearchPageStateStorage() {
  window.localStorage.removeItem(PAGE_STATE_KEY)
}

export function clearNewsSearchStorage() {
  clearNewsSearchHistoryStorage()
  clearNewsSearchPageStateStorage()
}

function formatPublishedAt(value: string) {
  if (!value) {
    return 'Horário não informado'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Horário não informado'
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

function loadPageState() {
  try {
    const raw = window.localStorage.getItem(PAGE_STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as null | {
      query?: string
      activeQuery?: string
      articles?: NewsArticle[]
      summary?: string
      markedSummary?: string
      summarySegments?: SummarySegment[]
      page?: number
      totalPages?: number
      totalResults?: number
      pageSize?: number
      hasSearched?: boolean
    }
  } catch {
    return null
  }
}

function savePageState(state: {
  query?: string
  activeQuery?: string
  articles?: NewsArticle[]
  summary?: string
  markedSummary?: string
  summarySegments?: SummarySegment[]
  page?: number
  totalPages?: number
  totalResults?: number
  pageSize?: number
  hasSearched?: boolean
}) {
  try {
    window.localStorage.setItem(PAGE_STATE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota errors
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

function createShortId(existingIds: string[] = []) {
  let candidate = ''

  do {
    candidate = Math.random().toString(36).slice(2, 8)
  } while (!candidate || existingIds.includes(candidate))

  return candidate
}

function attachShortIds(articles: NewsArticle[]) {
  const nextIds = new Set<string>()

  return articles.map((article) => {
    const shortId = article.shortId || createShortId(Array.from(nextIds))
    nextIds.add(shortId)
    return {
      ...article,
      shortId,
    }
  })
}

export function NewsSearch() {
  const navigate = useNavigate()
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
  const [markedAiSummary, setMarkedAiSummary] = useState('')
  const [typedAiSummary, setTypedAiSummary] = useState('')
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false)
  const [aiSummaryError, setAiSummaryError] = useState('')
  const [highlightedArticleId, setHighlightedArticleId] = useState('')

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
    const summaryForTyping = markedAiSummary || aiSummary

    if (!summaryForTyping) {
      setTypedAiSummary('')
      return
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTypedAiSummary(summaryForTyping)
      return
    }

    setTypedAiSummary('')

    let index = 0
    const chunkSize = Math.max(3, Math.ceil(summaryForTyping.length / 180))
    const timer = window.setInterval(() => {
      index += chunkSize
      setTypedAiSummary(summaryForTyping.slice(0, index))

      if (index >= summaryForTyping.length) {
        window.clearInterval(timer)
      }
    }, 18)

    return () => window.clearInterval(timer)
  }, [aiSummary, markedAiSummary])

  useEffect(() => {
    const localHistory = loadSearchHistory()
    setHistory(localHistory)

    const controller = new AbortController()

    async function loadRemoteHistory() {
      try {
        const response = await apiFetch('/api/news/search/history', {
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
    // attempt to restore saved page state
    const saved = loadPageState()
    if (saved) {
      if (Array.isArray(saved.articles) && saved.articles.length > 0) {
        const restoredArticles = attachShortIds(saved.articles)
        setArticles(restoredArticles)
        savePageState({
          query: saved.query,
          activeQuery: saved.activeQuery,
          articles: restoredArticles,
          summary: saved.summary,
          summarySegments: saved.summarySegments,
          page: saved.page,
          totalPages: saved.totalPages,
          totalResults: saved.totalResults,
          pageSize: saved.pageSize,
          hasSearched: saved.hasSearched,
        })
      }

      if (typeof saved.query === 'string') setQuery(saved.query)
      if (typeof saved.activeQuery === 'string') setActiveQuery(saved.activeQuery)
      if (typeof saved.summary === 'string') setAiSummary(saved.summary)
      if (typeof saved.markedSummary === 'string') setMarkedAiSummary(saved.markedSummary)
      if (typeof saved.page === 'number') setPage(saved.page)
      if (typeof saved.totalPages === 'number') setTotalPages(saved.totalPages)
      if (typeof saved.totalResults === 'number') setTotalResults(saved.totalResults)
      if (typeof saved.pageSize === 'number') setPageSize(saved.pageSize)
      if (saved.hasSearched) setHasSearched(true)
    }

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!highlightedArticleId) {
      return undefined
    }

    let ignoreInitialScroll = true
    const resetInitialScroll = window.setTimeout(() => {
      ignoreInitialScroll = false
    }, 700)

    function clearHighlightOnScroll() {
      if (ignoreInitialScroll) {
        return
      }

      setHighlightedArticleId('')
    }

    window.addEventListener('scroll', clearHighlightOnScroll, { passive: true })

    return () => {
      window.clearTimeout(resetInitialScroll)
      window.removeEventListener('scroll', clearHighlightOnScroll)
    }
  }, [highlightedArticleId])

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

  function getNavigationProps(url: string) {
    return url.startsWith('/') ? {} : { target: '_blank', rel: 'noreferrer noopener' }
  }

  async function openArticleSummary(article: NewsArticle) {
    if (article.shortId === 'preview-escarlate') {
      navigate(article.url)
      return
    }

    navigate(`/news/summary/prepare?id=${encodeURIComponent(article.shortId)}`)
  }

  function scrollToArticle(shortId: string) {
    const target = document.getElementById(`news-card-${shortId}`)

    if (!target) {
      return
    }

    target.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
    setHighlightedArticleId(shortId)
  }

  function handleSummarySegmentKeyDown(event: KeyboardEvent<HTMLSpanElement>, shortId: string) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    scrollToArticle(shortId)
  }

  function cleanVisibleSummarySegment(text: string, shortId: string) {
    const escapedShortId = shortId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    return text
      .replace(new RegExp(`\\s*\\(?\\[?${escapedShortId}\\]?\\)?\\s*`, 'gi'), ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }

  function renderMarkedSummaryInline(source: string) {
    const nodes: ReactNode[] = []
    const pattern = /\[\[([\s\S]+?)\]\]\(\(([^)]+)\)\)/g
    let cursor = 0
    let match

    while ((match = pattern.exec(source)) !== null) {
      if (match.index > cursor) {
        nodes.push(source.slice(cursor, match.index))
      }

      const segmentText = match[1] ?? ''
      const shortId = String(match[2] ?? '').trim()
      const visibleSegmentText = cleanVisibleSummarySegment(segmentText, shortId)

      if (!visibleSegmentText) {
        cursor = match.index + match[0].length
        continue
      }

      nodes.push(
        <span
          className={styles.aiSummarySegment}
          role="button"
          tabIndex={0}
          key={`${shortId}-${match.index}`}
          onClick={() => scrollToArticle(shortId)}
          onKeyDown={(event) => handleSummarySegmentKeyDown(event, shortId)}
          title="Ir para a notícia relacionada"
        >
          {visibleSegmentText}
        </span>,
      )

      cursor = match.index + match[0].length
    }

    if (cursor < source.length) {
      const tail = source.slice(cursor)
      nodes.push(tail.replace(/\[\[|\]\]\(\([^)]*$/g, ''))
    }

    return nodes
  }

  function renderTypedSummary() {
    const visibleSource = typedAiSummary

    if (!markedAiSummary) {
      return visibleSource.split(/\n{2,}/).map((paragraph, index) => (
        <p className={styles.aiSummaryParagraph} key={`${paragraph}-${index}`}>
          {paragraph}
        </p>
      ))
    }

    const paragraphs = visibleSource.split(/\n{2,}/).filter((paragraph) => paragraph.trim())

    return paragraphs.map((paragraph, index) => (
      <p className={styles.aiSummaryParagraph} key={`${paragraph}-${index}`}>
        {renderMarkedSummaryInline(paragraph)}
      </p>
    ))
  }

  async function summarizePage(input: { query: string; articles: NewsArticle[] }) {
    const summarizableArticles = input.articles.filter(
      (article) => article.title || article.description,
    )

    if (summarizableArticles.length === 0) {
      setAiSummary('')
      setMarkedAiSummary('')
      setAiSummaryError('')
      return
    }

    setAiSummary('')
    setMarkedAiSummary('')
    setAiSummaryError('')
    setAiSummaryLoading(true)

    try {
      const response = await apiFetch('/api/news-summary', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: input.query,
          articles: summarizableArticles.map((article) => ({
            shortId: article.shortId,
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
        setAiSummaryError(data.message ?? data.error ?? 'Não foi possível gerar o resumo da página.')
        return
      }

      const nextSummary = data.summary ?? ''
      const nextMarkedSummary = data.markedSummary ?? nextSummary
      const nextSegments = Array.isArray(data.segments)
        ? data.segments.filter(
            (segment): segment is SummarySegment =>
              typeof segment?.shortId === 'string' &&
              segment.shortId.trim().length > 0 &&
              typeof segment?.text === 'string' &&
              segment.text.trim().length > 0,
          )
        : []
      setAiSummary(nextSummary)
      setMarkedAiSummary(nextMarkedSummary)

      try {
        const currentSavedState = loadPageState()
        savePageState({
          query: input.query,
          activeQuery: input.query,
          articles: summarizableArticles,
          summary: nextSummary,
          markedSummary: nextMarkedSummary,
          summarySegments: nextSegments,
          page: currentSavedState?.page ?? page,
          totalPages: currentSavedState?.totalPages ?? totalPages,
          totalResults: currentSavedState?.totalResults ?? totalResults,
          pageSize: currentSavedState?.pageSize ?? pageSize,
          hasSearched: true,
        })
      } catch {
        // ignore persistence errors
      }
    } catch {
      setAiSummaryError('Serviço de IA indisponível para resumir esta página.')
    } finally {
      setAiSummaryLoading(false)
    }
  }

  async function searchNews(input: { query: string; page: number; isSearch: boolean }) {
    setError('')
    setAiSummary('')
    setMarkedAiSummary('')
    setAiSummaryError('')
    setHasSearched(true)
    setLoading(true)

    try {
      const response = await apiFetch('/api/news/search', {
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
              ? 'Serviço de notícias ainda não foi migrado.'
              : 'Falha ao buscar notícias.'),
        )
        return
      }

      const nextArticles = attachShortIds(data.articles ?? [])

      setArticles(nextArticles)
      setActiveQuery(input.query)
      rememberSearch(input.query)
      setPage(data.page ?? input.page)
      setTotalPages(data.totalPages ?? 1)
      setTotalResults(data.totalResults ?? 0)
      setPageSize(data.pageSize ?? 20)
      // persist current page state so user can return exactly to this view
      try {
        savePageState({
          query: query,
          activeQuery: input.query,
          articles: nextArticles,
          page: data.page ?? input.page,
          totalPages: data.totalPages ?? 1,
          totalResults: data.totalResults ?? 0,
          pageSize: data.pageSize ?? 20,
          hasSearched: true,
        })
      } catch {
        // ignore storage errors
      }
      void summarizePage({ query: input.query, articles: nextArticles })
    } catch {
      setArticles(previewArticles)
      setError('Serviço de notícias ainda não está disponível.')
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
          Buscar notícias recentes
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
              placeholder="Ex.: política, economia, transparência"
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

      {loading ? (
        <div className={styles.loadingPanel} role="status" aria-live="polite">
          <LoadingSignal label="Buscando" />
          <span>Consultando fontes e preparando os resultados...</span>
        </div>
      ) : null}

      {hasSearched && !loading && !error && articles.length === 0 ? (
        <p className={styles.newsHint}>Nenhuma notícia encontrada para este termo.</p>
      ) : null}

      {hasSearched && !error ? (
        <div className={styles.newsPaginationSummary}>
          <span>
            Página {page} de {totalPages} • {totalResults} resultados encontrados • {pageSize} por
            página
          </span>
        </div>
      ) : null}

      {hasSearched && !error ? (
        <section className={styles.aiSummaryBox} aria-live="polite">
          <span className={styles.aiSummaryLabel}>Síntese da página</span>
          {aiSummaryLoading ? (
            <div className={styles.aiSummaryLoading} role="status">
              <LoadingSignal label="IA" />
              <span>Gerando síntese central das notícias...</span>
            </div>
          ) : aiSummary ? (
            <div className={styles.aiSummaryText}>
              {renderTypedSummary()}
              {typedAiSummary.length < (markedAiSummary || aiSummary).length ? (
                <span className={styles.typingCaret} aria-hidden="true" />
              ) : null}
            </div>
          ) : aiSummaryError ? (
            <p className={styles.aiSummaryError}>{aiSummaryError}</p>
          ) : (
            <p className={styles.aiSummaryText}>
              A síntese será exibida aqui quando houver notícias para resumir.
            </p>
          )}
        </section>
      ) : null}

      {articles.length > 0 ? (
        <>
          <ul className={styles.newsList}>
            {articles.map((article, index) => {
              const navigationProps = getNavigationProps(article.url)

              return (
                <li
                  id={`news-card-${article.shortId}`}
                  className={`${styles.newsItem} ${
                    highlightedArticleId === article.shortId ? styles.newsItemHighlighted : ''
                  }`}
                  key={article.url + article.title}
                >
                  <div className={styles.newsItemHeader}>
                    <span className={styles.newsItemBadge}>
                      #{(page - 1) * pageSize + index + 1}
                    </span>
                    <span className={styles.newsItemSource}>{article.source}</span>
                    <span className={styles.newsItemDate}>
                      {formatPublishedAt(article.publishedAt)}
                    </span>
                  </div>

                  <a
                    className={styles.newsLink}
                    href={article.url}
                    {...navigationProps}
                  >
                    {article.title}
                  </a>

                  {article.description ? (
                    <p className={styles.newsDescription}>{article.description}</p>
                  ) : null}

                  <div className={styles.newsItemFooter}>
                    <span className={styles.newsMeta}>Notícia em destaque</span>
                    <div className={styles.newsItemActions}>
                      <button
                        className={styles.newsAiButton}
                        type="button"
                        onClick={() => openArticleSummary(article)}
                      >
                        Resumo com IA
                      </button>
                      <a className={styles.newsOpenLink} href={article.url} {...navigationProps}>
                        Abrir notícia
                      </a>
                    </div>
                  </div>
                </li>
              )
            })}
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
                Próxima
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
