const { toIso } = require('../shared/time')
const { LOCAL_OWNER_ID } = require('../shared/identity')
const { clone } = require('../shared/clone')
const { validateAsset } = require('./asset.validator')
const { fail, ERROR_CODES } = require('../moment/moment.errors')

/**
 * 创建 Asset。captureTime 只作为媒体线索，不会写入 Moment.occurredAt。
 * @param {object} input
 * @param {object} [dependencies]
 */
function createAsset(input, dependencies) {
  const deps = dependencies || {}
  const nowIso = toIso((deps.now && deps.now()) || Date.now())
  const ownerId = (input && input.ownerId) || deps.ownerId || LOCAL_OWNER_ID
  if (!input || !input.id || !input.type) {
    fail(ERROR_CODES.ASSET_NOT_FOUND, 'asset id and type are required')
  }
  const storageInput = input.storage && typeof input.storage === 'object' ? input.storage : {}
  const asset = {
    id: String(input.id),
    ownerId,
    type: input.type,
    captureTime: toIso(input.captureTime) || undefined,
    captureTimeSource: input.captureTimeSource,
    localUri: typeof input.localUri === 'string' ? input.localUri : '',
    storage: {
      status: storageInput.status || 'local',
      originalKey: storageInput.originalKey,
      previewKey: storageInput.previewKey,
      thumbnailKey: storageInput.thumbnailKey,
    },
    metadata: clone(input.metadata || {}),
    integrity: clone(input.integrity || {}),
    userCaption: typeof input.userCaption === 'string' ? input.userCaption : '',
    audit: {
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  }
  const result = validateAsset(asset)
  if (!result.ok) fail(result.errors[0].code, result.errors[0].message)
  return asset
}

module.exports = {
  createAsset,
  validateAsset,
}
