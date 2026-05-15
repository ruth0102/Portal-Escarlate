import http from 'node:http'
import { listActiveNewsApiKeys, markNewsApiKeyFailure } from '../../lib/news/api-key-repo.js'
import {
  createNewsSearchHistory,
  listNewsSearchMetricRows,
  listRecentNewsSearchQueries,
} from '../../lib/news/search-history-repo.js'
import { json, noContent, readJson } from '../../shared/http/json.js'
import { getSessionUser } from '../../shared/http/session-user.js'

const port = Number.parseInt(process.env.NEWS_SERVICE_PORT ?? '3002', 10)
const hostname = process.env.HOST ?? '127.0.0.1'
const NEWS_API_URL = 'https://newsapi.org/v2/everything'
const PAGE_SIZE = 20
const ARTICLE_FETCH_TIMEOUT_MS = 7000
const MAX_ARTICLE_HTML_LENGTH = 1_500_000
const MAX_ARTICLE_TEXT_LENGTH = 12_000

function sanitizeQuery(value) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

function sanitizePage(value) {
  const parsed = Number.parseInt(String(value ?? '1'), 10)

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1
  }

  return parsed
}

function getAiServiceUrl() {
  if (process.env.AI_SERVICE_URL) {
    return process.env.AI_SERVICE_URL.replace(/\/+$/g, '')
  }

  const serviceHost = process.env.AI_SERVICE_HOST ?? process.env.HOST ?? '127.0.0.1'
  const servicePort = process.env.AI_SERVICE_PORT ?? '3004'

  return `http://${serviceHost}:${servicePort}`
}

function extractNewsApiError(payload, response) {
  if (typeof payload?.message === 'string' && payload.message.trim()) {
    return payload.message.trim()
  }

  if (typeof payload?.code === 'string' && payload.code.trim()) {
    return payload.code.trim()
  }

  return response.statusText || `Erro externo ${response.status}`
}

async function fetchNewsApiJsonWithFallback(url) {
  const apiKeys = await listActiveNewsApiKeys()

  if (apiKeys.length === 0) {
    throw new Error('Nenhuma chave ativa da NewsAPI cadastrada no banco de dados.')
  }

  let lastError

  for (const apiKey of apiKeys) {
    try {
      const responseFromApi = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'X-Api-Key': apiKey.apiKey,
        },
        cache: 'no-store',
      })
      const data = await responseFromApi.json().catch(() => ({}))

      if (!responseFromApi.ok) {
        const message = extractNewsApiError(data, responseFromApi)
        lastError = new Error(`NewsAPI falhou com a chave ${apiKey.label || apiKey.id}: ${message}`)

        await markNewsApiKeyFailure({
          id: apiKey.id,
          error: message,
        })

        console.warn('[news-service] NewsAPI key failed, trying next fallback when available', {
          id: apiKey.id,
          label: apiKey.label,
          status: responseFromApi.status,
          message,
        })
        continue
      }

      return data
    } catch (error) {
      lastError = error

      await markNewsApiKeyFailure({
        id: apiKey.id,
        error: error instanceof Error ? error.message : 'Erro desconhecido ao consultar NewsAPI.',
      }).catch(() => undefined)

      console.warn('[news-service] NewsAPI key request failed, trying next fallback when available', {
        id: apiKey.id,
        label: apiKey.label,
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }

  throw new Error('Nenhuma chave da NewsAPI conseguiu completar a requisicao.')
}

function requireAdmin(request, response) {
  const sessionUser = getSessionUser(request)

  if (!sessionUser) {
    json(response, 401, { message: 'Sessao invalida. Faca login novamente.' })
    return null
  }

  if (sessionUser.role !== 'admin') {
    json(response, 403, { message: 'Acesso restrito a administradores.' })
    return null
  }

  return sessionUser
}

function buildThemePrompt(queries) {
  return [
    'Voce padroniza termos de busca de noticias em temas analiticos.',
    'Receba uma lista JSON de pesquisas e retorne apenas JSON valido.',
    'Nao use Markdown, titulo, explicacoes, listas textuais ou comentarios.',
    'Pesquisas similares devem cair no mesmo tema padronizado.',
    'Use temas curtos, em portugues do Brasil, com 1 a 4 palavras.',
    'Exemplos: "eleicao brasil", "eleicoes brasileiras" e "politica eleitoral" podem virar "Politica eleitoral".',
    'Formato obrigatorio de resposta:',
    '[{"query":"texto original","theme":"Tema padronizado"}]',
    '',
    JSON.stringify(queries),
  ].join('\n')
}

function stripJsonFence(value) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function normalizeTheme(value) {
  const theme = String(value ?? '').trim()

  if (!theme) {
    return 'Nao classificado'
  }

  return theme.charAt(0).toUpperCase() + theme.slice(1)
}

async function classifySearchThemes(queries) {
  if (queries.length === 0) {
    return new Map()
  }

  const response = await fetch(new URL('/internal/ai/chat', getAiServiceUrl()), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'system',
          content:
            'Voce classifica pesquisas em temas padronizados e retorna apenas JSON valido.',
        },
        {
          role: 'user',
          content: buildThemePrompt(queries),
        },
      ],
      temperature: 0,
    }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.message ?? 'Nao foi possivel classificar temas com IA.')
  }

  const content = typeof payload?.content === 'string' ? stripJsonFence(payload.content) : ''
  const parsed = JSON.parse(content)
  const themeByQuery = new Map()

  if (!Array.isArray(parsed)) {
    throw new Error('A IA retornou metricas em formato invalido.')
  }

  for (const item of parsed) {
    if (typeof item?.query === 'string') {
      themeByQuery.set(item.query.trim().toLowerCase(), normalizeTheme(item.theme))
    }
  }

  return themeByQuery
}

