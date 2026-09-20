const { toIso } = require('../shared/time')
const { LOCAL_OWNER_ID } = require('../shared/identity')
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
  const asset = {
    id: String(input.id),
    ownerId,
    type: input.type,
    captureTime: toIso(input.captureTime) || undefined,
    captureTimeSource: input.captureTimeSource,
    localUri: input.localUri || '',
    storage: {
      status: (input.storage && input.storage.status) || 'local',
      originalKey: input.storage && input.storage.originalKey,
      previewKey: input.storage && input.storage.previewKey,
      thumbnailKey: input.storage && input.storage.thumbnailKey,
    },
    metadata: input.metadata || {},
    integrity: input.integrity || {},
    userCaption: input.userCaption || '',
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
