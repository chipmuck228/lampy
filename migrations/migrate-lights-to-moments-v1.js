const { LOCAL_OWNER_ID } = require('../domain/shared/identity.js')
const { toIso } = require('../domain/shared/time.js')
const { validateMoment } = require('../domain/moment/index.js')
const { createAsset } = require('../domain/asset/index.js')
const { createTransmission, createLegacyReceivedTransmission } = require('../domain/transmission/index.js')
const { KEYS } = require('../repositories/keys.js')
const {
  fingerprintOf,
  toQuarantineEntry,
  mergeQuarantine,
  stableStringify,
} = require('../repositories/record-partition.js')

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

function resolveOwner(ownerId) {
  return ownerId || LOCAL_OWNER_ID
}

function sourceFingerprint(lights) {
  return fingerprintOf('legacy-light-set', lights)
}

function buildMigratedMoment(light, nowIso, ownerId) {
  const owner = resolveOwner(ownerId)
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
    ownerId: owner,
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

function buildAssets(light, nowIso, ownerId) {
  const owner = resolveOwner(ownerId)
  const assets = []
  if (light.imagePath) {
    assets.push(createAsset({
      id: `asset:${light.id}:image`,
      ownerId: owner,
      type: 'image',
      localUri: light.imagePath,
      storage: { status: 'local' },
    }, { now: () => nowIso, ownerId: owner }))
  }
  if (light.voicePath) {
    assets.push(createAsset({
      id: `asset:${light.id}:audio`,
      ownerId: owner,
      type: 'audio',
      localUri: light.voicePath,
      storage: { status: 'local' },
    }, { now: () => nowIso, ownerId: owner }))
  }
  return assets
}

function countSkipped(lights, existingIds) {
  return lights.filter((light) => light && light.id && existingIds[light.id]).length
}

/**
 * 将旧 light 幂等迁移到 Moment / Asset / Transmission。
 * 不删除 lampy_lights。
 */
function migrateLightsToMomentsV1({ storage, now, ownerId, logger }) {
  const nowIso = toIso(now || Date.now())
  const owner = resolveOwner(ownerId)
  const result = {
    migrated: 0,
    skipped: 0,
    quarantined: 0,
    alreadyDone: false,
  }

  const lights = storage.get(KEYS.lights, [])
  if (!Array.isArray(lights)) {
    warn(logger, 'old lights is not an array, abort without deleting or writing marker')
    return result
  }

  const existingMoments = Array.isArray(storage.get(KEYS.moments, [])) ? storage.get(KEYS.moments, []) : []
  const existingIds = {}
  existingMoments.forEach((item) => {
    if (item && item.id) existingIds[item.id] = true
  })

  const fingerprint = sourceFingerprint(lights)
  const marker = storage.get(KEYS.migration, null)
  if (marker && marker.version === 1 && marker.sourceFingerprint === fingerprint) {
    result.alreadyDone = true
    result.skipped = countSkipped(lights, existingIds)
    result.quarantined = marker.quarantined || 0
    log(logger, 'migration already done for this source set', result)
    return result
  }

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

  const nextMoments = existingMoments.slice()
  const nextAssets = existingAssets.slice()
  const nextTx = existingTx.slice()
  const discovered = []

  lights.forEach((light, index) => {
    if (!light || typeof light !== 'object' || !light.id) {
      discovered.push({
        raw: light,
        index,
        errors: [{ code: 'MOMENT_INVALID_ID', message: 'legacy light missing id' }],
        reason: 'missing-id',
      })
      result.quarantined += 1
      warn(logger, 'skip corrupt light', { index })
      return
    }

    if (existingIds[light.id]) {
      result.skipped += 1
      return
    }

    try {
      const moment = buildMigratedMoment(light, nowIso, owner)
      const checked = validateMoment(moment)
      if (!checked.ok) {
        discovered.push({
          raw: light,
          index,
          errors: checked.errors,
          reason: 'invalid-moment',
        })
        result.quarantined += 1
        warn(logger, 'migrated moment failed validation', { id: light.id, errors: checked.errors })
        return
      }

      nextMoments.push(moment)
      existingIds[moment.id] = true
      result.migrated += 1

      buildAssets(light, nowIso, owner).forEach((asset) => {
        if (!existingAssetIds[asset.id]) {
          nextAssets.push(asset)
          existingAssetIds[asset.id] = true
        }
      })

      if (light.source === 'nearby') {
        const tx = createLegacyReceivedTransmission(light.id, originalNearbyId(light), {
          now: () => nowIso,
          ownerId: owner,
        })
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
          senderId: owner,
          status: 'sent',
          sentAt: nowIso,
          legacy: true,
          legacySource: 'migrated-isPassed',
          message: 'migrated from isPassed; local share intent only, not proof of delivery',
        }, { now: () => nowIso })
        if (!existingTxIds[tx.id]) {
          nextTx.push(tx)
          existingTxIds[tx.id] = true
        }
      }
    } catch (error) {
      discovered.push({
        raw: light,
        index,
        errors: [{ code: 'MOMENT_INVALID_ORIGIN', message: error.message }],
        reason: 'exception',
      })
      result.quarantined += 1
      warn(logger, 'light migration exception', { id: light.id, message: error.message })
    }
  })

  const stamp = nowIso
  const incoming = discovered.map((item) => toQuarantineEntry('legacy-light', item, stamp))
  const existingQuarantine = Array.isArray(storage.get(KEYS.quarantine, []))
    ? storage.get(KEYS.quarantine, [])
    : []
  storage.set(KEYS.quarantine, mergeQuarantine(existingQuarantine, incoming, stamp))

  storage.set(KEYS.moments, nextMoments)
  storage.set(KEYS.assets, nextAssets)
  storage.set(KEYS.transmissions, nextTx)
  storage.set(KEYS.migration, {
    version: 1,
    sourceFingerprint: fingerprint,
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
  sourceFingerprint,
  stableStringify,
}