function buildMetrics(rows, themeByQuery) {
  const themes = new Map()
  const users = new Map()

  for (const row of rows) {
    const queryKey = row.query.trim().toLowerCase()
    const theme = themeByQuery.get(queryKey) ?? normalizeTheme(row.query)
    const searchCount = Number(row.searchCount) || 0

    if (!themes.has(theme)) {
      themes.set(theme, {
        theme,
        totalSearches: 0,
        userEmails: new Set(),
      })
    }

    const themeEntry = themes.get(theme)
    themeEntry.totalSearches += searchCount
    themeEntry.userEmails.add(row.userEmail)

    if (!users.has(row.userEmail)) {
      users.set(row.userEmail, {
        email: row.userEmail,
        totalSearches: 0,
        themes: new Map(),
      })
    }

    const userEntry = users.get(row.userEmail)
    userEntry.totalSearches += searchCount

    if (!userEntry.themes.has(theme)) {
      userEntry.themes.set(theme, {
        theme,
        totalSearches: 0,
      })
    }

    userEntry.themes.get(theme).totalSearches += searchCount
  }

  return {
    themes: Array.from(themes.values())
      .map((theme) => ({
        theme: theme.theme,
        totalSearches: theme.totalSearches,
        uniqueUsers: theme.userEmails.size,
      }))
      .sort((a, b) => b.totalSearches - a.totalSearches || a.theme.localeCompare(b.theme)),
    users: Array.from(users.values())
      .map((user) => ({
        email: user.email,
        totalSearches: user.totalSearches,
        themes: Array.from(user.themes.values()).sort(
          (a, b) => b.totalSearches - a.totalSearches || a.theme.localeCompare(b.theme),
        ),
      }))
      .sort((a, b) => b.totalSearches - a.totalSearches || a.email.localeCompare(b.email)),
  }
}

