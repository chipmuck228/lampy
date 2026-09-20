const { LOCAL_OWNER_ID } = require('../domain/shared/identity.js')
const { toIso } = require('../domain/shared/time.js')
const { validateMoment } = require('../domain/moment/index.js')
const { createAsset } = require('../domain/asset/index.js')
const { createTransmission, createLegacyReceivedTransmission } = require('../domain/transmission/index.js')
const { KEYS } = require('../repositories/keys.js')

function log(logger, message, extra) {
  if (logger && logger.info) logger.info(message, extra)
  else console.log('[lampy.migration]', message, extra || '')
}

function warn(logger, message, extra) {
  if (logger && logger.warn) logger.warn(message, extra)
  else console.warn('[lampy.migration]', message, extra || '')
}

function originalNearbyId(light) {
  const id = String(light.id)
  return id.indexOf('collected_') === 0 ? id.slice('collected_'.length) : id
}

function mapVisibility(isPublic) {
  return isPublic ? 'public' : 'private'
}

function buildMigratedMoment(light, nowIso) {
  const occurredAt = toIso(light.createdAt) || nowIso
  const received = light.source === 'nearby'
  const origin = received
    ? {
      type: 'received',
      transmissionId: `tx:legacy:received:${light.id}`,
      originalMomentId: originalNearbyId(light),
      snapshotRevision: 1,
      legacy: true,
      legacySource: 'migrated-nearby',
    }
    : { type: 'created' }

  const assetIds = []
  if (light.imagePath) assetIds.push(`asset:${light.id}:image`)
  if (light.voicePath) assetIds.push(`asset:${light.id}:audio`)

  return {
    id: String(light.id),
    schemaVersion: 1,
    revision: 1,
    ownerId: LOCAL_OWNER_ID,
    content: {
      note: typeof light.text === 'string' ? light.text : '',
      significance: '',
      emotion: typeof light.emotion === 'string' ? light.emotion : '',
    },
    time: {
      occurredAt,
      occurredAtPrecision: 'exact',
      recordedAt: occurredAt,
    },
    assetIds,
    context: {
      people: [],
      tags: [],
    },
    origin,
    accessSummary: {
      visibility: mapVisibility(!!light.isPublic),
      futureAccessEnabled: false,
    },
    lifecycle: {
      status: 'active',
      activatedAt: occurredAt,
    },
    audit: {
      createdAt: occurredAt,
      updatedAt: occurredAt,
    },
  }
}

function buildAssets(light, nowIso) {
  const assets = []
  if (light.imagePath) {
    assets.push(createAsset({
      id: `asset:${light.id}:image`,
      ownerId: LOCAL_OWNER_ID,
      type: 'image',
      localUri: light.imagePath,
      storage: { status: 'local' },
    }, { now: () => nowIso }))
  }
  if (light.voicePath) {
    assets.push(createAsset({
      id: `asset:${light.id}:audio`,
      ownerId: LOCAL_OWNER_ID,
      type: 'audio',
      localUri: light.voicePath,
      storage: { status: 'local' },
    }, { now: () => nowIso }))
  }
  return assets
}

/**
 * 将旧 light 幂等迁移到 Moment / Asset / Transmission。
 * 不删除 lampy_lights。
 */
function migrateLightsToMomentsV1({ storage, now, ownerId, logger }) {
  const nowIso = toIso(now || Date.now())
  const result = {
    migrated: 0,
    skipped: 0,
    quarantined: 0,
    alreadyDone: false,
  }

  const existingMoments = Array.isArray(storage.get(KEYS.moments, [])) ? storage.get(KEYS.moments, []) : []
  const existingIds = {}
  existingMoments.forEach((item) => {
    if (item && item.id) existingIds[item.id] = true
  })

  const existingAssets = Array.isArray(storage.get(KEYS.assets, [])) ? storage.get(KEYS.assets, []) : []
  const existingAssetIds = {}
  existingAssets.forEach((item) => {
    if (item && item.id) existingAssetIds[item.id] = true
  })

  const existingTx = Array.isArray(storage.get(KEYS.transmissions, [])) ? storage.get(KEYS.transmissions, []) : []
  const existingTxIds = {}
  existingTx.forEach((item) => {
    if (item && item.id) existingTxIds[item.id] = true
  })

  const lights = storage.get(KEYS.lights, [])
  if (!Array.isArray(lights)) {
    warn(logger, 'old lights is not an array, abort without deleting')
    return result
  }

  const nextMoments = existingMoments.slice()
  const nextAssets = existingAssets.slice()
  const nextTx = existingTx.slice()
  const quarantine = Array.isArray(storage.get(KEYS.quarantine, [])) ? storage.get(KEYS.quarantine, []).slice() : []

  lights.forEach((light, index) => {
    if (!light || typeof light !== 'object' || !light.id) {
      quarantine.push({ reason: 'missing-id', index, raw: light })
      result.quarantined += 1
      warn(logger, 'skip corrupt light', { index })
      return
    }

    if (existingIds[light.id]) {
      result.skipped += 1
      return
    }

    try {
      const moment = buildMigratedMoment(light, nowIso)
      if (ownerId) moment.ownerId = ownerId
      const checked = validateMoment(moment)
      if (!checked.ok) {
        quarantine.push({ reason: 'invalid-moment', id: light.id, errors: checked.errors })
        result.quarantined += 1
        warn(logger, 'migrated moment failed validation', { id: light.id, errors: checked.errors })
        return
      }

      nextMoments.push(moment)
      existingIds[moment.id] = true
      result.migrated += 1

      buildAssets(light, nowIso).forEach((asset) => {
        if (!existingAssetIds[asset.id]) {
          nextAssets.push(asset)
          existingAssetIds[asset.id] = true
        }
      })

      if (light.source === 'nearby') {
        const tx = createLegacyReceivedTransmission(light.id, originalNearbyId(light), { now: () => nowIso })
        if (!existingTxIds[tx.id]) {
          nextTx.push(tx)
          existingTxIds[tx.id] = true
        }
      }

      if (light.isPassed) {
        const tx = createTransmission({
          id: `tx:legacy:passed:${light.id}`,
          sourceMomentId: light.id,
          sourceRevision: 1,
          senderId: LOCAL_OWNER_ID,
          status: 'sent',
          sentAt: nowIso,
          legacy: true,
          legacySource: 'migrated-isPassed',
          message: 'migrated from isPassed; not a real recipient loop',
        }, { now: () => nowIso })
        if (!existingTxIds[tx.id]) {
          nextTx.push(tx)
          existingTxIds[tx.id] = true
        }
      }
    } catch (error) {
      quarantine.push({ reason: 'exception', id: light.id, message: error.message })
      result.quarantined += 1
      warn(logger, 'light migration exception', { id: light.id, message: error.message })
    }
  })

  storage.set(KEYS.moments, nextMoments)
  storage.set(KEYS.assets, nextAssets)
  storage.set(KEYS.transmissions, nextTx)
  storage.set(KEYS.quarantine, quarantine)
  storage.set(KEYS.migration, {
    version: 1,
    completedAt: nowIso,
    migrated: result.migrated,
    skipped: result.skipped,
    quarantined: result.quarantined,
  })

  log(logger, 'migration complete', result)
  return result
}

module.exports = {
  migrateLightsToMomentsV1,
  buildMigratedMoment,
}
