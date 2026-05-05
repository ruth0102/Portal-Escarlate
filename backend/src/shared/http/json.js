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

export async function readJson(request) {
  const chunks = []

  for await (const chunk of request) {
    chunks.push(chunk)
  }

  if (chunks.length === 0) {
    return null
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

