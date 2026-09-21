const { SCHEMA_VERSION } = require('../shared/identity')
const { isIso } = require('../shared/time')
const { ERROR_CODES } = require('./moment.errors')

const PRECISIONS = ['exact', 'day', 'month', 'year', 'unknown']
const VISIBILITIES = ['private', 'selected_people', 'shared_space', 'public']
const STATUSES = ['draft', 'active', 'archived', 'trashed']
const IMPORT_SOURCES = ['album', 'camera', 'file', 'voice']

function issue(code, message, path) {
  return { code, message, path }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function hasActiveContent(moment) {
  const note = moment.content && typeof moment.content.note === 'string'
    ? moment.content.note.trim()
    : ''
  const assets = Array.isArray(moment.assetIds) ? moment.assetIds.filter(isNonEmptyString) : []
  const received = moment.origin && moment.origin.type === 'received'
    && isNonEmptyString(moment.origin.transmissionId)
    && isNonEmptyString(moment.origin.originalMomentId)
    && Number.isInteger(moment.origin.snapshotRevision)
  return note.length > 0 || assets.length > 0 || !!received
}

function validateOrigin(origin, errors) {
  if (!origin || typeof origin !== 'object') {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_ORIGIN, 'origin is required', 'origin'))
    return
  }
  if (origin.legacy !== undefined && typeof origin.legacy !== 'boolean') {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_ORIGIN, 'legacy must be boolean', 'origin.legacy'))
  }
  if (origin.legacySource !== undefined && typeof origin.legacySource !== 'string') {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_ORIGIN, 'legacySource must be string', 'origin.legacySource'))
  }
  if (origin.type === 'created') return
  if (origin.type === 'imported') {
    if (IMPORT_SOURCES.indexOf(origin.importSource) === -1) {
      errors.push(issue(ERROR_CODES.MOMENT_INVALID_ORIGIN, 'imported origin needs importSource', 'origin.importSource'))
    }
    return
  }
  if (origin.type === 'received') {
    if (!isNonEmptyString(origin.transmissionId)) {
      errors.push(issue(ERROR_CODES.MOMENT_INVALID_ORIGIN, 'received origin needs transmissionId', 'origin.transmissionId'))
    }
    if (!isNonEmptyString(origin.originalMomentId)) {
      errors.push(issue(ERROR_CODES.MOMENT_INVALID_ORIGIN, 'received origin needs originalMomentId', 'origin.originalMomentId'))
    }
    if (!Number.isInteger(origin.snapshotRevision) || origin.snapshotRevision < 1) {
      errors.push(issue(ERROR_CODES.MOMENT_INVALID_ORIGIN, 'received origin needs snapshotRevision', 'origin.snapshotRevision'))
    }
    return
  }
  errors.push(issue(ERROR_CODES.MOMENT_INVALID_ORIGIN, 'unknown origin type', 'origin.type'))
}

function validateContent(content, errors) {
  if (!content || typeof content !== 'object') {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_CONTENT, 'content must be an object', 'content'))
    return
  }
  ;['note', 'significance', 'emotion'].forEach((key) => {
    if (content[key] !== undefined && typeof content[key] !== 'string') {
      errors.push(issue(ERROR_CODES.MOMENT_INVALID_CONTENT, `${key} must be a string`, `content.${key}`))
    }
  })
}

