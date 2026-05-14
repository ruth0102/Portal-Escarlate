const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_EMAIL = 5
const MAX_PER_IP = 20

const store = {
  byEmail: new Map(),
  byIp: new Map(),
}

function consumeBucket(map, key, max) {
  const now = Date.now()
  const current = map.get(key)

  if (!current || current.resetAt <= now) {
    map.set(key, {
      count: 1,
      resetAt: now + WINDOW_MS,
    })
    return true
  }

  if (current.count >= max) {
    return false
  }

  current.count += 1
  map.set(key, current)
  return true
}

function clearBucket(map, key) {
  map.delete(key)
}

export function consumeLoginRateLimit(input) {
  const emailAllowed = consumeBucket(store.byEmail, input.email, MAX_PER_EMAIL)
  const ipAllowed = consumeBucket(store.byIp, input.ip, MAX_PER_IP)

  return emailAllowed && ipAllowed
}

export function clearLoginRateLimit(input) {
  clearBucket(store.byEmail, input.email)
  clearBucket(store.byIp, input.ip)
}
