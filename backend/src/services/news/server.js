import http from 'node:http'
import { publishEventSafely } from '../../lib/events/event-client.js'
import { requestService } from '../../lib/events/service-request-client.js'
import { listActiveNewsApiKeys, markNewsApiKeyFailure } from '../../lib/news/api-key-repo.js'
import {
  assignHistoryThemes,
  createNewsSearchHistory,
  listNewsSearchMetricRows,
  listRecentNewsSearchQueries,
  listSearchThemes,
  listUnlinkedSearchHistory,
  normalizeThemeKey,
  normalizeThemeName,
  upsertSearchThemeNames,
} from '../../lib/news/search-history-repo.js'
import { json, noContent, readJson } from '../../shared/http/json.js'
import { getSessionUser } from '../../shared/http/session-user.js'

const port = Number.parseInt(process.env.NEWS_SERVICE_PORT ?? '3002', 10)
const hostname = process.env.HOST ?? '127.0.0.1'
const NEWS_API_URL = 'https://newsapi.org/v2/everything'
const PAGE_SIZE = 20
const NEWS_API_TIMEOUT_MS = 10000
const AI_REQUEST_TIMEOUT_MS = 45000
const FAILED_NEWS_API_KEY_COOLDOWN_MS = 5 * 60 * 1000

let newsApiKeysCache = null
let newsApiKeysCachePromise = null
const failedNewsApiKeys = new Map()

function sanitizeQuery(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function sanitizePage(value) {
  const parsed = Number.parseInt(String(value ?? '1'), 10)

  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
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

function stripJsonFence(value) {
  return String(value ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function buildThemeAssignmentPrompt(input) {
  return [
    'Voce organiza historicos de pesquisa de noticias em temas analiticos.',
    'Receba os temas existentes e os historicos ainda sem tema.',
    'Conecte cada historico a um tema existente quando o assunto for semanticamente equivalente ou muito proximo.',
    'Se um historico for de assunto distinto dos temas existentes, crie um novo tema generico, curto e abrangente.',
    'Use temas em portugues do Brasil, com 1 a 4 palavras, sem pontuacao decorativa.',
    'Retorne apenas JSON valido. Nao use Markdown, explicacoes, listas textuais ou comentarios.',
    'Formato obrigatorio:',
    '{"newThemes":[{"name":"Tema novo"}],"assignments":[{"historyId":"uuid","themeName":"Tema existente ou novo"}]}',
    'O campo historyId deve ser exatamente um dos ids recebidos.',
    'O campo themeName deve ser exatamente o nome de um tema existente ou novo.',
    '',
    JSON.stringify({
      existingThemes: input.existingThemes.map((theme) => ({
        id: theme.id,
        name: theme.name,
      })),
      unlinkedHistory: input.unlinkedHistory.map((history) => ({
        id: history.id,
        query: history.query,
        userEmail: history.userEmail,
        totalResults: history.totalResults,
        createdAt: history.createdAt,
      })),
    }),
  ].join('\n')
}

async function classifyUnlinkedHistory(existingThemes, unlinkedHistory) {
  if (unlinkedHistory.length === 0) {
    return {
      newThemes: [],
      assignments: [],
    }
  }

  const response = await requestService('ai', '/internal/ai/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'system',
          content:
            'Voce classifica historicos de pesquisa em temas e retorna apenas JSON valido.',
        },
        {
          role: 'user',
          content: buildThemeAssignmentPrompt({ existingThemes, unlinkedHistory }),
        },
      ],
      temperature: 0,
    }),
    source: 'news-service',
    signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.message ?? 'Nao foi possivel classificar historicos com IA.')
  }

  const content = stripJsonFence(payload?.content)
  const parsed = JSON.parse(content)

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.assignments)) {
    throw new Error('A IA retornou metricas em formato invalido.')
  }

  return {
    newThemes: Array.isArray(parsed.newThemes)
      ? parsed.newThemes.map((theme) => normalizeThemeName(theme?.name)).filter(Boolean)
      : [],
    assignments: parsed.assignments
      .map((assignment) => ({
        historyId: String(assignment?.historyId ?? '').trim(),
        themeName: normalizeThemeName(assignment?.themeName),
      }))
      .filter((assignment) => assignment.historyId && assignment.themeName),
  }
}

async function classifyAndPersistUnlinkedHistory() {
  const unlinkedHistory = await listUnlinkedSearchHistory(500)

  if (unlinkedHistory.length === 0) {
    return
  }

  const existingThemes = await listSearchThemes()
  const aiResult = await classifyUnlinkedHistory(existingThemes, unlinkedHistory)
  const existingThemeNames = existingThemes.map((theme) => theme.name)
  const assignmentByHistoryId = new Map(
    aiResult.assignments.map((assignment) => [assignment.historyId, assignment.themeName]),
  )
  const completedAssignments = unlinkedHistory.map((history) => ({
    historyId: history.id,
    themeName:
      assignmentByHistoryId.get(history.id) ||
      normalizeThemeName(history.query) ||
      'Nao classificado',
  }))
  const assignedThemeNames = completedAssignments.map((assignment) => assignment.themeName)
  const themeByKey = await upsertSearchThemeNames([
    ...existingThemeNames,
    ...aiResult.newThemes,
    ...assignedThemeNames,
  ])
  const validHistoryIds = new Set(unlinkedHistory.map((history) => history.id))
  const assignments = completedAssignments
    .filter((assignment) => validHistoryIds.has(assignment.historyId))
    .map((assignment) => {
      const theme = themeByKey.get(normalizeThemeKey(assignment.themeName))

      return theme
        ? {
            historyId: assignment.historyId,
            themeId: theme.id,
          }
        : null
    })
    .filter(Boolean)

  await assignHistoryThemes(assignments)

  void publishEventSafely({
    type: 'news.search_themes_classified',
    source: 'news-service',
    payload: {
      historiesClassified: assignments.length,
      newThemes: aiResult.newThemes,
    },
  })
}

function buildMetrics(rows) {
  const themes = new Map()
  const users = new Map()

  for (const row of rows) {
    const theme = row.theme
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
          userId: sessionUser.id,
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

async function handleNewsMetrics(request, response) {
  if (!requireAdmin(request, response)) {
    return
  }

  try {
    await classifyAndPersistUnlinkedHistory()

    const rows = await listNewsSearchMetricRows()
    const metrics = buildMetrics(rows)

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
