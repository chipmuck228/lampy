const { validateMoment } = require('../domain/moment/index.js')
const { KEYS } = require('./keys.js')
const { createSafeRepository } = require('./safe-repository.js')

function createMomentRepository(storage) {
  return createSafeRepository({
    storage,
    collectionKey: KEYS.moments,
    quarantineKey: KEYS.momentsQuarantine,
    entityType: 'moment',
    validate: validateMoment,
  })
}

module.exports = {
  createMomentRepository,
}
