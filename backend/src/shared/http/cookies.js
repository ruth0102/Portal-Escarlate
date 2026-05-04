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