function validateContext(context, errors) {
  if (!context || typeof context !== 'object') {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_CONTEXT, 'context must be an object', 'context'))
    return
  }
  if (!Array.isArray(context.people)) {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_CONTEXT, 'people must be an array', 'context.people'))
  } else {
    context.people.forEach((person, index) => {
      if (!person || typeof person !== 'object') {
        errors.push(issue(ERROR_CODES.MOMENT_INVALID_CONTEXT, 'person must be an object', `context.people.${index}`))
        return
      }
      if (!isNonEmptyString(person.id)) {
        errors.push(issue(ERROR_CODES.MOMENT_INVALID_CONTEXT, 'person.id is required', `context.people.${index}.id`))
      }
      if (!isNonEmptyString(person.displayName)) {
        errors.push(issue(ERROR_CODES.MOMENT_INVALID_CONTEXT, 'person.displayName is required', `context.people.${index}.displayName`))
      }
      if (person.linkedUserId !== undefined && typeof person.linkedUserId !== 'string') {
        errors.push(issue(ERROR_CODES.MOMENT_INVALID_CONTEXT, 'linkedUserId must be string', `context.people.${index}.linkedUserId`))
      }
      if (person.relationship !== undefined && typeof person.relationship !== 'string') {
        errors.push(issue(ERROR_CODES.MOMENT_INVALID_CONTEXT, 'relationship must be string', `context.people.${index}.relationship`))
      }
    })
  }
  if (!Array.isArray(context.tags)) {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_CONTEXT, 'tags must be an array', 'context.tags'))
  } else if (context.tags.some((tag) => typeof tag !== 'string')) {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_CONTEXT, 'tags must be strings', 'context.tags'))
  }
  if (context.place !== undefined && context.place !== null) {
    if (typeof context.place !== 'object') {
      errors.push(issue(ERROR_CODES.MOMENT_INVALID_CONTEXT, 'place must be an object', 'context.place'))
    } else {
      if (!isNonEmptyString(context.place.id) || !isNonEmptyString(context.place.displayName)) {
        errors.push(issue(ERROR_CODES.MOMENT_INVALID_CONTEXT, 'place needs id and displayName', 'context.place'))
      }
      if (context.place.latitude !== undefined && typeof context.place.latitude !== 'number') {
        errors.push(issue(ERROR_CODES.MOMENT_INVALID_CONTEXT, 'latitude must be number', 'context.place.latitude'))
      }
      if (context.place.longitude !== undefined && typeof context.place.longitude !== 'number') {
        errors.push(issue(ERROR_CODES.MOMENT_INVALID_CONTEXT, 'longitude must be number', 'context.place.longitude'))
      }
    }
  }
}

function validateAssetIds(assetIds, errors) {
  if (!Array.isArray(assetIds)) {
    errors.push(issue(ERROR_CODES.ASSET_NOT_FOUND, 'assetIds must be an array', 'assetIds'))
    return
  }
  const seen = {}
  assetIds.forEach((id, index) => {
    if (!isNonEmptyString(id)) {
      errors.push(issue(ERROR_CODES.ASSET_NOT_FOUND, 'assetId must be a non-empty string', `assetIds.${index}`))
      return
    }
    if (seen[id]) {
      errors.push(issue(ERROR_CODES.ASSET_NOT_FOUND, 'duplicate assetId', `assetIds.${index}`))
    }
    seen[id] = true
  })
}

function validateLifecycle(moment, errors) {
  const lifecycle = moment.lifecycle
  if (!lifecycle || typeof lifecycle !== 'object') {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_LIFECYCLE, 'lifecycle must be an object', 'lifecycle'))
    return
  }
  if (STATUSES.indexOf(lifecycle.status) === -1) {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_TRANSITION, 'invalid lifecycle status', 'lifecycle.status'))
    return
  }
  ;['activatedAt', 'archivedAt', 'trashedAt'].forEach((key) => {
    if (lifecycle[key] !== undefined && !isIso(lifecycle[key])) {
      errors.push(issue(ERROR_CODES.MOMENT_INVALID_TIME, `${key} must be ISO`, `lifecycle.${key}`))
    }
  })
  if (lifecycle.status === 'active' && !isIso(lifecycle.activatedAt)) {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_LIFECYCLE, 'active moment needs activatedAt', 'lifecycle.activatedAt'))
  }
  if (lifecycle.status === 'archived' && !isIso(lifecycle.archivedAt)) {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_LIFECYCLE, 'archived moment needs archivedAt', 'lifecycle.archivedAt'))
  }
  if (lifecycle.status === 'trashed' && !isIso(lifecycle.trashedAt)) {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_LIFECYCLE, 'trashed moment needs trashedAt', 'lifecycle.trashedAt'))
  }
  if (lifecycle.status !== 'draft' && !hasActiveContent(moment)) {
    errors.push(issue(ERROR_CODES.MOMENT_EMPTY, 'active moment needs content, assets, or received origin'))
  }
}

