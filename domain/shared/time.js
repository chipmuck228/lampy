const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/

function toIso(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }
  if (typeof value === 'string' && isIso(value)) {
    return new Date(value).toISOString()
  }
  return null
}

function isIso(value) {
  if (typeof value !== 'string' || !ISO_RE.test(value)) return false
  const time = Date.parse(value)
  return Number.isFinite(time)
}

function parseMillis(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') {
    const time = Date.parse(value)
    return Number.isFinite(time) ? time : null
  }
  return null
}

module.exports = {
  toIso,
  isIso,
  parseMillis,
}
