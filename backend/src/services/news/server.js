import http from 'node:http'
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

  const newsApiKey = process.env.NEWS_API_KEY

  if (!newsApiKey) {
    json(response, 500, { message: 'NEWS_API_KEY nao configurada no servidor.' })
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
  url.searchParams.set('pageSize', String(PAGE_SIZE))
  url.searchParams.set('page', String(page))

  try {
    const responseFromApi = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Api-Key': newsApiKey,
      },
      cache: 'no-store',
    })

    if (!responseFromApi.ok) {
      json(response, responseFromApi.status, {
        message: `Falha ao buscar noticias: ${responseFromApi.statusText || 'Erro externo.'}`,
      })
      return
    }

    const data = await responseFromApi.json()
    const articles =
      data.articles?.map((article) => ({
        title: article.title ?? 'Sem titulo',
        description: article.description ?? '',
        url: article.url ?? '',
        source: article.source?.name ?? 'Fonte nao informada',
        publishedAt: article.publishedAt ?? '',
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
