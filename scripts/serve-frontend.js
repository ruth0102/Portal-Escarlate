import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const distDir = path.join(root, 'frontend', 'dist')
const fallbackFile = path.join(distDir, 'index.html')
const PROXY_TIMEOUT_MS = 70000

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
])

function getFrontendPort() {
  const explicitPort = Number.parseInt(process.env.FRONTEND_PORT ?? '', 10)

  if (Number.isFinite(explicitPort) && explicitPort > 0) {
    return explicitPort
  }

  try {
    const appUrl = new URL(process.env.APP_URL ?? '')

    if (appUrl.port) {
      return Number.parseInt(appUrl.port, 10)
    }
  } catch {
    // Use the default below.
  }

  return 5173
}

function getGatewayUrl() {
  if (process.env.VITE_API_URL) {
    return process.env.VITE_API_URL.replace(/\/+$/g, '')
  }

  const host = process.env.GATEWAY_HOST ?? process.env.HOST ?? '127.0.0.1'
  const port = process.env.PORT ?? '3000'

  return `http://${host}:${port}`
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath)

  response.writeHead(200, {
    'content-type': mimeTypes.get(extension) ?? 'application/octet-stream',
  })
  createReadStream(filePath).pipe(response)
}

async function resolveFilePath(requestUrl) {
  const url = new URL(requestUrl ?? '/', 'http://localhost')
  const decodedPath = decodeURIComponent(url.pathname)
  const requestedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, '')
  const filePath = path.join(distDir, requestedPath)

  if (!filePath.startsWith(distDir)) {
    return null
  }

  try {
    const fileStat = await stat(filePath)

    if (fileStat.isFile()) {
      return filePath
    }
  } catch {
    // Fall back to the SPA entrypoint below.
  }

  return fallbackFile
}

const host = process.env.FRONTEND_HOST ?? '0.0.0.0'
const port = getFrontendPort()
const gatewayUrl = getGatewayUrl()

async function proxyApi(request, response) {
  const target = new URL(request.url ?? '/', gatewayUrl)
  const headers = { ...request.headers }

  delete headers.host

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request,
      duplex: 'half',
      redirect: 'manual',
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    })

    const responseHeaders = {}

    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') {
        return
      }

      responseHeaders[key] = value
    })

    const setCookies =
      typeof upstream.headers.getSetCookie === 'function'
        ? upstream.headers.getSetCookie()
        : []

    if (setCookies.length > 0) {
      responseHeaders['set-cookie'] = setCookies
    } else {
      const setCookie = upstream.headers.get('set-cookie')

      if (setCookie) {
        responseHeaders['set-cookie'] = setCookie
      }
    }

    response.writeHead(upstream.status, responseHeaders)

    if (!upstream.body) {
      response.end()
      return
    }

    const reader = upstream.body.getReader()

    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      response.write(Buffer.from(value))
    }

    response.end()
  } catch (error) {
    console.error('[frontend] Failed to proxy API request', error)
    response.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ message: 'Gateway indisponivel.' }))
  }
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.url?.startsWith('/api/')) {
      await proxyApi(request, response)
      return
    }

    const filePath = await resolveFilePath(request.url)

    if (!filePath) {
      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Forbidden')
      return
    }

    sendFile(response, filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Not found')
      return
    }

    console.error('[frontend] Failed to serve file', error)
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Internal server error')
  }
})

server.listen(port, host, () => {
  console.log(`Frontend running at http://${host}:${port}`)
  console.log(`Frontend API proxy target ${gatewayUrl}`)
})
