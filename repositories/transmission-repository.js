const { validateTransmission } = require('../domain/transmission/index.js')
const { KEYS } = require('./keys.js')
const { createSafeRepository } = require('./safe-repository.js')

function createTransmissionRepository(storage) {
  return createSafeRepository({
    storage,
    collectionKey: KEYS.transmissions,
    quarantineKey: KEYS.transmissionsQuarantine,
    entityType: 'transmission',
    validate: validateTransmission,
  })
}

module.exports = {
  createTransmissionRepository,
}
