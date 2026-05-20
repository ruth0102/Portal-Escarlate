import http from 'node:http'
import { createHash } from 'node:crypto'
import { requestService } from '../../lib/events/service-request-client.js'
import { json, noContent, readJson } from '../../shared/http/json.js'
import { getSessionUser } from '../../shared/http/session-user.js'

const port = Number.parseInt(process.env.NEWS_SUMMARY_SERVICE_PORT ?? '3006', 10)
const hostname = process.env.HOST ?? '127.0.0.1'
const AI_UNAVAILABLE_MESSAGE = 'IA invalida no momento.'
const MIN_MARKED_TEXT_RATIO = 0.82
const AI_REQUEST_TIMEOUT_MS = 45000
const SUMMARY_CACHE_TTL_MS = 10 * 60 * 1000
const SUMMARY_CACHE_MAX_ITEMS = 100
const MIN_CORRECTION_TEXT_RATIO = 0.5

const summaryCache = new Map()

function sanitizeArticle(article, index) {
  const shortId =
    typeof article.shortId === 'string' && article.shortId.trim()
      ? article.shortId.trim()
      : `noticia-${index + 1}`

  return [
    `Noticia ${index + 1}:`,
    `ShortID: ${shortId}`,
    `Titulo: ${article.title || 'Sem titulo'}`,
    `Fonte: ${article.source || 'Fonte nao informada'}`,
    `Data: ${article.publishedAt || 'Data nao informada'}`,
    `Resumo: ${article.description || 'Sem resumo disponivel'}`,
  ].join('\n')
}

function buildSummaryCacheKey(input) {
  const cachePayload = {
    query: input.query.trim().toLowerCase(),
    articles: input.articles.map((article, index) => ({
      shortId: article.shortId || `noticia-${index + 1}`,
      title: article.title || '',
      description: article.description || '',
      source: article.source || '',
      publishedAt: article.publishedAt || '',
    })),
  }

  return createHash('sha256').update(JSON.stringify(cachePayload)).digest('hex')
}

function getCachedSummary(cacheKey) {
  const entry = summaryCache.get(cacheKey)

  if (!entry) {
    return null
  }

  if (Date.now() - entry.createdAt > SUMMARY_CACHE_TTL_MS) {
    summaryCache.delete(cacheKey)
    return null
  }

  summaryCache.delete(cacheKey)
  summaryCache.set(cacheKey, entry)

  return entry.value
}

function setCachedSummary(cacheKey, value) {
  summaryCache.set(cacheKey, {
    createdAt: Date.now(),
    value,
  })

  while (summaryCache.size > SUMMARY_CACHE_MAX_ITEMS) {
    const oldestKey = summaryCache.keys().next().value

    if (!oldestKey) {
      break
    }

    summaryCache.delete(oldestKey)
  }
}

function buildNewsSummaryPrompt(input) {
  const articlesText = input.articles.map(sanitizeArticle).join('\n\n')

  return [
    'Voce e um editor jornalistico do Portal Escarlate.',
    'Abaixo ha titulos e resumos de noticias retornadas por uma busca.',
    'Escreva uma sintese central em portugues do Brasil, com leitura fluida, elegante e jornalistica.',
    'O texto deve parecer uma analise curta de contexto, conectando os fatos principais em uma narrativa continua, e nao uma colagem de frases soltas.',
    'Priorize as noticias mais relevantes, recorrentes ou impactantes da lista.',
    'Voce nao precisa citar todas as noticias, mas deve usar no minimo metade das noticias recebidas e no maximo todas.',
    'Quando houver noticias parecidas, agrupe a ideia em uma mesma passagem, sem repetir informacoes.',
    'A sintese deve ser um texto unico, natural e bom de ler.',
    'Quando uma frase ou trecho estiver relacionado a uma noticia especifica, marque esse trecho no formato [[texto do trecho]]((ShortID)).',
    'Exemplo: Nessa semana, [[a decisao economica ganhou destaque]]((abc123)) enquanto [[novas medidas foram anunciadas]]((def456)).',
    'O ShortID deve aparecer somente dentro dos parenteses finais ((ShortID)). Nunca coloque o ShortID dentro do texto visivel.',
    'Errado: [[(abc123)]]((abc123)). Correto: [[a decisao economica ganhou destaque]]((abc123)).',
    'Regra obrigatoria: praticamente todo o texto informativo deve estar dentro de marcacoes [[...]]((ShortID)).',
    'Trechos sem ShortID devem ser apenas conectivos muito curtos, como "Enquanto isso," ou "No mesmo periodo,".',
    'Nunca deixe uma frase inteira sem marcacao.',
    'Nunca deixe nomes, fatos, acontecimentos, locais, numeros, consequencias ou conclusoes fora de marcacao quando vierem de alguma noticia.',
    'Se uma frase combina duas noticias, divida a frase em dois ou mais trechos marcados, cada um com o ShortID correto.',
    'O leitor deve conseguir clicar em quase todo o resumo.',
    'Use apenas ShortIDs recebidos na lista de noticias.',
    'Nao invente fatos que nao estejam nos resumos. Se houver poucos dados, deixe isso claro.',
    'Retorne apenas texto limpo com essas marcacoes internas.',
    'Nao crie titulo.',
    'Nao use Markdown.',
    'Nao use listas, bullets, numeracao, negrito, italico, hashtags, tabelas, citacoes ou separadores.',
    'Nao comece com frases como "Resumo:", "Sintese:" ou "Noticia central:".',
    'Use de 2 a 4 paragrafos curtos, com ritmo natural e boa transicao entre os assuntos.',
    'Use entre 180 e 320 palavras quando houver noticias suficientes.',
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
            'Voce resume noticias com precisao em texto limpo, sem Markdown, sem titulo e sem listas. Use marcacoes [[trecho]]((shortId)) quando associar trechos a noticias. O shortId nunca deve aparecer como texto visivel.',
        },
        {
          role: 'user',
          content: buildNewsSummaryPrompt(input),
        },
      ],
      temperature: 0.3,
    }),
    source: 'news-summary-service',
    signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.message ?? AI_UNAVAILABLE_MESSAGE)
  }

  if (typeof payload?.content !== 'string') {
    throw new Error('A IA nao retornou um resumo valido.')
  }

  return payload
}

