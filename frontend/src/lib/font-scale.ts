const FONT_SCALE_COOKIE = 'portal_font_scale'
export const MIN_FONT_SCALE = 0.8
export const MAX_FONT_SCALE = 1.3
const FONT_SCALE_STEP = 0.05
const DEFAULT_FONT_SCALE = 1

function clampFontScale(value: number) {
  return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, value))
}

function normalizeFontScale(value: number) {
  return Number(clampFontScale(value).toFixed(2))
}

function getCookieValue(name: string) {
  const prefix = `${name}=`
  const cookie = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix))

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : ''
}

export function getStoredFontScale() {
  const parsed = Number.parseFloat(getCookieValue(FONT_SCALE_COOKIE))

  if (!Number.isFinite(parsed)) {
    return DEFAULT_FONT_SCALE
  }

  return normalizeFontScale(parsed)
}

export function applyFontScale(value: number) {
  const nextValue = normalizeFontScale(value)
  document.documentElement.style.setProperty('--font-scale', String(nextValue))
  return nextValue
}

export function saveFontScale(value: number) {
  const nextValue = applyFontScale(value)
  const maxAge = 60 * 60 * 24 * 365
  document.cookie = `${FONT_SCALE_COOKIE}=${encodeURIComponent(String(nextValue))}; Path=/; Max-Age=${maxAge}; SameSite=Lax`
  return nextValue
}

export function increaseFontScale(current: number) {
  return saveFontScale(current + FONT_SCALE_STEP)
}

export function decreaseFontScale(current: number) {
  return saveFontScale(current - FONT_SCALE_STEP)
}

export function resetFontScale() {
  return saveFontScale(DEFAULT_FONT_SCALE)
}
