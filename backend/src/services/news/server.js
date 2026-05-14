import http from 'node:http'
import { lookup } from 'node:dns/promises'
import net from 'node:net'
import { publishEventSafely } from '../../lib/events/event-client.js'
import {
  findArticleSummaryById,
  findArticleSummaryByNormalizedUrl,
  upsertArticleSummary,
} from '../../lib/news/article-summary-repo.js'
import { listActiveNewsApiKeys, markNewsApiKeyFailure } from '../../lib/news/api-key-repo.js'
import {
  createNewsSearchHistory,
  listCachedSearchThemes,
  listNewsSearchMetricRows,
  listRecentNewsSearchQueries,
  upsertSearchThemes,
} from '../../lib/news/search-history-repo.js'
import { json, noContent, readJson } from '../../shared/http/json.js'
import { getSessionUser } from '../../shared/http/session-user.js'
import { buildInternalHeaders } from '../../shared/http/security.js'

const port = Number.parseInt(process.env.NEWS_SERVICE_PORT ?? '3002', 10)
const hostname = process.env.HOST ?? '127.0.0.1'
const NEWS_API_URL = 'https://newsapi.org/v2/everything'
const PAGE_SIZE = 20
const NEWS_API_TIMEOUT_MS = 10000
const ARTICLE_FETCH_TIMEOUT_MS = 7000
const AI_REQUEST_TIMEOUT_MS = 45000
const MAX_ARTICLE_HTML_LENGTH = 1_500_000
const MAX_ARTICLE_TEXT_LENGTH = 12_000
const FAILED_NEWS_API_KEY_COOLDOWN_MS = 5 * 60 * 1000
const AI_UNAVAILABLE_MESSAGE = 'IA invalida no momento.'

let newsApiKeysCache = null
let newsApiKeysCachePromise = null
const failedNewsApiKeys = new Map()

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

function isNewsApiKeyCoolingDown(apiKeyId) {
  const failedAt = failedNewsApiKeys.get(apiKeyId)

  if (!failedAt) {
    return false
  }

  if (Date.now() - failedAt > FAILED_NEWS_API_KEY_COOLDOWN_MS) {
    failedNewsApiKeys.delete(apiKeyId)
    return false
  }

  return true
}

async function getCachedNewsApiKeys({ forceRefresh = false } = {}) {
  if (newsApiKeysCache && !forceRefresh) {
    return newsApiKeysCache
  }

  if (!newsApiKeysCachePromise) {
    newsApiKeysCachePromise = listActiveNewsApiKeys()
      .then((apiKeys) => {
        newsApiKeysCache = apiKeys
        return apiKeys
      })
      .finally(() => {
        newsApiKeysCachePromise = null
      })
  }

  return newsApiKeysCachePromise
}

