export function parseCookies(request) {
  const cookie = request.headers.cookie

  if (!cookie) {
    return {}
  }

  return Object.fromEntries(
    cookie.split(';').flatMap((part) => {
      const [rawKey, ...rawValue] = part.trim().split('=')

      if (!rawKey) {
        return []
      }

      return [[rawKey, decodeURIComponent(rawValue.join('='))]]
    }),
  )
}

export function getCookieValues(request, name) {
  const cookie = request.headers.cookie

  if (!cookie || !name) {
    return []
  }

  return cookie.split(';').flatMap((part) => {
    const [rawKey, ...rawValue] = part.trim().split('=')

    if (rawKey !== name) {
      return []
    }

    return [decodeURIComponent(rawValue.join('='))]
  })
}
