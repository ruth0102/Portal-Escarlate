export function getClientIp(request) {
  const forwarded = request.headers['x-forwarded-for']

  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || 'unknown'
  }

  const realIp = request.headers['x-real-ip']

  if (typeof realIp === 'string' && realIp.length > 0) {
    return realIp.trim()
  }

  return request.socket.remoteAddress ?? 'unknown'
}

