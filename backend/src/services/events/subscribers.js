function getServiceTarget(urlEnvName, hostEnvName, portEnvName, fallbackPort) {
  const serviceUrl = process.env[urlEnvName]?.trim()

  if (serviceUrl) {
    return serviceUrl.replace(/\/+$/g, '')
  }

  const host = process.env[hostEnvName] ?? process.env.HOST ?? '127.0.0.1'
  const port = process.env[portEnvName] ?? fallbackPort

  return `http://${host}:${port}`
}

export function getSubscribersForEvent(eventType) {
  const emailServiceUrl = getServiceTarget(
    'EMAIL_SERVICE_URL',
    'EMAIL_SERVICE_HOST',
    'EMAIL_SERVICE_PORT',
    '3005',
  )

  const subscribers = {
    'email.verification_requested': [
      {
        service: 'email-service',
        url: new URL('/internal/events', emailServiceUrl).toString(),
      },
    ],
    'email.password_recovery_requested': [
      {
        service: 'email-service',
        url: new URL('/internal/events', emailServiceUrl).toString(),
      },
    ],
  }

  return subscribers[eventType] ?? []
}