async function handleNewsSearch(request, response) {
  const sessionUser = getSessionUser(request)

  if (!sessionUser) {
    json(response, 401, { message: 'Sessao invalida. Faca login novamente.' })
    return
  }

  let payload

  try {
    payload = await readJson(request)
  } catch {
    json(response, 400, { message: 'Nao foi possivel ler os dados da busca.' })
    return
  }

  const query = sanitizeQuery(payload?.query)
  const page = sanitizePage(payload?.page)
  const isSearch = typeof payload?.isSearch === 'boolean' ? payload.isSearch : true

  if (query.length < 2) {
    json(response, 400, { message: 'Digite ao menos 2 caracteres para buscar noticias.' })
    return
  }

  const url = new URL(NEWS_API_URL)
  url.searchParams.set('q', query)
  url.searchParams.set('language', 'pt')
  url.searchParams.set('sortBy', 'publishedAt')
  url.searchParams.set('pageSize', String(PAGE_SIZE * 2))
  url.searchParams.set('page', String(page))

  try {
    const data = await fetchNewsApiJsonWithFallback(url)
    const articles =
      data.articles?.map((article) => ({
        title: article.title ?? 'Sem titulo',
        description: article.description ?? '',
        url: article.url ?? '',
        source: article.source?.name ?? 'Fonte nao informada',
        publishedAt: article.publishedAt ?? '',
        author: article.author ?? 'Autor desconhecido',
      })) ?? []
    const validArticles = articles.filter((article) => article.url.length > 0)
    const filteredArticles = validArticles.slice(0, PAGE_SIZE)
    const totalResults = typeof data.totalResults === 'number' ? data.totalResults : 0
    const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE))

    if (isSearch) {
      await createNewsSearchHistory({
        userEmail: sessionUser.email,
        query,
        totalResults,
      })
    }

    json(response, 200, {
      totalResults,
      totalPages,
      page,
      pageSize: PAGE_SIZE,
      articles: filteredArticles,
    })
  } catch (error) {
    console.error('[news-service] News search failed', error)
    json(response, 500, { message: 'Nao foi possivel consultar noticias neste momento.' })
  }
}

async function handleNewsSearchHistory(request, response) {
  const sessionUser = getSessionUser(request)

  if (!sessionUser) {
    json(response, 401, { message: 'Sessao invalida. Faca login novamente.' })
    return
  }

  try {
    const queries = await listRecentNewsSearchQueries({
      userEmail: sessionUser.email,
      limit: 10,
    })

    json(response, 200, { queries })
  } catch (error) {
    console.error('[news-service] Failed to load search history', error)
    json(response, 500, { message: 'Nao foi possivel carregar o historico de buscas.' })
  }
}

function normalizeUrl(value) {
  return String(value ?? '')
    .trim()
    .replace(/#.*$/, '')
    .replace(/\/+$/, '')
}

function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function decodeHtmlEntities(value) {
  const namedEntities = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalized = String(entity).toLowerCase()

    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
    }

    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
    }

    return namedEntities[normalized] ?? match
  })
}

function htmlToText(html) {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, ' ')
      .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, ' ')
      .replace(/<(br|p|div|section|article|main|h[1-6]|li|blockquote)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
}

function extractMetaContent(html, selectors) {
  for (const selector of selectors) {
    const pattern = new RegExp(
      `<meta\\b(?=[^>]*(?:property|name)=["']${selector}["'])[^>]*content=["']([^"']+)["'][^>]*>`,
      'i',
    )
    const match = html.match(pattern)

    if (match?.[1]) {
      return decodeHtmlEntities(match[1].trim())
    }
  }

  return ''
}

function extractArticleText(html) {
  const candidates = [
    ...Array.from(html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi), (match) => match[0]),
    ...Array.from(html.matchAll(/<main\b[^>]*>[\s\S]*?<\/main>/gi), (match) => match[0]),
  ]
    .map(htmlToText)
    .filter((text) => text.length >= 400)
    .sort((a, b) => b.length - a.length)

  const text = candidates[0] ?? htmlToText(html)

  return text.slice(0, MAX_ARTICLE_TEXT_LENGTH)
}

