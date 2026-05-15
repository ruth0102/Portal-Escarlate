import http from 'node:http'
import { lookup } from 'node:dns/promises'
import net from 'node:net'
import { publishEventSafely } from '../../lib/events/event-client.js'
import { requestService } from '../../lib/events/service-request-client.js'
import {
  findArticleSummaryById,
  findArticleSummaryByNormalizedUrl,
  upsertArticleSummary,
} from '../../lib/article-summary/article-summary-repo.js'
import { json, noContent, readJson } from '../../shared/http/json.js'
import { getSessionUser } from '../../shared/http/session-user.js'

const port = Number.parseInt(process.env.ARTICLE_SUMMARY_SERVICE_PORT ?? '3008', 10)
const hostname = process.env.HOST ?? '127.0.0.1'
const ARTICLE_FETCH_TIMEOUT_MS = 7000
const AI_REQUEST_TIMEOUT_MS = 45000
const MAX_ARTICLE_HTML_LENGTH = 1_500_000
const MAX_ARTICLE_TEXT_LENGTH = 12_000
const AI_UNAVAILABLE_MESSAGE = 'IA invalida no momento.'

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

  const targetHostname = parsed.hostname.toLowerCase()

  if (targetHostname === 'localhost' || targetHostname.endsWith('.localhost')) {
    throw new Error('URL local nao permitida para extracao de noticia.')
  }

  const addresses = await lookup(targetHostname, { all: true, verbatim: true })

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
    'Abaixo esta o conteudo de uma noticia recuperada a partir da URL original e, se necessario, complementada por dados da listagem de noticias.',
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

async function requestAiSummary(articleForPrompt) {
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
            'Voce resume noticias com precisao, sem inventar fatos, em texto limpo, sem Markdown e sem titulo.',
        },
        {
          role: 'user',
          content: buildSummaryPrompt(articleForPrompt),
        },
      ],
      temperature: 0.3,
    }),
    source: 'article-summary-service',
    signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.message ?? AI_UNAVAILABLE_MESSAGE)
  }

  if (typeof payload?.content !== 'string' || !payload.content.trim()) {
    throw new Error('A IA nao retornou um resumo valido.')
  }

  return payload
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
        source: 'article-summary-service',
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
      publishedAt: payload?.publishedAt ?? null,
    }
    let articleFromUrl = null

    try {
      articleFromUrl = await fetchArticleFromUrl(url)
    } catch (fetchError) {
      console.warn('[article-summary-service] Could not extract full article from URL', {
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

    const aiPayload = await requestAiSummary(articleForPrompt)
    const savedSummary = await upsertArticleSummary({
      url: articleForPrompt.url ?? url,
      normalizedUrl: normalizedTargetUrl,
      title: articleForPrompt.title ?? title,
      author: articleForPrompt.author ?? author,
      source: articleForPrompt.source?.name || articleForPrompt.source || source,
      publishedAt: articleForPrompt.publishedAt ?? null,
      urlToImage: articleForPrompt.urlToImage ?? urlToImage,
      summary: aiPayload.content.trim(),
      provider: aiPayload?.provider ?? '',
      model: aiPayload?.model ?? '',
    })

    void publishEventSafely({
      type: 'news.summary_generated',
      source: 'article-summary-service',
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
      source: 'article-summary-service',
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
    console.error('[article-summary-service] Failed to summarize news', error)
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
      source: 'article-summary-service',
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
    console.error('[article-summary-service] Failed to load stored summary', error)
    json(response, 500, { message: 'Nao foi possivel carregar o resumo.' })
  }
}

async function route(request, response) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${hostname}:${port}`}`)

  if (request.method === 'OPTIONS') {
    noContent(response)
    return
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    json(response, 200, { service: 'article-summary', status: 'ok' })
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
    console.error('[article-summary-service] Unhandled error', error)
    json(response, 500, { message: 'Erro interno do servico de resumo de noticia.' })
  })
})

server.listen(port, hostname, () => {
  console.log(`Article summary service running at http://${hostname}:${port}`)
})
