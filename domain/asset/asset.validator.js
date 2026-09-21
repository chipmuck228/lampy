const { isIso } = require('../shared/time')
const { ERROR_CODES } = require('../moment/moment.errors')

const TYPES = ['image', 'video', 'audio']
const STATUSES = ['local', 'pending', 'ready', 'failed', 'missing']
const CAPTURE_SOURCES = ['metadata', 'user', 'system']

function issue(code, message, path) {
  return { code, message, path }
}

function validateAsset(raw) {
  const errors = []
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: [issue(ERROR_CODES.ASSET_NOT_FOUND, 'asset is required')] }
  }
  if (typeof raw.id !== 'string' || !raw.id) {
    errors.push(issue(ERROR_CODES.ASSET_NOT_FOUND, 'id is required', 'id'))
  }
  if (typeof raw.ownerId !== 'string' || !raw.ownerId) {
    errors.push(issue(ERROR_CODES.ASSET_INVALID, 'ownerId is required', 'ownerId'))
  }
  if (TYPES.indexOf(raw.type) === -1) {
    errors.push(issue(ERROR_CODES.ASSET_INVALID, 'invalid asset type', 'type'))
  }
  if (raw.captureTime !== undefined && !isIso(raw.captureTime)) {
    errors.push(issue(ERROR_CODES.ASSET_INVALID, 'captureTime must be ISO', 'captureTime'))
  }
  if (raw.captureTimeSource !== undefined && CAPTURE_SOURCES.indexOf(raw.captureTimeSource) === -1) {
    errors.push(issue(ERROR_CODES.ASSET_INVALID, 'invalid captureTimeSource', 'captureTimeSource'))
  }
  if (raw.localUri !== undefined && typeof raw.localUri !== 'string') {
    errors.push(issue(ERROR_CODES.ASSET_INVALID, 'localUri must be string', 'localUri'))
  }
  if (!raw.storage || typeof raw.storage !== 'object') {
    errors.push(issue(ERROR_CODES.ASSET_INVALID, 'storage is required', 'storage'))
  } else if (STATUSES.indexOf(raw.storage.status) === -1) {
    errors.push(issue(ERROR_CODES.ASSET_INVALID, 'invalid storage status', 'storage.status'))
  }
  if (raw.metadata !== undefined) {
    if (typeof raw.metadata !== 'object' || raw.metadata === null) {
      errors.push(issue(ERROR_CODES.ASSET_INVALID, 'metadata must be an object', 'metadata'))
    } else {
      if (raw.metadata.mimeType !== undefined && typeof raw.metadata.mimeType !== 'string') {
        errors.push(issue(ERROR_CODES.ASSET_INVALID, 'mimeType must be string', 'metadata.mimeType'))
      }
      ;['sizeBytes', 'width', 'height', 'durationMs'].forEach((key) => {
        if (raw.metadata[key] !== undefined && (!Number.isFinite(raw.metadata[key]) || raw.metadata[key] < 0)) {
          errors.push(issue(ERROR_CODES.ASSET_INVALID, `${key} must be a non-negative number`, `metadata.${key}`))
        }
      })
    }
  }
  if (raw.integrity !== undefined && (typeof raw.integrity !== 'object' || raw.integrity === null)) {
    errors.push(issue(ERROR_CODES.ASSET_INVALID, 'integrity must be an object', 'integrity'))
  } else if (raw.integrity && raw.integrity.checksum !== undefined && typeof raw.integrity.checksum !== 'string') {
    errors.push(issue(ERROR_CODES.ASSET_INVALID, 'checksum must be string', 'integrity.checksum'))
  }
  if (!raw.audit || !isIso(raw.audit.createdAt) || !isIso(raw.audit.updatedAt)) {
    errors.push(issue(ERROR_CODES.ASSET_INVALID, 'asset audit must be ISO', 'audit'))
  } else if (Date.parse(raw.audit.updatedAt) < Date.parse(raw.audit.createdAt)) {
    errors.push(issue(ERROR_CODES.ASSET_INVALID, 'updatedAt cannot be earlier than createdAt', 'audit.updatedAt'))
  }
  return { ok: errors.length === 0, errors }
}

module.exports = {
  validateAsset,
}