async function fetchArticleFromUrl(url) {
  if (!isHttpUrl(url)) {
    return null
  }

  const pageResponse = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent':
        'Mozilla/5.0 (compatible; PortalEscarlateBot/1.0; +https://portal-escarlate.local)',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(ARTICLE_FETCH_TIMEOUT_MS),
  })

  if (!pageResponse.ok) {
    return null
  }

  const contentType = pageResponse.headers.get('content-type') ?? ''

  if (!contentType.toLowerCase().includes('text/html')) {
    return null
  }

  const contentLength = Number.parseInt(pageResponse.headers.get('content-length') ?? '0', 10)

  if (Number.isFinite(contentLength) && contentLength > MAX_ARTICLE_HTML_LENGTH) {
    return null
  }

  const html = await pageResponse.text()

  if (html.length > MAX_ARTICLE_HTML_LENGTH) {
    return null
  }

  const content = extractArticleText(html)
  const urlToImage = extractMetaContent(html, ['og:image', 'twitter:image'])

  if (content.length < 300) {
    return null
  }

  return {
    content,
    urlToImage,
  }
}

function buildSummaryPrompt(article) {
  const content = String(article?.content ?? article?.description ?? '').trim()

  return [
    'Voce e um editor jornalistico do Portal Escarlate.',
    'Abaixo esta o conteudo de uma noticia recuperada a partir da URL original e, se necessario, complementada pela NewsAPI.',
    'O conteudo pode estar incompleto, bloqueado por paywall ou truncado. Use o titulo, fonte e descricao como contexto auxiliar.',
    'Escreva um resumo direto em portugues do Brasil, objetivo e coeso, destacando os pontos principais e o contexto mais importante.',
    'Nao invente fatos que nao estejam no conteudo ou no contexto fornecido. Se o conteudo for incompleto ou truncado, deixe isso claro.',
    'Retorne apenas texto limpo.',
    'Nao crie titulo.',
    'Nao use Markdown, listas, bullets, numeracao, negrito, italico, hashtags, tabelas ou separadores.',
    'Use no maximo 3 paragrafos curtos, com ate 300 palavras no total.',
    '',
    `Titulo: ${article?.title || 'Sem titulo'}`,
    `URL: ${article?.url || 'URL nao informada'}`,
    `Autor: ${article?.author || 'Autor desconhecido'}`,
    `Imagem: ${article?.urlToImage || 'Sem imagem'}`,
    `Fonte: ${article?.source?.name || article?.source || 'Fonte nao informada'}`,
    'Conteudo da noticia:',
    content || 'Sem conteudo disponivel',
  ].join('\n')
}

