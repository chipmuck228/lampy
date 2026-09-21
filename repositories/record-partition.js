/**
 * Repository 数据分区：合法记录给页面，非法记录隔离但保留原文。
 */
const { hashCode } = require('../domain/shared/hash.js')

function stableStringify(value) {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function fingerprintOf(entityType, raw) {
  return `${entityType}:${hashCode(stableStringify(raw))}`
}

function partitionRecords(rawRecords, validator) {
  const valid = []
  const invalid = []
  if (!Array.isArray(rawRecords)) {
    return { valid, invalid }
  }
  rawRecords.forEach((raw, index) => {
    const result = validator(raw)
    if (result.ok) valid.push(raw)
    else {
      invalid.push({
        raw,
        index,
        errors: result.errors || [],
        reason: (result.errors && result.errors[0] && result.errors[0].code) || 'invalid',
      })
    }
  })
  return { valid, invalid }
}

function toQuarantineEntry(entityType, item, nowIso) {
  return {
    fingerprint: fingerprintOf(entityType, item.raw),
    entityType,
    reason: item.reason,
    errors: item.errors || [],
    raw: item.raw,
    firstSeenAt: nowIso,
    lastSeenAt: nowIso,
  }
}

function mergeQuarantine(existing, incoming, nowIso) {
  const next = Array.isArray(existing) ? existing.slice() : []
  const seen = {}
  next.forEach((entry) => {
    if (entry && entry.fingerprint) seen[entry.fingerprint] = entry
  })
  incoming.forEach((item) => {
    const found = seen[item.fingerprint]
    if (found) {
      found.lastSeenAt = nowIso
      return
    }
    next.push(item)
    seen[item.fingerprint] = item
  })
  return next
}

function readRawArray(storage, key) {
  const raw = storage.get(key, [])
  return Array.isArray(raw) ? raw.slice() : []
}

module.exports = {
  stableStringify,
  fingerprintOf,
  partitionRecords,
  toQuarantineEntry,
  mergeQuarantine,
  readRawArray,
}
