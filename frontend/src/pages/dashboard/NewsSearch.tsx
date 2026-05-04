import { useMemo, useState } from 'react'
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

export function NewsSearch() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [articles, setArticles] = useState<NewsArticle[]>(previewArticles)
  const [hasSearched, setHasSearched] = useState(false)

  const canSubmit = useMemo(() => query.trim().length >= 2 && !loading, [query, loading])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setHasSearched(true)
    setLoading(true)

    try {
      const response = await fetch('/api/news/search', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query: query.trim() }),
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

      setArticles(data.articles ?? [])
    } catch {
      setArticles(previewArticles)
      setError('Backend de noticias ainda nao esta disponivel.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.newsBox}>
      <form className={styles.newsForm} onSubmit={handleSubmit}>
        <label className={styles.newsLabel} htmlFor="news-query">
          Buscar noticias recentes
        </label>

        <div className={styles.newsControls}>
          <input
            id="news-query"
            className={styles.newsInput}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Ex.: politica, economia, transparencia"
            autoComplete="off"
          />

          <button className={styles.newsButton} type="submit" disabled={!canSubmit}>
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </form>

      {error ? <p className={styles.newsError}>{error}</p> : null}

      {hasSearched && !loading && !error && articles.length === 0 ? (
        <p className={styles.newsHint}>Nenhuma noticia encontrada para este termo.</p>
      ) : null}

      {articles.length > 0 ? (
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
      ) : null}
    </div>
  )
}
