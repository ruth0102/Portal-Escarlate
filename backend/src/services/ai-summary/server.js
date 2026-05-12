import http from 'node:http'
import { listActiveAiConfigs } from '../../lib/ai-summary/config-repo.js'
import { json, noContent, readJson } from '../../shared/http/json.js'
import { getSessionUser } from '../../shared/http/session-user.js'

const port = Number.parseInt(process.env.AI_SUMMARY_SERVICE_PORT ?? '3004', 10)
const hostname = process.env.HOST ?? '127.0.0.1'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

function sanitizeArticle(article, index) {
  return [
    `Noticia ${index + 1}:`,
    `Titulo: ${article.title || 'Sem titulo'}`,
    `Fonte: ${article.source || 'Fonte nao informada'}`,
    `Data: ${article.publishedAt || 'Data nao informada'}`,
    `Resumo: ${article.description || 'Sem resumo disponivel'}`,
  ].join('\n')
}

function buildPrompt(input) {
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

function cleanSummary(value) {
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

async function requestOpenRouterSummary(input) {
  const openRouterResponse = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL ?? 'http://localhost:5173',
      'X-Title': 'Portal Escarlate',
    },
    body: JSON.stringify({
      model: input.model,
      messages: [
        {
          role: 'system',
          content:
            'Voce resume noticias com precisao, sem inventar fatos, em texto limpo, sem Markdown, sem titulo e sem listas.',
        },
        {
          role: 'user',
          content: buildPrompt({
            query: input.query,
            articles: input.articles,
          }),
        },
      ],
      temperature: 0.3,
    }),
  })

  const data = await openRouterResponse.json().catch(() => ({}))

  if (!openRouterResponse.ok) {
    throw new Error(data?.error?.message ?? `OpenRouter failed with status ${openRouterResponse.status}`)
  }

  const summary = data?.choices?.[0]?.message?.content

  if (typeof summary !== 'string' || summary.trim().length === 0) {
    throw new Error('A IA nao retornou um resumo valido.')
  }

  return cleanSummary(summary)
}

async function summarizeWithFallback(input) {
  const configs = await listActiveAiConfigs()
  let lastError

  for (const config of configs) {
    if (config.provider !== 'openrouter') {
      continue
    }

    for (const model of config.models) {
      try {
        return await requestOpenRouterSummary({
          apiKey: config.apiKey,
          model,
          query: input.query,
          articles: input.articles,
        })
      } catch (error) {
        lastError = error
        console.error('[ai-summary-service] AI config failed', {
          provider: config.provider,
          label: config.label,
          model,
          message: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }

  throw new Error('Nenhuma chave/modelo ativo configurado para IA.')
}

async function summarizeArticles(request, response) {
  const sessionUser = getSessionUser(request)

  if (!sessionUser) {
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
    const summary = await summarizeWithFallback({ query, articles })

    json(response, 200, { summary })
  } catch (error) {
    console.error('[ai-summary-service] Failed to summarize articles', error)
    json(response, 500, { message: 'Nao foi possivel gerar o resumo agora.' })
  }
}

async function route(request, response) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${hostname}:${port}`}`)

  if (request.method === 'OPTIONS') {
    noContent(response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    json(response, 200, { service: 'ai-summary', status: 'ok' })
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/ai-summary/news') {
    await summarizeArticles(request, response)
    return
  }

  json(response, 404, { error: 'Not found' })
}

const server = http.createServer((request, response) => {
  route(request, response).catch((error) => {
    console.error('[ai-summary-service] Unhandled error', error)
    json(response, 500, { message: 'Erro interno do servico de sintese por IA.' })
  })
})

server.listen(port, hostname, () => {
  console.log(`AI summary service running at http://${hostname}:${port}`)
})
