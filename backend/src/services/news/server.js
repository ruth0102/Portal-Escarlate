import http from 'node:http'
import { json, noContent, readJson } from '../../shared/http/json.js'
import { getSessionUser } from '../../shared/http/session-user.js'

const port = Number.parseInt(process.env.NEWS_SERVICE_PORT ?? '3002', 10)
const hostname = process.env.HOST ?? '127.0.0.1'
const NEWS_API_URL = 'https://newsapi.org/v2/everything'
const MAX_RESULTS = 8

function sanitizeQuery(value) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
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

  if (query.length < 2) {
    json(response, 400, { message: 'Digite ao menos 2 caracteres para buscar noticias.' })
    return
  }

  const url = new URL(NEWS_API_URL)
  url.searchParams.set('q', query)
  url.searchParams.set('language', 'pt')
  url.searchParams.set('sortBy', 'publishedAt')
  url.searchParams.set('pageSize', String(MAX_RESULTS))

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

    json(response, 200, {
      totalResults: typeof data.totalResults === 'number' ? data.totalResults : 0,
      articles: articles.filter((article) => article.url.length > 0),
    })
  } catch (error) {
    console.error('[news-service] News search failed', error)
    json(response, 500, { message: 'Nao foi possivel consultar noticias neste momento.' })
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