async function handleNewsSummarize(request, response) {
  const sessionUser = getSessionUser(request)

  if (!sessionUser) {
    json(response, 401, { message: 'Sessao invalida. Faca login novamente.' })
    return
  }

  let payload

  try {
    payload = await readJson(request)
  } catch {
    json(response, 400, { message: 'Nao foi possivel ler os dados da noticia.' })
    return
  }

  const title = typeof payload?.title === 'string' ? payload.title.trim() : ''
  const author = typeof payload?.author === 'string' ? payload.author.trim() : ''
  const urlToImage = typeof payload?.urlToImage === 'string' ? payload.urlToImage.trim() : ''
  const url = typeof payload?.url === 'string' ? payload.url.trim() : ''
  const description = typeof payload?.description === 'string' ? payload.description.trim() : ''
  const source = typeof payload?.source === 'string' ? payload.source.trim() : ''

  if (!title || !url) {
    json(response, 400, { message: 'Titulo e URL da noticia sao obrigatorios para resumo.' })
    return
  }

  try {
    const lookupUrl = new URL(NEWS_API_URL)
    lookupUrl.searchParams.set('q', title)
    lookupUrl.searchParams.set('language', 'pt')
    lookupUrl.searchParams.set('sortBy', 'publishedAt')
    lookupUrl.searchParams.set('pageSize', String(PAGE_SIZE * 2))

    const lookupData = await fetchNewsApiJsonWithFallback(lookupUrl)
    const normalizedTargetUrl = normalizeUrl(url)
    const normalizedTargetTitle = title.trim().toLowerCase()
    const foundArticle = (lookupData.articles ?? []).find((article) => {
      const articleUrl = normalizeUrl(article.url)
      const articleTitle = String(article.title ?? '').trim().toLowerCase()

      return articleUrl === normalizedTargetUrl || articleTitle === normalizedTargetTitle
    })

    const articleFromNewsApi = foundArticle ?? {
      title,
      url,
      author: author || 'Autor desconhecido',
      urlToImage: urlToImage || '',
      description,
      content: '',
      source,
    }
    let articleFromUrl = null

    try {
      articleFromUrl = await fetchArticleFromUrl(url)
    } catch (fetchError) {
      console.warn('[news-service] Could not extract full article from URL', {
        url,
        message: fetchError instanceof Error ? fetchError.message : 'Unknown error',
      })
    }

    const articleForPrompt = {
      ...articleFromNewsApi,
      content:
        articleFromUrl?.content ||
        articleFromNewsApi.content ||
        articleFromNewsApi.description ||
        description,
      urlToImage: articleFromNewsApi.urlToImage || articleFromUrl?.urlToImage || urlToImage,
    }

    const prompt = buildSummaryPrompt(articleForPrompt)
    const summaryResponse = await fetch(new URL('/internal/ai/chat', getAiServiceUrl()), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content:
              'Voce resume noticias com precisao, sem inventar fatos, em texto limpo, sem Markdown e sem titulo.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
      }),
    })

    const aiPayload = await summaryResponse.json().catch(() => null)

    if (!summaryResponse.ok) {
      throw new Error(aiPayload?.message ?? 'Nao foi possivel gerar resumo.')
    }

    const summary = typeof aiPayload?.content === 'string' ? aiPayload.content.trim() : ''

    json(response, 200, {
      title: articleForPrompt.title ?? title,
      author: articleForPrompt.author ?? author,
      urlToImage: articleForPrompt.urlToImage ?? urlToImage,
      url: articleForPrompt.url ?? url,
      summary,
      provider: aiPayload?.provider,
      model: aiPayload?.model,
    })
  } catch (error) {
    console.error('[news-service] Failed to summarize news', error)
    json(response, 500, {
      message: error instanceof Error ? error.message : 'Nao foi possivel gerar o resumo agora.',
    })
  }
}

async function handleNewsMetrics(request, response) {
  if (!requireAdmin(request, response)) {
    return
  }

  try {
    const rows = await listNewsSearchMetricRows()
    const uniqueQueries = Array.from(new Set(rows.map((row) => row.query.trim()).filter(Boolean)))
    const themeByQuery = await classifySearchThemes(uniqueQueries)
    const metrics = buildMetrics(rows, themeByQuery)

    json(response, 200, {
      generatedAt: new Date().toISOString(),
      totalSearches: rows.reduce((total, row) => total + (Number(row.searchCount) || 0), 0),
      ...metrics,
    })
  } catch (error) {
    console.error('[news-service] Failed to build news metrics', error)
    json(response, 500, {
      message: error instanceof Error ? error.message : 'Nao foi possivel gerar metricas.',
    })
  }
}

async function route(request, response) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${hostname}:${port}`}`)

  if (request.method === 'OPTIONS') {
    noContent(response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    json(response, 200, { service: 'news', status: 'ok' })
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/news/search/history') {
    await handleNewsSearchHistory(request, response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/news/metrics') {
    await handleNewsMetrics(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/news/search') {
    await handleNewsSearch(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/news/summarize') {
    await handleNewsSummarize(request, response)
    return
  }

  json(response, 404, { error: 'Not found' })
}

const server = http.createServer((request, response) => {
  route(request, response).catch((error) => {
    console.error('[news-service] Unhandled error', error)
    json(response, 500, { message: 'Erro interno do servico de noticias.' })
  })
})

server.listen(port, hostname, () => {
  console.log(`News service running at http://${hostname}:${port}`)
})
