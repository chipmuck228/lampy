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

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, errors: { code: string, message: string, path?: string }[] }}
 */
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

  const time = moment.time || {}
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
  if (time.importedAt && time.occurredAt && time.importedAt === time.occurredAt && moment.origin && moment.origin.type === 'imported' && !time.occurredAtConfirmed) {
    // importedAt may coincide by chance; commands prevent copying. Validator does not treat equality as automatic error.
  }

  validateOrigin(moment.origin, errors)

  if (!moment.accessSummary || VISIBILITIES.indexOf(moment.accessSummary.visibility) === -1) {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_ORIGIN, 'invalid visibility', 'accessSummary.visibility'))
  }

  const status = moment.lifecycle && moment.lifecycle.status
  if (STATUSES.indexOf(status) === -1) {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_TRANSITION, 'invalid lifecycle status', 'lifecycle.status'))
  } else if (status !== 'draft' && !hasActiveContent(moment)) {
    errors.push(issue(ERROR_CODES.MOMENT_EMPTY, 'active moment needs content, assets, or received origin'))
  }

  const audit = moment.audit || {}
  if (!isIso(audit.createdAt) || !isIso(audit.updatedAt)) {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_TIME, 'audit timestamps must be ISO', 'audit'))
  } else if (Date.parse(audit.updatedAt) < Date.parse(audit.createdAt)) {
    errors.push(issue(ERROR_CODES.MOMENT_INVALID_TIME, 'updatedAt cannot be earlier than createdAt', 'audit.updatedAt'))
  }

  if (moment.assetIds && !Array.isArray(moment.assetIds)) {
    errors.push(issue(ERROR_CODES.ASSET_NOT_FOUND, 'assetIds must be an array', 'assetIds'))
  }

  return { ok: errors.length === 0, errors }
}

module.exports = {
  validateMoment,
  hasActiveContent,
  isNonEmptyString,
}
