export function getCurrentRedirectPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

export function buildLoginRedirectPath(target = getCurrentRedirectPath()) {
  const redirectTarget = target.startsWith('/') ? target : '/'
  return `/login?redirect=${encodeURIComponent(redirectTarget)}`
}

export function sanitizeLoginRedirect(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard'
  }

  if (value === '/login' || value.startsWith('/login?')) {
    return '/dashboard'
  }

  return value
}
