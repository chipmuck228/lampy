const { toIso } = require('../shared/time')
const { LOCAL_OWNER_ID } = require('../shared/identity')
const { fail, ERROR_CODES } = require('../moment/moment.errors')
const { validateTransmission } = require('./transmission.validator')

const STATUSES = ['created', 'sent', 'received', 'declined', 'expired', 'revoked']

/**
 * 本地 Transmission 只记录分享意图，不是真实送达证明。
 */
function createTransmission(input, dependencies) {
  const deps = dependencies || {}
  const nowIso = toIso((deps.now && deps.now()) || Date.now())
  if (!input || !input.id || !input.sourceMomentId || !input.senderId) {
    fail(ERROR_CODES.TRANSMISSION_INVALID, 'transmission needs id, sourceMomentId, senderId')
  }
  if (STATUSES.indexOf(input.status || 'created') === -1) {
    fail(ERROR_CODES.TRANSMISSION_INVALID, 'invalid transmission status')
  }
  const transmission = {
    id: String(input.id),
    sourceMomentId: String(input.sourceMomentId),
    sourceRevision: Number.isInteger(input.sourceRevision) ? input.sourceRevision : 1,
    senderId: String(input.senderId),
    recipientId: typeof input.recipientId === 'string' ? input.recipientId : undefined,
    status: input.status || 'created',
    message: typeof input.message === 'string' ? input.message : '',
    createdAt: nowIso,
    sentAt: toIso(input.sentAt) || undefined,
    receivedAt: toIso(input.receivedAt) || undefined,
    legacy: !!input.legacy,
    legacySource: typeof input.legacySource === 'string' ? input.legacySource : undefined,
  }
  const result = validateTransmission(transmission)
  if (!result.ok) fail(result.errors[0].code, result.errors[0].message)
  return transmission
}

function createLocalPassTransmission(moment, dependencies) {
  return createTransmission({
    id: (dependencies && dependencies.id && dependencies.id()) || `tx:local:pass:${moment.id}:${moment.revision}`,
    sourceMomentId: moment.id,
    sourceRevision: moment.revision,
    senderId: moment.ownerId || LOCAL_OWNER_ID,
    status: 'sent',
    sentAt: (dependencies && dependencies.now && dependencies.now()) || Date.now(),
    message: 'local share intent only; not proof of delivery',
  }, dependencies)
}

function createLegacyReceivedTransmission(lightId, originalMomentId, dependencies) {
  const ownerId = (dependencies && dependencies.ownerId) || LOCAL_OWNER_ID
  return createTransmission({
    id: `tx:legacy:received:${lightId}`,
    sourceMomentId: originalMomentId || lightId,
    sourceRevision: 1,
    senderId: 'legacy-nearby',
    recipientId: ownerId,
    status: 'received',
    receivedAt: (dependencies && dependencies.now && dependencies.now()) || Date.now(),
    legacy: true,
    legacySource: 'migrated-nearby',
    message: 'migrated from source=nearby; not a complete transmission',
  }, dependencies)
}

module.exports = {
  createTransmission,
  createLocalPassTransmission,
  createLegacyReceivedTransmission,
}