function validateMoment(raw) {
  const errors = []
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: [issue(ERROR_CODES.MOMENT_INVALID_ID, 'moment is required')] }
  }
  const moment = raw

  if (!isNonEmptyString(moment.id)) {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_ID, 'id is required', 'id'))
  }
  if (!isNonEmptyString(moment.ownerId)) {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_OWNER, 'ownerId is required', 'ownerId'))
  }
  if (moment.schemaVersion !== SCHEMA_VERSION) {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_ID, 'schemaVersion must be 1', 'schemaVersion'))
  }
  if (!Number.isInteger(moment.revision) || moment.revision < 1) {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_ID, 'revision must start at 1', 'revision'))
  }

  validateContent(moment.content, errors)

  const time = moment.time
  if (!time || typeof time !== 'object') {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_TIME, 'time must be an object', 'time'))
  } else {
    if (!isIso(time.recordedAt)) {
      errors.push(issue(ERROR_CODES.MOMENT_INVALID_TIME, 'recordedAt must be ISO', 'time.recordedAt'))
    }
    if (PRECISIONS.indexOf(time.occurredAtPrecision) === -1) {
      errors.push(issue(ERROR_CODES.MOMENT_INVALID_TIME, 'invalid occurredAtPrecision', 'time.occurredAtPrecision'))
    } else if (time.occurredAtPrecision !== 'unknown' && !isIso(time.occurredAt)) {
      errors.push(issue(ERROR_CODES.MOMENT_INVALID_TIME, 'occurredAt required for this precision', 'time.occurredAt'))
    }
    if (time.occurredAt && !isIso(time.occurredAt)) {
      errors.push(issue(ERROR_CODES.MOMENT_INVALID_TIME, 'occurredAt must be ISO', 'time.occurredAt'))
    }
    if (time.importedAt && !isIso(time.importedAt)) {
      errors.push(issue(ERROR_CODES.MOMENT_INVALID_TIME, 'importedAt must be ISO', 'time.importedAt'))
    }
    if (time.timezone !== undefined && time.timezone !== null && typeof time.timezone !== 'string') {
      errors.push(issue(ERROR_CODES.MOMENT_INVALID_TIME, 'timezone must be a string', 'time.timezone'))
    }
  }

  validateAssetIds(moment.assetIds, errors)
  validateContext(moment.context, errors)
  validateOrigin(moment.origin, errors)

  if (!moment.accessSummary || typeof moment.accessSummary !== 'object') {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_ACCESS, 'accessSummary is required', 'accessSummary'))
  } else {
    if (VISIBILITIES.indexOf(moment.accessSummary.visibility) === -1) {
      errors.push(issue(ERROR_CODES.MOMENT_INVALID_ACCESS, 'invalid visibility', 'accessSummary.visibility'))
    }
    if (typeof moment.accessSummary.futureAccessEnabled !== 'boolean') {
      errors.push(issue(ERROR_CODES.MOMENT_INVALID_ACCESS, 'futureAccessEnabled must be boolean', 'accessSummary.futureAccessEnabled'))
    }
  }

  validateLifecycle(moment, errors)

  const audit = moment.audit || {}
  if (!isIso(audit.createdAt) || !isIso(audit.updatedAt)) {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_TIME, 'audit timestamps must be ISO', 'audit'))
  } else if (Date.parse(audit.updatedAt) < Date.parse(audit.createdAt)) {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_TIME, 'updatedAt cannot be earlier than createdAt', 'audit.updatedAt'))
  }

  return { ok: errors.length === 0, errors }
}

module.exports = {
  validateMoment,
  hasActiveContent,
  isNonEmptyString,
}
