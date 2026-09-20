const { isIso } = require('../shared/time')

const TYPES = ['image', 'video', 'audio']
const STATUSES = ['local', 'pending', 'ready', 'failed', 'missing']

function validateAsset(raw) {
  const errors = []
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: [{ code: 'ASSET_NOT_FOUND', message: 'asset is required' }] }
  }
  if (typeof raw.id !== 'string' || !raw.id) {
    errors.push({ code: 'ASSET_NOT_FOUND', message: 'id is required', path: 'id' })
  }
  if (typeof raw.ownerId !== 'string' || !raw.ownerId) {
    errors.push({ code: 'MOMENT_INVALID_OWNER', message: 'ownerId is required', path: 'ownerId' })
  }
  if (TYPES.indexOf(raw.type) === -1) {
    errors.push({ code: 'ASSET_NOT_FOUND', message: 'invalid asset type', path: 'type' })
  }
  if (!raw.storage || STATUSES.indexOf(raw.storage.status) === -1) {
    errors.push({ code: 'ASSET_NOT_FOUND', message: 'invalid storage status', path: 'storage.status' })
  }
  if (!raw.audit || !isIso(raw.audit.createdAt) || !isIso(raw.audit.updatedAt)) {
    errors.push({ code: 'MOMENT_INVALID_TIME', message: 'asset audit must be ISO', path: 'audit' })
  }
  return { ok: errors.length === 0, errors }
}

module.exports = {
  validateAsset,
}
