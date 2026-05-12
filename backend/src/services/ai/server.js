import http from 'node:http'
import { listActiveAiConfigs } from '../../lib/ai/config-repo.js'
import { json, noContent, readJson } from '../../shared/http/json.js'
import { getSessionUser } from '../../shared/http/session-user.js'

const port = Number.parseInt(process.env.AI_SERVICE_PORT ?? '3004', 10)
const hostname = process.env.HOST ?? '127.0.0.1'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

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
    throw new Error(data?.error?.message ?? `OpenRouter failed with status ${openRouterResponse.status}`)
  }

  const content = data?.choices?.[0]?.message?.content

  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('A IA nao retornou uma resposta valida.')
  }

  return content.trim()
}

async function completeWithFallback(input) {
  const configs = await listActiveAiConfigs()
  let lastError

  for (const config of configs) {
    if (config.provider !== 'openrouter') {
      continue
    }

    for (const model of config.models) {
      try {
        const content = await requestOpenRouterCompletion({
          apiKey: config.apiKey,
          model,
          messages: input.messages,
          temperature: input.temperature,
        })

        return {
          content,
          provider: config.provider,
          model,
        }
      } catch (error) {
        lastError = error
        console.error('[ai-service] AI config failed', {
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
    json(response, 500, {
      message:
        error instanceof Error ? error.message : 'Nao foi possivel completar a requisicao de IA.',
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