async function fetchNewsApiJsonWithFallback(url) {
  let apiKeys = await getCachedNewsApiKeys()
  let lastError
  let refreshedAfterFailure = false

  while (true) {
    if (apiKeys.length === 0) {
      throw new Error('Nenhuma chave ativa da NewsAPI cadastrada no banco de dados.')
    }

    let refreshedDuringLoop = false

    for (const apiKey of apiKeys) {
      if (isNewsApiKeyCoolingDown(apiKey.id)) {
        continue
      }

      try {
        const responseFromApi = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'X-Api-Key': apiKey.apiKey,
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(NEWS_API_TIMEOUT_MS),
        })
        const data = await responseFromApi.json().catch(() => ({}))

        if (!responseFromApi.ok) {
          const message = extractNewsApiError(data, responseFromApi)
          lastError = new Error(`NewsAPI falhou com a chave ${apiKey.provider || apiKey.id}: ${message}`)
          failedNewsApiKeys.set(apiKey.id, Date.now())

          await markNewsApiKeyFailure({
            id: apiKey.id,
            error: message,
          })

          console.warn('[news-service] NewsAPI key failed, trying next fallback when available', {
            id: apiKey.id,
            provider: apiKey.provider,
            status: responseFromApi.status,
            message,
          })

          if (!refreshedAfterFailure) {
            apiKeys = await getCachedNewsApiKeys({ forceRefresh: true })
            refreshedAfterFailure = true
            refreshedDuringLoop = true
            break
          }

          continue
        }

        failedNewsApiKeys.delete(apiKey.id)
        return data
      } catch (error) {
        lastError = error
        failedNewsApiKeys.set(apiKey.id, Date.now())

        await markNewsApiKeyFailure({
          id: apiKey.id,
          error: error instanceof Error ? error.message : 'Erro desconhecido ao consultar NewsAPI.',
        }).catch(() => undefined)

        console.warn('[news-service] NewsAPI key request failed, trying next fallback when available', {
          id: apiKey.id,
          provider: apiKey.provider,
          message: error instanceof Error ? error.message : 'Unknown error',
        })

        if (!refreshedAfterFailure) {
          apiKeys = await getCachedNewsApiKeys({ forceRefresh: true })
          refreshedAfterFailure = true
          refreshedDuringLoop = true
          break
        }
      }
    }

    if (!refreshedDuringLoop) {
      break
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

  const cachedThemes = await listCachedSearchThemes(queries)
  const missingQueries = queries.filter((item) => !cachedThemes.has(item.trim().toLowerCase()))

  if (missingQueries.length === 0) {
    return cachedThemes
  }

  const response = await fetch(new URL('/internal/ai/chat', getAiServiceUrl()), {
    method: 'POST',
    headers: {
      ...buildInternalHeaders(),
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
          content: buildThemePrompt(missingQueries),
        },
      ],
      temperature: 0,
    }),
    signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.message ?? 'Nao foi possivel classificar temas com IA.')
  }

  const content = typeof payload?.content === 'string' ? stripJsonFence(payload.content) : ''
  const parsed = JSON.parse(content)
  const generatedThemes = new Map()

  if (!Array.isArray(parsed)) {
    throw new Error('A IA retornou metricas em formato invalido.')
  }

  for (const item of parsed) {
    if (typeof item?.query === 'string') {
      generatedThemes.set(item.query.trim().toLowerCase(), normalizeTheme(item.theme))
    }
  }

  for (const query of missingQueries) {
    const queryKey = query.trim().toLowerCase()

    if (!generatedThemes.has(queryKey)) {
      generatedThemes.set(queryKey, normalizeTheme(query))
    }
  }

  await upsertSearchThemes(generatedThemes)

  return new Map([...cachedThemes, ...generatedThemes])
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
  } catch (error) {
    json(response, error?.status === 413 ? 413 : 400, {
      message:
        error?.status === 413
          ? 'Dados da busca muito grandes.'
          : 'Nao foi possivel ler os dados da busca.',
    })
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
  url.searchParams.set('pageSize', String(PAGE_SIZE))
  url.searchParams.set('page', String(page))

  try {
    const data = await fetchNewsApiJsonWithFallback(url)
    const articles =
      data.articles?.map((article) => ({
        title: article.title ?? 'Sem titulo',
        description: article.description ?? '',
        url: article.url ?? '',
        urlToImage: article.urlToImage ?? '',
        source: article.source?.name ?? 'Fonte nao informada',
        publishedAt: article.publishedAt ?? '',
        author: article.author ?? 'Autor desconhecido',
      })) ?? []
    const filteredArticles = articles.filter((article) => article.url.length > 0)
    const totalResults = typeof data.totalResults === 'number' ? data.totalResults : 0
    const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE))

    if (isSearch) {
      await createNewsSearchHistory({
        userEmail: sessionUser.email,
        query,
        totalResults,
      })
      void publishEventSafely({
        type: 'news.search_performed',
        source: 'news-service',
        payload: {
          userEmail: sessionUser.email,
          query,
          totalResults,
          page,
          pageSize: PAGE_SIZE,
        },
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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? ''),
  )
}

function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map((part) => Number.parseInt(part, 10))
    const [a, b] = parts

    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a >= 224 && a <= 239)
    )
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase()

    if (normalized.startsWith('::ffff:')) {
      return isPrivateIp(normalized.slice('::ffff:'.length))
    }

    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:')
    )
  }

  return true
}

