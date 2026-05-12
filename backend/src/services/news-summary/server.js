import http from 'node:http'
import { json, noContent, readJson } from '../../shared/http/json.js'
import { getSessionUser } from '../../shared/http/session-user.js'

const port = Number.parseInt(process.env.NEWS_SUMMARY_SERVICE_PORT ?? '3006', 10)
const hostname = process.env.HOST ?? '127.0.0.1'

function getAiServiceUrl() {
  if (process.env.AI_SERVICE_URL) {
    return process.env.AI_SERVICE_URL.replace(/\/+$/g, '')
  }

  const host = process.env.AI_SERVICE_HOST ?? process.env.HOST ?? '127.0.0.1'
  const servicePort = process.env.AI_SERVICE_PORT ?? '3004'

  return `http://${host}:${servicePort}`
}

function sanitizeArticle(article, index) {
  return [
    `Noticia ${index + 1}:`,
    `Titulo: ${article.title || 'Sem titulo'}`,
    `Fonte: ${article.source || 'Fonte nao informada'}`,
    `Data: ${article.publishedAt || 'Data nao informada'}`,
    `Resumo: ${article.description || 'Sem resumo disponivel'}`,
  ].join('\n')
}

function buildNewsSummaryPrompt(input) {
  const articlesText = input.articles.map(sanitizeArticle).join('\n\n')

  return [
    'Voce e um editor jornalistico do Portal Escarlate.',
    'Abaixo ha titulos e resumos de noticias retornadas por uma busca.',
    'Escreva uma sintese central em portugues do Brasil, objetiva e coesa, reunindo os pontos em comum e o contexto mais importante.',
    'Nao invente fatos que nao estejam nos resumos. Se houver poucos dados, deixe isso claro.',
    'Retorne apenas texto limpo.',
    'Nao crie titulo.',
    'Nao use Markdown.',
    'Nao use listas, bullets, numeracao, negrito, italico, hashtags, tabelas, citacoes ou separadores.',
    'Nao comece com frases como "Resumo:", "Sintese:" ou "Noticia central:".',
    'Use no maximo 2 paragrafos curtos, com ate 120 palavras no total.',
    '',
    `Busca do usuario: ${input.query}`,
    '',
    articlesText,
  ].join('\n')
}

function cleanPlainText(value) {
  return value
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/^\s*(resumo|sintese|síntese|noticia central|notícia central)\s*:\s*/i, '')
    .trim()
}

async function requestAiSummary(input) {
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
            'Voce resume noticias com precisao, sem inventar fatos, em texto limpo, sem Markdown, sem titulo e sem listas.',
        },
        {
          role: 'user',
          content: buildNewsSummaryPrompt(input),
        },
      ],
      temperature: 0.3,
    }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.message ?? 'Nao foi possivel completar a requisicao de IA.')
  }

  if (typeof payload?.content !== 'string') {
    throw new Error('A IA nao retornou um resumo valido.')
  }

  return payload
}

async function handleNewsSummary(request, response) {
  if (!getSessionUser(request)) {
    json(response, 401, { message: 'Sessao invalida. Faca login novamente.' })
    return
  }

  let payload

  try {
    payload = await readJson(request)
  } catch {
    json(response, 400, { message: 'Nao foi possivel ler os dados para resumo.' })
    return
  }

  const articles = Array.isArray(payload?.articles) ? payload.articles.slice(0, 20) : []
  const query = typeof payload?.query === 'string' ? payload.query.trim() : ''

  if (!query || articles.length === 0) {
    json(response, 400, { message: 'Informe uma busca e ao menos uma noticia para resumir.' })
    return
  }

  try {
    const aiResult = await requestAiSummary({ query, articles })

    json(response, 200, {
      summary: cleanPlainText(aiResult.content),
      provider: aiResult.provider,
      model: aiResult.model,
    })
  } catch (error) {
    console.error('[news-summary-service] Failed to summarize news', error)
    json(response, 500, {
      message: error instanceof Error ? error.message : 'Nao foi possivel gerar o resumo agora.',
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
    json(response, 200, { service: 'news-summary', status: 'ok' })
    return
  }

  if (
    request.method === 'POST' &&
    (url.pathname === '/api/news-summary' ||
      url.pathname === '/api/ai/news-summary' ||
      url.pathname === '/api/ai-summary/news')
  ) {
    await handleNewsSummary(request, response)
    return
  }

  json(response, 404, { error: 'Not found' })
}

const server = http.createServer((request, response) => {
  route(request, response).catch((error) => {
    console.error('[news-summary-service] Unhandled error', error)
    json(response, 500, { message: 'Erro interno do servico de resumo de noticias.' })
  })
})

server.listen(port, hostname, () => {
  console.log(`News summary service running at http://${hostname}:${port}`)
})
