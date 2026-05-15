const configuredApiBaseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/g, '')

function isLoopbackHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function getApiBaseUrl() {
  if (!configuredApiBaseUrl || typeof window === 'undefined') {
    return configuredApiBaseUrl
  }

  try {
    const apiUrl = new URL(configuredApiBaseUrl)

    if (isLoopbackHost(apiUrl.hostname) && isLoopbackHost(window.location.hostname)) {
      return ''
    }
  } catch {
    return configuredApiBaseUrl
  }

  return configuredApiBaseUrl
}

export function apiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return `${getApiBaseUrl()}${normalizedPath}`
}

export function apiFetch(path: string, init: RequestInit = {}) {
  return fetch(apiUrl(path), {
    ...init,
    credentials: init.credentials ?? 'include',
  })
}