async function assertPublicHttpUrl(value) {
  const parsed = new URL(value)

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL da noticia deve usar HTTP ou HTTPS.')
  }

  const hostname = parsed.hostname.toLowerCase()

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('URL local nao permitida para extracao de noticia.')
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true })

  if (addresses.length === 0 || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error('URL da noticia aponta para endereco privado ou invalido.')
  }

  return parsed
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

  await assertPublicHttpUrl(url)

  const pageResponse = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent':
        'Mozilla/5.0 (compatible; PortalEscarlateBot/1.0; +https://portal-escarlate.local)',
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(ARTICLE_FETCH_TIMEOUT_MS),
  })

  if (pageResponse.status >= 300 && pageResponse.status < 400) {
    return null
  }

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
  } catch (error) {
    json(response, error?.status === 413 ? 413 : 400, {
      message:
        error?.status === 413
          ? 'Dados da noticia muito grandes.'
          : 'Nao foi possivel ler os dados da noticia.',
    })
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
    const normalizedTargetUrl = normalizeUrl(url)
    const cachedSummary = await findArticleSummaryByNormalizedUrl(normalizedTargetUrl)

    if (cachedSummary) {
      void publishEventSafely({
        type: 'news.article_summary_cache_hit',
        source: 'news-service',
        payload: {
          userEmail: sessionUser.email,
          summaryId: cachedSummary.id,
          url: cachedSummary.url,
          title: cachedSummary.title,
        },
      })

      json(response, 200, {
        summaryId: cachedSummary.id,
      })
      return
    }

    const articleFromPayload = {
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
      ...articleFromPayload,
      content:
        articleFromUrl?.content ||
        articleFromPayload.content ||
        articleFromPayload.description ||
        description,
      urlToImage: articleFromPayload.urlToImage || articleFromUrl?.urlToImage || urlToImage,
    }

    const prompt = buildSummaryPrompt(articleForPrompt)
    const summaryResponse = await fetch(new URL('/internal/ai/chat', getAiServiceUrl()), {
      method: 'POST',
      headers: {
        ...buildInternalHeaders(),
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
      signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
    })

    const aiPayload = await summaryResponse.json().catch(() => null)

    if (!summaryResponse.ok) {
      throw new Error(aiPayload?.message ?? AI_UNAVAILABLE_MESSAGE)
    }

    const summary = typeof aiPayload?.content === 'string' ? aiPayload.content.trim() : ''
    const savedSummary = await upsertArticleSummary({
      url: articleForPrompt.url ?? url,
      normalizedUrl: normalizedTargetUrl,
      title: articleForPrompt.title ?? title,
      author: articleForPrompt.author ?? author,
      source: articleForPrompt.source?.name || articleForPrompt.source || source,
      publishedAt: articleForPrompt.publishedAt ?? payload?.publishedAt ?? null,
      urlToImage: articleForPrompt.urlToImage ?? urlToImage,
      summary,
      provider: aiPayload?.provider ?? '',
      model: aiPayload?.model ?? '',
    })

    void publishEventSafely({
      type: 'news.summary_generated',
      source: 'news-service',
      payload: {
        userEmail: sessionUser.email,
        title: savedSummary.title,
        url: savedSummary.url,
        summaryId: savedSummary.id,
        provider: aiPayload?.provider ?? '',
        model: aiPayload?.model ?? '',
      },
    })
    void publishEventSafely({
      type: 'news.article_summary_created',
      source: 'news-service',
      payload: {
        userEmail: sessionUser.email,
        summaryId: savedSummary.id,
        url: savedSummary.url,
        title: savedSummary.title,
        provider: savedSummary.provider,
        model: savedSummary.model,
      },
    })

    json(response, 200, {
      summaryId: savedSummary.id,
    })
  } catch (error) {
    console.error('[news-service] Failed to summarize news', error)
    json(response, 500, {
      message: AI_UNAVAILABLE_MESSAGE,
    })
  }
}

async function handleGetNewsSummary(request, response, id) {
  const sessionUser = getSessionUser(request)

  if (!sessionUser) {
    json(response, 401, { message: 'Sessao invalida. Faca login novamente.' })
    return
  }

  if (!isUuid(id)) {
    json(response, 400, { message: 'UUID do resumo invalido.' })
    return
  }

  try {
    const summary = await findArticleSummaryById(id)

    if (!summary) {
      json(response, 404, { message: 'Resumo nao encontrado.' })
      return
    }
    void publishEventSafely({
      type: 'news.article_summary_viewed',
      source: 'news-service',
      payload: {
        userEmail: sessionUser.email,
        summaryId: summary.id,
        url: summary.url,
        title: summary.title,
      },
    })

    json(response, 200, {
      id: summary.id,
      title: summary.title,
      author: summary.author,
      source: summary.source,
      publishedAt: summary.publishedAt,
      urlToImage: summary.urlToImage,
      url: summary.url,
      summary: summary.summary,
      provider: summary.provider,
      model: summary.model,
      createdAt: summary.createdAt,
    })
  } catch (error) {
    console.error('[news-service] Failed to load stored summary', error)
    json(response, 500, { message: 'Nao foi possivel carregar o resumo.' })
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
    const totalSearches = rows.reduce((total, row) => total + (Number(row.searchCount) || 0), 0)

    void publishEventSafely({
      type: 'news.metrics_generated',
      source: 'news-service',
      payload: {
        totalSearches,
        themeCount: metrics.themes.length,
        userCount: metrics.users.length,
      },
    })

    json(response, 200, {
      generatedAt: new Date().toISOString(),
      totalSearches,
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

  const summaryMatch = url.pathname.match(/^\/api\/news\/summaries\/([^/]+)$/)

  if (request.method === 'GET' && summaryMatch) {
    await handleGetNewsSummary(request, response, summaryMatch[1])
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
