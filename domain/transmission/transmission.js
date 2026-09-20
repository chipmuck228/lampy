const { toIso } = require('../shared/time')
const { LOCAL_OWNER_ID } = require('../shared/identity')
const { fail, ERROR_CODES } = require('../moment/moment.errors')

const STATUSES = ['created', 'sent', 'received', 'declined', 'expired', 'revoked']

function createTransmission(input, dependencies) {
  const deps = dependencies || {}
  const nowIso = toIso((deps.now && deps.now()) || Date.now())
  if (!input || !input.id || !input.sourceMomentId || !input.senderId) {
    fail(ERROR_CODES.MOMENT_INVALID_ORIGIN, 'transmission needs id, sourceMomentId, senderId')
  }
  if (STATUSES.indexOf(input.status || 'created') === -1) {
    fail(ERROR_CODES.MOMENT_INVALID_ORIGIN, 'invalid transmission status')
  }
  return {
    id: String(input.id),
    sourceMomentId: String(input.sourceMomentId),
    sourceRevision: Number.isInteger(input.sourceRevision) ? input.sourceRevision : 1,
    senderId: String(input.senderId),
    recipientId: input.recipientId || undefined,
    status: input.status || 'created',
    message: input.message || '',
    createdAt: nowIso,
    sentAt: toIso(input.sentAt) || undefined,
    receivedAt: toIso(input.receivedAt) || undefined,
    legacy: !!input.legacy,
    legacySource: input.legacySource || undefined,
  }
}

function createLocalPassTransmission(moment, dependencies) {
  return createTransmission({
    id: (dependencies && dependencies.id && dependencies.id()) || `tx:local:pass:${moment.id}:${moment.revision}`,
    sourceMomentId: moment.id,
    sourceRevision: moment.revision,
    senderId: moment.ownerId || LOCAL_OWNER_ID,
    status: 'sent',
    sentAt: (dependencies && dependencies.now && dependencies.now()) || Date.now(),
    message: 'local prototype pass, not a real delivery loop',
  }, dependencies)
}

function createLegacyReceivedTransmission(lightId, originalMomentId, dependencies) {
  return createTransmission({
    id: `tx:legacy:received:${lightId}`,
    sourceMomentId: originalMomentId || lightId,
    sourceRevision: 1,
    senderId: 'legacy-nearby',
    recipientId: LOCAL_OWNER_ID,
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