async function requestAiCorrection(input) {
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
            'Voce corrige marcacoes de resumo. Retorne apenas o texto corrigido, sem Markdown, sem titulo e sem listas.',
        },
        {
          role: 'user',
          content: [
            'O texto abaixo tem muitos trechos sem ShortID.',
            'Reescreva mantendo uma leitura fluida, mas coloque praticamente todo trecho informativo no formato [[texto]]((ShortID)).',
            'Trechos sem ShortID so podem ser conectivos curtos.',
            'Use apenas os ShortIDs listados nas noticias.',
            '',
            'Noticias disponiveis:',
            input.articles.map(sanitizeArticle).join('\n\n'),
            '',
            'Texto a corrigir:',
            input.markedSummary,
          ].join('\n'),
        },
      ],
      temperature: 0.2,
    }),
    source: 'news-summary-service',
    signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.message ?? AI_UNAVAILABLE_MESSAGE)
  }

  if (typeof payload?.content !== 'string') {
    throw new Error('A IA nao retornou uma correcao valida.')
  }

  return payload
}

function parseSummarySegments(summary, articles) {
  const validShortIds = new Set(
    articles
      .map((article) => (typeof article.shortId === 'string' ? article.shortId.trim() : ''))
      .filter(Boolean),
  )
  const segments = []
  const pattern = /\[\[([\s\S]+?)\]\]\(\(([^)]+)\)\)/g
  let match

  while ((match = pattern.exec(summary)) !== null) {
    const text = cleanPlainText(match[1] ?? '')
    const shortId = String(match[2] ?? '').trim()

    if (text && validShortIds.has(shortId)) {
      segments.push({
        shortId,
        text,
      })
    }
  }

  return segments.slice(0, 12)
}

