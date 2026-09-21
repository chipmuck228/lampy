const { createDraftMoment, activateMoment, archiveMoment, trashMoment } = require('../domain/moment/index.js')
const { createAsset } = require('../domain/asset/index.js')
const { createTransmission } = require('../domain/transmission/index.js')

const NOW = new Date('2026-09-20T02:00:00.000Z')
const OWNER = 'local-user'

function makeActiveMoment(overrides) {
  const ownerId = (overrides && overrides.ownerId) || OWNER
  const now = (overrides && overrides.now) || NOW
  let moment = createDraftMoment({
    id: (overrides && overrides.id) || 'moment_ok',
    ownerId,
    content: { note: (overrides && overrides.note) || '一份记录' },
    time: {
      occurredAt: (overrides && overrides.occurredAt) || now.toISOString(),
      occurredAtPrecision: 'exact',
      recordedAt: (overrides && overrides.recordedAt) || now.toISOString(),
    },
  }, { now: () => now })
  moment = activateMoment(moment, ownerId, now)
  if (overrides && overrides.status === 'archived') {
    moment = archiveMoment(moment, ownerId, now)
  }
  if (overrides && overrides.status === 'trashed') {
    moment = trashMoment(moment, ownerId, now)
  }
  return moment
}

function makeAsset(overrides) {
  return createAsset({
    id: (overrides && overrides.id) || 'asset_ok',
    ownerId: (overrides && overrides.ownerId) || OWNER,
    type: (overrides && overrides.type) || 'image',
    localUri: (overrides && overrides.localUri) || 'wxfile://tmp/a.jpg',
    storage: { status: 'local' },
  }, { now: () => NOW })
}

function makeTransmission(overrides) {
  return createTransmission({
    id: (overrides && overrides.id) || 'tx_ok',
    sourceMomentId: (overrides && overrides.sourceMomentId) || 'moment_ok',
    sourceRevision: (overrides && overrides.sourceRevision) || 1,
    senderId: (overrides && overrides.senderId) || OWNER,
    status: (overrides && overrides.status) || 'created',
    message: (overrides && overrides.message) || '',
  }, { now: () => NOW })
}

module.exports = {
  NOW,
  OWNER,
  makeActiveMoment,
  makeAsset,
  makeTransmission,
}
