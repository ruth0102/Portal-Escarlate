import http from 'node:http'
import { listActiveAiConfigs } from '../../lib/ai/config-repo.js'
import { json, noContent, readJson } from '../../shared/http/json.js'
import { getSessionUser } from '../../shared/http/session-user.js'

const port = Number.parseInt(process.env.AI_SERVICE_PORT ?? '3004', 10)
const hostname = process.env.HOST ?? '127.0.0.1'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const FAILED_AI_TARGET_COOLDOWN_MS = 5 * 60 * 1000

let aiConfigsCache = null
let aiConfigsCachePromise = null
const failedAiTargets = new Map()

class AiProviderError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'AiProviderError'
    this.status = details.status
    this.code = details.code
    this.provider = details.provider
    this.model = details.model
    this.rawMessage = details.rawMessage
  }
}

function extractProviderError(data, status) {
  const error = data?.error
  const metadata = error?.metadata
  const rawMessage =
    typeof error?.message === 'string' && error.message.trim()
      ? error.message.trim()
      : `OpenRouter respondeu com status ${status}.`
  const providerMessage =
    typeof metadata?.raw === 'string' && metadata.raw.trim() ? metadata.raw.trim() : ''
  const code =
    typeof error?.code === 'string' || typeof error?.code === 'number' ? String(error.code) : ''
  const provider =
    typeof metadata?.provider_name === 'string' && metadata.provider_name.trim()
      ? metadata.provider_name.trim()
      : ''

  return {
    code,
    provider,
    rawMessage: providerMessage || rawMessage,
    message: providerMessage || rawMessage,
  }
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return []
  }

  return messages
    .map((message) => ({
      role: ['system', 'user', 'assistant'].includes(message?.role) ? message.role : 'user',
      content: typeof message?.content === 'string' ? message.content.trim() : '',
    }))
    .filter((message) => message.content.length > 0)
}

function getAiTargetId(config, model) {
  return `${config.apiKeyId}:${model}`
}

function isAiTargetCoolingDown(targetId) {
  const failedAt = failedAiTargets.get(targetId)

  if (!failedAt) {
    return false
  }

  if (Date.now() - failedAt > FAILED_AI_TARGET_COOLDOWN_MS) {
    failedAiTargets.delete(targetId)
    return false
  }

  return true
}

async function getCachedAiConfigs({ forceRefresh = false } = {}) {
  if (aiConfigsCache && !forceRefresh) {
    return aiConfigsCache
  }

  if (!aiConfigsCachePromise) {
    aiConfigsCachePromise = listActiveAiConfigs()
      .then((configs) => {
        aiConfigsCache = configs
        return configs
      })
      .finally(() => {
        aiConfigsCachePromise = null
      })
  }

  return aiConfigsCachePromise
}

async function requestOpenRouterCompletion(input) {
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
      messages: input.messages,
      temperature: input.temperature ?? 0.3,
    }),
  })

  const data = await openRouterResponse.json().catch(() => ({}))

  if (!openRouterResponse.ok) {
    const providerError = extractProviderError(data, openRouterResponse.status)

    throw new AiProviderError(providerError.message, {
      status: openRouterResponse.status,
      code: providerError.code,
      provider: providerError.provider,
      model: input.model,
      rawMessage: providerError.rawMessage,
    })
  }

  const content = data?.choices?.[0]?.message?.content

  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('A IA nao retornou uma resposta valida.')
  }

  return content.trim()
}

async function completeWithFallback(input) {
  let configs = await getCachedAiConfigs()
  let lastError
  let refreshedAfterFailure = false

  while (true) {
    let refreshedDuringLoop = false

    for (const config of configs) {
      if (config.provider !== 'openrouter') {
        continue
      }

      for (const model of config.models) {
        const targetId = getAiTargetId(config, model)

        if (isAiTargetCoolingDown(targetId)) {
          continue
        }

        try {
          const content = await requestOpenRouterCompletion({
            apiKey: config.apiKey,
            model,
            messages: input.messages,
            temperature: input.temperature,
          })

          failedAiTargets.delete(targetId)

          return {
            content,
            provider: config.provider,
            model,
          }
        } catch (error) {
          lastError = error
          failedAiTargets.set(targetId, Date.now())
          console.error('[ai-service] AI config failed, trying next fallback when available', {
            provider: config.provider,
            label: config.label,
            model,
            status: error?.status,
            code: error?.code,
            providerName: error?.provider,
            message: error instanceof Error ? error.message : 'Unknown error',
          })

          if (!refreshedAfterFailure) {
            configs = await getCachedAiConfigs({ forceRefresh: true })
            refreshedAfterFailure = true
            refreshedDuringLoop = true
            break
          }
        }
      }

      if (refreshedDuringLoop) {
        break
      }
    }

    if (!refreshedDuringLoop) {
      break
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }

  throw new Error('Nenhuma chave/modelo ativo configurado para IA.')
}

async function handleChatCompletion(request, response, { requireSession }) {
  if (requireSession && !getSessionUser(request)) {
    json(response, 401, { message: 'Sessao invalida. Faca login novamente.' })
    return
  }

  let payload

  try {
    payload = await readJson(request)
  } catch {
    json(response, 400, { message: 'Nao foi possivel ler os dados da requisicao de IA.' })
    return
  }

  const messages = normalizeMessages(payload?.messages)

  if (messages.length === 0) {
    json(response, 400, { message: 'Informe ao menos uma mensagem para a IA.' })
    return
  }

  try {
    const result = await completeWithFallback({
      messages,
      temperature:
        typeof payload?.temperature === 'number'
          ? Math.min(1, Math.max(0, payload.temperature))
          : undefined,
    })

    json(response, 200, result)
  } catch (error) {
    console.error('[ai-service] Failed to complete AI request', error)
    const providerSuffix =
      error instanceof AiProviderError
        ? [
            error.status ? `status ${error.status}` : '',
            error.code ? `codigo ${error.code}` : '',
            error.model ? `modelo ${error.model}` : '',
          ]
            .filter(Boolean)
            .join(', ')
        : ''

    json(response, 500, {
      message:
        error instanceof Error
          ? providerSuffix
            ? `${error.message} (${providerSuffix}).`
            : error.message
          : 'Nao foi possivel completar a requisicao de IA.',
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
    json(response, 200, { service: 'ai', status: 'ok' })
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/ai/chat') {
    await handleChatCompletion(request, response, { requireSession: true })
    return
  }

  if (request.method === 'POST' && url.pathname === '/internal/ai/chat') {
    await handleChatCompletion(request, response, { requireSession: false })
    return
  }

  json(response, 404, { error: 'Not found' })
}

const server = http.createServer((request, response) => {
  route(request, response).catch((error) => {
    console.error('[ai-service] Unhandled error', error)
    json(response, 500, { message: 'Erro interno do servico de IA.' })
  })
})

server.listen(port, hostname, () => {
  console.log(`AI service running at http://${hostname}:${port}`)
})
