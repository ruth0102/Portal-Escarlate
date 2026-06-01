export class PayloadTooLargeError extends Error {
  constructor(message = 'Payload muito grande.') {
    super(message)
    this.name = 'PayloadTooLargeError'
    this.status = 413
  }
}

export function json(response, status, payload, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json',
    ...headers,
  })
  response.end(JSON.stringify(payload))
}

export function noContent(response, headers = {}) {
  response.writeHead(204, headers)
  response.end()
}

export async function readJson(request, { maxBytes = 1024 * 1024 } = {}) {
  const chunks = []
  let totalBytes = 0

  for await (const chunk of request) {
    totalBytes += chunk.length

    if (totalBytes > maxBytes) {
      throw new PayloadTooLargeError()
    }

    chunks.push(chunk)
  }

  if (chunks.length === 0) {
    return null
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
