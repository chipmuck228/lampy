const { LOCAL_OWNER_ID } = require('../domain/shared/identity.js')
const { createDraftMoment, updateMomentContent, activateMoment } = require('../domain/moment/index.js')
const { createLegacyReceivedTransmission } = require('../domain/transmission/index.js')
const { getRuntime } = require('./runtime.js')

function receiveNearbyLight(current, storage) {
  if (!current || !current.id) return null
  const runtime = getRuntime(storage)
  const now = new Date()
  const copyId = `collected_${current.id}`
  const transmission = createLegacyReceivedTransmission(copyId, current.id, { now: () => now })
  runtime.transmissions.save(transmission)

  let moment = createDraftMoment({
    id: copyId,
    ownerId: LOCAL_OWNER_ID,
    content: {
      note: current.text || '',
      emotion: current.emotion || '',
    },
    time: {
      occurredAt: new Date(current.createdAt || Date.now()).toISOString(),
      occurredAtPrecision: 'exact',
      recordedAt: now.toISOString(),
    },
    origin: {
      type: 'received',
      transmissionId: transmission.id,
      originalMomentId: current.id,
      snapshotRevision: 1,
      legacy: true,
      legacySource: 'nearby-mock',
    },
  }, { now: () => now })

  moment = updateMomentContent(moment, {
    content: {
      note: current.text || '',
      emotion: current.emotion || '',
    },
  }, LOCAL_OWNER_ID, now)
  moment = activateMoment(moment, LOCAL_OWNER_ID, now)
  runtime.moments.save(moment)
  return moment
}

module.exports = {
  receiveNearbyLight,
}