function cleanVisibleMarkedText(text, shortId) {
  const escapedShortId = shortId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  return cleanPlainText(text)
    .replace(new RegExp(`\\s*\\(?\\[?${escapedShortId}\\]?\\)?\\s*`, 'gi'), ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function cleanMarkedSummary(value) {
  const cleaned = value
    .replace(/^```(?:text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/^\s*(resumo|sintese|síntese|noticia central|notícia central)\s*:\s*/i, '')
    .trim()

  return cleaned.replace(/\[\[([\s\S]+?)\]\]\(\(([^)]+)\)\)/g, (fullMatch, text, shortId) => {
    const normalizedShortId = String(shortId ?? '').trim()
    const visibleText = cleanVisibleMarkedText(text, normalizedShortId)

    if (!visibleText) {
      return ''
    }

    return `[[${visibleText}]]((${normalizedShortId}))`
  })
}

function stripSummaryMarkers(value) {
  return cleanPlainText(value.replace(/\[\[([\s\S]+?)\]\]\(\([^)]+\)\)/g, '$1'))
}

function normalizeTextForMatch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getMatchTokens(value) {
  return normalizeTextForMatch(value)
    .split(' ')
    .filter((token) => token.length > 3)
}

function getBestArticleShortId(text, articles, fallbackIndex) {
  const textTokens = new Set(getMatchTokens(text))
  let bestArticle = null
  let bestScore = 0

  for (const article of articles) {
    const shortId = typeof article.shortId === 'string' ? article.shortId.trim() : ''

    if (!shortId) {
      continue
    }

    const articleTokens = getMatchTokens(`${article.title ?? ''} ${article.description ?? ''}`)
    const score = articleTokens.reduce((total, token) => total + (textTokens.has(token) ? 1 : 0), 0)

    if (score > bestScore) {
      bestScore = score
      bestArticle = article
    }
  }

  if (bestArticle?.shortId) {
    return bestArticle.shortId.trim()
  }

  const fallbackArticle = articles[fallbackIndex % articles.length]
  return typeof fallbackArticle?.shortId === 'string' && fallbackArticle.shortId.trim()
    ? fallbackArticle.shortId.trim()
    : ''
}

function splitParagraphIntoSentences(paragraph) {
  const matches = paragraph.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [paragraph]
  return matches.map((sentence) => sentence.trim()).filter(Boolean)
}

function rebuildMarkedSummaryLocally(value, articles) {
  const validArticles = articles.filter(
    (article) => typeof article.shortId === 'string' && article.shortId.trim().length > 0,
  )

  if (validArticles.length === 0) {
    return cleanMarkedSummary(value)
  }

  const plainSummary = stripSummaryMarkers(value)
  const paragraphs = plainSummary
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  let fallbackIndex = 0

  return paragraphs
    .map((paragraph) =>
      splitParagraphIntoSentences(paragraph)
        .map((sentence) => {
          const shortId = getBestArticleShortId(sentence, validArticles, fallbackIndex)
          fallbackIndex += 1

          if (!shortId) {
            return sentence
          }

          return `[[${sentence}]]((${shortId}))`
        })
        .join(' '),
    )
    .join('\n\n')
    .trim()
}

function ensureValidMarkedSummary(value, articles) {
  const cleaned = cleanMarkedSummary(value)
  const ratio = calculateMarkedTextRatio(cleaned)

  if (ratio >= MIN_MARKED_TEXT_RATIO) {
    return cleaned
  }

  const rebuilt = rebuildMarkedSummaryLocally(cleaned, articles)

  if (calculateMarkedTextRatio(rebuilt) > ratio) {
    return rebuilt
  }

  return cleaned
}

function calculateMarkedTextRatio(value) {
  const plainLength = stripSummaryMarkers(value).replace(/\s+/g, '').length
  const markedLength = Array.from(value.matchAll(/\[\[([\s\S]+?)\]\]\(\([^)]+\)\)/g)).reduce(
    (total, match) => total + String(match[1] ?? '').replace(/\s+/g, '').length,
    0,
  )

  if (plainLength === 0) {
    return 0
  }

  return markedLength / plainLength
}

async function handleNewsSummary(request, response) {
  if (!getSessionUser(request)) {
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
          ? 'Dados para resumo muito grandes.'
          : 'Nao foi possivel ler os dados para resumo.',
    })
    return
  }

  const articles = Array.isArray(payload?.articles) ? payload.articles.slice(0, 20) : []
  const query = typeof payload?.query === 'string' ? payload.query.trim() : ''

  if (!query || articles.length === 0) {
    json(response, 400, { message: 'Informe uma busca e ao menos uma noticia para resumir.' })
    return
  }

  try {
    const cacheKey = buildSummaryCacheKey({ query, articles })
    const cachedSummary = getCachedSummary(cacheKey)

    if (cachedSummary) {
      json(response, 200, cachedSummary)
      return
    }

    const aiResult = await requestAiSummary({ query, articles })
    let markedSummary = cleanMarkedSummary(aiResult.content)
    let provider = aiResult.provider
    let model = aiResult.model

    if (calculateMarkedTextRatio(markedSummary) < MIN_CORRECTION_TEXT_RATIO) {
      try {
        const corrected = await requestAiCorrection({ articles, markedSummary })
        markedSummary = cleanMarkedSummary(corrected.content)
        provider = corrected.provider ?? provider
        model = corrected.model ?? model
      } catch (error) {
        console.warn('[news-summary-service] Failed to correct marked summary, using local repair', {
          message: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    markedSummary = ensureValidMarkedSummary(markedSummary, articles)

    const segments = parseSummarySegments(markedSummary, articles)
    const summary = stripSummaryMarkers(markedSummary)

    const responsePayload = {
      summary,
      markedSummary,
      segments,
      provider,
      model,
    }

    setCachedSummary(cacheKey, responsePayload)
    json(response, 200, responsePayload)
  } catch (error) {
    console.error('[news-summary-service] Failed to summarize news', error)
    json(response, 500, {
      message: AI_UNAVAILABLE_MESSAGE,
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
