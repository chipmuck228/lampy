const { ERROR_CODES, DomainError } = require('../domain/moment/moment.errors.js')
const { toIso } = require('../domain/shared/time.js')
const {
  partitionRecords,
  toQuarantineEntry,
  mergeQuarantine,
  inspectCollection,
  readRawArray,
} = require('./record-partition.js')

function createSafeRepository({ storage, collectionKey, quarantineKey, entityType, validate }) {
  function nowIso() {
    return toIso(Date.now())
  }

  function quarantineInvalid(invalid) {
    if (!invalid.length) return
    const stamp = nowIso()
    const incoming = invalid.map((item) => toQuarantineEntry(entityType, item, stamp))
    const existing = readRawArray(storage, quarantineKey)
    storage.set(quarantineKey, mergeQuarantine(existing, incoming, stamp))
  }

  function quarantineCorruptCollection(raw) {
    quarantineInvalid([{
      raw,
      index: -1,
      errors: [{
        code: ERROR_CODES.REPOSITORY_COLLECTION_NOT_ARRAY,
        message: 'top-level collection is not an array',
      }],
      reason: ERROR_CODES.REPOSITORY_COLLECTION_NOT_ARRAY,
    }])
  }

  function readArrayOrMissing() {
    const inspected = inspectCollection(storage, collectionKey)
    if (inspected.kind === 'corrupt') {
      quarantineCorruptCollection(inspected.raw)
      throw new DomainError(
        ERROR_CODES.REPOSITORY_COLLECTION_NOT_ARRAY,
        'top-level collection is not an array'
      )
    }
    return inspected.kind === 'array' ? inspected.raw : []
  }

  function listValid() {
    const inspected = inspectCollection(storage, collectionKey)
    if (inspected.kind === 'corrupt') {
      quarantineCorruptCollection(inspected.raw)
      return []
    }
    const raw = inspected.kind === 'array' ? inspected.raw : []
    const { valid, invalid } = partitionRecords(raw, validate)
    quarantineInvalid(invalid)
    return valid
  }

  return {
    getById(id) {
      return listValid().find((item) => item.id === id) || null
    },
    list() {
      return listValid()
    },
    collectionKind() {
      return inspectCollection(storage, collectionKey).kind
    },
    save(entity) {
      const result = validate(entity)
      if (!result.ok) {
        throw new DomainError(
          ERROR_CODES.REPOSITORY_INVALID_RECORD,
          (result.errors[0] && result.errors[0].message) || 'invalid record'
        )
      }
      const raw = readArrayOrMissing()
      const next = []
      const discovered = []
      raw.forEach((item, index) => {
        if (item && item.id === entity.id) return
        next.push(item)
        const check = validate(item)
        if (!check.ok) {
          discovered.push({
            raw: item,
            index,
            errors: check.errors || [],
            reason: (check.errors && check.errors[0] && check.errors[0].code) || 'invalid',
          })
        }
      })
      next.unshift(entity)
      quarantineInvalid(discovered)
      storage.set(collectionKey, next)
      return entity
    },
    remove(id) {
      if (!id || typeof id !== 'string') {
        throw new DomainError(ERROR_CODES.REPOSITORY_INVALID_RECORD, 'remove requires a non-empty id')
      }
      const raw = readArrayOrMissing()
      let removed = false
      const next = raw.filter((item) => {
        if (item && item.id === id) {
          removed = true
          return false
        }
        return true
      })
      storage.set(collectionKey, next)
      return { removed }
    },
    replaceAll(records) {
      if (!Array.isArray(records)) {
        throw new DomainError(ERROR_CODES.REPOSITORY_INVALID_RECORD, 'replaceAll requires an array')
      }
      const { valid, invalid } = partitionRecords(records, validate)
      if (invalid.length) {
        throw new DomainError(ERROR_CODES.REPOSITORY_INVALID_RECORD, 'replaceAll rejected invalid records')
      }
      readArrayOrMissing()
      storage.set(collectionKey, valid.slice())
      return valid.slice()
    },
  }
}

module.exports = {
  createSafeRepository,
}
